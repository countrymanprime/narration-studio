package process

import (
	"os"
	"testing"
)

// Tests here start this test binary again as a helper program (TestStreamHelperProcess and the supervisor tests). Under -race that child
// sleeps a second before it exits; the setting is read when a process starts, so it reaches the children and leaves this process alone.
func TestMain(m *testing.M) {
	_ = os.Setenv("GORACE", "atexit_sleep_ms=0 "+os.Getenv("GORACE"))
	os.Exit(m.Run())
}
