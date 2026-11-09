package persist

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// renameAttempts and renameDelay are the budget for a rename that a second handle on the destination makes fail for a moment.
const (
	renameAttempts = 8
	renameDelay    = 15 * time.Millisecond
)

// errTransient stands in for the platform's "someone has it open" error in tests; isTransient also matches it.
var errTransient = errors.New("destination is briefly in use")

// rename is the platform move (replaceFile); tests swap it.
var rename = replaceFile

func swapRename(replacement func(from, to string) error) (restore func()) {
	previous := rename
	rename = replacement
	return func() { rename = previous }
}

// WriteFile replaces path with data so a reader sees the old file or the new one, never half of one: it writes a temporary file
// in the same folder, flushes it to disk, renames it over path and flushes the folder. On Windows a rename over a file another
// handle has open without FILE_SHARE_DELETE fails with "Access is denied" (a reader in the same process, a file watcher, antivirus),
// so a rename that fails that way is retried for a moment before the error is returned.
func WriteFile(path string, data []byte, perm os.FileMode) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	name := temporary.Name()
	err = flushTemporary(temporary, data, perm)
	if err == nil {
		err = renameWithRetry(name, path)
	}
	if err != nil {
		_ = os.Remove(name)
		return err
	}
	syncFolder(filepath.Dir(path))
	return nil
}

// flushTemporary writes data to the open temporary file, sets its mode, flushes it to disk and closes it, reporting the first failure.
// Setting the mode is best effort: Windows has no POSIX mode to set.
func flushTemporary(file *os.File, data []byte, perm os.FileMode) error {
	_, err := file.Write(data)
	if err == nil {
		_ = file.Chmod(perm)
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	return err
}

// Rename is os.Rename that, on Windows, retries for a moment when another handle on the destination (or on a folder being moved) makes
// it fail with "Access is denied" or a sharing violation. Use it for every rename of a file or folder the host owns; WriteFile
// uses it for the final step of a save.
func Rename(from, to string) error { return renameWithRetry(from, to) }

func renameWithRetry(from, to string) error {
	var err error
	for attempt := 1; attempt <= renameAttempts; attempt++ {
		if err = rename(from, to); err == nil || !isTransient(err) {
			return err
		}
		if attempt < renameAttempts {
			time.Sleep(time.Duration(attempt) * renameDelay)
		}
	}
	return fmt.Errorf("%w (after %d attempts)", err, renameAttempts)
}
