package project

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// FindByDawFile scans projectsDir's immediate subfolders for the one project
// whose manifest links rppPath as its DAW project file
// (the rpp may live outside its project's folder, so this walks every
// project's own link rather than assuming rppPath's containing folder is the
// project).
//
// For each candidate it resolves the manifest's link the same way
// dawLinkFacts does (DawLink.Resolve: whichever of the absolute/relative
// paths currently exists on disk) and compares that against rppPath, both
// cleaned and lower-cased for a case-insensitive match (Windows paths are not
// case-sensitive, and this is the first platform, ADR 0030), or as the same file
// on disk (samePath). The link may sit at any depth inside its project or
// outside it.
//
// ok is false when projectsDir cannot be listed, rppPath is empty (an unsaved
// REAPER project has no file to match), or no project's link resolves to
// rppPath. Callers that get ok=false fall back to their existing behaviour
// (the picker, or the rpp's own folder) unchanged.
func FindByDawFile(reporter *persist.Reporter, projectsDir, rppPath string) (folder, name string, ok bool) {
	return FindByDawFileAmong(reporter, projectsDir, rppPath, nil)
}

// FindByDawFileAmong is FindByDawFile that also looks in folders: project folders that may sit anywhere, outside projectsDir (a
// project can be created at any absolute location, so listing projectsDir alone never finds it). The caller passes the open
// project and the recent projects; an empty, missing or non-project entry is skipped. folders are tried first, in order, so the
// open project wins over a scan hit.
func FindByDawFileAmong(reporter *persist.Reporter, projectsDir, rppPath string, folders []string) (folder, name string, ok bool) {
	if rppPath == "" {
		return "", "", false
	}
	target := normalizePath(rppPath)
	for _, candidate := range folders {
		if candidate == "" {
			continue
		}
		if name, matched := linkedTo(reporter, candidate, rppPath, target); matched {
			return candidate, name, true
		}
	}
	if projectsDir == "" {
		return "", "", false
	}
	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return "", "", false
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		candidate := filepath.Join(projectsDir, entry.Name())
		if name, matched := linkedTo(reporter, candidate, rppPath, target); matched {
			return candidate, name, true
		}
	}
	return "", "", false
}

// linkedTo is whether the project in candidate links rppPath (whose normalizePath is target), and the project's name.
func linkedTo(reporter *persist.Reporter, candidate, rppPath, target string) (string, bool) {
	manifest, loaded, err := Load(reporter, candidate)
	if err != nil || !loaded || manifest == nil || manifest.DawProjectFile == nil {
		return "", false
	}
	resolved, exists := manifest.DawProjectFile.Resolve(candidate)
	if !exists || !samePath(resolved, rppPath, target) {
		return "", false
	}
	return manifest.Name, true
}

// samePath reports whether resolved names the same file as rppPath (whose
// normalizePath is target): the same spelling ignoring case, or the same file
// on disk reached another way (a symlink, a junction, a short name).
func samePath(resolved, rppPath, target string) bool {
	if normalizePath(resolved) == target {
		return true
	}
	a, errA := os.Stat(resolved)
	b, errB := os.Stat(rppPath)
	return errA == nil && errB == nil && os.SameFile(a, b)
}

// normalizePath makes a path absolute (best effort; the input is kept as-is
// if that fails) and case-folds it so two spellings of the same Windows path
// compare equal.
func normalizePath(path string) string {
	if absolute, err := filepath.Abs(path); err == nil {
		path = absolute
	}
	return strings.ToLower(filepath.Clean(path))
}
