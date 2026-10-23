package guide

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
)

// The sidecar's own list (test_bible_types.py writes guide-types-default-sidecar.json from manuscript_guide.py DEFAULT_TYPES).
func TestDefaultTypesMatchTheSidecar(t *testing.T) {
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	bytes, err := os.ReadFile(filepath.Join(dir, "guide-types-default-sidecar.json"))
	if err != nil {
		t.Fatalf("the sidecar's types file is missing (run the Python contract test with UPDATE_CONTRACTS=1): %v", err)
	}
	var want []Type
	if err := json.Unmarshal(bytes, &want); err != nil {
		t.Fatal(err)
	}
	if got := DefaultTypes(); !slices.Equal(got, want) {
		t.Fatalf("DefaultTypes() = %v, the sidecar's = %v", got, want)
	}
}

func TestAFileWithoutTypesReadsAsTheDefaults(t *testing.T) {
	for _, content := range []string{`{"schema_version": 2, "entities": []}`, `{"schema_version": 2, "types": null}`} {
		service, _, _ := guideFile(t, content)
		if got, err := service.Types(); err != nil || !slices.Equal(got, DefaultTypes()) {
			t.Fatalf("%s: %v, %v", content, got, err)
		}
	}
	if got, err := New(t.TempDir(), "", "", nil, nil).Types(); err != nil || !slices.Equal(got, DefaultTypes()) {
		t.Fatalf("no file: %v, %v", got, err)
	}
}

func TestAMalformedTypesListIsRefused(t *testing.T) {
	for _, types := range []string{`"Character"`, `[]`, `[{"name": "", "colour": "green", "speaks": true}]`, `[{"name": "A", "colour": "pink", "speaks": false}]`} {
		service, _, _ := guideFile(t, `{"schema_version": 2, "types": `+types+`}`)
		if _, err := service.Types(); err == nil || !strings.Contains(err.Error(), "types data is invalid") {
			t.Fatalf("%s: err = %v", types, err)
		}
	}
}

func TestATypeNameOrColourTheSidecarWouldRefuseIsRefusedBeforeItStarts(t *testing.T) {
	service := New(t.TempDir(), "", "", nil, nil) // no sidecar: a call that got past the check would fail differently
	for _, name := range []string{"", "  ", "two\nlines", strings.Repeat("x", maxTypeName+1)} {
		if err := service.AddType(name); err == nil || !strings.Contains(err.Error(), "one line") {
			t.Fatalf("AddType(%q) = %v", name, err)
		}
		if err := service.RenameType("Place", name); err == nil || !strings.Contains(err.Error(), "one line") {
			t.Fatalf("RenameType(%q) = %v", name, err)
		}
	}
	if err := service.SetTypeColour("Place", "pink"); err == nil || !strings.Contains(err.Error(), "colour is one of") {
		t.Fatalf("SetTypeColour = %v", err)
	}
}

// What Types() sends the UI for the list the sidecar's own test writes after an add, a colour, a Can speak, a rename and a remove
// (guide-types-sidecar.json): the rows without the "builtin" the file keeps for a rebuild.
func TestContractTypesFromTheSidecarsOwnFile(t *testing.T) {
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	bytes, err := os.ReadFile(filepath.Join(dir, "guide-types-sidecar.json"))
	if err != nil {
		t.Fatalf("the sidecar's types file is missing (run the Python contract test with UPDATE_CONTRACTS=1): %v", err)
	}
	service, _, _ := guideFile(t, `{"schema_version": 2, "entities": [], "types": `+string(bytes)+`}`)
	got, err := service.Types()
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "guide-types", got)
}
