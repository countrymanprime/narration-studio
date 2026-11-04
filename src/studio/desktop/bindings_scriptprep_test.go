package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"desktop/internal/scriptprep"
)

func decodeScriptPrep(t *testing.T) func(string, error) scriptprep.ScriptPrep {
	return func(payload string, err error) scriptprep.ScriptPrep {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var list scriptprep.ScriptPrep
		if err := json.Unmarshal([]byte(payload), &list); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return list
	}
}

func TestScriptPrepBindingsRoundtrip(t *testing.T) {
	host, _ := bookmarksHost(t)
	payload, err := host.ScriptPrepList()
	list := decodeScriptPrep(t)(payload, err)
	if len(list.Chapters) != 2 || list.Chapters[0].State != "none" || strings.Contains(payload, "words") {
		t.Fatalf("list of a new project = %s", payload)
	}
	payload, err = host.ScriptPrepSetChapter("c-0002", "prepped")
	if err != nil || !strings.Contains(payload, `"state":"prepped"`) {
		t.Fatalf("set chapter = %s, %v", payload, err)
	}
	if _, err := host.ScriptPrepSetChapter("c-0009", "prepped"); err == nil {
		t.Fatal("a chapter the manuscript lacks was saved")
	}
	list = decodeScriptPrep(t)(host.ScriptPrepList())
	if list.Chapters[1].State != "prepped" {
		t.Fatalf("list = %+v", list)
	}
}

func TestScriptPrepBindingsWithNoProject(t *testing.T) {
	host := newTestHost(t)
	if list := decodeScriptPrep(t)(host.ScriptPrepList()); len(list.Chapters) != 0 {
		t.Fatalf("list with no project = %+v", list)
	}
	if _, err := host.ScriptPrepSetChapter("c-0001", "prepped"); err == nil {
		t.Fatal("a set with no project succeeded")
	}
}

// Replacing the manuscript is the import's own test (internal/manuscript); Clear project data through its binding removes the
// file too.
func TestClearProjectDataRemovesScriptPrep(t *testing.T) {
	host, project := bookmarksHost(t)
	if _, err := host.ScriptPrepSetChapter("c-0002", "prepped"); err != nil {
		t.Fatal(err)
	}
	if _, err := host.ManuscriptClearProjectData(true); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(scriptprep.File(project)); !os.IsNotExist(err) {
		t.Fatalf("script prep after Clear project data: %v", err)
	}
}
