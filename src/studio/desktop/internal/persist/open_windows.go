//go:build windows

package persist

import (
	"io/fs"
	"os"
	"syscall"
)

// Open opens name for reading with FILE_SHARE_DELETE, which Go's os.Open leaves out. Without it a rename over the file (every save
// WriteFile and Rename make) fails with "Access is denied" for as long as the reader holds the handle; with it the rename
// goes through and the reader keeps reading the old contents.
func Open(name string) (*os.File, error) {
	path, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return nil, &fs.PathError{Op: "open", Path: name, Err: err}
	}
	handle, err := syscall.CreateFile(path, syscall.GENERIC_READ, syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|syscall.FILE_SHARE_DELETE,
		nil, syscall.OPEN_EXISTING, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		return nil, &fs.PathError{Op: "open", Path: name, Err: err}
	}
	return os.NewFile(uintptr(handle), name), nil
}
