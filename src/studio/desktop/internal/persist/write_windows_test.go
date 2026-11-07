//go:build windows

package persist

import (
	"os"
	"syscall"
	"testing"
)

func TestWindowsBusyDestinationErrorsAreTransient(t *testing.T) {
	for name, errno := range map[string]syscall.Errno{
		"access denied":     syscall.ERROR_ACCESS_DENIED,
		"sharing violation": errorSharingViolation,
		"lock violation":    errorLockViolation,
	} {
		if !isTransient(&os.LinkError{Op: "rename", Old: "a", New: "b", Err: errno}) {
			t.Errorf("%s is not treated as transient", name)
		}
	}
	if isTransient(&os.LinkError{Op: "rename", Old: "a", New: "b", Err: syscall.ERROR_FILE_NOT_FOUND}) {
		t.Error("file not found is treated as transient")
	}
}
