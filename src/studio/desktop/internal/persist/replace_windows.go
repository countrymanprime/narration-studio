//go:build windows

package persist

import (
	"errors"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	renameReplaceIfExists = 0x1
	renamePosixSemantics  = 0x2
)

// replaceFile moves from over to. os.Rename (MoveFileEx) cannot replace a file that anyone holds open, even one opened with
// FILE_SHARE_DELETE, because the old file stays linked until the last handle closes. A rename with POSIX semantics unlinks it at
// once and the open reader keeps its handle, which is what Open's FILE_SHARE_DELETE is for. Windows builds that predate it (before
// 1709), or a volume that lacks it, fall back to os.Rename.
func replaceFile(from, to string) error {
	err := posixRenameFn(from, to)
	if err == nil || !errors.Is(err, errPosixRenameUnsupported) {
		return err
	}
	return os.Rename(from, to)
}

var errPosixRenameUnsupported = errors.New("posix rename unsupported")

// posixRenameFn is posixRename; a test swaps it to reach the fallback.
var posixRenameFn = posixRename

// unsupported is the set of errors Windows gives for a rename class or flag it does not know.
func unsupported(err error) bool {
	return errors.Is(err, windows.ERROR_INVALID_PARAMETER) || errors.Is(err, windows.ERROR_NOT_SUPPORTED) || errors.Is(err, windows.ERROR_INVALID_FUNCTION)
}

func posixRename(from, to string) error {
	target, err := filepath.Abs(to)
	if err != nil {
		return err
	}
	name, err := windows.UTF16FromString(target)
	if err != nil {
		return &os.LinkError{Op: "rename", Old: from, New: to, Err: err}
	}
	source, err := windows.UTF16PtrFromString(from)
	if err != nil {
		return &os.LinkError{Op: "rename", Old: from, New: to, Err: err}
	}
	// DELETE access is what a rename needs; the share mode lets the source's other handles stay open.
	handle, err := windows.CreateFile(source, windows.DELETE|windows.SYNCHRONIZE,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE, nil, windows.OPEN_EXISTING,
		windows.FILE_FLAG_BACKUP_SEMANTICS, 0)
	if err != nil {
		return &os.LinkError{Op: "rename", Old: from, New: to, Err: err}
	}
	defer func() { _ = windows.CloseHandle(handle) }()

	// FILE_RENAME_INFO_EX: Flags uint32, RootDirectory HANDLE, FileNameLength uint32 (bytes), FileName []uint16 (no terminator needed).
	type header struct {
		Flags          uint32
		RootDirectory  windows.Handle
		FileNameLength uint32
	}
	// FileName follows FileNameLength directly (offset 20 on 64-bit), not at the padded size of the Go struct.
	const nameOffset = unsafe.Offsetof(header{}.FileNameLength) + unsafe.Sizeof(uint32(0))
	nameBytes := (len(name) - 1) * 2
	buffer := make([]byte, int(nameOffset)+nameBytes+2)
	info := (*header)(unsafe.Pointer(&buffer[0])) //nolint:gosec // G103: the Win32 call takes a raw struct pointer; the buffer outlives it
	info.Flags = renameReplaceIfExists | renamePosixSemantics
	info.FileNameLength = uint32(nameBytes)                                                                     //nolint:gosec // G115: a path is far below 4 GiB
	copy(buffer[nameOffset:], unsafe.Slice((*byte)(unsafe.Pointer(&name[0])), nameBytes))                       //nolint:gosec // G103: the bytes of the UTF-16 name, which outlives the copy
	err = windows.SetFileInformationByHandle(handle, windows.FileRenameInfoEx, &buffer[0], uint32(len(buffer))) //nolint:gosec // G115: the buffer is a path plus a header
	if err == nil {
		return nil
	}
	if unsupported(err) {
		return errPosixRenameUnsupported
	}
	return &os.LinkError{Op: "rename", Old: from, New: to, Err: err}
}
