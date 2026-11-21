package retention

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// stepFunc is a Step that runs fn.
type stepFunc struct {
	name string
	fn   func(ctx context.Context, stop func() bool) Report
}

func (s stepFunc) Name() string { return s.name }
func (s stepFunc) Run(ctx context.Context, stop func() bool) Report {
	return s.fn(ctx, stop)
}

func waitFor(t *testing.T, what string, done func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !done() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(time.Millisecond)
	}
}

func TestTenKicksAtOnceMakeOnePass(t *testing.T) {
	var passes atomic.Int32
	release := make(chan struct{})
	runner := New([]Step{stepFunc{"a", func(context.Context, func() bool) Report {
		passes.Add(1)
		<-release
		return Report{}
	}}}, nil, nil)
	for range 10 {
		runner.Kick("open")
	}
	waitFor(t, "the pass to start", func() bool { return passes.Load() == 1 })
	close(release)
	runner.Close()
	if got := passes.Load(); got != 1 {
		t.Fatalf("%d passes, want 1", got)
	}
}

func TestNoPassStartsWhileBusy(t *testing.T) {
	var busy atomic.Bool
	busy.Store(true)
	var passes atomic.Int32
	runner := New([]Step{stepFunc{"a", func(context.Context, func() bool) Report { passes.Add(1); return Report{} }}}, busy.Load, nil)
	runner.Kick("open")
	runner.Close()
	if passes.Load() != 0 {
		t.Fatal("a pass ran while busy")
	}
}

func TestACheckStartingMidPassStopsIt(t *testing.T) {
	var busy atomic.Bool
	started := make(chan struct{})
	var second atomic.Int32
	var reports []Report
	var mu sync.Mutex
	runner := New([]Step{
		stepFunc{"first", func(_ context.Context, stop func() bool) Report {
			close(started)
			waitFor(t, "the check to start", busy.Load)
			if !stop() {
				t.Error("stop answered false while a check runs")
			}
			return Report{Removed: 1}
		}},
		stepFunc{"second", func(context.Context, func() bool) Report { second.Add(1); return Report{} }},
	}, busy.Load, func(_ string, r []Report) { mu.Lock(); reports = r; mu.Unlock() })
	runner.Kick("open")
	<-started
	busy.Store(true)
	runner.Close()
	mu.Lock()
	defer mu.Unlock()
	if second.Load() != 0 || len(reports) != 1 || reports[0].Kind != "first" {
		t.Fatalf("second ran %d times, reports = %+v; want the first step only", second.Load(), reports)
	}
}

func TestCloseCancelsThePassAndWaitsForIt(t *testing.T) {
	started := make(chan struct{})
	var finished atomic.Bool
	runner := New([]Step{stepFunc{"a", func(ctx context.Context, _ func() bool) Report {
		close(started)
		<-ctx.Done()
		finished.Store(true)
		return Report{}
	}}}, nil, nil)
	runner.Kick("open")
	<-started
	runner.Close()
	if !finished.Load() {
		t.Fatal("Close returned before the pass finished")
	}
	runner.Kick("later")
	runner.Close()
}

func TestAKickAfterClosePassesNothing(t *testing.T) {
	var passes atomic.Int32
	runner := New([]Step{stepFunc{"a", func(context.Context, func() bool) Report { passes.Add(1); return Report{} }}}, nil, nil)
	runner.Close()
	runner.Kick("open")
	runner.Close()
	if passes.Load() != 0 {
		t.Fatal("a pass ran after Close")
	}
}

func TestAPassAfterAnotherEndsRunsAgain(t *testing.T) {
	var passes atomic.Int32
	runner := New([]Step{stepFunc{"a", func(context.Context, func() bool) Report { passes.Add(1); return Report{} }}}, nil, nil)
	runner.Kick("open")
	waitFor(t, "the first pass", func() bool { return passes.Load() == 1 && !runner.running.Load() })
	runner.Kick("check-ended")
	waitFor(t, "the second pass", func() bool { return passes.Load() == 2 })
	runner.Close()
}

// The runner deletes nothing itself: a store's step does, through persist.RemoveRegular, and the host composes them (#3816).
func TestThePackageCallsNoDelete(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil || len(files) == 0 {
		t.Fatalf("no source files: %v", err)
	}
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		raw, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		for _, call := range []string{"os.Remove(", "os.RemoveAll(", ".Remove(", "RemoveRegular("} {
			if strings.Contains(string(raw), call) {
				t.Errorf("%s calls %s", file, call)
			}
		}
	}
}
