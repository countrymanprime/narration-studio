package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/guide"
)

// Each type edit is one sidecar call naming the type, and GuideTypes reads back the list the sidecar writes: here the file the
// sidecar's own test wrote after an add, a Can speak, a colour, a rename and a remove (guide-types-sidecar.json).
func TestGuideTypesRoundTripThroughTheSidecar(t *testing.T) {
	for _, tc := range []struct {
		call func(*Host) (string, error)
		want []string
	}{
		{func(h *Host) (string, error) { return h.GuideTypeAdd(" Creature ") }, []string{"type-add", "--name=Creature"}},
		{func(h *Host) (string, error) { return h.GuideTypeSetSpeaks("Creature", true) }, []string{"type-speaks", "--name=Creature", "--speaks", "1"}},
		{func(h *Host) (string, error) { return h.GuideTypeSetSpeaks("Creature", false) }, []string{"type-speaks", "--name=Creature", "--speaks", "0"}},
		{func(h *Host) (string, error) { return h.GuideTypeSetColour("Creature", "amber") }, []string{"type-colour", "--name=Creature", "--colour", "amber"}},
		{func(h *Host) (string, error) { return h.GuideTypeRename("Place", "Location") }, []string{"type-rename", "--name=Place", "--to=Location"}},
		{func(h *Host) (string, error) { return h.GuideTypeRemove("Event") }, []string{"type-remove", "--name=Event"}},
	} {
		service, calls := countingGuide(t)
		result, err := tc.call(&Host{guide: service})
		if err != nil || result != "null" {
			t.Fatalf("%v: %q, %v", tc.want, result, err)
		}
		call := calls()[0]
		if call[0] != tc.want[0] || !slices.Contains(call, "--guide") {
			t.Fatalf("call = %v, want %v", call, tc.want)
		}
		for _, arg := range tc.want[1:] {
			if !slices.Contains(call, arg) {
				t.Fatalf("call = %v, want %v", call, tc.want)
			}
		}
	}

	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	written, err := os.ReadFile(filepath.Join(dir, "guide-types-sidecar.json"))
	if err != nil {
		t.Fatalf("the sidecar's types file is missing (run the Python contract test with UPDATE_CONTRACTS=1): %v", err)
	}
	project := t.TempDir()
	host := &Host{guide: guide.New(project, "", "", nil, nil)}
	path := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(`{"schema_version": 2, "entities": [], "types": `+string(written)+`}`), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := host.GuideTypes()
	if err != nil {
		t.Fatal(err)
	}
	var rows []struct {
		Name   string `json:"name"`
		Colour string `json:"colour"`
		Speaks bool   `json:"speaks"`
	}
	if err := json.Unmarshal([]byte(got), &rows); err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, row := range rows {
		names = append(names, row.Name)
	}
	if want := []string{"Character", "Location", "Organization", "Lore", "Item", "Creature"}; !slices.Equal(names, want) {
		t.Fatalf("names = %v, want %v", names, want)
	}
	if last := rows[len(rows)-1]; last.Colour != "amber" || !last.Speaks {
		t.Fatalf("Creature = %+v", last)
	}
}

func TestGuideTypeBindingsRefuseABadNameOrColourBeforeTheSidecar(t *testing.T) {
	for _, call := range []func(*Host) (string, error){
		func(h *Host) (string, error) { return h.GuideTypeAdd("  ") },
		func(h *Host) (string, error) { return h.GuideTypeRename("Place", "two\nlines") },
		func(h *Host) (string, error) { return h.GuideTypeSetColour("Place", "pink") },
	} {
		service, calls := countingGuide(t)
		if _, err := call(&Host{guide: service}); err == nil {
			t.Fatal("accepted")
		}
		if len(calls()) != 0 {
			t.Fatal("the sidecar started")
		}
	}
}

func TestGuideTypeBindingsWithoutAStoryBible(t *testing.T) {
	host := &Host{}
	for name, call := range map[string]func() (string, error){
		"GuideTypes":         host.GuideTypes,
		"GuideTypeAdd":       func() (string, error) { return host.GuideTypeAdd("A") },
		"GuideTypeRename":    func() (string, error) { return host.GuideTypeRename("A", "B") },
		"GuideTypeSetColour": func() (string, error) { return host.GuideTypeSetColour("A", "green") },
		"GuideTypeSetSpeaks": func() (string, error) { return host.GuideTypeSetSpeaks("A", true) },
		"GuideTypeRemove":    func() (string, error) { return host.GuideTypeRemove("A") },
	} {
		if _, err := call(); err == nil {
			t.Fatalf("%s accepted", name)
		}
	}
}
