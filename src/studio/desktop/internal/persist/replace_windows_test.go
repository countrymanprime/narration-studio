//go:build windows

package persist

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"testing"

	"golang.org/x/sys/windows"
)

func TestReplaceFileReplacesAnOpenDestinationAndLeavesTheReaderItsOldBytes(t *testing.T) {
	dir := t.TempDir()
	from, to := filepath.Join(dir, "new"), filepath.Join(dir, "old")
	for path, text := range map[string]string{from: "new", to: "old"} {
		if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	reader, err := Open(to)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reader.Close() }()
	if err := replaceFile(from, to); err != nil {
		t.Fatalf("replaceFile over an open file: %v", err)
	}
	buffer := make([]byte, 3)
	if n, _ := reader.Read(buffer); string(buffer[:n]) != "old" {
		t.Errorf("open reader saw %q, want its old bytes", buffer[:n])
	}
	if got, _ := os.ReadFile(to); string(got) != "new" {
		t.Errorf("destination = %q, want new", got)
	}
}

func TestReplaceFileReportsErrors(t *testing.T) {
	dir := t.TempDir()
	if err := replaceFile(filepath.Join(dir, "missing"), filepath.Join(dir, "to")); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("missing source: err = %v, want not exist", err)
	}
	for name, pair := range map[string][2]string{
		"NUL in the source":      {"a\x00b", filepath.Join(dir, "to")},
		"NUL in the destination": {filepath.Join(dir, "from"), "a\x00b"},
	} {
		if err := posixRename(pair[0], pair[1]); err == nil {
			t.Errorf("%s: no error", name)
		}
	}
}

func TestReplaceFileFallsBackToOsRenameWhenPosixRenameIsUnsupported(t *testing.T) {
	previous := posixRenameFn
	posixRenameFn = func(string, string) error { return errPosixRenameUnsupported }
	defer func() { posixRenameFn = previous }()
	dir := t.TempDir()
	from, to := filepath.Join(dir, "a"), filepath.Join(dir, "b")
	if err := os.WriteFile(from, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := replaceFile(from, to); err != nil {
		t.Fatalf("fallback: %v", err)
	}
	if _, err := os.Stat(to); err != nil {
		t.Errorf("destination missing after the fallback: %v", err)
	}
}

func TestUnsupportedRenameErrors(t *testing.T) {
	for _, errno := range []error{windows.ERROR_INVALID_PARAMETER, windows.ERROR_NOT_SUPPORTED, windows.ERROR_INVALID_FUNCTION} {
		if !unsupported(errno) {
			t.Errorf("%v is not treated as unsupported", errno)
		}
	}
	if unsupported(windows.ERROR_ACCESS_DENIED) {
		t.Error("access denied is treated as unsupported")
	}
}

func TestOpenReportsErrors(t *testing.T) {
	if _, err := Open(filepath.Join(t.TempDir(), "missing")); !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("missing file: err = %v, want not exist", err)
	}
	if _, err := Open("a\x00b"); err == nil {
		t.Error("NUL in the name: no error")
	}
}
