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

// rename is os.Rename; tests swap it.
var rename = os.Rename

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
	keep := false
	defer func() {
		if !keep {
			_ = os.Remove(name)
		}
	}()
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Chmod(perm); err != nil && !errors.Is(err, os.ErrPermission) {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := renameWithRetry(name, path); err != nil {
		return err
	}
	keep = true
	syncFolder(filepath.Dir(path))
	return nil
}

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
