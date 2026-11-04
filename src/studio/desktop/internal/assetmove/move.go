// Package assetmove moves the folder the approved downloads are kept in: copy, check every byte, and only then put the copy in place. It
// never changes or deletes the source (RemoveOld is a separate, later call), so a cancel, a full or read-only disk, a bad copy or a crash
// leaves the narrator with exactly the models they had.
package assetmove

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
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
	ErrLink = errors.New("the folder holds a link to somewhere else")
)

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

// Check says why a move from plan.Source to plan.Target must not start, or nil. It writes nothing.
func Check(plan Plan) error {
	source, target := normal(plan.Source), normal(plan.Target)
	switch {
	case same(source, target):
		return ErrSameFolder
	case inside(target, source):
		return ErrTargetInsideSource
	case inside(source, target):
		return ErrSourceInsideTarget
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
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), movingPrefix) {
			return ErrTargetNotEmpty
		}
	}
	return nil
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
	madeTarget := false
	if _, statErr := os.Stat(target); errors.Is(statErr, fs.ErrNotExist) {
		if err = os.MkdirAll(target, 0o755); err != nil {
			return err
		}
		madeTarget = true
	}
	removeStale(target)
	staging, err := os.MkdirTemp(target, movingPrefix)
	if err != nil {
		if madeTarget {
			_ = os.Remove(target)
		}
		return err
	}
	var placed []string
	defer func() {
		if err != nil {
			for _, dir := range placed {
				_ = os.RemoveAll(filepath.Join(target, dir))
			}
		}
		_ = os.RemoveAll(staging)
		if err != nil && madeTarget {
			_ = os.Remove(target)
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
	for _, dir := range plan.Dirs {
		if _, statErr := os.Stat(filepath.Join(staging, dir)); statErr != nil {
			continue
		}
		if err = os.Rename(filepath.Join(staging, dir), filepath.Join(target, dir)); err != nil {
			return err
		}
		placed = append(placed, dir)
	}
	return nil
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
	for _, dir := range dirs {
		if err := os.RemoveAll(filepath.Join(root, dir)); err != nil {
			return err
		}
	}
	if entries, err := os.ReadDir(root); err == nil && len(entries) == 0 {
		return os.Remove(root)
	}
	return nil
}

func removeStale(target string) {
	entries, _ := os.ReadDir(target)
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), movingPrefix) {
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
			if entry.Type()&fs.ModeSymlink != 0 {
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
		case entry.Type()&fs.ModeSymlink != 0:
			return fmt.Errorf("%w: %s", ErrLink, path)
		case !entry.Type().IsRegular():
			return nil
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
	defer in.Close()
	info, err := in.Stat()
	if err != nil {
		return fileFact{}, err
	}
	out, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return fileFact{}, err
	}
	hash := sha256.New()
	written, err := copyChunks(ctx, io.MultiWriter(out, hash), in, func(n int64) { progress.add(PhaseCopying, n) })
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
		if !entry.Type().IsRegular() {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		name := filepath.ToSlash(filepath.Join(key, rel))
		want, ok := facts[name]
		if !ok {
			return fmt.Errorf("%w: %s was not in the original", ErrMismatch, name)
		}
		seen[name] = true
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
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
