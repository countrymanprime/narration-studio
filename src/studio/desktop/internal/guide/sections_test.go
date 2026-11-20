package guide

import (
	"strings"
	"testing"
)

func sectionsDocument(name string) map[string]any {
	return map[string]any{
		"schema_version": 2,
		"entities":       []any{map[string]any{"id": "e1", "canonical_name": name}},
		"dialogue_cues":  []any{map[string]any{"id": "cue-1", "paragraphId": "p1"}},
		"types":          []any{map[string]any{"name": "Character", "colour": TypeColours[0], "speaks": true}},
	}
}

func TestReadsSplitAnUnchangedFileOnce(t *testing.T) {
	project := t.TempDir()
	writeGuideDocument(t, project, sectionsDocument("Ada"))
	s := New(project, "", "", nil, nil)
	for range 2 {
		entities, err := s.Entities()
		if err != nil || len(entities) != 1 || entities[0]["canonical_name"] != "Ada" {
			t.Fatalf("Entities() = %v, %v", entities, err)
		}
		if types, err := s.Types(); err != nil || len(types) != 1 || types[0].Name != "Character" {
			t.Fatalf("Types() = %v, %v", types, err)
		}
		if cues, err := s.DialogueCues(); err != nil || len(cues) != 1 || cues[0].ID != "cue-1" {
			t.Fatalf("DialogueCues() = %v, %v", cues, err)
		}
	}
	if got := s.splits.Load(); got != 1 {
		t.Fatalf("six reads of one file split it %d times, want 1", got)
	}
}

func TestAReadNeverAnswersFromAFileAnotherWriterChanged(t *testing.T) {
	project := t.TempDir()
	writeGuideDocument(t, project, sectionsDocument("Ada"))
	s := New(project, "", "", nil, nil)
	if _, err := s.Entities(); err != nil {
		t.Fatal(err)
	}
	writeGuideDocument(t, project, sectionsDocument("Bea")) // the same length: only the bytes differ
	entities, err := s.Entities()
	if err != nil || entities[0]["canonical_name"] != "Bea" {
		t.Fatalf("after another writer's change Entities() = %v, %v, want Bea", entities, err)
	}
	newer := sectionsDocument("Cy")
	newer["schema_version"] = schemaVersion + 1
	writeGuideDocument(t, project, newer)
	if _, err := s.Types(); err == nil || !strings.Contains(err.Error(), "newer") {
		t.Fatalf("a newer file read as %v, want it refused", err)
	}
}

func TestEachReadDecodesItsOwnEntries(t *testing.T) {
	project := t.TempDir()
	writeGuideDocument(t, project, sectionsDocument("Ada"))
	s := New(project, "", "", nil, nil)
	first, err := s.Entities()
	if err != nil {
		t.Fatal(err)
	}
	first[0]["canonical_name"] = "changed by the caller"
	second, err := s.Entities()
	if err != nil || second[0]["canonical_name"] != "Ada" {
		t.Fatalf("a caller's change reached the next read: %v, %v", second, err)
	}
}

func TestAnAbsentOrNullListReadsAsItsDefault(t *testing.T) {
	project := t.TempDir()
	writeGuideDocument(t, project, map[string]any{"schema_version": 2, "entities": nil, "dialogue_cues": nil, "types": nil})
	s := New(project, "", "", nil, nil)
	if entities, err := s.Entities(); err != nil || len(entities) != 0 {
		t.Fatalf("Entities() = %v, %v", entities, err)
	}
	if cues, err := s.DialogueCues(); err != nil || cues == nil || len(cues) != 0 {
		t.Fatalf("DialogueCues() = %v, %v", cues, err)
	}
	if types, err := s.Types(); err != nil || len(types) != len(DefaultTypes()) {
		t.Fatalf("Types() = %v, %v", types, err)
	}
}
