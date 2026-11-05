package main

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// #3041: a chapter linked to a folder of voices keeps its audio on the folder's children, so a read of "the chapter's track" that asks the DAW for the linked
// track alone sees an empty folder. A reader of a chapter's audio goes through dawport.ChapterAudioState (the folder's items and every track's inside it).
// The reads below keep the one-track read on purpose, each with the reason; a new caller of ChapterTrackState must either read through
// ChapterAudioState or be added here with its reason.
var oneTrackReads = map[string]string{
	"bindings_daw_stack.go":          "edit commands (stack, split, range, gain, click repair) plan on the linked track's own items because the Lua commands act within one track; folder support is its own change",
	"bindings_replace.go":            "replace-range edits the item on the track the alignment names; the Lua command acts within one track",
	"bindings_readaloud_record.go":   "the record precondition reads the voice the take arms, never the folder (recordTarget)",
	"readaloudreaper.go":             "the arm state of the voice the take records on",
	"teleprompterinput.go":           "the input device of the track a take records on",
	"bindings_passagemap.go":         "known gap (#3041 follow-up): the passage map's stamp reads the linked track's last item, empty for a folder of voices; the Booth page maps passages by text so it still works",
	"chapteraudio_guard_test.go":     "this file names the call",
	"internal/bridge/track_state.go": "the bridge's own read",
	"internal/dawport/roles.go":      "the role definitions",
}

func TestOnlyReadsThatMeanOneTrackAskForTheLinkedTrackAlone(t *testing.T) {
	var found []string
	err := filepath.WalkDir(".", func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if path != "." && (strings.HasPrefix(entry.Name(), ".") || entry.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") && path != "chapteraudio_guard_test.go" {
			return nil
		}
		if strings.HasPrefix(path, "internal/") && !strings.HasPrefix(path, "internal/bridge/") && !strings.HasPrefix(path, "internal/dawport/roles.go") {
			return nil
		}
		text, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if strings.Contains(string(text), ".ChapterTrackState(") || strings.Contains(string(text), "ChapterTrackState(ctx") {
			found = append(found, filepath.ToSlash(path))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range found {
		if _, ok := oneTrackReads[path]; !ok {
			t.Errorf("%s asks the DAW for the linked track alone (ChapterTrackState): a chapter linked to a folder of voices would read as empty. Read the chapter's audio through dawport.ChapterAudioState, or add the file to oneTrackReads with the reason it means one track", path)
		}
	}
	for path := range oneTrackReads {
		if !slices.Contains(found, path) {
			t.Errorf("oneTrackReads lists %s, which no longer reads the linked track alone: remove the entry", path)
		}
	}
}
