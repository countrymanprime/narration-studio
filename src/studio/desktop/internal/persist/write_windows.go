//go:build windows

package persist

import (
	"errors"
	"syscall"
)

const (
	errorSharingViolation = syscall.Errno(32)
	errorLockViolation    = syscall.Errno(33)
)

// isTransient is the set of errors Windows returns while another handle holds the destination: access denied, sharing violation
// and lock violation. They pass on their own, which a permanent failure does not.
func isTransient(err error) bool {
	return errors.Is(err, errTransient) || errors.Is(err, syscall.ERROR_ACCESS_DENIED) ||
		errors.Is(err, errorSharingViolation) || errors.Is(err, errorLockViolation)
}

// syncFolder is a no-op: Windows cannot open a folder to flush it, and NTFS journals the rename.
func syncFolder(string) {}
