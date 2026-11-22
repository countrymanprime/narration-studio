package persist

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

// FileState is what Recheck found of a file the caller listed some time ago.
type FileState int

const (
	// FileSame: the same regular file, with the size and modification time it was listed with.
	FileSame FileState = iota
	// FileGone: nothing is there any more.
	FileGone
	// FileNotRegular: a folder, link, pipe or device has taken the name.
	FileNotRegular
	// FileChanged: a regular file whose size, modification time or identity is not the listed one (written or used since), or one that cannot be looked at.
	FileChanged
)

// Recheck looks at path again just before it is removed, and says whether it is still the regular file that was listed with that
// size, modification time and identity (listed is the FileInfo the listing opened or read; os.SameFile compares against it). A writer that
// renames another file over the name shows in the identity even on a filesystem whose times are too coarse to show it. The current
// FileInfo comes back for the callers that count it (it is nil for a file that is gone or cannot be looked at).
func Recheck(path string, size int64, modTime time.Time, listed os.FileInfo) (FileState, os.FileInfo) {
	current, err := os.Lstat(path)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return FileGone, nil
	case err != nil:
		return FileChanged, nil
	case !current.Mode().IsRegular():
		return FileNotRegular, current
	case !current.ModTime().Equal(modTime) || current.Size() != size || !os.SameFile(listed, current):
		return FileChanged, current
	}
	return FileSame, current
}

// SetFileTime sets the modification time of the file name in dir to at, through an os.Root opened on dir, which a link cannot lead
// out of. It is a variable so a test can make it fail on every platform (a file time can only be set by the file's owner).
var SetFileTime = func(dir, name string, at time.Time) error {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()
	return root.Chtimes(name, at, at)
}

// MarkUsed moves the modification time of the file name in dir to now when it is older than every, or dated in the future: the
// file's time is then its last use, for the prune passes that order by it. A hit costs one stat and, at most once in every, a time
// change; the contents are not rewritten. A failure is ignored: the file then keeps its time, which costs a recompute at worst.
func MarkUsed(dir, name string, every time.Duration, now time.Time) {
	info, err := os.Lstat(filepath.Join(dir, name))
	if err != nil {
		return
	}
	if age := now.Sub(info.ModTime()); age >= 0 && age < every {
		return
	}
	_ = SetFileTime(dir, name, now)
}

// Failures is the one-line error for the removals of a pass that failed: the count and the first (they are usually all the same
// one), for a host log that cuts a long message. No failure is nil.
func Failures(failures []error) error {
	switch len(failures) {
	case 0:
		return nil
	case 1:
		return failures[0]
	}
	return fmt.Errorf("%d removals failed, the first: %w", len(failures), failures[0])
}

// PruneRule says which files of a flat folder a PruneFolder pass may remove, and when.
type PruneRule struct {
	// Group names the group a file belongs to (a run's files share one, a file alone is its own) and false for a name the folder's
	// writer does not use: such a file is never counted, grouped or removed.
	Group func(name string) (string, bool)
	// KeepGroups, when above zero, is how many of the newest groups stay; the rest go.
	KeepGroups int
	// MaxAge, when above zero, removes a group whose newest file is older than it.
	MaxAge time.Duration
	// MaxBytes, when above zero, removes the oldest groups until the groups left hold no more than that.
	MaxBytes int64
	// SizeGuard keeps a group with a file modified within it out of the removals that meet MaxBytes (a writer may still be on it).
	SizeGuard time.Duration
}

// PrunePass is what one PruneFolder pass found and did: the regular files of the folder and their bytes before and after, and how
// many it removed. Stopped is set when the pass was told to stop; the counts are then of what it had reached.
type PrunePass struct {
	FilesBefore, FilesAfter int
	BytesBefore, BytesAfter int64
	Removed                 int
	Stopped                 bool
}

// removeFile removes one regular file below a root and listFolder lists a folder; variables so a test can make either fail on every platform.
var (
	removeFile = RemoveRegular
	listFolder = ReadDir
)

// maxPruneFailures is how many removals may fail in one pass before it gives up.
const maxPruneFailures = 8

// pruneChunk is how many entries a pass reads between two looks at its stop function.
const pruneChunk = 256

type prunedFile struct {
	name string
	info os.FileInfo
	// settled is set when the recheck found the file gone or no longer a regular file: it is out of the tally and not for removal.
	settled bool
}

type prunedGroup struct {
	files  []prunedFile
	newest time.Time
	bytes  int64
}

// PruneFolder removes files from the flat folder rel beneath root by rule, as one pass: the groups older than MaxAge or beyond
// KeepGroups, then the oldest groups beyond MaxBytes. Only regular files that rule.Group names are touched. Deletes go through
// RemoveRegular after RealFolder (a folder that is a link, or below one, is an error and nothing is removed). Every file of a group is looked at again
// just before the group goes (Recheck): a group with a file that was written or used since the listing stays whole. stop is asked
// before the scan, every pruneChunk entries and before each group; a pass gives up after eight failed removals with one line. A
// file time in the future counts as now. A folder that is not there is nothing to do.
func PruneFolder(root, rel string, rule PruneRule, now time.Time, stop func() bool) (PrunePass, error) {
	var pass PrunePass
	if stop == nil {
		stop = func() bool { return false }
	}
	if root == "" {
		return pass, nil
	}
	root = filepath.Clean(root)
	real, err := RealFolder(root, rel)
	if err != nil {
		return pass, fmt.Errorf("the folder is not a real folder: %w", err)
	}
	if !real {
		return pass, nil
	}
	dir := filepath.Join(root, rel)
	entries, err := listFolder(dir)
	if err != nil {
		return pass, fmt.Errorf("could not list the folder: %w", err)
	}
	groups := map[string]*prunedGroup{}
	for i, entry := range entries {
		if i%pruneChunk == 0 && stop() {
			pass.Stopped = true
			pass.FilesAfter, pass.BytesAfter = pass.FilesBefore, pass.BytesBefore
			return pass, nil
		}
		if !entry.Type().IsRegular() {
			continue
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		pass.FilesBefore++
		pass.BytesBefore += info.Size()
		key, ok := rule.Group(entry.Name())
		if !ok {
			continue
		}
		group := groups[key]
		if group == nil {
			group = &prunedGroup{}
			groups[key] = group
		}
		group.files = append(group.files, prunedFile{name: entry.Name(), info: info})
		group.bytes += info.Size()
		modified := info.ModTime()
		if modified.After(now) {
			modified = now // a time in the future counts as now
		}
		if modified.After(group.newest) {
			group.newest = modified
		}
	}
	pass.FilesAfter, pass.BytesAfter = pass.FilesBefore, pass.BytesBefore

	ordered := make([]*prunedGroup, 0, len(groups))
	for _, group := range groups {
		ordered = append(ordered, group)
	}
	// Newest first; groups with the same time in the order of their first file's name, so a pass is repeatable.
	slices.SortFunc(ordered, func(a, b *prunedGroup) int {
		if c := b.newest.Compare(a.newest); c != 0 {
			return c
		}
		return strings.Compare(a.files[0].name, b.files[0].name)
	})
	var doomed []*prunedGroup
	var kept int64
	var keptGroups []*prunedGroup
	for i, group := range ordered {
		if (rule.KeepGroups > 0 && i >= rule.KeepGroups) || (rule.MaxAge > 0 && now.Sub(group.newest) > rule.MaxAge) {
			doomed = append(doomed, group)
			continue
		}
		kept += group.bytes
		keptGroups = append(keptGroups, group)
	}
	if rule.MaxBytes > 0 {
		// The oldest of what is left first, but not a group a writer may still be on.
		for i := len(keptGroups) - 1; i >= 0 && kept > rule.MaxBytes; i-- {
			if group := keptGroups[i]; now.Sub(group.newest) >= rule.SizeGuard {
				doomed = append(doomed, group)
				kept -= group.bytes
			}
		}
	}
	// Oldest first: a pass cut short has removed what is least likely to be wanted.
	slices.Reverse(doomed)
	var failures []error
	for _, group := range doomed {
		if stop() {
			pass.Stopped = true
			return pass, Failures(failures)
		}
		if !groupUnchanged(dir, group, &pass) {
			continue
		}
		for _, file := range group.files {
			if file.settled {
				continue
			}
			removed, err := removeFile(root, filepath.Join(rel, file.name))
			if err != nil {
				failures = append(failures, fmt.Errorf("could not remove %s: %w", file.name, err))
				if len(failures) >= maxPruneFailures {
					return pass, fmt.Errorf("gave up after %d failed removals, the first: %w", maxPruneFailures, failures[0])
				}
				continue
			}
			pass.FilesAfter--
			pass.BytesAfter -= file.info.Size()
			if removed {
				pass.Removed++
			}
		}
	}
	return pass, Failures(failures)
}

// groupUnchanged looks at every file of the group again and reports whether the group may go: one written, used or replaced since the
// listing, or one that cannot be looked at, keeps the whole group. A file that is gone (another pass or a manuscript reset took it) or
// that a folder, link or pipe has taken the name of is out of the tally from here on, and is not asked of again.
func groupUnchanged(dir string, group *prunedGroup, pass *PrunePass) bool {
	unchanged := true
	for i := range group.files {
		file := &group.files[i]
		state, _ := Recheck(filepath.Join(dir, file.name), file.info.Size(), file.info.ModTime(), file.info)
		switch state {
		case FileGone, FileNotRegular:
			file.settled = true
			pass.FilesAfter--
			pass.BytesAfter -= file.info.Size()
			if state == FileNotRegular {
				unchanged = false
			}
		case FileChanged:
			unchanged = false
		}
	}
	return unchanged
}
