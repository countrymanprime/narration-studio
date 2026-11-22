//go:build unix

package coverage

import (
	"path/filepath"
	"reflect"
	"syscall"
	"testing"
	"time"
)

// A named pipe named like an orphan's file would hold a read open for ever: the sweep reads regular files only, so it
// ends, and the pipe is left.
func TestTheSweepLeavesANamedPipeNamedLikeAnOrphan(t *testing.T) {
	f, _, _, _ := checkedTwiceThenFailed(t)
	writeStoredSummary(t, f.service, "orphan")
	pipes := []string{filepath.Join(resultsDir(f.dir), "pipe.json"), filepath.Join(summariesDir(f.dir), "pipe.json")}
	for _, pipe := range pipes {
		if err := syscall.Mkfifo(pipe, 0o600); err != nil {
			t.Skipf("this platform cannot make a named pipe: %v", err)
		}
	}
	type outcome struct {
		swept []string
		err   error
	}
	done := make(chan outcome, 1)
	go func() {
		swept, err := f.service.SweepOrphanResults()
		done <- outcome{swept, err}
	}()
	select {
	case got := <-done:
		if got.err != nil || !reflect.DeepEqual(got.swept, []string{"orphan"}) {
			t.Fatalf("SweepOrphanResults = %v, %v; want the orphan alone", got.swept, got.err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("the sweep did not return: it is reading a named pipe")
	}
	for _, pipe := range pipes {
		if !exists(pipe) {
			t.Fatalf("the sweep removed %s", pipe)
		}
	}
}
