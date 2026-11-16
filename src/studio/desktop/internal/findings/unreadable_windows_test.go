//go:build windows

package findings

import (
	"os"
	"syscall"
	"testing"
)

// makeUnreadable makes path (a file or a folder) fail every open for the rest of the test by holding it open with no sharing, which
// Windows answers with a sharing violation to any other open, whatever the account (an icacls deny does not bind an elevated process, and the
// CI runner is one: these guards used to skip there, #3630). The handle closes at the end of the test, before the temp folder is removed.
func makeUnreadable(t *testing.T, path string) {
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
	t.Cleanup(func() { _ = syscall.CloseHandle(handle) })
	if file, err := os.Open(path); err == nil {
		_ = file.Close()
		t.Fatalf("%s is still readable while another handle holds it with no sharing: the guard would prove nothing", path)
	}
}
