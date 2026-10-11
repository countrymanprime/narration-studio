package main

import (
	"path/filepath"
	"strings"
	"testing"
)

// The three bindings' payloads, the goldens the UI's schemas are checked against: an empty list, an accept (with a word
// already accepted), the list in reading order with stale words, and what an unaccept leaves.
func TestEditLogAcceptedContractGoldens(t *testing.T) {
	host, project := editLogHost(t)
	payload, err := host.EditingAcceptedList("c-0001")
	checkBindingContract(t, "edit-accepted-list-empty", payload)
	decodeAcceptedWords(t)(payload, err)

	decodeAcceptedChange(t)(host.EditingAccept("c-0001", []string{"p-000002:1"}))
	// "the Queen" (words 4 and 5) and "soldiers" again: only the two new words are changed.
	payload, err = host.EditingAccept("c-0001", []string{"p-000001:4", "p-000001:5", "p-000002:1"})
	checkBindingContract(t, "edit-accepted-accept", payload)
	if change := decodeAcceptedChange(t)(payload, err); strings.Join(change.Changed, ",") != "p-000001:4,p-000001:5" {
		t.Fatalf("accept = %s", payload)
	}
	decodeAcceptedChange(t)(host.EditingAccept("c-0001", []string{"p-000002:3"}))

	// The narrator re-imports without a reset: "soldiers" became "guards" and the line lost its last word. Both records are
	// stale, never moved.
	edited := strings.Replace(bookmarksManuscript, "The soldiers were silent.", "The guards were", 1)
	writeNested(t, filepath.Join(project, "narration-utils", "manuscript", "manuscript.json"), edited)
	payload, err = host.EditingAcceptedList("c-0001")
	checkBindingContract(t, "edit-accepted-list", payload)
	list := decodeAcceptedWords(t)(payload, err)
	if acceptedKeys(list.Words) != "p-000001:4,p-000001:5,p-000002:1,p-000002:3" || list.Words[0].Stale || list.Words[2].StaleReason != "text_changed" || list.Words[3].StaleReason != "word_missing" {
		t.Fatalf("list = %s", payload)
	}

	payload, err = host.EditingUnaccept("c-0001", []string{"p-000002:1", "p-000002:3"})
	checkBindingContract(t, "edit-accepted-unaccept", payload)
	if change := decodeAcceptedChange(t)(payload, err); acceptedKeys(change.Words) != "p-000001:4,p-000001:5" {
		t.Fatalf("unaccept = %s", payload)
	}
}
