package persist

import (
	"bytes"
	"errors"
	"io"
	"io/fs"
	"math"
	"os"
	"sync/atomic"
)

// decodes and listings count the work ReadJSON, ReadHeld (a file it decoded, not one it only hashed) and ReadDir did in this process, for the tests that budget what a host read costs.
var decodes, listings atomic.Int64

// errNotAFile is why ReadFile refuses a named pipe, a socket or a device: a read of one waits for a writer that may never come.
var errNotAFile = errors.New("not a regular file")

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
	// One buffer of the file's size, as os.ReadFile makes: io.ReadAll grows and copies its buffer as it goes, which more
	// than doubled the read of a megabyte file, and every held file is read whole on every ask (issue 3863).
	size := 0
	if info, err := file.Stat(); err == nil {
		if info.Mode()&(os.ModeNamedPipe|os.ModeSocket|os.ModeDevice) != 0 {
			return nil, &fs.PathError{Op: "read", Path: name, Err: errNotAFile}
		}
		if info.Size() > 0 && info.Size() < math.MaxInt32 {
			size = int(info.Size())
		}
	}
	return readSized(file, size)
}

// readSized reads r to its end into a buffer made for size bytes, with room past them so the read that finds the end
// needs no larger buffer. A reader that holds more than size (the file grew after it was opened) grows the buffer.
func readSized(r io.Reader, size int) ([]byte, error) {
	data := make([]byte, 0, size+bytes.MinRead)
	for {
		n, err := r.Read(data[len(data):cap(data)])
		data = data[:len(data)+n]
		if err == io.EOF {
			return data, nil
		}
		if err != nil {
			return nil, err
		}
		if len(data) == cap(data) {
			data = append(data, 0)[:len(data)]
		}
	}
}
