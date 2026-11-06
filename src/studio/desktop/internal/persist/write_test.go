package persist

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteFileReplacesTheDestinationAndLeavesNoTemporary(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.json")
	if err := os.WriteFile(path, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := WriteFile(path, []byte("new"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if got, _ := os.ReadFile(path); string(got) != "new" {
		t.Fatalf("content = %q", got)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("directory holds %d entries, want only the file", len(entries))
	}
}

func TestWriteFileRetriesATransientRenameFailure(t *testing.T) {
	calls := 0
	restore := swapRename(func(from, to string) error {
		calls++
		if calls < 3 {
			return &os.LinkError{Op: "rename", Old: from, New: to, Err: errTransient}
		}
		return os.Rename(from, to)
	})
	defer restore()
	path := filepath.Join(t.TempDir(), "a.json")
	if err := WriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if calls != 3 {
		t.Fatalf("rename called %d times, want 3", calls)
	}
}

func TestWriteFileGivesUpOnAPermanentRenameFailureAndCleansUp(t *testing.T) {
	permanent := errors.New("disk on fire")
	restore := swapRename(func(string, string) error { return permanent })
	defer restore()
	dir := t.TempDir()
	err := WriteFile(filepath.Join(dir, "a.json"), []byte("x"), 0o600)
	if !errors.Is(err, permanent) {
		t.Fatalf("err = %v, want the rename failure", err)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Fatalf("temporary file left behind: %v", entries)
	}
}

func TestWriteFileGivesUpAfterTheRetryBudget(t *testing.T) {
	calls := 0
	restore := swapRename(func(from, to string) error {
		calls++
		return &os.LinkError{Op: "rename", Old: from, New: to, Err: errTransient}
	})
	defer restore()
	err := WriteFile(filepath.Join(t.TempDir(), "a.json"), []byte("x"), 0o600)
	if !errors.Is(err, errTransient) {
		t.Fatalf("err = %v, want the last transient failure", err)
	}
	if calls != renameAttempts {
		t.Fatalf("rename called %d times, want %d", calls, renameAttempts)
	}
}
