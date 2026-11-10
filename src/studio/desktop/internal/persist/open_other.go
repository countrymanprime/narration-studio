//go:build !windows

package persist

import "os"

// Open is os.Open: a POSIX rename over an open file succeeds, so the reader needs no special share mode.
func Open(name string) (*os.File, error) { return os.Open(name) }
