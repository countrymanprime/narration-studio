//go:build windows

package assetmove

import (
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"testing"
	"unsafe"
)

var procLockFileEx = syscall.NewLazyDLL("kernel32.dll").NewProc("LockFileEx")

const (
	lockfileFailImmediately = 0x1
	lockfileExclusiveLock   = 0x2
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

// makeUnreadable makes path fail to be read until the answer is called (or the test ends). A folder is held open with no sharing, which
// answers every other open of it with a sharing violation. A file is locked over its whole length with an exclusive byte-range lock, which
// fails every read of it through another handle: a share mode alone did not stop a file being opened and read on the CI runner. It fails the
// test, not skips, if the failure cannot be made: a guard that cannot be made to bite proves nothing.
func makeUnreadable(t *testing.T, path string) func() {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.IsDir() {
		release := hold(t, path)
		if dir, err := os.Open(path); err == nil {
			_ = dir.Close()
			t.Fatalf("%s is still open-able while another handle holds it with no sharing", path)
		}
		return release
	}
	name, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		t.Fatal(err)
	}
	handle, err := syscall.CreateFile(name, syscall.GENERIC_READ, syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|syscall.FILE_SHARE_DELETE, nil, syscall.OPEN_EXISTING, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		t.Fatalf("could not open %s to lock it: %v", path, err)
	}
	var once sync.Once
	release := func() { once.Do(func() { _ = syscall.CloseHandle(handle) }) } // closing the handle drops the lock
	t.Cleanup(release)
	var overlapped syscall.Overlapped
	if r, _, callErr := procLockFileEx.Call(uintptr(handle), lockfileExclusiveLock|lockfileFailImmediately, 0, 0xFFFFFFFF, 0xFFFFFFFF, uintptr(unsafe.Pointer(&overlapped))); r == 0 {
		t.Fatalf("could not lock %s: %v", path, callErr)
	}
	if _, err := os.ReadFile(path); err == nil {
		t.Fatalf("%s is still readable while another handle holds an exclusive lock over it", path)
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
