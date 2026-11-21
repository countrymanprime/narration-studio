// Package retention runs the passes that keep the derived files of a project bounded (#3816): one pass at a time, in the
// background, never while a recording check runs, and stopped when one starts or the project closes. It schedules; each
// Step knows its own store and what may leave it. The package names no analyzer and no store.
//
// Step.Run, the busy predicate and the log function run on the pass's goroutine while a project switch may be waiting for
// the pass in Close with the host's lock held, so none of them may take that lock.
package retention

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"sync"
	"sync/atomic"
)

// Report is what one Step found or did: the kind of file it covers and its size, in bytes and files, before and after.
// A Step that deletes nothing reports the same numbers before and after.
type Report struct {
	Kind        string
	BytesBefore int64
	BytesAfter  int64
	FilesBefore int
	FilesAfter  int
	Removed     int
	// Stopped is true when the step was cut short (a check started, or Close): the figures are of what it reached.
	Stopped bool
	// Err is the first error the step met and went on past.
	Err error
}

// Step is one store's pass. It checks stop between files and returns early when it answers true, and reports what it did.
type Step interface {
	Name() string
	Run(ctx context.Context, stop func() bool) Report
}

// Runner runs its steps in order, one pass at a time. A nil Runner has nothing to do: Kick and Close return at once.
type Runner struct {
	steps []Step
	busy  func() bool
	log   func(reason string, reports []Report)

	running atomic.Bool
	// pending is set by a Kick that found a pass running: the pass runs once more when it ends, so a trigger is never lost.
	pending atomic.Value // string: the reason of the last dropped kick
	passes  atomic.Int64

	mu sync.Mutex
	// +checklocks:mu
	cancel context.CancelFunc
	done   sync.WaitGroup
	// +checklocks:mu
	closed bool
}

// New is a Runner over steps. busy says whether something that must not be disturbed is running (a recording check); it is
// asked before a pass and between files. log hears each finished pass's reports, in step order; either may be nil.
func New(steps []Step, busy func() bool, log func(reason string, reports []Report)) *Runner {
	if busy == nil {
		busy = func() bool { return false }
	}
	if log == nil {
		log = func(string, []Report) {}
	}
	return &Runner{steps: steps, busy: busy, log: log}
}

// Passes is how many passes have started, for tests.
func (r *Runner) Passes() int64 { return r.passes.Load() }

// Kick starts a pass in the background for reason, and returns at once. It does nothing when busy answers true or after
// Close. A kick that finds a pass running is not lost: the pass runs once more when it ends, unless a check is running then.
func (r *Runner) Kick(reason string) {
	if r == nil || r.busy() {
		return
	}
	if !r.running.CompareAndSwap(false, true) {
		r.pending.Store(reason)
		return
	}
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		r.running.Store(false)
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	r.cancel = cancel
	r.done.Add(1)
	r.mu.Unlock()
	go func() {
		defer r.done.Done()
		defer cancel()
		for {
			r.passes.Add(1)
			r.pass(ctx, reason)
			r.running.Store(false)
			next, again := r.pending.Swap("").(string)
			if !again || next == "" || ctx.Err() != nil || r.busy() || !r.running.CompareAndSwap(false, true) {
				return
			}
			reason = next
		}
	}()
}

func (r *Runner) pass(ctx context.Context, reason string) {
	stop := func() bool { return ctx.Err() != nil || r.busy() }
	reports := make([]Report, 0, len(r.steps))
	for _, step := range r.steps {
		if stop() {
			reports = append(reports, Report{Kind: step.Name(), Stopped: true})
			break
		}
		report := step.Run(ctx, stop)
		if report.Kind == "" {
			report.Kind = step.Name()
		}
		reports = append(reports, report)
	}
	r.log(reason, reports)
}

// Close stops a pass in progress, waits for it and refuses every later Kick. It is for the project switch and the app's exit.
func (r *Runner) Close() {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.closed = true
	if r.cancel != nil {
		r.cancel()
	}
	r.mu.Unlock()
	r.done.Wait()
}

// DirStep is a Step that reports the size of the regular files below dir, which it never changes: the report-only step of a store
// whose deletes are not wired. A folder that is not there is empty, a link is not followed, and a folder that cannot be listed
// is passed over with the first such error in the report.
func DirStep(kind, dir string) Step { return dirStep{kind: kind, dir: dir} }

type dirStep struct{ kind, dir string }

func (d dirStep) Name() string { return d.kind }

func (d dirStep) Run(_ context.Context, stop func() bool) Report {
	report := Report{Kind: d.kind}
	note := func(path string, err error) {
		if report.Err == nil && !errors.Is(err, fs.ErrNotExist) {
			report.Err = fmt.Errorf("%s: %w", path, err)
		}
	}
	_ = filepath.WalkDir(d.dir, func(path string, entry fs.DirEntry, err error) error {
		if stop() {
			report.Stopped = true
			return filepath.SkipAll
		}
		if err != nil {
			note(path, err)
			if entry != nil && entry.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if !entry.Type().IsRegular() {
			return nil // WalkDir does not follow a link; a folder is walked
		}
		info, err := entry.Info()
		if err != nil {
			note(path, err)
			return nil
		}
		report.FilesBefore++
		report.BytesBefore += info.Size()
		return nil
	})
	report.FilesAfter, report.BytesAfter = report.FilesBefore, report.BytesBefore
	return report
}
