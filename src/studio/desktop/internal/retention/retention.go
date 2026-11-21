// Package retention runs the passes that keep the derived files of a project bounded (#3816): one pass at a time, in the
// background, never while a recording check runs, and stopped when one starts or the project closes. It schedules; each
// Step knows its own store and what may leave it. The package names no analyzer and no store.
package retention

import (
	"context"
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
	Err         error
}

// Step is one store's pass. It checks stop between files and returns early when it answers true, and reports what it did.
type Step interface {
	Name() string
	Run(ctx context.Context, stop func() bool) Report
}

// Runner runs its steps in order, one pass at a time.
type Runner struct {
	steps []Step
	busy  func() bool
	log   func(reason string, reports []Report)

	running atomic.Bool
	mu      sync.Mutex
	cancel  context.CancelFunc
	done    sync.WaitGroup
	closed  bool
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

// A nil Runner is a Runner with nothing to do: Kick and Close return at once.

// Kick starts a pass in the background for reason, and returns at once. It does nothing when busy answers true, when a pass is
// already running (the next trigger will start another) or after Close.
func (r *Runner) Kick(reason string) {
	if r == nil {
		return
	}
	if r.busy() || !r.running.CompareAndSwap(false, true) {
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
		defer r.running.Store(false)
		defer cancel()
		r.pass(ctx, reason)
	}()
}

func (r *Runner) pass(ctx context.Context, reason string) {
	stop := func() bool { return ctx.Err() != nil || r.busy() }
	reports := make([]Report, 0, len(r.steps))
	for _, step := range r.steps {
		if stop() {
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
// whose deletes are not wired. A folder that is not there is empty, and a link is not followed.
func DirStep(kind, dir string) Step { return dirStep{kind: kind, dir: dir} }

type dirStep struct{ kind, dir string }

func (d dirStep) Name() string { return d.kind }

func (d dirStep) Run(_ context.Context, stop func() bool) Report {
	report := Report{Kind: d.kind}
	_ = filepath.WalkDir(d.dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || stop() {
			return filepath.SkipAll
		}
		if !entry.Type().IsRegular() {
			return nil // WalkDir does not follow a link; a folder is walked
		}
		if info, err := entry.Info(); err == nil {
			report.FilesBefore++
			report.BytesBefore += info.Size()
		}
		return nil
	})
	report.FilesAfter, report.BytesAfter = report.FilesBefore, report.BytesBefore
	return report
}
