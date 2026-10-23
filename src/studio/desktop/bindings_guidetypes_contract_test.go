package main

import (
	"encoding/json"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/guide"
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

func TestContractGuideTypeEditsReturnNothing(t *testing.T) {
	for name, call := range map[string]func(*Host) (string, error){
		"GuideTypeAdd":       func(h *Host) (string, error) { return h.GuideTypeAdd("Creature") },
		"GuideTypeRename":    func(h *Host) (string, error) { return h.GuideTypeRename("Place", "Location") },
		"GuideTypeSetColour": func(h *Host) (string, error) { return h.GuideTypeSetColour("Place", "rose") },
		"GuideTypeSetSpeaks": func(h *Host) (string, error) { return h.GuideTypeSetSpeaks("Place", true) },
		"GuideTypeRemove":    func(h *Host) (string, error) { return h.GuideTypeRemove("Event") },
	} {
		service, _ := countingGuide(t)
		if got, err := call(&Host{guide: service}); err != nil || got != "null" {
			t.Fatalf("%s = %q, %v", name, got, err)
		}
	}
}
