//go:build !windows

package bridge

import (
	"os"
	"path/filepath"
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
