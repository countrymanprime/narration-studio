//go:build !windows

package bridge

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewMakesTheSessionFolderOwnerOnly(t *testing.T) {
	session := filepath.Join(t.TempDir(), "session")
	if _, err := New(session); err != nil {
		t.Fatal(err)
	}
	for _, dir := range []string{session, filepath.Join(session, "commands")} {
		info, err := os.Stat(dir)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != 0o700 {
			t.Fatalf("%s is %o, want 700", dir, info.Mode().Perm())
		}
	}
}

func TestNewRefusesToUseAFolderItCannotRestrict(t *testing.T) {
	previous := restrictFolder
	restrictFolder = func(string) error { return errors.New("access denied") }
	t.Cleanup(func() { restrictFolder = previous })

	client, err := New(filepath.Join(t.TempDir(), "session"))

	if err == nil || client != nil {
		t.Fatalf("New = %v, %v; want an error and no client when the folder cannot be limited to the user", client, err)
	}
	if !strings.Contains(err.Error(), "secure the bridge folder") {
		t.Fatalf("error %q does not say the folder could not be secured", err)
	}
}
