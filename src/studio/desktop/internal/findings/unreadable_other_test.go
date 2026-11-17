//go:build !windows

package findings

import (
	"os"
	"testing"

	"desktop/internal/persist"
)

// makeUnreadable makes path (a file or a folder) fail every open for the rest of the test by removing its mode bits, and puts them back at
// the end so the temp folder can be removed. A user the mode does not bind (root) reads it anyway, so the test skips there: the Windows run
// does not depend on the account (unreadable_windows_test.go).
func makeUnreadable(t *testing.T, path string) {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(path, info.Mode().Perm()) })
	if info.IsDir() {
		if _, err := os.ReadDir(path); err == nil {
			unbound(t)
		}
	} else if _, err := persist.ReadFile(path); err == nil {
		unbound(t)
	}
}

// unbound ends the test when the file mode does not bind this user (root): a skip on a developer's machine, a failure in CI, where a guard that
// quietly does not run is the thing these helpers exist to prevent (#3630).
func unbound(t *testing.T) {
	t.Helper()
	if os.Getenv("CI") != "" {
		t.Fatal("the file mode does not bind this user (root), so the guard cannot be made to bite: run CI as an ordinary user")
	}
	t.Skip("the file mode does not bind this user (root), so the failure cannot be made")
}
