package recents

import (
	"path/filepath"
	"strings"
)

// Running is the ProjectRunningDaw payload: the recent project the running DAW has open (the project picker's "REAPER is
// running with a project linked to <name>" banner). Linked is false, and Path and Name are empty, when there is none.
type Running struct {
	Linked bool   `json:"linked"`
	Path   string `json:"path"`
	Name   string `json:"name"`
}

// Opener is the part of the DAW heartbeat MatchRunning needs: whether file is the project the DAW has open.
type Opener interface {
	Matches(file string) bool
}

// MatchRunning picks the first entry, other than the open project's folder, whose linked DAW file (from linked, which says
// false for a project that links none) is the one the DAW has open.
func MatchRunning(daw Opener, open string, entries []Entry, linked func(folder string) (string, bool)) Running {
	for _, entry := range entries {
		if open != "" && strings.EqualFold(filepath.Clean(entry.Path), filepath.Clean(open)) {
			continue
		}
		if file, ok := linked(entry.Path); ok && daw.Matches(file) {
			return Running{Linked: true, Path: entry.Path, Name: entry.Name}
		}
	}
	return Running{}
}
