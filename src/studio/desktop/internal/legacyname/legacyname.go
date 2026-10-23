// Package legacyname is the one place the product's name before Narration Studio is written down, with the one-time moves that
// carry a narrator's data from the old names to the new ones. scripts/ci/old-name.mjs fails the gate if the old name appears in
// any other tracked file, so a reader of the rest of the code never meets it.
//
// Each move keeps the narrator's data whatever happens: a folder is renamed in one step when it can be, otherwise copied to a
// temporary sibling that becomes the new folder only once the copy is complete, and the old folder is removed only after that.
// On any error the old location is left as it was and the error is returned. Every move is safe to run again: a second run finds
// nothing to do, and a run after an interrupted one finishes it.
package legacyname

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// The old names, and the names that replaced them.
const (
	oldDirName        = "narration-utils"
	newDirName        = "narration-studio"
	oldExecutable     = "narration-utils.exe"
	oldProjectsDir    = "NarrationUtils"
	oldProjectMarker  = "narration-utils-project"
	oldExtKeyPrefix   = "narration_utils_"
	newExtKeyPrefix   = "narration_studio_"
	oldTrackPrefix    = "Narration Utils"
	newTrackPrefix    = "Narration Studio"
	oldLauncherFile   = "NarrationUtils_Launcher.lua"
	newLauncherFile   = "NarrationStudio_Launcher.lua"
	oldEntropy        = "narration-utils credentialstore v1"
	rewritePendingTag = ".legacyname-rewrite-pending"
	partialSuffix     = ".legacyname-partial"
)

// ProjectsDirName is the default projects folder's old name under the narrator's home folder. A narrator whose projects are in it
// keeps using it: the folder holds their own projects, which REAPER and Audacity projects name by absolute path, so it is never moved.
const ProjectsDirName = oldProjectsDir

// CredentialEntropy is the DPAPI entropy a key saved before the rename was sealed with. A key that does not open with the current
// entropy is tried with this one.
var CredentialEntropy = []byte(oldEntropy)

// IsProjectMarker reports whether marker is the project manifest's marker as written before the rename.
func IsProjectMarker(marker string) bool { return marker == oldProjectMarker }

// RenameExtKeys rewrites, in place, every key of a REAPER P_EXT map written under the old prefix to the new prefix. A key already
// present under the new name wins: it was written after the rename.
func RenameExtKeys(ext map[string]string) {
	for key, value := range ext {
		rest, ok := strings.CutPrefix(key, oldExtKeyPrefix)
		if !ok {
			continue
		}
		delete(ext, key)
		if _, taken := ext[newExtKeyPrefix+rest]; !taken {
			ext[newExtKeyPrefix+rest] = value
		}
	}
}

// TrackName is an Audacity track's name as the app now writes it: a track the app made before the rename (its label track, a take
// or a backup) has its old prefix replaced. Any other name is returned as it is.
func TrackName(name string) string {
	if rest, ok := strings.CutPrefix(name, oldTrackPrefix); ok && (rest == "" || rest[0] == ' ') {
		return newTrackPrefix + rest
	}
	return name
}

// ProjectRelative maps a project-relative path the app stored before the rename (manuscript.json's source.storedPath) into the
// renamed project data folder. Any other path is returned as it is.
func ProjectRelative(stored string) string {
	slashed := filepath.ToSlash(stored)
	if rest, ok := strings.CutPrefix(slashed, oldDirName+"/"); ok {
		return newDirName + "/" + rest
	}
	return stored
}

// ProjectDataDir is where a project's data folder is for a read of a project that has not been opened since the rename (a scan of
// the projects folder for a linked DAW file, say): the new folder when it exists, the old one when only it does.
func ProjectDataDir(project string) string {
	current := filepath.Join(project, newDirName)
	if _, err := os.Stat(current); err != nil {
		if old := filepath.Join(project, oldDirName); isDir(old) {
			return old
		}
	}
	return current
}

// OldProjectDataDir is where a build from before the rename kept a project's data folder. Tests outside this package build a fake
// old project with it, so they need not spell the old name.
func OldProjectDataDir(project string) string { return filepath.Join(project, oldDirName) }

// OldLauncherDir is where a build from before the rename kept the REAPER launcher under userCache, for the same tests.
func OldLauncherDir(userCache string) string { return filepath.Join(userCache, oldDirName, "reaper") }

// Logf receives one line per thing a move did or could not do.
type Logf func(format string, args ...any)

// MigrateUserFolders moves the per-user folders: the settings folder under appData (%APPDATA%), the cache folder under userCache
// (%LOCALAPPDATA%) and, on Windows, the WebView2 profile Wails keeps beside them under the program's file name (executable). It
// runs before anything reads them. Each folder is moved on its own, so one that fails does not hold back the others; the errors
// are joined.
func MigrateUserFolders(appData, userCache, executable string, logf Logf) error {
	var errs []error
	if appData != "" {
		errs = append(errs, moveFolder(filepath.Join(appData, oldDirName), filepath.Join(appData, newDirName), false, logf))
		if executable != "" && !strings.EqualFold(executable, oldExecutable) {
			errs = append(errs, moveFolder(filepath.Join(appData, oldExecutable), filepath.Join(appData, executable), false, logf))
		}
	}
	if userCache != "" {
		errs = append(errs, moveCache(filepath.Join(userCache, oldDirName), filepath.Join(userCache, newDirName), logf))
	}
	return errors.Join(errs...)
}

// MigrateProject moves a project's data folder to its new name and rewrites the paths into it that the JSON files inside hold.
// It runs before the project is opened; on an error the project must not be opened, or the app would start a new, empty folder
// beside the narrator's data.
func MigrateProject(project string, logf Logf) error {
	if project == "" {
		return nil
	}
	return moveFolder(filepath.Join(project, oldDirName), filepath.Join(project, newDirName), true, logf)
}

// moveCache moves the cache folder's contents one entry at a time, except the REAPER launcher's folder: REAPER's action list names
// the launcher by its absolute path there, so it stays for the app to keep current (LauncherDir).
func moveCache(old, current string, logf Logf) error {
	entries, err := os.ReadDir(old)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var errs []error
	for _, entry := range entries {
		from, to := filepath.Join(old, entry.Name()), filepath.Join(current, entry.Name())
		switch {
		case entry.Name() == "reaper":
		case entry.IsDir():
			if err := os.MkdirAll(current, 0o755); err != nil {
				return err
			}
			errs = append(errs, moveFolder(from, to, false, logf))
		case !exists(to):
			if err := os.MkdirAll(current, 0o755); err != nil {
				return err
			}
			if err := os.Rename(from, to); err != nil {
				errs = append(errs, err)
			}
		}
	}
	return errors.Join(errs...)
}

func exists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}

// LauncherDir is the folder the REAPER launcher ran from before the rename, when it still exists under userCache: a narrator's
// REAPER action may name it, so the app keeps its scripts current there too. ok is false when there is none.
func LauncherDir(userCache string) (dir string, ok bool) {
	dir = OldLauncherDir(userCache)
	return dir, userCache != "" && isDir(dir)
}

// LauncherShim is the file name and content of the script that a REAPER action added under the launcher's old file name runs: it
// runs the launcher beside it.
func LauncherShim() (name string, content []byte) {
	return oldLauncherFile, []byte("-- An action added to REAPER under the launcher's old file name: run the launcher beside it.\n" +
		"local _, path = reaper.get_action_context()\n" +
		"local dir = path:match('^(.*)[\\\\/]') or '.'\n" +
		"return dofile(dir .. package.config:sub(1, 1) .. '" + newLauncherFile + "')\n")
}

// moveFolder moves old to current. rewrite also rewrites the old folder name inside the paths the JSON files under it hold.
func moveFolder(old, current string, rewrite bool, logf Logf) error {
	if !isDir(old) {
		if rewrite {
			return rewriteAfterMove(current, logf)
		}
		return nil
	}
	if rewrite {
		// The tag moves with the folder, so a rewrite that an interruption cut short is finished on the next run.
		if err := os.WriteFile(filepath.Join(old, rewritePendingTag), nil, 0o600); err != nil {
			return fmt.Errorf("could not prepare %s to be moved: %w", old, err)
		}
	}
	if _, err := os.Lstat(current); errors.Is(err, fs.ErrNotExist) {
		if err := os.Rename(old, current); err == nil {
			logf("moved %s to %s", old, current)
			return rewriteAfterMove(current, logf)
		}
		if err := copyThenSwap(old, current); err != nil {
			dropTag(old, rewrite)
			return fmt.Errorf("could not move %s to %s; nothing was changed: %w", old, current, err)
		}
		logf("copied %s to %s", old, current)
	} else {
		// Both exist: an earlier run copied the folder but could not remove the old one, or something wrote the new folder first.
		// Copy in whatever the new folder does not have yet; keep what it has.
		conflicts, err := mergeMissing(old, current)
		if err != nil {
			dropTag(old, rewrite)
			return fmt.Errorf("could not finish moving %s to %s; the old folder was left as it was: %w", old, current, err)
		}
		if len(conflicts) > 0 {
			logf("kept %s: %d file(s) in it differ from the ones in %s (first: %s)", old, len(conflicts), current, conflicts[0])
			dropTag(old, rewrite)
			return rewriteAfterMove(current, logf)
		}
		logf("copied what was missing from %s into %s", old, current)
	}
	if err := os.RemoveAll(old); err != nil {
		logf("could not remove %s after copying it: %v", old, err)
	}
	return rewriteAfterMove(current, logf)
}

func dropTag(folder string, rewrite bool) {
	if rewrite {
		_ = os.Remove(filepath.Join(folder, rewritePendingTag))
	}
}

// copyThenSwap copies old into a temporary sibling of current and renames it to current once the copy is complete.
func copyThenSwap(old, current string) error {
	partial := current + partialSuffix
	if err := os.RemoveAll(partial); err != nil {
		return err
	}
	if err := copyTree(old, partial); err != nil {
		_ = os.RemoveAll(partial)
		return err
	}
	if err := os.Rename(partial, current); err != nil {
		_ = os.RemoveAll(partial)
		return err
	}
	return nil
}

// mergeMissing copies every file under old that current lacks, each through a temporary file, and lists the files both hold with
// different content.
func mergeMissing(old, current string) (conflicts []string, err error) {
	err = filepath.WalkDir(old, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(old, path)
		if err != nil {
			return err
		}
		target := filepath.Join(current, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if relative == rewritePendingTag {
			return copyFile(path, target)
		}
		if _, err := os.Lstat(target); err == nil {
			if same, err := sameContent(path, target); err != nil || !same {
				conflicts = append(conflicts, relative)
			}
			return nil
		}
		partial := target + partialSuffix
		if err := copyFile(path, partial); err != nil {
			_ = os.Remove(partial)
			return err
		}
		return os.Rename(partial, target)
	})
	return conflicts, err
}

func copyTree(source, target string) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		destination := filepath.Join(target, relative)
		if entry.IsDir() {
			return os.MkdirAll(destination, 0o755)
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("%s is not a plain file", path)
		}
		return copyFile(path, destination)
	})
}

func copyFile(source, target string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer func() { _ = in.Close() }()
	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}

func sameContent(a, b string) (bool, error) {
	left, err := os.ReadFile(a)
	if err != nil {
		return false, err
	}
	right, err := os.ReadFile(b)
	if err != nil {
		return false, err
	}
	return bytes.Equal(left, right), nil
}

// The old folder name as one part of a path inside JSON text, so a narrator's own words are left alone: a part with a separator
// ("/" or a JSON-escaped "\\") after it, at the start of a string or after a separator; or the last part of a path, after a
// separator and before the end of the string. A string that is only the old name is not a path and is left as it is.
var (
	oldInnerSegment = regexp.MustCompile(`(["/]|\\\\)` + regexp.QuoteMeta(oldDirName) + `(/|\\\\)`)
	oldLastSegment  = regexp.MustCompile(`(/|\\\\)` + regexp.QuoteMeta(oldDirName) + `(")`)
)

// rewriteAfterMove finishes the rewrite once the folder is in place. A failure here does not undo the move or stop the folder
// being used: the narrator's data is whole in the new folder, only some saved paths may still name the old one. It is logged,
// the tag stays, and the next run tries again.
func rewriteAfterMove(folder string, logf Logf) error {
	if err := finishRewrite(folder, logf); err != nil {
		logf("%v", err)
	}
	return nil
}

// finishRewrite rewrites the old folder name in the paths held by the JSON files under folder when its tag says a move has not
// finished that yet, then removes the tag. Each file is replaced through a temporary file, so a run cut short leaves every file
// whole, and the tag stays until all are done.
func finishRewrite(folder string, logf Logf) error {
	tag := filepath.Join(folder, rewritePendingTag)
	if _, err := os.Stat(tag); err != nil {
		return nil
	}
	root, err := os.OpenRoot(folder)
	if err != nil {
		return fmt.Errorf("could not update the paths saved in %s; it will be tried again next time: %w", folder, err)
	}
	defer func() { _ = root.Close() }()
	rewritten := 0
	err = fs.WalkDir(root.FS(), ".", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		extension := strings.ToLower(filepath.Ext(path))
		if !entry.Type().IsRegular() || (extension != ".json" && extension != ".jsonl") {
			return nil
		}
		text, err := root.ReadFile(path)
		if err != nil {
			return err
		}
		updated := rewriteSegments(text)
		if bytes.Equal(updated, text) {
			return nil
		}
		partial := path + partialSuffix
		if err := root.WriteFile(partial, updated, 0o600); err != nil {
			_ = root.Remove(partial)
			return err
		}
		if err := root.Rename(partial, path); err != nil {
			_ = root.Remove(partial)
			return err
		}
		rewritten++
		return nil
	})
	if err != nil {
		return fmt.Errorf("could not update the paths saved in %s; it will be tried again next time: %w", folder, err)
	}
	if rewritten > 0 {
		logf("updated the saved paths in %d file(s) under %s", rewritten, folder)
	}
	return os.Remove(tag)
}

func rewriteSegments(text []byte) []byte {
	// Two passes: adjacent segments share a separator, which one pass of a non-overlapping match would skip.
	for range 2 {
		text = oldInnerSegment.ReplaceAll(text, []byte("${1}"+newDirName+"${2}"))
		text = oldLastSegment.ReplaceAll(text, []byte("${1}"+newDirName+"${2}"))
	}
	return text
}

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}
