package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/scriptprep"
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

func decodeScriptWord(t *testing.T) func(string, error) scriptprep.Word {
	return func(payload string, err error) scriptprep.Word {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var word scriptprep.Word
		if err := json.Unmarshal([]byte(payload), &word); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return word
	}
}

func TestScriptPrepBindingsRoundtrip(t *testing.T) {
	host, _ := bookmarksHost(t)
	list := decodeScriptPrep(t)(host.ScriptPrepList())
	if len(list.Chapters) != 2 || list.Chapters[0].State != "none" || len(list.Words) != 0 {
		t.Fatalf("list of a new project = %+v", list)
	}
	payload, err := host.ScriptPrepSetChapter("c-0002", "prepped")
	if err != nil || !strings.Contains(payload, `"state":"prepped"`) {
		t.Fatalf("set chapter = %s, %v", payload, err)
	}
	if _, err := host.ScriptPrepSetChapter("c-0009", "prepped"); err == nil {
		t.Fatal("a chapter the manuscript lacks was saved")
	}
	// "Queen" after the closing curly quote: UTF-16 offsets 25 to 30.
	queen := decodeScriptWord(t)(host.ScriptWordFlag("c-0001", "p-000001", 25, 30))
	if queen.Word != "queen" || queen.Status != "not_set" || len(queen.Flags) != 1 {
		t.Fatalf("flagged = %+v", queen)
	}
	// A registered source that is not installed is still a registered one.
	said := decodeScriptWord(t)(host.ScriptWordSay("Queen", "kween", "wiktextract"))
	if said.Say != "kween" || said.Source != "wiktextract" || said.Status != "set" {
		t.Fatalf("said = %+v", said)
	}
	if _, err := host.ScriptWordSay("queen", "kween", "made-up"); err == nil {
		t.Fatal("an unregistered source was saved")
	}
	typed := decodeScriptWord(t)(host.ScriptWordSay("queen", "KWEEN", ""))
	if typed.Source != "manual" {
		t.Fatalf("typed = %+v", typed)
	}
	list = decodeScriptPrep(t)(host.ScriptPrepList())
	if list.Chapters[1].State != "prepped" || len(list.Words) != 1 || list.Words[0].Say != "KWEEN" {
		t.Fatalf("list = %+v", list)
	}
	gone := decodeScriptWord(t)(host.ScriptWordUnflag(queen.Flags[0].ID))
	if gone.Status != "not_flagged" || gone.Say != "" || len(gone.Flags) != 0 {
		t.Fatalf("after the last unflag = %+v", gone)
	}
}

// The bindings take ids, offsets, a state, a word, a say-value and a source id, never a path: a say-value shaped like one is
// stored as text, a source shaped like one is refused, and nothing at either path is opened or written.
func TestScriptPrepBindingsStoreAPathShapedValueAsText(t *testing.T) {
	host, project := bookmarksHost(t)
	outside := filepath.Join(filepath.Dir(project), "say-target.txt")
	decodeScriptWord(t)(host.ScriptWordFlag("c-0001", "p-000002", 4, 12))
	said := decodeScriptWord(t)(host.ScriptWordSay("soldiers", outside, "espeak"))
	if said.Say != outside {
		t.Fatalf("said = %+v", said)
	}
	if _, err := host.ScriptWordSay("soldiers", "x", "../"+outside); err == nil {
		t.Fatal("a path-shaped source was saved")
	}
	if _, err := os.Stat(outside); !os.IsNotExist(err) {
		t.Fatalf("a path-shaped value touched the file system: %v", err)
	}
}

func TestScriptPrepBindingsWithNoProject(t *testing.T) {
	host := NewHost()
	if list := decodeScriptPrep(t)(host.ScriptPrepList()); len(list.Chapters) != 0 || len(list.Words) != 0 {
		t.Fatalf("list with no project = %+v", list)
	}
	if _, err := host.ScriptPrepSetChapter("c-0001", "prepped"); err == nil {
		t.Fatal("a set with no project succeeded")
	}
	if _, err := host.ScriptWordFlag("c-0001", "p-000001", 0, 1); err == nil {
		t.Fatal("a flag with no project succeeded")
	}
	if _, err := host.ScriptWordSay("x", "y", ""); err == nil {
		t.Fatal("a say with no project succeeded")
	}
	if _, err := host.ScriptWordUnflag("x"); err == nil {
		t.Fatal("an unflag with no project succeeded")
	}
}

// Replacing the manuscript is the import's own test (internal/manuscript); Clear project data through its binding removes the
// file too.
func TestClearProjectDataRemovesScriptPrep(t *testing.T) {
	host, project := bookmarksHost(t)
	decodeScriptWord(t)(host.ScriptWordFlag("c-0001", "p-000002", 4, 12))
	if _, err := host.ManuscriptClearProjectData(true); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(scriptprep.File(project)); !os.IsNotExist(err) {
		t.Fatalf("script prep after Clear project data: %v", err)
	}
}
