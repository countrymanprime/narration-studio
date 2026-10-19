package main

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/recents"
)

func TestProjectRunningDawIsUnlinkedWithoutABridge(t *testing.T) {
	host := NewHost()
	host.recents = recents.New(filepath.Join(t.TempDir(), "recent-projects.json"))
	raw, err := host.ProjectRunningDaw()
	if err != nil {
		t.Fatal(err)
	}
	var got recents.Running
	if err := json.Unmarshal([]byte(raw), &got); err != nil {
		t.Fatal(err)
	}
	if got.Linked || got.Path != "" || got.Name != "" {
		t.Fatalf("got %#v, want the empty answer", got)
	}
}

func TestProjectSetPinnedReturnsTheUpdatedList(t *testing.T) {
	host := NewHost()
	host.recents = recents.New(filepath.Join(t.TempDir(), "recent-projects.json"))
	folder := t.TempDir()
	if err := host.recents.Touch(folder, "Pinned"); err != nil {
		t.Fatal(err)
	}
	raw, err := host.ProjectSetPinned(folder, true)
	if err != nil {
		t.Fatal(err)
	}
	var entries []recents.Entry
	if err := json.Unmarshal([]byte(raw), &entries); err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || !entries[0].Pinned {
		t.Fatalf("entries = %#v, want one pinned", entries)
	}
	if raw, err := (&Host{}).ProjectSetPinned(folder, true); err != nil || raw != "[]" {
		t.Fatalf("no store: %q, %v", raw, err)
	}
}
