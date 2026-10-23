package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
)

func editLogHost(t *testing.T) (*Host, string) {
	t.Helper()
	// The bookmarks tests' two-chapter manuscript: "the Queen" is words 4 and 5 of p-000001.
	return bookmarksHost(t)
}

func decodeAcceptedWords(t *testing.T) func(string, error) editlog.AcceptedWords {
	return func(payload string, err error) editlog.AcceptedWords {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var words editlog.AcceptedWords
		if err := json.Unmarshal([]byte(payload), &words); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return words
	}
}

func decodeAcceptedChange(t *testing.T) func(string, error) editlog.AcceptedChange {
	return func(payload string, err error) editlog.AcceptedChange {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var change editlog.AcceptedChange
		if err := json.Unmarshal([]byte(payload), &change); err != nil {
			t.Fatalf("%v: %s", err, payload)
		}
		return change
	}
}

func acceptedKeys(words []editlog.Accepted) string {
	keys := make([]string, 0, len(words))
	for _, word := range words {
		keys = append(keys, word.Key)
	}
	return strings.Join(keys, ",")
}

func TestEditLogBindingsAcceptListUnacceptRoundtrip(t *testing.T) {
	host, project := editLogHost(t)
	if list := decodeAcceptedWords(t)(host.EditingAcceptedList("c-0001")); len(list.Words) != 0 || list.ChapterID != "c-0001" {
		t.Fatalf("list of a new project = %+v", list)
	}
	change := decodeAcceptedChange(t)(host.EditingAccept("c-0001", []string{"p-000002:1", "p-000001:5"}))
	if acceptedKeys(change.Words) != "p-000001:5,p-000002:1" || strings.Join(change.Changed, ",") != "p-000002:1,p-000001:5" {
		t.Fatalf("accept = %+v", change)
	}
	if again := decodeAcceptedChange(t)(host.EditingAccept("c-0001", []string{"p-000001:5"})); len(again.Changed) != 0 {
		t.Fatalf("accepting again = %+v", again)
	}
	if list := decodeAcceptedWords(t)(hostOverProject(t, project).EditingAcceptedList("c-0001")); acceptedKeys(list.Words) != "p-000001:5,p-000002:1" {
		t.Fatalf("list from another host = %+v", list)
	}
	removed := decodeAcceptedChange(t)(host.EditingUnaccept("c-0001", []string{"p-000001:5"}))
	if acceptedKeys(removed.Words) != "p-000002:1" || strings.Join(removed.Changed, ",") != "p-000001:5" {
		t.Fatalf("unaccept = %+v", removed)
	}
}

func TestEditLogBindingsRefuseAWordTheManuscriptLacks(t *testing.T) {
	host, project := editLogHost(t)
	for _, call := range []struct {
		chapterID string
		keys      []string
	}{{"c-0009", []string{"p-000001:0"}}, {"c-0002", []string{"p-000001:0"}}, {"c-0001", []string{"p-000002:4"}}, {"c-0001", []string{"p-000002:-1"}}, {"c-0001", nil}} {
		if _, err := host.EditingAccept(call.chapterID, call.keys); err == nil {
			t.Errorf("accepting %+v succeeded", call)
		}
	}
	if _, err := os.Stat(editlog.AcceptedFile(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused accept wrote the file: %v", err)
	}
}

// The bindings take ids and keys, never a path: a path-shaped key is an unknown word and nothing at that path is opened.
func TestEditLogBindingsRefuseAPathShapedKey(t *testing.T) {
	host, project := editLogHost(t)
	outside := filepath.Join(filepath.Dir(project), "accepted-target")
	for _, key := range []string{"../../../etc/passwd:0", outside + ":0"} {
		if _, err := host.EditingAccept("c-0001", []string{key}); err == nil {
			t.Errorf("a path-shaped key %q was accepted", key)
		}
	}
	if _, err := host.EditingAccept("../../etc", []string{"p-000001:0"}); err == nil {
		t.Error("a path-shaped chapter id was accepted")
	}
	if _, err := os.Stat(outside); !os.IsNotExist(err) {
		t.Fatalf("a path-shaped key touched the file system: %v", err)
	}
}

func TestEditLogBindingsWithNoProject(t *testing.T) {
	host := NewHost()
	if payload, err := host.EditingAcceptedList("c-0001"); err != nil || payload != `{"chapterId":"c-0001","words":[]}` {
		t.Fatalf("list with no project = %s, %v", payload, err)
	}
	if _, err := host.EditingAccept("c-0001", []string{"p-000001:0"}); err == nil {
		t.Fatal("an accept with no project succeeded")
	}
	if _, err := host.EditingUnaccept("c-0001", []string{"p-000001:0"}); err == nil {
		t.Fatal("an unaccept with no project succeeded")
	}
}

// Replacing the manuscript is the import's own test (internal/manuscript); Clear project data through its binding removes
// the file too.
func TestClearProjectDataRemovesAcceptedWords(t *testing.T) {
	host, project := editLogHost(t)
	decodeAcceptedChange(t)(host.EditingAccept("c-0001", []string{"p-000002:1"}))
	if _, err := host.ManuscriptClearProjectData(true); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(editlog.AcceptedFile(project)); !os.IsNotExist(err) {
		t.Fatalf("accepted words after Clear project data: %v", err)
	}
}

// hostOverProject attaches a second host to the same project folder: what reopening the app reads.
func hostOverProject(t *testing.T, project string) *Host {
	t.Helper()
	host := NewHost()
	next := host.config
	next.projectFolder = project
	if attached, reason := host.attachProjectLocked(next); !attached {
		t.Fatalf("attach failed: %s", reason)
	}
	return host
}
