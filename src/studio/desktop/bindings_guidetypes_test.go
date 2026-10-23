package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"

	"github.com/countrymanprime/narration-studio/shell/internal/contractfile"
)

// The type edits run in the host (guide.Service.typesInHost): the same five edits the sidecar's own test makes, through the bindings with
// no sidecar process, leave the types the sidecar left (guide-types-sidecar.json), and GuideTypes reads that list back.
func TestGuideTypesRoundTripWithoutTheSidecar(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := &Host{guide: service}
	for _, step := range []func() (string, error){
		func() (string, error) { return host.GuideTypeAdd(" Creature ") },
		func() (string, error) { return host.GuideTypeSetSpeaks("Creature", true) },
		func() (string, error) { return host.GuideTypeSetColour("Creature", "amber") },
		func() (string, error) { return host.GuideTypeRename("Place", "Location") },
		func() (string, error) { return host.GuideTypeRemove("Event") },
	} {
		if result, err := step(); err != nil || result != "null" {
			t.Fatalf("%q, %v", result, err)
		}
	}
	if got := calls(); len(got) != 0 {
		t.Fatalf("the sidecar was started: %v", got)
	}
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	written, err := os.ReadFile(filepath.Join(dir, "guide-types-sidecar.json"))
	if err != nil {
		t.Fatalf("the sidecar's types file is missing (run the Python contract test with UPDATE_CONTRACTS=1): %v", err)
	}
	raw, err := os.ReadFile(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"))
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Types any `json:"types"`
	}
	var want any
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(written, &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(file.Types, want) {
		t.Fatalf("types = %v, the sidecar's = %v", file.Types, want)
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

func TestGuideTypeBindingsRefuseABadNameOrColourWithoutTheSidecar(t *testing.T) {
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
