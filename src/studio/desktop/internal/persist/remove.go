package persist

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"time"
)

// IsRegular reports whether rel beneath the folder root is a regular file, by RemoveRegular's rules: the answer a
// delete of the same path would act on, for a caller that has work to do before it deletes.
func IsRegular(root, rel string) (bool, error) {
	return onRegular(root, rel, func(*os.Root) error { return nil })
}

// RemoveRegular deletes the regular file at rel beneath the folder root, and reports whether it deleted one. It is for
// code that deletes files the host stored under a project: rel is a path below root, and the delete goes through an
// os.Root opened on root, so a ".." in rel or an absolute rel is refused with an error and nothing is deleted. Every
// folder of rel must be a folder itself (RealFolder): a link or junction on the way is refused with an error wherever
// it leads, because a folder linked to another folder of the project would have a delete by name take that folder's
// files. The root itself may be reached through a link. A link, a folder or anything else that is not a regular file
// at rel is left where it is, and so is its target. A root, a folder of rel or a file that is not there is nothing to
// delete, not an error. A delete moves Generation, as Advance does.
//
// The folders are checked and then the file is deleted, so a folder swapped for a link between the two is followed;
// the os.Root still keeps that delete inside root.
func RemoveRegular(root, rel string) (bool, error) {
	removed, err := onRegular(root, rel, func(folder *os.Root) error { return folder.Remove(rel) })
	if removed {
		Advance()
	}
	return removed, err
}

// RealFolder reports whether rel beneath the folder root is a folder reached through folders only: rel and every
// folder above it, up to root, is a directory itself. One that is a link, a junction, a file or anything else is an
// error, since what is listed or deleted below it would be another folder's files. A root or a folder that is not
// there is false with no error. The root itself may be reached through a link.
func RealFolder(root, rel string) (bool, error) {
	folder, err := os.OpenRoot(root)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	defer func() { _ = folder.Close() }()
	return realFolder(folder, rel)
}

// realFolder is RealFolder beneath an open root.
func realFolder(folder *os.Root, rel string) (bool, error) {
	// rel's folders, the deepest first: Dir stops at "." for a relative path and at the volume's root for an absolute one,
	// which the os.Root then refuses.
	var folders []string
	for dir := filepath.Clean(rel); dir != "." && dir != filepath.Dir(dir); dir = filepath.Dir(dir) {
		folders = append(folders, dir)
	}
	for _, dir := range slices.Backward(folders) {
		info, err := folder.Lstat(dir)
		if errors.Is(err, fs.ErrNotExist) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if !isRealFolder(info.Mode()) {
			return false, fmt.Errorf("%s is a link or a file, not a folder: nothing is listed or deleted through it", dir)
		}
	}
	return true, nil
}

// isRealFolder reports whether an Lstat mode is a folder itself. A link or junction is reported without ModeDir; a folder
// that Windows tags with a reparse point that is not a link (OneDrive's cloud files) is reported as ModeDir|ModeIrregular,
// and is a folder.
func isRealFolder(mode fs.FileMode) bool { return mode&fs.ModeSymlink == 0 && mode.IsDir() }

// beforeAct runs between onRegular's checks and its act; tests swap it.
var beforeAct = func() {}

// onRegular runs act when rel beneath root is a regular file in real folders, and reports whether act ran and succeeded.
func onRegular(root, rel string, act func(*os.Root) error) (bool, error) {
	folder, err := os.OpenRoot(root)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	defer func() { _ = folder.Close() }()
	if within, err := realFolder(folder, filepath.Dir(rel)); err != nil || !within {
		return false, err
	}
	info, err := lstatSettled(folder, rel)
	if err == nil && info.Mode().IsRegular() {
		beforeAct()
		if err = act(folder); err == nil {
			return true, nil
		}
		if errors.Is(err, fs.ErrPermission) {
			// Another delete of the same file may have been in flight: let it settle, and a file that is gone then is not an error.
			_, err = lstatSettled(folder, rel)
		}
	}
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}
	return false, nil
}

// lstatRoot and settleWait are seams for the tests of lstatSettled.
var (
	lstatRoot  = func(folder *os.Root, name string) (fs.FileInfo, error) { return folder.Lstat(name) }
	settleWait = 10 * time.Millisecond
)

// settleTries is how often lstatSettled asks again of a file that answers "access denied".
const settleTries = 20

// lstatSettled is Lstat of rel that waits out a delete in flight. On Windows a file whose delete is pending (another handle still
// open) answers a stat or an open with "access is denied" and not "not exist", until the delete completes a moment later; two
// stores pruning one project meet this. An access-denied answer is therefore asked again for up to a fifth of a second, and
// what it settles to (the file, or not there) is returned; one that never settles is a permission problem and is returned as is.
func lstatSettled(folder *os.Root, rel string) (fs.FileInfo, error) {
	info, err := lstatRoot(folder, rel)
	for range settleTries {
		if !errors.Is(err, fs.ErrPermission) {
			break
		}
		time.Sleep(settleWait)
		info, err = lstatRoot(folder, rel)
	}
	return info, err
}
