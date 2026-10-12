package main

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
)

// The three cuts bindings' payloads, the goldens the UI's schemas are checked against: a record (a closed cut after a gap
// already stored, so the list is in time order), the list after a re-import changed the gap's words (stale, not moved), and
// what a remove leaves.
func TestEditCutsContractGoldens(t *testing.T) {
	host, project := editLogHost(t)
	decodeCutsChange(t)(host.EditingCutRecord("c-0001", silentCutRequest()))
	payload, err := host.EditingCutRecord("c-0001", queenCutRequest())
	checkBindingContract(t, "edit-cuts-record", payload)
	if change := decodeCutsChange(t)(payload, err); strings.Join(change.Changed, ",") != "cut2" || cutIDsOf(change.Cuts.Cuts) != "cut2,cut1" {
		t.Fatalf("record = %s", payload)
	}

	// The narrator re-imports without a reset and "silent." became "still.": the gap's cut is stale, never moved.
	edited := strings.Replace(bookmarksManuscript, "The soldiers were silent.", "The soldiers were still.", 1)
	writeNested(t, filepath.Join(project, "narration-utils", "manuscript", "manuscript.json"), edited)
	payload, err = host.EditingCutsList("c-0001")
	checkBindingContract(t, "edit-cuts-list", payload)
	if list := decodeCuts(t)(payload, err); list.Cuts[0].Stale || !list.Cuts[1].Stale || list.Cuts[1].StaleReason != "text_changed" || list.Cuts[1].A != 20 {
		t.Fatalf("list = %s", payload)
	}

	payload, err = host.EditingCutRemove("c-0001", "cut2")
	checkBindingContract(t, "edit-cuts-remove", payload)
	if change := decodeCutsChange(t)(payload, err); cutIDsOf(change.Cuts.Cuts) != "cut1" {
		t.Fatalf("remove = %s", payload)
	}
}

// A wordless cut (SN-E112): a gap between words that Clean up shortened, recorded after a word cut. It has no paragraph, keys or
// words, a null paragraph and is not stale; the golden the UI's schema reads it from.
func TestEditCutsWordlessContractGolden(t *testing.T) {
	host, _ := editLogHost(t)
	decodeCutsChange(t)(host.EditingCutRecord("c-0001", queenCutRequest()))
	gap := editlog.CutRequest{Keys: []string{}, Text: "A gap of 1.5 s", A: 30, B: 31.5, Off0: 30, Off1: 31.5, Mode: editlog.CutClose, FadeMs: 6,
		Daw: "REAPER", GUID: "c-0001/{C0000001-0000-4000-8000-000000000001}@29.5", UndoSteps: undoSteps(1)}
	payload, err := host.EditingCutRecord("c-0001", gap)
	checkBindingContract(t, "edit-cuts-record-wordless", payload)
	change := decodeCutsChange(t)(payload, err)
	if strings.Join(change.Changed, ",") != "cut2" || cutIDsOf(change.Cuts.Cuts) != "cut1,cut2" {
		t.Fatalf("record = %s", payload)
	}
	if got := change.Cuts.Cuts[1]; got.ParagraphID != "" || len(got.Keys) != 0 || got.Paragraph != nil || got.Stale {
		t.Fatalf("wordless cut = %+v", got)
	}
}
