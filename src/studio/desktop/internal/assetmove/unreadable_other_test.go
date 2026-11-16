//go:build !windows

package assetmove

import (
	"os"
	"testing"
)

// makeUnreadable makes path fail every open (and, for a folder, every listing) by removing its mode bits, until the answer is called or the
// test ends. A user the mode does not bind (root) reads it anyway, so the test skips there: the Windows run does not depend on the account
// (unreadable_windows_test.go).
func makeUnreadable(t *testing.T, path string) func() {
	t.Helper()
	return restrict(t, path, 0o000, func() bool {
		file, err := os.Open(path)
		if err == nil {
			_ = file.Close()
		}
		return err != nil
	})
}

// makeUndeletable makes the entries of dir impossible to delete (a folder without write permission) until the answer is called or the test
// ends. It skips for a user the mode does not bind.
func makeUndeletable(t *testing.T, dir string) func() {
	t.Helper()
	probe := dir + string(os.PathSeparator) + ".probe"
	return restrict(t, dir, 0o555, func() bool {
		file, err := os.Create(probe)
		if err == nil {
			_ = file.Close()
			_ = os.Remove(probe)
		}
		return err != nil
	})
}

// restrict sets path's mode, puts it back when the answer is called or the test ends, and skips the test when enforced reports the mode
// binds nobody (the user is root).
func restrict(t *testing.T, path string, mode os.FileMode, enforced func() bool) func() {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	original := info.Mode().Perm()
	if err := os.Chmod(path, mode); err != nil {
		t.Fatal(err)
	}
	restore := func() { _ = os.Chmod(path, original) }
	t.Cleanup(restore)
	if !enforced() {
		restore()
		t.Skip("the file mode does not bind this user (root), so the failure cannot be made")
	}
	return restore
}
