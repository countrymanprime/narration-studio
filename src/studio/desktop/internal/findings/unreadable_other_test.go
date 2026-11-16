//go:build !windows

package findings

import (
	"os"
	"testing"
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
	if file, err := os.Open(path); err == nil {
		_ = file.Close()
		t.Skip("the file mode does not bind this user (root), so the failure cannot be made")
	}
}
