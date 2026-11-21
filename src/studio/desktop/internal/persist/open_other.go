//go:build !windows

package persist

import (
	"os"
	"syscall"
)

// Open is os.Open without the wait: a POSIX rename over an open file succeeds, so the reader needs no special share mode, and
// O_NONBLOCK makes opening a named pipe that has no writer return at once (ReadFile then refuses it) instead of blocking for
// good. A regular file is opened as os.Open opens it.
func Open(name string) (*os.File, error) { return os.OpenFile(name, os.O_RDONLY|syscall.O_NONBLOCK, 0) }
