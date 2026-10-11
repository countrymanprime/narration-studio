package main

import (
	"path/filepath"
	"strings"
	"testing"
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
