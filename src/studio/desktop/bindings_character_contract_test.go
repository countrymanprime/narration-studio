package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"desktop/internal/brand"
	"desktop/internal/character"
	"desktop/internal/guide"
	"desktop/internal/settings"
)

// What CharacterListRegions, CharacterApprove/CharacterReferences and GuideDialogueCues send to the UI
// (non-acoustic part only; the owner decision on #509 benches every acoustic-drift
// binding, so there is no findings or audition contract here).

const contractTwoRegions = `<REAPER_PROJECT 0.1 "7.0" 0
  MARKER 1 1.5 "Alice ref A" 1 0 1 R {AAAAAAAA-0000-0000-0000-000000000001} 0 1
  MARKER 1 3.5 "" 1
  MARKER 2 10 "Narration ref" 1 0 1 R {BBBBBBBB-0000-0000-0000-000000000002} 0 1
  MARKER 2 14 "" 1
>
`

func contractCharacterService(t *testing.T) *character.Service {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "project.rpp")
	if err := os.WriteFile(path, []byte(contractTwoRegions), 0o600); err != nil {
		t.Fatal(err)
	}
	return character.New(character.Config{Project: dir, ProjectFile: func() (string, error) { return path, nil }})
}

func TestContractCharacterListRegions(t *testing.T) {
	host := &Host{character: contractCharacterService(t)}
	listed, err := host.CharacterListRegions()
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "character-regions", listed)
}

func TestContractCharacterApproveAndReferences(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "project.rpp")
	if err := os.WriteFile(path, []byte(contractTwoRegions), 0o600); err != nil {
		t.Fatal(err)
	}
	svc := character.New(character.Config{Project: dir, ProjectFile: func() (string, error) { return path, nil }})
	host := &Host{character: svc}
	approved, err := host.CharacterApprove("alice", "{AAAAAAAA-0000-0000-0000-000000000001}", "Anchor take, chapter 1.")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "character-approve", approved)
	if _, err := host.CharacterApprove(character.NarrationCharacterID, "{BBBBBBBB-0000-0000-0000-000000000002}", ""); err != nil {
		t.Fatal(err)
	}
	// The saved project is re-saved with the Narration region's name changed, as a narrator renaming a region in
	// REAPER would produce, so the second reference reads "changed since approval" in the golden.
	renamed := `<REAPER_PROJECT 0.1 "7.0" 0
  MARKER 1 1.5 "Alice ref A" 1 0 1 R {AAAAAAAA-0000-0000-0000-000000000001} 0 1
  MARKER 1 3.5 "" 1
  MARKER 2 10 "Narration ref (renamed)" 1 0 1 R {BBBBBBBB-0000-0000-0000-000000000002} 0 1
  MARKER 2 14 "" 1
>
`
	if err := os.WriteFile(path, []byte(renamed), 0o600); err != nil {
		t.Fatal(err)
	}
	referenced, err := host.CharacterReferences()
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "character-references", referenced)
}

func contractGuideServiceWithDialogueCues(t *testing.T) *guide.Service {
	t.Helper()
	project := t.TempDir()
	svc := guide.New(project, "", "", settings.New(project, project), nil)
	path := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	document := map[string]any{
		"schema_version": 2,
		"entities":       []any{},
		"dialogue_cues": []any{
			map[string]any{
				"id": "cue-1", "chapterId": "chapter-1", "paragraphId": "p-3", "quote_start": 0, "quote_end": 8,
				"quote_text": "Oh dear!", "speaker_entity_id": "alice", "speaker_source": "tag",
				"evidence":  map[string]any{"chapterId": "chapter-1", "paragraphId": "p-3", "excerpt": "Oh dear!", "tag": "said Alice"},
				"corrected": false,
			},
			map[string]any{
				"id": "cue-2", "chapterId": "chapter-6", "paragraphId": "p-24", "quote_start": 0, "quote_end": 15,
				"quote_text": "Have some wine.", "speaker_entity_id": nil, "speaker_source": "unknown",
				"evidence":  map[string]any{"chapterId": "chapter-6", "paragraphId": "p-24", "excerpt": "Have some wine.", "tag": ""},
				"corrected": false,
			},
			map[string]any{
				"id": "cue-3", "chapterId": "chapter-6", "paragraphId": "p-25", "quote_start": 0, "quote_end": 9,
				"quote_text": "No room!", "speaker_entity_id": "alice", "speaker_source": "proximity",
				"evidence":  map[string]any{"chapterId": "chapter-6", "paragraphId": "p-25", "excerpt": "No room! Alice frowned.", "tag": ""},
				"corrected": false,
			},
		},
	}
	bytes, err := json.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, bytes, 0o600); err != nil {
		t.Fatal(err)
	}
	return svc
}

func TestContractGuideDialogueCues(t *testing.T) {
	host := &Host{guide: contractGuideServiceWithDialogueCues(t)}
	cues, err := host.GuideDialogueCues()
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "guide-dialogue-cues", cues)
}

func TestContractGuideAttributeSpeakers(t *testing.T) {
	project := t.TempDir()
	svc := guide.New(project, "", "", settings.New(project, project), nil)
	write := func(path string, value any) {
		t.Helper()
		bytes, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, bytes, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json"), map[string]any{
		"schemaVersion": 1, "documentId": "d", "chapters": []any{map[string]any{"id": "c1", "title": "One"}},
		"paragraphs": []any{
			map[string]any{"id": "p1", "index": 0, "chapterId": "c1", "chapterTitle": "One", "text": `"Hello," Ada said.`},
			map[string]any{"id": "p2", "index": 1, "chapterId": "c1", "chapterTitle": "One", "text": `"Wait," Bo said.`},
		},
	})
	write(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"), map[string]any{
		"schema_version": 2,
		"entities": []any{
			map[string]any{"id": "ada", "canonical_name": "Ada", "category": "Character", "aliases": []any{}},
			map[string]any{"id": "bo", "canonical_name": "Bo", "category": "Character", "aliases": []any{}},
		},
	})
	host := &Host{guide: svc}
	result, err := host.GuideAttributeSpeakers()
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "guide-attribute-speakers", result)
}
