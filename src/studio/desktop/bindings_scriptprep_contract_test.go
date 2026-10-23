package main

import (
	"path/filepath"
	"strings"
	"testing"
)

// The bindings' payloads, the goldens the UI's schemas are checked against: the list with chapter states, a set word, a word
// with no value and a stale flag; one chapter's state; and one word after a say-value is saved.
func TestScriptPrepContractGoldens(t *testing.T) {
	host, project := bookmarksHost(t)

	payload, err := host.ScriptPrepSetChapter("c-0001", "progress")
	checkBindingContract(t, "script-prep-chapter", payload)
	if err != nil {
		t.Fatal(err)
	}
	// "Queen" after the closing curly quote: UTF-16 offsets 25 to 30.
	decodeScriptWord(t)(host.ScriptWordFlag("c-0001", "p-000001", 25, 30))
	decodeScriptWord(t)(host.ScriptWordFlag("c-0001", "p-000002", 4, 12))
	decodeScriptWord(t)(host.ScriptWordFlag("c-0002", "p-000003", 0, 5))
	payload, err = host.ScriptWordSay("queen", "kween", "cmu")
	checkBindingContract(t, "script-prep-word", payload)
	decodeScriptWord(t)(payload, err)

	// The narrator re-imports a manuscript where the soldiers' line changed: its flag is stale, never moved.
	edited := strings.Replace(bookmarksManuscript, "The soldiers were silent.", "The guards were silent.", 1)
	writeNested(t, filepath.Join(project, "narration-utils", "manuscript", "manuscript.json"), edited)
	payload, err = host.ScriptPrepList()
	checkBindingContract(t, "script-prep-list", payload)
	list := decodeScriptPrep(t)(payload, err)
	if len(list.Words) != 3 || list.Words[0].Status != "set" || list.Words[1].Flags[0].StaleReason != "text_changed" || list.Words[2].Status != "not_set" {
		t.Fatalf("list = %s", payload)
	}
}
