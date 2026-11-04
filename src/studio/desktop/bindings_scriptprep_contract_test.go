package main

import (
	"testing"
)

// The bindings' payloads, the goldens the UI's schemas are checked against: one chapter's state, and the list with a chapter set,
// one never set and the opening credits.
func TestScriptPrepContractGoldens(t *testing.T) {
	host, _ := bookmarksHost(t)

	payload, err := host.ScriptPrepSetChapter("c-0001", "progress")
	checkBindingContract(t, "script-prep-chapter", payload)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := host.ScriptPrepSetChapter("credits:opening", "prepped"); err != nil {
		t.Fatal(err)
	}
	payload, err = host.ScriptPrepList()
	checkBindingContract(t, "script-prep-list", payload)
	list := decodeScriptPrep(t)(payload, err)
	if len(list.Chapters) != 3 || list.Chapters[0].State != "progress" || list.Chapters[1].State != "none" || list.Chapters[2].ChapterID != "credits:opening" {
		t.Fatalf("list = %s", payload)
	}
}
