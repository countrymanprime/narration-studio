//go:build windows

package update

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// standInForExplorer puts a program that ends at once on PATH under Explorer's name, so OpenFolder starts it instead of opening a window.
func standInForExplorer(t *testing.T) {
	t.Helper()
	dir, err := os.MkdirTemp("", "explorer-*")
	if err != nil {
		t.Fatal(err)
	}
	// The program may still hold its file for a moment after it ends, so removing the folder is tried for a while and then let go.
	t.Cleanup(func() {
		for range 20 {
			if os.RemoveAll(dir) == nil {
				return
			}
			time.Sleep(50 * time.Millisecond)
		}
	})
	copyFile(t, filepath.Join(os.Getenv("SystemRoot"), "System32", "hostname.exe"), filepath.Join(dir, "explorer.exe"))
	t.Setenv("PATH", dir)
}

func TestOpenFolderStartsExplorerOnTheFolder(t *testing.T) {
	standInForExplorer(t)
	if err := OpenFolder(t.TempDir()); err != nil {
		t.Fatalf("a started Explorer is not an error: %v", err)
	}
}

func TestOpenFolderSaysSoWhenExplorerCannotBeStarted(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	if err := OpenFolder(t.TempDir()); err == nil || !strings.Contains(fmt.Sprint(err), "could not be opened") {
		t.Fatalf("no Explorer to start: %v", err)
	}
}
