//go:build !windows

package main

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"desktop/internal/dawport/audacity"
)

// A path that is a device or a pipe is refused: the parsers open by path, and would read a device without end or wait for a
// writer to a pipe. The reader is not asked.
func TestAProjectPathThatIsADeviceOrAPipeIsRefused(t *testing.T) {
	for _, name := range []string{"Book.rpp", audacity.SnapshotFile} {
		for kind, build := range map[string]func(path string) error{
			"a link to a device": func(path string) error { return os.Symlink("/dev/zero", path) },
			"a named pipe":       func(path string) error { return syscall.Mkfifo(path, 0o600) },
		} {
			t.Run(name+" is "+kind, func(t *testing.T) {
				savedProjects.reset()
				t.Cleanup(savedProjects.reset)
				reader := &pathOnlyProjectReader{}
				withProjectReaderRole(t, reader)
				path := filepath.Join(t.TempDir(), name)
				if err := build(path); err != nil {
					t.Skipf("cannot make it here: %v", err)
				}
				done := make(chan error, 1)
				go func() { _, err := readProject(path); done <- err }()
				select {
				case err := <-done:
					if err == nil || reader.reads != 0 || len(savedProjects.entries) != 0 {
						t.Fatalf("err = %v, reader asked %d times, kept %d; want an error, the reader not asked and nothing kept", err, reader.reads, len(savedProjects.entries))
					}
				case <-time.After(10 * time.Second):
					t.Fatal("reading the path did not stop")
				}
			})
		}
	}
}
