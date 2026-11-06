package main

import (
	"encoding/json"
	"testing"

	"desktop/internal/contractfile"
	"desktop/internal/guide"
)

// What GuideTypes sends the UI before the narrator has changed a type: the default list. The list after edits is pinned in
// guide-types.json (internal/guide/types_test.go). The edit bindings send nothing (the UI's voidResult).
func TestContractGuideTypesBeforeAnyEditAreTheDefaults(t *testing.T) {
	got, err := (&Host{guide: guide.New(t.TempDir(), "", "", nil, nil)}).GuideTypes()
	if err != nil {
		t.Fatal(err)
	}
	var value any
	if err := json.Unmarshal([]byte(got), &value); err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "guide-types-default", value)
}

// What GuideTypesChanged sends: a JSON boolean, false for the default list and true once a type is added.
func TestContractGuideTypesChangedIsABoolean(t *testing.T) {
	service, _, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := hostWithoutCueRefresh(service)
	before, err := host.GuideTypesChanged()
	if err != nil || before != "false" {
		t.Fatalf("default list: %q, %v", before, err)
	}
	contractfile.Check(t, "guide-types-changed-default", false)
	if _, err := host.GuideTypeAdd("Creature"); err != nil {
		t.Fatal(err)
	}
	after, err := host.GuideTypesChanged()
	if err != nil || after != "true" {
		t.Fatalf("after adding a type: %q, %v", after, err)
	}
	contractfile.Check(t, "guide-types-changed", true)
}

func TestContractGuideTypeEditsReturnNothing(t *testing.T) {
	for name, call := range map[string]func(*Host) (string, error){
		"GuideTypeAdd":       func(h *Host) (string, error) { return h.GuideTypeAdd("Creature") },
		"GuideTypeRename":    func(h *Host) (string, error) { return h.GuideTypeRename("Place", "Location") },
		"GuideTypeSetColour": func(h *Host) (string, error) { return h.GuideTypeSetColour("Place", "rose") },
		"GuideTypeSetSpeaks": func(h *Host) (string, error) { return h.GuideTypeSetSpeaks("Place", true) },
		"GuideTypeRemove":    func(h *Host) (string, error) { return h.GuideTypeRemove("Event") },
	} {
		service, _ := countingGuide(t)
		if got, err := call(hostWithoutCueRefresh(service)); err != nil || got != "null" {
			t.Fatalf("%s = %q, %v", name, got, err)
		}
	}
}
