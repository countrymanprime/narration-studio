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
	"app.go":                          "hands projectFileReader (the saved reader) to the editing, coverage and character services, which read the saved file's items",
	"bindings.go":                     "the TracksList binding: the saved project's tracks, which the host's own pages merge the live list over",
	"bindings_voicesamples.go":        "the voice sample service reads the saved file's items through projectFileReader",
	"bindings_workspace_peaks.go":     "the saved project read with the chapter's alignment to place peaks",
	"bindings_workspace_snap.go":      "the saved project read for snap points once the DAW says the saved file is current",
	"bindings_workspace_takes.go":     "the saved project read with the chapter's alignment to list the passage's takes",
	"media.go":                        "finds a take's media file in the saved project when the recorder does not know it",
}

var savedTrackReader = regexp.MustCompile(`\b(selectedProject|readProject|readLinksProject)\(|\.tracksList\(|\bprojectFileReader\{`)

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
