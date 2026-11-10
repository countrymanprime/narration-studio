package main

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// savedTrackReaders is every file of the host's root package that reads the saved .rpp for a project's tracks (selectedProject,
// readProject, readLinksProject), with why the saved file is the right source there. Track structure for a screen (a chapter's folder,
// its voices, what is linked) comes from the live-over-saved answer (liveSelectedProject, tracks_live.go) or from the chapter links'
// `members`, so every page agrees (#3269). A new file here means a new reader that can disagree with the rest: add it to this list
// only with a reason the live list cannot serve.
var savedTrackReaders = map[string]string{
	"tracks.go":                       "defines selectedProject/readProject, the saved reader the live answer is merged over",
	"tracks_live.go":                  "the live-over-saved reader itself: liveProject merges the live list over the saved file, liveSelectedProject falls back to it",
	"chapterlinks.go":                 "readLinksProject: the links read's saved base, which chapterTrackLinksLive merges the live list over",
	"chaptersync.go":                  "chapter sync writes links and a snapshot from its plan, so it follows the saved file (#3290)",
	"chapterregions.go":               "reads the saved regions again from the same file; the links payload leaves regions off the wire",
	"bindings_cleanup.go":             "reads the saved project's items for the linked track after the links read",
	"bindings_daw_stack.go":           "the stack's saved fallback when REAPER does not answer",
	"bindings_booth_punch.go":         "the saved project joined with the live track state (liveTrackState) to place a pickup",
	"bindings_workspace_wordtimes.go": "the saved project joined with the live track state (liveTrackState) for word times",
	"recordedlengths.go":              "measures recorded lengths from the saved file's items, cached by its modification time",
	"creditsrecordedlengths.go":       "measures credit lengths from the saved file's items",
}

var savedTrackReader = regexp.MustCompile(`\b(selectedProject|readProject|readLinksProject)\(`)

// TestOnlyTheListedFilesReadTheSavedProjectForTracks fails when a file outside savedTrackReaders reads the saved .rpp's tracks, and when a
// listed file no longer does (the list must not outlive the reader).
func TestOnlyTheListedFilesReadTheSavedProjectForTracks(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	reading := map[string]bool{}
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		body, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if savedTrackReader.Match(body) {
			reading[file] = true
		}
	}
	var unlisted, stale []string
	for file := range reading {
		if _, ok := savedTrackReaders[file]; !ok {
			unlisted = append(unlisted, file)
		}
	}
	for file := range savedTrackReaders {
		if !reading[file] {
			stale = append(stale, file)
		}
	}
	sort.Strings(unlisted)
	sort.Strings(stale)
	if len(unlisted) > 0 {
		t.Errorf("these files read the saved project's tracks but are not in savedTrackReaders (read the live answer, liveSelectedProject, or the chapter links' members instead): %v", unlisted)
	}
	if len(stale) > 0 {
		t.Errorf("these files are in savedTrackReaders but no longer read the saved project: %v", stale)
	}
}
