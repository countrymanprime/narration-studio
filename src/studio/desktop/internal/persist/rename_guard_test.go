package persist

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A bare os.Rename fails on Windows with "Access is denied" whenever a scanner, a watcher or a reader holds the destination open
// (issue 3084). Every rename the host makes goes through Rename or WriteFile, which retry; this test fails for a new bare one.
func TestNoBareOsRenameOutsideThisPackage(t *testing.T) {
	root := filepath.Join("..", "..")
	var found []string
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		slash := filepath.ToSlash(path)
		if entry.IsDir() {
			// cmd/spike-storage is a throwaway storage experiment, not the app; this package is where the one allowed call lives.
			if strings.HasSuffix(slash, "/internal/persist") || strings.HasSuffix(slash, "/cmd/spike-storage") || entry.Name() == "node_modules" {
				return fs.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		source, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		if strings.Contains(string(source), "os.Rename(") {
			found = append(found, slash)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(found) > 0 {
		t.Errorf("use persist.Rename (or persist.WriteFile) instead of os.Rename in: %s", strings.Join(found, ", "))
	}
}

func TestRenameMovesAFile(t *testing.T) {
	dir := t.TempDir()
	from, to := filepath.Join(dir, "a"), filepath.Join(dir, "b")
	if err := os.WriteFile(from, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Rename(from, to); err != nil {
		t.Fatalf("Rename: %v", err)
	}
	if got, _ := os.ReadFile(to); string(got) != "x" {
		t.Fatalf("content = %q", got)
	}
}
