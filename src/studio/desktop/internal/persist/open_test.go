package persist

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"
)

func TestReadFileReadsAndReportsAMissingFileAsNotExist(t *testing.T) {
	path := filepath.Join(t.TempDir(), "a.json")
	if _, err := ReadFile(path); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("missing file: err = %v, want fs.ErrNotExist", err)
	}
	if err := os.WriteFile(path, []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got, err := ReadFile(path); err != nil || string(got) != "hello" {
		t.Fatalf("ReadFile = %q, %v", got, err)
	}
}

// A save (WriteFile) must go through while a reader still holds the file open. On Linux this holds for any open; on Windows it
// holds only because Open sets FILE_SHARE_DELETE, so the same test fails there if the helper regresses to os.Open.
func TestSaveSucceedsWhileAReaderHoldsTheFileOpen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	reader, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reader.Close() }()
	if err := WriteFile(path, []byte("new"), 0o600); err != nil {
		t.Fatalf("WriteFile while a reader is open: %v", err)
	}
	if got, _ := ReadFile(path); string(got) != "new" {
		t.Fatalf("content = %q, want new", got)
	}
}

func TestReadFileMaxStopsAtTheLimitWhateverTheSizeSaid(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "f")
	if err := os.WriteFile(path, make([]byte, 100), 0o600); err != nil {
		t.Fatal(err)
	}
	if raw, err := ReadFileMax(path, 100); err != nil || len(raw) != 100 {
		t.Fatalf("a file at the limit: %d bytes, %v", len(raw), err)
	}
	if _, err := ReadFileMax(path, 99); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("a file over the limit: err = %v, want ErrTooLarge", err)
	}
	if raw, err := ReadFileMax(filepath.Join(dir, "none"), 10); err == nil || raw != nil {
		t.Fatalf("a missing file answered %d bytes and %v", len(raw), err)
	}
}
