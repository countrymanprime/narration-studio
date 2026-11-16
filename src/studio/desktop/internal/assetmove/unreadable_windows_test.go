//go:build windows

package assetmove

import (
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"testing"
)

// hold opens path (a file or a folder) with no sharing, so Windows answers every other open of it, and a delete of it, with a sharing
// violation, whatever the account: a mode or an icacls deny does not bind an elevated process, and the CI runner is one, which is why these
// guards skipped there (#3630). It answers the function that lets go; the test also lets go when it ends, before the temp folder is removed.
func hold(t *testing.T, path string) func() {
	t.Helper()
	name, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		t.Fatal(err)
	}
	// FILE_FLAG_BACKUP_SEMANTICS lets the same call open a folder.
	handle, err := syscall.CreateFile(name, syscall.GENERIC_READ, 0, nil, syscall.OPEN_EXISTING, syscall.FILE_FLAG_BACKUP_SEMANTICS, 0)
	if err != nil {
		t.Fatalf("could not hold %s open exclusively: %v", path, err)
	}
	var once sync.Once
	release := func() { once.Do(func() { _ = syscall.CloseHandle(handle) }) }
	t.Cleanup(release)
	return release
}

// makeUnreadable makes path fail every open until the answer is called (or the test ends). It fails the test, not skips, if the open still
// works: a guard that cannot be made to bite proves nothing.
func makeUnreadable(t *testing.T, path string) func() {
	t.Helper()
	release := hold(t, path)
	if file, err := os.Open(path); err == nil {
		_ = file.Close()
		t.Fatalf("%s is still readable while another handle holds it with no sharing", path)
	}
	return release
}

// makeUndeletable makes every file under dir impossible to delete until the answer is called (or the test ends), by holding each one open.
func makeUndeletable(t *testing.T, dir string) func() {
	t.Helper()
	var releases []func()
	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			releases = append(releases, hold(t, path))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(releases) == 0 {
		t.Fatalf("nothing under %s to hold: the guard would prove nothing", dir)
	}
	return func() {
		for _, release := range releases {
			release()
		}
	}
}
