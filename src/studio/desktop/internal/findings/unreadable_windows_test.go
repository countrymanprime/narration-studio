//go:build windows

package findings

import (
	"os"
	"syscall"
	"testing"
	"unsafe"

	"desktop/internal/persist"
)

var procLockFileEx = syscall.NewLazyDLL("kernel32.dll").NewProc("LockFileEx")

const (
	lockfileFailImmediately = 0x1
	lockfileExclusiveLock   = 0x2
)

// makeUnreadable makes path (a file or a folder) fail to be read for the rest of the test, whatever the account (an icacls deny does not bind
// an elevated process, and the CI runner is one: these guards used to skip there, #3630). A folder is held open with no sharing, which
// answers every other open of it with a sharing violation. A file is locked over its whole length with an exclusive byte-range lock, which
// fails every read of it through another handle (a share mode alone did not stop it being opened and read on the runner). The hold ends with
// the test, before the temp folder is removed: call t.TempDir() before makeUnreadable, so the cleanups run in that order.
func makeUnreadable(t *testing.T, path string) {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	name, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.IsDir() {
		// FILE_FLAG_BACKUP_SEMANTICS lets CreateFile open a folder.
		handle, err := syscall.CreateFile(name, syscall.GENERIC_READ, 0, nil, syscall.OPEN_EXISTING, syscall.FILE_FLAG_BACKUP_SEMANTICS, 0)
		if err != nil {
			t.Fatalf("could not hold %s open exclusively: %v", path, err)
		}
		t.Cleanup(func() { _ = syscall.CloseHandle(handle) })
		if _, err := os.ReadDir(path); err == nil {
			t.Fatalf("%s can still be listed while another handle holds it with no sharing: the guard would prove nothing", path)
		}
		return
	}
	handle, err := syscall.CreateFile(name, syscall.GENERIC_READ, syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|syscall.FILE_SHARE_DELETE, nil, syscall.OPEN_EXISTING, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		t.Fatalf("could not open %s to lock it: %v", path, err)
	}
	t.Cleanup(func() { _ = syscall.CloseHandle(handle) }) // closing the handle drops the lock
	var overlapped syscall.Overlapped
	if r, _, callErr := procLockFileEx.Call(uintptr(handle), lockfileExclusiveLock|lockfileFailImmediately, 0, 0xFFFFFFFF, 0xFFFFFFFF, uintptr(unsafe.Pointer(&overlapped))); r == 0 {
		t.Fatalf("could not lock %s: %v", path, callErr)
	}
	// persist.ReadFile is the read the store makes (it opens with its own share modes), so it is the one to prove fails.
	if _, err := persist.ReadFile(path); err == nil {
		t.Fatalf("%s is still readable while another handle holds an exclusive lock over it: the guard would prove nothing", path)
	}
}
