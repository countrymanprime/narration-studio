// Package assetmove moves the folder the approved downloads are kept in: copy, check every byte, and only then put the copy in place. It
// never changes or deletes the source (RemoveOld is a separate, later call), so a cancel, a full or read-only disk, a bad copy or a crash
// leaves the narrator with exactly the models they had.
package assetmove

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"desktop/internal/assets"
)

// The phases a move reports.
const (
	PhaseCopying   = "copying"
	PhaseVerifying = "verifying"
)

// movingPrefix names the staging folder a move works in, inside the target. A folder with this prefix is ours: an interrupted move's is
// removed by the next one.
const movingPrefix = ".models-move-"

var (
	// ErrSameFolder is a target that is the source.
	ErrSameFolder = errors.New("that is the folder the models are already in")
	// ErrTargetInsideSource is a target within the source: copying would feed on itself, and removing the old copy would remove the new.
	ErrTargetInsideSource = errors.New("the new folder is inside the current one")
	// ErrSourceInsideTarget is a target that holds the source.
	ErrSourceInsideTarget = errors.New("the current folder is inside the new one")
	// ErrTargetNotEmpty is a target that already holds files, which a move never mixes with or overwrites.
	ErrTargetNotEmpty = errors.New("the new folder is not empty")
	// ErrMismatch is a copy that differs from its source in size or checksum.
	ErrMismatch = errors.New("a copied file does not match its original")
	// ErrLink is a link in the source: a move copies files and never follows a link out of the folder.
	ErrLink = errors.New("the folder holds a link or another kind of entry that is not moved")
	// ErrIncomplete is a folder that lacks files of the one it is meant to replace.
	ErrIncomplete = errors.New("the new copy does not hold everything the old one does")
	// ErrBadName is a folder name Windows would silently change (a trailing dot or space).
	ErrBadName = errors.New("a folder name may not end in a dot or a space")
)

// journalName is the marker a move writes into the target just before it renames the folders into place, naming them. A crash
// between that and the setting being written leaves the folders in a target that looks foreign; the marker lets the next move
// recognise them as its own leftovers. Finish removes it once the folder is in use.
const journalName = movingPrefix + "journal"

// stagingMarker is the file a move writes first into its staging folder. Only a folder named like a generated one that holds it is
// treated as ours: a folder of the narrator's that happens to start with movingPrefix is neither removed nor ignored.
const stagingMarker = ".narration-move"

var stagingName = regexp.MustCompile(`^` + regexp.QuoteMeta(movingPrefix) + `[0-9]+$`)

// isStaging reports whether dir/name is a staging folder this package made.
func isStaging(dir, name string) bool {
	if !stagingName.MatchString(name) {
		return false
	}
	info, err := os.Lstat(filepath.Join(dir, name, stagingMarker))
	return err == nil && info.Mode().IsRegular()
}

// syncFile is a seam for tests: every copied file is flushed through it before it is checked.
var syncFile = func(f *os.File) error { return f.Sync() }

// Plan is one move: the folder the downloads are in, the folder they go to, and the per-kind folders of the downloads inside the source.
// Only those folders are copied (and later removed): anything else the narrator keeps in the source is left alone.
type Plan struct {
	Source, Target string
	Dirs           []string
}

// Progress is how far a move is: Done of Total bytes, counting the copy and the check each as a pass over every byte.
type Progress struct {
	Phase       string
	Done, Total int64
}

// afterCopy is a seam for tests: called with the path of each copied file, before the check.
var afterCopy = func(string) error { return nil }

type sum [sha256.Size]byte

type fileFact struct {
	size int64
	hash sum
}

// Check says why a move from plan.Source to plan.Target must not start, or nil. It writes nothing. Folders are compared by name and by
// identity (os.SameFile along the nearest existing parents), so a link, another spelling or a case variant of the same folder is seen.
func Check(plan Plan) error {
	if runtime.GOOS == "windows" && hasTrailingDotOrSpace(plan.Target) {
		return ErrBadName
	}
	source, target := normal(plan.Source), normal(plan.Target)
	switch {
	case same(source, target):
		return ErrSameFolder
	case inside(target, source):
		return ErrTargetInsideSource
	case inside(source, target):
		return ErrSourceInsideTarget
	}
	if err := identity(source, target); err != nil {
		return err
	}
	info, err := os.Stat(target)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return nil
	case err != nil:
		return err
	case !info.IsDir():
		return fmt.Errorf("%s is a file, not a folder", target)
	}
	entries, err := os.ReadDir(target)
	if err != nil {
		return err
	}
	own := journalDirs(target, plan.Dirs)
	for _, entry := range entries {
		if !isStaging(target, entry.Name()) && entry.Name() != journalName && !own[entry.Name()] {
			return ErrTargetNotEmpty
		}
	}
	return nil
}

// identity compares the two folders by what is on the disk and not by their names.
func identity(source, target string) error {
	src, err := os.Stat(source)
	if err != nil {
		return nil
	}
	for p := target; ; p = filepath.Dir(p) {
		if info, statErr := os.Stat(p); statErr == nil && os.SameFile(src, info) {
			if p == target {
				return ErrSameFolder
			}
			return ErrTargetInsideSource
		}
		if filepath.Dir(p) == p {
			break
		}
	}
	if tgt, statErr := os.Stat(target); statErr == nil {
		for p := filepath.Dir(source); ; p = filepath.Dir(p) {
			if info, e := os.Stat(p); e == nil && os.SameFile(tgt, info) {
				return ErrSourceInsideTarget
			}
			if filepath.Dir(p) == p {
				break
			}
		}
	}
	return nil
}

// hasTrailingDotOrSpace reports a path component Windows would change by dropping its trailing dots or spaces (".." and "." are fine).
func hasTrailingDotOrSpace(path string) bool {
	for _, part := range strings.FieldsFunc(path, func(r rune) bool { return r == '/' || r == '\\' }) {
		if part == "." || part == ".." {
			continue
		}
		if strings.HasSuffix(part, ".") || strings.HasSuffix(part, " ") {
			return true
		}
	}
	return false
}

// journalDirs are the folders a crashed move's marker names that this plan may own: only plain names from the plan's own list.
func journalDirs(target string, allowed []string) map[string]bool {
	own := map[string]bool{}
	data, err := os.ReadFile(filepath.Join(target, journalName))
	if err != nil {
		return own
	}
	var doc struct {
		Dirs []string `json:"dirs"`
	}
	if json.Unmarshal(data, &doc) != nil {
		return own
	}
	for _, name := range doc.Dirs {
		for _, kind := range allowed {
			if name == kind {
				own[name] = true
			}
		}
	}
	return own
}

// recoverLeftovers removes what an interrupted move left in the target: the folders its marker names, the marker, and staging folders.
func recoverLeftovers(target string, dirs []string) {
	for name := range journalDirs(target, dirs) {
		_ = os.RemoveAll(filepath.Join(target, name))
	}
	removeStale(target)
}

// Finish ends a move whose folder is now in use: it removes the marker. Call it after the setting was written.
func Finish(target string) error {
	err := os.Remove(filepath.Join(normal(target), journalName))
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}

// SweepStale removes the staging folders and markers an interrupted move left in root, and answers their names.
func SweepStale(root string) []string {
	var removed []string
	entries, _ := os.ReadDir(root)
	for _, entry := range entries {
		name := entry.Name()
		if (isStaging(root, name) || (name == journalName && entry.Type().IsRegular())) && os.RemoveAll(filepath.Join(root, name)) == nil {
			removed = append(removed, name)
		}
	}
	return removed
}

// Covered says whether now holds every file of old's per-kind folders, at the same size. A kind folder old does not have, or has empty,
// needs nothing. It is how the host knows the copy that replaced the old folder is whole before it offers to delete the old one.
func Covered(old, now string, dirs []string) error {
	for _, dir := range dirs {
		want, err := sizes(filepath.Join(old, dir))
		if err != nil {
			return err
		}
		if len(want) == 0 {
			continue
		}
		have, err := sizes(filepath.Join(now, dir))
		if err != nil {
			return fmt.Errorf("%w: %s", ErrIncomplete, dir)
		}
		for name, size := range want {
			if got, ok := have[name]; !ok || got != size {
				return fmt.Errorf("%w: %s/%s", ErrIncomplete, dir, name)
			}
		}
	}
	return nil
}

func sizes(root string) (map[string]int64, error) {
	out := map[string]int64{}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type().IsRegular() {
			info, err := entry.Info()
			if err != nil {
				return err
			}
			rel, _ := filepath.Rel(root, path)
			out[filepath.ToSlash(rel)] = info.Size()
		}
		return nil
	})
	if errors.Is(err, fs.ErrNotExist) {
		return map[string]int64{}, nil
	}
	return out, err
}

// Related reports whether two folders are the same or one holds the other.
func Related(a, b string) bool {
	a, b = normal(a), normal(b)
	return same(a, b) || inside(a, b) || inside(b, a)
}

// Move copies the plan's folders into the target, checks the copy against the source, and puts it in place. report, when set, is called
// as bytes are copied and checked. On any error, a cancelled ctx included, the target is as it was and the source untouched.
func Move(ctx context.Context, plan Plan, report func(Progress)) (err error) {
	if err = Check(plan); err != nil {
		return err
	}
	source, target := normal(plan.Source), normal(plan.Target)
	total, err := measure(source, plan.Dirs)
	if err != nil {
		return err
	}
	if err = assets.RequireFreeSpace(target, total); err != nil {
		return err
	}
	created, err := makeDirs(target)
	if err != nil {
		return err
	}
	recoverLeftovers(target, plan.Dirs)
	staging, err := os.MkdirTemp(target, movingPrefix)
	if err == nil {
		err = os.WriteFile(filepath.Join(staging, stagingMarker), nil, 0o600)
	}
	if err != nil {
		if staging != "" {
			_ = os.RemoveAll(staging)
		}
		removeEmpty(created)
		return err
	}
	var placed []string
	defer func() {
		if err != nil {
			for _, dir := range placed {
				_ = os.RemoveAll(filepath.Join(target, dir))
			}
			_ = os.Remove(filepath.Join(target, journalName))
		}
		_ = os.RemoveAll(staging)
		if err != nil {
			removeEmpty(created)
		}
	}()

	progress := &counter{total: total * 2, report: report}
	facts := map[string]fileFact{}
	for _, dir := range plan.Dirs {
		if err = copyTree(ctx, filepath.Join(source, dir), filepath.Join(staging, dir), dir, facts, progress); err != nil {
			return err
		}
	}
	for _, dir := range plan.Dirs {
		if err = verifyTree(ctx, filepath.Join(staging, dir), dir, facts, progress); err != nil {
			return err
		}
	}
	if err = ctx.Err(); err != nil {
		return err
	}
	var present []string
	for _, dir := range plan.Dirs {
		if _, statErr := os.Stat(filepath.Join(staging, dir)); statErr == nil {
			if err = syncTree(filepath.Join(staging, dir)); err != nil {
				return err
			}
			present = append(present, dir)
		}
	}
	if err = writeJournal(target, present); err != nil {
		return err
	}
	for _, dir := range present {
		if err = os.Rename(filepath.Join(staging, dir), filepath.Join(target, dir)); err != nil {
			return err
		}
		placed = append(placed, dir)
	}
	return syncDir(target)
}

// MissingFolders is the folder and the parents of it that do not exist yet, deepest first: what making it would create.
func MissingFolders(path string) []string {
	var missing []string
	for p := normal(path); ; p = filepath.Dir(p) {
		if _, err := os.Lstat(p); err == nil || filepath.Dir(p) == p {
			break
		}
		missing = append(missing, p)
	}
	return missing
}

// RemoveEmpty removes each folder of paths that is empty, in the order given (deepest first, from MissingFolders). It never removes one
// that holds anything.
func RemoveEmpty(paths []string) {
	removeEmpty(paths)
}

func removeEmpty(paths []string) {
	for _, p := range paths {
		_ = os.Remove(p)
	}
}

// makeDirs creates the folder and its parents and answers every one it made, deepest first. When it fails partway the ones it made are removed.
func makeDirs(target string) ([]string, error) {
	created := MissingFolders(target)
	if len(created) == 0 {
		return nil, nil
	}
	if err := os.MkdirAll(target, 0o755); err != nil {
		removeEmpty(created)
		return nil, err
	}
	return created, nil
}

func writeJournal(target string, dirs []string) error {
	data, err := json.Marshal(map[string][]string{"dirs": dirs})
	if err != nil {
		return err
	}
	file, err := os.OpenFile(filepath.Join(target, journalName), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644) //nolint:gosec // G302: a marker with no secret in it
	if err != nil {
		return err
	}
	_, err = file.Write(data)
	if err == nil {
		err = syncFile(file)
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	return err
}

// syncDir flushes a folder's entries to the disk. Windows has no such call for a folder, so it is skipped there.
func syncDir(path string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	dir, err := os.Open(path)
	if err != nil {
		return err
	}
	err = dir.Sync()
	if closeErr := dir.Close(); err == nil {
		err = closeErr
	}
	return err
}

// syncTree flushes every folder under root, so the names of the copied files are as safe as their contents.
func syncTree(root string) error {
	return filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil || !entry.IsDir() {
			return walkErr
		}
		return syncDir(path)
	})
}

// RemoveOld deletes the plan's per-kind folders from root and then root itself when nothing else is left in it. It deletes nothing else.
func RemoveOld(root string, dirs []string) error {
	if root == "" || filepath.Clean(root) == "." {
		return fmt.Errorf("refusing to remove %q", root)
	}
	root = normal(root)
	if filepath.Dir(root) == root {
		return fmt.Errorf("refusing to remove %q", root)
	}
	if err := RemoveKinds(root, dirs); err != nil {
		return err
	}
	removeStale(root)
	if entries, err := os.ReadDir(root); err == nil && len(entries) == 0 {
		return os.Remove(root)
	}
	return nil
}

// RemoveKinds deletes the plan's per-kind folders from root and nothing else, not even root.
func RemoveKinds(root string, dirs []string) error {
	for _, dir := range dirs {
		if err := os.RemoveAll(filepath.Join(root, dir)); err != nil {
			return err
		}
	}
	return nil
}

func removeStale(target string) {
	entries, _ := os.ReadDir(target)
	for _, entry := range entries {
		if isStaging(target, entry.Name()) {
			_ = os.RemoveAll(filepath.Join(target, entry.Name()))
		}
	}
}

type counter struct {
	done, total int64
	report      func(Progress)
}

func (c *counter) add(phase string, n int64) {
	c.done += n
	if c.report != nil {
		c.report(Progress{Phase: phase, Done: c.done, Total: c.total})
	}
}

// measure is the bytes of the regular files under source's dirs; a link is refused.
func measure(source string, dirs []string) (int64, error) {
	var total int64
	for _, dir := range dirs {
		err := filepath.WalkDir(filepath.Join(source, dir), func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				if errors.Is(walkErr, fs.ErrNotExist) && path == filepath.Join(source, dir) {
					return nil
				}
				return walkErr
			}
			if !entry.IsDir() && !entry.Type().IsRegular() {
				return fmt.Errorf("%w: %s", ErrLink, path)
			}
			if entry.Type().IsRegular() {
				info, err := entry.Info()
				if err != nil {
					return err
				}
				total += info.Size()
			}
			return nil
		})
		if err != nil {
			return 0, err
		}
	}
	return total, nil
}

func copyTree(ctx context.Context, from, to, key string, facts map[string]fileFact, progress *counter) error {
	if _, err := os.Stat(from); errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return filepath.WalkDir(from, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, _ := filepath.Rel(from, path)
		dst := filepath.Join(to, rel)
		switch {
		case entry.IsDir():
			return os.MkdirAll(dst, 0o755)
		case !entry.Type().IsRegular():
			return fmt.Errorf("%w: %s", ErrLink, path)
		}
		fact, err := copyFile(ctx, path, dst, progress)
		if err != nil {
			return err
		}
		facts[filepath.ToSlash(filepath.Join(key, rel))] = fact
		return afterCopy(dst)
	})
}

func copyFile(ctx context.Context, from, to string, progress *counter) (fileFact, error) {
	in, err := os.Open(from)
	if err != nil {
		return fileFact{}, err
	}
	defer func() { _ = in.Close() }()
	info, err := in.Stat()
	if err != nil {
		return fileFact{}, err
	}
	out, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644) //nolint:gosec // G302: a copy of a downloaded model, readable like the original
	if err != nil {
		return fileFact{}, err
	}
	hash := sha256.New()
	written, err := copyChunks(ctx, io.MultiWriter(out, hash), in, func(n int64) { progress.add(PhaseCopying, n) })
	if err == nil {
		err = syncFile(out)
	}
	if closeErr := out.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return fileFact{}, err
	}
	if written != info.Size() {
		return fileFact{}, fmt.Errorf("%w: %s changed while it was copied", ErrMismatch, filepath.Base(from))
	}
	_ = os.Chtimes(to, info.ModTime(), info.ModTime())
	var fact fileFact
	fact.size = written
	copy(fact.hash[:], hash.Sum(nil))
	return fact, nil
}

func verifyTree(ctx context.Context, root, key string, facts map[string]fileFact, progress *counter) error {
	if _, err := os.Stat(root); errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	seen := map[string]bool{}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("%w: %s is not a file", ErrMismatch, path)
		}
		rel, _ := filepath.Rel(root, path)
		name := filepath.ToSlash(filepath.Join(key, rel))
		want, ok := facts[name]
		if !ok {
			return fmt.Errorf("%w: %s was not in the original", ErrMismatch, name)
		}
		seen[name] = true
		file, err := os.Open(path) //nolint:gosec // G122: the folder is the one this move just wrote, and links are refused
		if err != nil {
			return err
		}
		defer func() { _ = file.Close() }()
		hash := sha256.New()
		n, err := copyChunks(ctx, hash, file, func(n int64) { progress.add(PhaseVerifying, n) })
		if err != nil {
			return err
		}
		var got sum
		copy(got[:], hash.Sum(nil))
		if n != want.size || got != want.hash {
			return fmt.Errorf("%w: %s", ErrMismatch, name)
		}
		return nil
	})
	if err != nil {
		return err
	}
	for name := range facts {
		if strings.HasPrefix(name, key+"/") && !seen[name] {
			return fmt.Errorf("%w: %s is missing from the copy", ErrMismatch, name)
		}
	}
	return nil
}

// copyChunks is io.Copy that stops between chunks when ctx is done and reports each chunk.
func copyChunks(ctx context.Context, dst io.Writer, src io.Reader, onChunk func(int64)) (int64, error) {
	buffer := make([]byte, 1<<20)
	var total int64
	for {
		if err := ctx.Err(); err != nil {
			return total, err
		}
		n, readErr := src.Read(buffer)
		if n > 0 {
			if _, err := dst.Write(buffer[:n]); err != nil {
				return total, err
			}
			total += int64(n)
			onChunk(int64(n))
		}
		if readErr == io.EOF {
			return total, nil
		}
		if readErr != nil {
			return total, readErr
		}
	}
}

func normal(path string) string {
	if path == "" {
		return ""
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	abs = filepath.Clean(abs)
	if resolved, err := filepath.EvalSymlinks(abs); err == nil {
		return resolved
	}
	// A folder that does not exist yet: resolve its nearest parent so a link above it is seen.
	if parent := filepath.Dir(abs); parent != abs {
		return filepath.Join(normal(parent), filepath.Base(abs))
	}
	return abs
}

func fold(path string) string {
	if runtime.GOOS == "windows" {
		return strings.ToLower(path)
	}
	return path
}

func same(a, b string) bool { return fold(a) == fold(b) }

// inside reports whether path is within dir (not dir itself).
func inside(path, dir string) bool {
	rel, err := filepath.Rel(fold(dir), fold(path))
	return err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
