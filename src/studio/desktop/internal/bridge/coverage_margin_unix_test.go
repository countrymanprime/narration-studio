//go:build !windows

package bridge

import (
	"os"
	"path/filepath"
	"testing"
)

// On Windows opening a path under a file reads as "not found" and a folder has size 0, so these two unreadable-log cases are Unix-only.

func TestNewEventLinesReportsALogItCannotRead(t *testing.T) {
	t.Run("the session folder is a file", func(t *testing.T) {
		notAFolder := filepath.Join(t.TempDir(), "file")
		if err := os.WriteFile(notAFolder, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
		client := &Client{sessionDir: notAFolder}
		if lines, err := client.newEventLines(); err == nil || lines != nil {
			t.Fatalf("lines = %v, err = %v; want an error", lines, err)
		}
	})
	t.Run("events.log is a folder", func(t *testing.T) {
		dir := t.TempDir()
		if err := os.Mkdir(filepath.Join(dir, "events.log"), 0o700); err != nil {
			t.Fatal(err)
		}
		client := &Client{sessionDir: dir}
		if lines, err := client.newEventLines(); err == nil || lines != nil {
			t.Fatalf("lines = %v, err = %v; want an error", lines, err)
		}
	})
}
