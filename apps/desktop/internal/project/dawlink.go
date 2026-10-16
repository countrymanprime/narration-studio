package project

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// DawLink is a project's link to its DAW (REAPER) project file, stored both as
// an absolute path and as a path relative to the project folder (both are
// kept). Either survives a move the other doesn't: the absolute path survives
// the project folder itself moving while the rpp stays where it was relative to
// it, and the relative path survives the whole project folder (rpp included)
// being relocated as a unit.
type DawLink struct {
	Absolute string `json:"absolute"`
	Relative string `json:"relative,omitempty"`
}

// BuildDawLink records rppPath as a link from projectFolder: the absolute path
// always, and a path relative to projectFolder when rppPath is inside it at any
// depth (empty otherwise, since "relative to a folder it isn't under" isn't
// meaningful). Inside is decided by RelativeTo, so a symlinked or junctioned
// folder, another spelling of the same path or a different drive are all
// judged by what is on disk rather than by the text of the paths.
func BuildDawLink(projectFolder, rppPath string) (DawLink, error) {
	if rppPath == "" {
		// filepath.Abs("") is the working directory, which would be recorded as the DAW project file.
		return DawLink{}, errors.New("there is no REAPER project file to link")
	}
	absolute, err := filepath.Abs(rppPath)
	if err != nil {
		return DawLink{}, err
	}
	link := DawLink{Absolute: absolute}
	if relative, inside := RelativeTo(projectFolder, absolute); inside {
		link.Relative = onDiskCase(projectFolder, relative)
	}
	return link, nil
}

// onDiskCase respells relative, a path under folder, with the casing the file system holds. On a case-insensitive file system
// (Windows) the narrator or the launcher may spell the file any way ("SHOW.RPP"); the link keeps the name the file really has,
// so it also resolves if the project is later moved to a case-sensitive place. A component that is not found, or a folder
// that cannot be listed, is kept as given, and where names are case-sensitive an exact match is always taken first, so
// nothing changes there.
func onDiskCase(folder, relative string) string {
	parts := strings.Split(relative, string(filepath.Separator))
	current := folder
	for index, part := range parts {
		entries, err := os.ReadDir(current)
		if err != nil {
			break
		}
		name := ""
		for _, entry := range entries {
			if entry.Name() == part {
				name = part
				break
			}
			if name == "" && strings.EqualFold(entry.Name(), part) {
				name = entry.Name()
			}
		}
		if name == "" {
			break
		}
		parts[index] = name
		current = filepath.Join(current, name)
	}
	return strings.Join(parts, string(filepath.Separator))
}

// Inside reports whether the linked file was inside the project folder when it
// was linked (the link carries a project-relative path).
func (l DawLink) Inside() bool { return l.Relative != "" }

// RelativeTo returns path relative to folder and true when path is inside
// folder at any depth. It first walks path's parent folders looking for the
// one that is the same folder on disk as folder (os.SameFile), which holds
// across symlinks, Windows junctions, short (8.3) names and letter case; when
// either does not exist it falls back to comparing the absolute, cleaned and
// symlink-evaluated paths (filepath.Rel, which is case-insensitive on
// Windows and fails across volumes).
func RelativeTo(folder, path string) (string, bool) {
	absFolder, err := filepath.Abs(folder)
	if err != nil {
		return "", false
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return "", false
	}
	if folderInfo, err := os.Stat(absFolder); err == nil && folderInfo.IsDir() {
		for dir := filepath.Dir(absPath); ; dir = filepath.Dir(dir) {
			if info, err := os.Stat(dir); err == nil && os.SameFile(info, folderInfo) {
				if relative, err := filepath.Rel(dir, absPath); err == nil {
					return relative, true
				}
			}
			if parent := filepath.Dir(dir); parent == dir {
				break
			}
		}
	}
	for _, pair := range [][2]string{{absFolder, absPath}, {evalSymlinks(absFolder), evalSymlinks(absPath)}} {
		if relative, err := filepath.Rel(pair[0], pair[1]); err == nil && relative != "." && !isOutsideFolder(relative) {
			return relative, true
		}
	}
	return "", false
}

// evalSymlinks resolves path's symlinks, or returns it unchanged when it cannot (a path that does not exist).
func evalSymlinks(path string) string {
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		return resolved
	}
	return path
}

// isOutsideFolder reports whether a filepath.Rel result climbs out of the base
// folder (starts with ".."), which means rppPath isn't actually inside it.
func isOutsideFolder(relative string) bool {
	return relative == ".." || len(relative) >= 3 && relative[:3] == ".."+string(filepath.Separator)
}

// Resolve returns the file this link points to, preferring whichever path
// currently exists on disk. The absolute path is tried first: it is stable
// across a project folder move where the rpp itself did not move, and is what
// today's Tracks.selectedRpp already stores. The relative path (joined against
// projectFolder) is tried next, covering a project folder that moved as a
// whole. ok is false when neither resolves to a file that exists.
func (l DawLink) Resolve(projectFolder string) (path string, ok bool) {
	if l.Absolute != "" && fileExists(l.Absolute) {
		return l.Absolute, true
	}
	if l.Relative != "" {
		candidate := filepath.Join(projectFolder, l.Relative)
		if fileExists(candidate) {
			return candidate, true
		}
	}
	return "", false
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
