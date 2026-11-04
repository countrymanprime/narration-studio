package process

import (
	"runtime"
	"testing"
	"time"
)

// dumpStacksIfStillRunning prints every goroutine's stack to the test log when the calling test is still running after limit. The
// package timeout of a slow CI runner kills the whole binary and, on Windows, the tail of the log has lost the stacks by the time
// anyone reads it; this names what each goroutine was waiting on, in the failing test's own output, well before that. limit must
// be shorter than the test's own waits so it fires first. The watchdog is stopped when the test ends.
func dumpStacksIfStillRunning(t *testing.T, limit time.Duration) {
	t.Helper()
	timer := time.AfterFunc(limit, func() {
		buf := make([]byte, 1<<20)
		buf = buf[:runtime.Stack(buf, true)]
		t.Logf("%s still running after %s; all goroutines:\n%s", t.Name(), limit, buf)
	})
	t.Cleanup(func() { timer.Stop() })
}
