package guide

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"desktop/internal/contractfile"
)

// The build's own list (build_test.go TestTheTypesOfAFileWithoutThemAreTheDefaults writes guide-types-default-sidecar.json from
// defaultTypeRows, with the bytes the sidecar's test_bible_types.py wrote from manuscript_guide.py DEFAULT_TYPES).
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

// The list after an add, a Can speak, a colour, a rename and a remove, as the file holds it (guide-types-sidecar.json: the sidecar wrote
// it before the host made type edits itself, and the UI's contract tests read it by that name), and what Types() sends the UI for it:
// the rows without the "builtin" the file keeps for a rebuild.
func TestContractTypes(t *testing.T) {
	service, _, path := guideFile(t, `{"schema_version": 2, "entities": [{"id": "e-wren", "canonical_name": "Wren", "category": "Character",
		"aliases": [], "occurrences": [], "occurrence_count": 0, "pronunciation": {}, "description": {"text": "", "evidence": {}},
		"personality_notes": [], "relationships": [], "properties": [], "locked": false, "manual": false, "review_state": "generated"}]}`)
	for _, edit := range []func() error{
		func() error { return service.AddType("Creature") },
		func() error { return service.SetTypeSpeaks("Creature", true) },
		func() error { return service.SetTypeColour("Creature", "amber") },
		func() error { return service.RenameType("Place", "Location") },
		func() error { return service.RemoveType("Event") },
	} {
		if err := edit(); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		Types []any `json:"types"`
	}
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "guide-types-sidecar", document.Types)
	got, err := service.Types()
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "guide-types", got)
}

func TestTypesChangedIsTrueForAnyListThatIsNotTheDefaults(t *testing.T) {
	defaults := `[{"name":"Character","colour":"green","speaks":true},{"name":"Place","colour":"blue","speaks":false},{"name":"Organization","colour":"violet","speaks":false},` +
		`{"name":"Lore","colour":"amber","speaks":false},{"name":"Item","colour":"teal","speaks":false},{"name":"Event","colour":"rose","speaks":false}]`
	for name, tc := range map[string]struct {
		content string
		want    bool
	}{
		"no list":              {`{"schema_version": 2, "entities": []}`, false},
		"the default list":     {`{"schema_version": 2, "types": ` + defaults + `}`, false},
		"a type added":         {`{"schema_version": 2, "types": ` + defaults[:len(defaults)-1] + `,{"name":"Creature","colour":"amber","speaks":true}]}`, true},
		"a type removed":       {`{"schema_version": 2, "types": [{"name":"Character","colour":"green","speaks":true}]}`, true},
		"a colour changed":     {`{"schema_version": 2, "types": ` + strings.Replace(defaults, `"blue"`, `"rose"`, 1) + `}`, true},
		"a type now speaks":    {`{"schema_version": 2, "types": ` + strings.Replace(defaults, `"Place","colour":"blue","speaks":false`, `"Place","colour":"blue","speaks":true`, 1) + `}`, true},
		"a type renamed":       {`{"schema_version": 2, "types": ` + strings.Replace(defaults, `"Lore"`, `"Legend"`, 1) + `}`, true},
		"a stored builtin key": {`{"schema_version": 2, "types": ` + strings.Replace(defaults, `"speaks":false}`, `"speaks":false,"builtin":"Place"}`, 1) + `}`, false},
	} {
		service, _, _ := guideFile(t, tc.content)
		got, err := service.TypesChanged()
		if err != nil || got != tc.want {
			t.Errorf("%s: TypesChanged = %v, %v; want %v", name, got, err, tc.want)
		}
	}
	if got, err := New(t.TempDir(), "", "", nil, nil).TypesChanged(); err != nil || got {
		t.Errorf("no Story Bible: %v, %v", got, err)
	}
	service, _, _ := guideFile(t, `{"schema_version": 2, "types": "Character"}`)
	if _, err := service.TypesChanged(); err == nil {
		t.Error("a malformed list is refused")
	}
}
