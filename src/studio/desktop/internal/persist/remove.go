package persist

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
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
		if info.Mode().Type() != fs.ModeDir {
			return false, fmt.Errorf("%s is a link or a file, not a folder: nothing is listed or deleted through it", dir)
		}
	}
	return true, nil
}

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
	info, err := folder.Lstat(rel)
	if err == nil && info.Mode().IsRegular() {
		beforeAct()
		if err = act(folder); err == nil {
			return true, nil
		}
	}
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}
	return false, nil
}
