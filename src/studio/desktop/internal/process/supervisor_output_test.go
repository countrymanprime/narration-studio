package process

import (
	"strings"
	"testing"
	"time"

	"desktop/internal/runlog"
)

// Start reads a child's output through exec, so Wait cannot close a pipe before the last line is read. A child that prints and
// exits at once is the case that lost its stderr when Start read the pipes by hand; one start in thirty used to be enough, so the
// guard starts many.
func TestStartKeepsAnExitingChildsLastStderrLine(t *testing.T) {
	const starts = 60
	supervisor := NewSupervisor()
	t.Cleanup(func() { _ = supervisor.Close() })
	name, args := envEchoCommand()
	for index := 0; index < starts; index++ {
		ctx, stderrPath := runContext(t, t.TempDir())
		child, err := supervisor.Start(ctx, name, args...)
		if err != nil {
			t.Fatal(err)
		}
		want := "run=" + runlog.FromContext(ctx).ID()
		if got := waitForStderrFile(t, stderrPath, want); !strings.Contains(got, want) {
			t.Fatalf("start %d: stderr file %q has no %q", index, got, want)
		}
		deadline := time.Now().Add(20 * time.Second)
		for !child.HasExited() && time.Now().Before(deadline) {
			time.Sleep(5 * time.Millisecond)
		}
		if !child.HasExited() {
			t.Fatalf("start %d: the child never reported its exit", index)
		}
	}
}
