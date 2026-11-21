package persist

import (
	"errors"
	"io/fs"
	"os"
)

// IsRegular reports whether rel beneath the folder root is a regular file, by RemoveRegular's rules: the answer a
// delete of the same path would act on, for a caller that has work to do before it deletes.
func IsRegular(root, rel string) (bool, error) {
	return onRegular(root, rel, func(*os.Root) error { return nil })
}

// RemoveRegular deletes the regular file at rel beneath the folder root, and reports whether it deleted one. It is for
// code that deletes files the host stored under a project: rel is a path below root, and the delete goes through an
// os.Root opened on root, so a ".." in rel, an absolute rel, or a link or junction on the way that leads outside root
// is refused with an error and nothing is deleted. A link, a folder or anything else that is not a regular file at rel
// is left where it is, and so is its target. A root or a file that is not there is nothing to delete, not an error.
// A delete moves Generation, as Advance does.
func RemoveRegular(root, rel string) (bool, error) {
	removed, err := onRegular(root, rel, func(folder *os.Root) error { return folder.Remove(rel) })
	if removed {
		Advance()
	}
	return removed, err
}

// onRegular runs act when rel beneath root is a regular file, and reports whether act ran and succeeded.
func onRegular(root, rel string, act func(*os.Root) error) (bool, error) {
	folder, err := os.OpenRoot(root)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	defer func() { _ = folder.Close() }()
	info, err := folder.Lstat(rel)
	if err == nil && info.Mode().IsRegular() {
		if err = act(folder); err == nil {
			return true, nil
		}
	}
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return false, err
	}
	return false, nil
}
