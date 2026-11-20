package persist

import (
	"io"
	"os"
	"sync/atomic"
)

// decodes and listings count the work ReadJSON and ReadDir did in this process, for the tests that budget what a host read costs.
var decodes, listings atomic.Int64

// Work reports how many files ReadJSON has read and decoded and how many folders ReadDir has listed since the process started. A
// test takes the difference across a read; nothing in the app depends on the numbers.
func Work() (decoded, listed int64) { return decodes.Load(), listings.Load() }

// ReadDir is os.ReadDir, counted for Work. List a folder of persisted records through it.
func ReadDir(name string) ([]os.DirEntry, error) {
	listings.Add(1)
	return os.ReadDir(name)
}

// ReadFile is os.ReadFile that, on Windows, does not stop a save from renaming over the file while it reads (see Open). Read every
// file the host also rewrites with WriteFile or Rename through it, not through os.ReadFile.
func ReadFile(name string) ([]byte, error) {
	file, err := Open(name)
	if err != nil {
		return nil, err
	}
	defer func() { _ = file.Close() }()
	return io.ReadAll(file)
}
