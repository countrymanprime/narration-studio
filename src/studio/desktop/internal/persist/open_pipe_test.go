//go:build !windows

package persist

import (
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

// A named pipe with no writer must not hold a read for good: a record swapped for one between a check and the open used to block
// the pass that held the store's lock.
func TestReadFileRefusesANamedPipeWithoutWaitingForAWriter(t *testing.T) {
	path := filepath.Join(t.TempDir(), "record.json")
	if err := syscall.Mkfifo(path, 0o600); err != nil {
		t.Skipf("no named pipe here: %v", err)
	}
	done := make(chan error, 1)
	go func() { _, err := ReadFile(path); done <- err }()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("ReadFile of a named pipe answered no error")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("ReadFile of a named pipe with no writer is still waiting")
	}
}
