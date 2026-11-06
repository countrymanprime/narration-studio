//go:build !windows

package persist

import (
	"errors"
	"os"
)

// isTransient is false for everything but the test stand-in: a POSIX rename over an open file succeeds.
func isTransient(err error) bool { return errors.Is(err, errTransient) }

// syncFolder flushes the folder so the rename survives a power cut. A failure is ignored: the data file itself was already flushed.
func syncFolder(dir string) {
	folder, err := os.Open(dir)
	if err != nil {
		return
	}
	_ = folder.Sync()
	_ = folder.Close()
}
