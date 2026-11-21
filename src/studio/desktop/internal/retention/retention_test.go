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
	stopped := make(chan bool, 1)
	var second atomic.Int32
	var reports []Report
	var mu sync.Mutex
	runner := New([]Step{
		stepFunc{"first", func(_ context.Context, stop func() bool) Report {
			close(started)
			deadline := time.Now().Add(5 * time.Second)
			for !busy.Load() && time.Now().Before(deadline) {
				time.Sleep(time.Millisecond)
			}
			stopped <- stop()
			return Report{Removed: 1}
		}},
		stepFunc{"second", func(context.Context, func() bool) Report { second.Add(1); return Report{} }},
	}, busy.Load, func(_ string, r []Report) { mu.Lock(); reports = r; mu.Unlock() })
	runner.Kick("open")
	<-started
	busy.Store(true)
	runner.Close()
	if !<-stopped {
		t.Error("stop answered false while a check runs")
	}
	mu.Lock()
	defer mu.Unlock()
	if second.Load() != 0 || len(reports) != 2 || reports[0].Kind != "first" || !reports[1].Stopped {
		t.Fatalf("second ran %d times, reports = %+v; want the first step, then the second marked stopped", second.Load(), reports)
	}
}

// A trigger that comes while a pass runs is not lost: the pass runs once more when it ends.
func TestAKickDuringAPassRunsAnotherWhenItEnds(t *testing.T) {
	var passes atomic.Int32
	block := make(chan struct{})
	started := make(chan struct{}, 2)
	runner := New([]Step{stepFunc{"a", func(context.Context, func() bool) Report {
		passes.Add(1)
		started <- struct{}{}
		<-block
		return Report{}
	}}}, nil, nil)
	runner.Kick("open")
	<-started
	runner.Kick("check-ended") // while the first pass is blocked
	close(block)
	waitFor(t, "the second pass", func() bool { return passes.Load() == 2 })
	runner.Close()
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

func TestADirStepCountsFilesPassesOverAnUnlistableFolderAndNamesTheError(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.json"), []byte("12345"), 0o600); err != nil {
		t.Fatal(err)
	}
	locked := filepath.Join(dir, "locked")
	if err := os.Mkdir(locked, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(locked, "b.json"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(locked, 0); err != nil {
		t.Skipf("cannot lock a folder here: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(locked, 0o755) })
	if _, err := os.ReadDir(locked); err == nil {
		t.Skip("the folder can be listed here (running as root)")
	}
	report := DirStep("kind", dir).Run(t.Context(), func() bool { return false })
	if report.FilesBefore != 1 || report.BytesBefore != 5 || report.FilesAfter != 1 || report.Stopped {
		t.Fatalf("report = %+v, want the one readable file", report)
	}
	if report.Err == nil {
		t.Fatal("the unlistable folder was passed over without an error")
	}
}

func TestADirStepOverAFolderThatIsNotThereIsEmptyWithNoError(t *testing.T) {
	report := DirStep("kind", filepath.Join(t.TempDir(), "none")).Run(t.Context(), func() bool { return false })
	if report.FilesBefore != 0 || report.Err != nil {
		t.Fatalf("report = %+v, want empty and no error", report)
	}
}

func TestADirStepThatIsToldToStopSaysSo(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.json"), []byte("1"), 0o600); err != nil {
		t.Fatal(err)
	}
	if report := DirStep("kind", dir).Run(t.Context(), func() bool { return true }); !report.Stopped {
		t.Fatalf("report = %+v, want Stopped", report)
	}
}
