package guide

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"desktop/internal/contractfile"
)

// What Entities() sends to the UI. The first file is built from the entities the Python sidecar's build pins
// (guide-entities-sidecar.json), read back through the real service; the second is a record written by an older sidecar, with the
// nulls and missing objects normalizeEntity exists for.
func serviceWithGuideFile(t *testing.T, entities any) *Service {
	t.Helper()
	project := t.TempDir()
	path := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	bytes, err := json.Marshal(map[string]any{"schema_version": 2, "entities": entities})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, bytes, 0o600); err != nil {
		t.Fatal(err)
	}
	return New(project, "", "", nil, nil)
}

func TestContractEntitiesFromTheSidecarsOwnFile(t *testing.T) {
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	bytes, err := os.ReadFile(filepath.Join(dir, "guide-entities-sidecar.json"))
	if err != nil {
		t.Fatalf("the sidecar's entity file is missing (run the Python contract test with UPDATE_CONTRACTS=1): %v", err)
	}
	var entities []any
	if err := json.Unmarshal(bytes, &entities); err != nil {
		t.Fatal(err)
	}
	got, err := serviceWithGuideFile(t, entities).Entities()
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "guide-entities", got)
}

func TestContractEntitiesFromAnOlderSidecarAreNormalized(t *testing.T) {
	legacy := []any{map[string]any{
		"id": "entity-legacy", "canonical_name": "Hatter", "category": "Character", "occurrence_count": 0, "locked": false, "review_state": "generated",
		"aliases": []any{map[string]any{"text": "Mad Hatter"}}, "occurrences": nil, "personality_notes": nil, "relationships": nil,
	}}
	got, err := serviceWithGuideFile(t, legacy).Entities()
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "guide-entities-legacy", got)
}

func TestContractNoGuideFileYetIsAnEmptyList(t *testing.T) {
	got, err := New(t.TempDir(), "", "", nil, nil).Entities()
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "guide-entities-empty", got)
}

// storedEntities is the entities the Story Bible file holds now, as plain JSON values.
func storedEntities(t *testing.T, s *Service) []any {
	t.Helper()
	raw, err := os.ReadFile(s.guidePath())
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		Entities []any `json:"entities"`
	}
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	return document.Entities
}

// checkStoredThenSent pins the entities the file holds (stored, a "-sidecar" file: the sidecar wrote these before the host made the
// edits itself, and the UI's contract tests read them by that name) and then what Entities() sends the UI for them (sent).
func checkStoredThenSent(t *testing.T, stored, sent string, entities []any) {
	t.Helper()
	contractfile.Check(t, stored, entities)
	got, err := serviceWithGuideFile(t, entities).Entities()
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, sent, got)
}

// The narrator's own pronunciation, its alternate, a status and a note: the file after PronounceUser, with the status and note a
// file written before docs/guides/using-the-app/story-bible.md#how-you-say-each-name still holds (the host writes neither).
func TestContractEntitiesWithPronunciationWork(t *testing.T) {
	s := serviceWithGuideFile(t, []any{map[string]any{
		"id":             "entity-wren",
		"canonical_name": "Wren",
		"category":       "Character",
		"aliases": []any{map[string]any{
			"text": "the Sparrow", "pronunciation": map[string]any{"ipa": "ðə ˈspæɹoʊ", "source": "CMU dictionary", "confidence": "medium"}, "occurrences": []any{},
		}},
		"occurrences":       []any{},
		"occurrence_count":  0,
		"pronunciation":     map[string]any{"ipa": "ɹɛn", "source": "CMU dictionary", "confidence": "medium"},
		"description":       map[string]any{"text": "", "evidence": map[string]any{}},
		"personality_notes": []any{},
		"relationships":     []any{},
		"properties":        []any{},
		"locked":            false,
		"review_state":      "reviewed",
	}})
	if err := s.PronounceUser("entity-wren", nil, "wɹɛn"); err != nil {
		t.Fatal(err)
	}
	entities := storedEntities(t, s)
	wren := entities[0].(map[string]any)
	pronunciation := wren["pronunciation"].(map[string]any)
	pronunciation["status"], pronunciation["note"] = "query_sent", "Asked the author by email."
	wren["aliases"].([]any)[0].(map[string]any)["pronunciation"].(map[string]any)["status"] = "author_confirmed"
	checkStoredThenSent(t, "guide-entities-pronunciation-sidecar", "guide-entities-pronunciation", entities)
}

// The entities after Mark reviewed, and after Flag review of one name plus a speaker colour (SNB-3b, SNB-4b), as the file holds them
// and as the host sends them to the UI.
func TestContractGuideReview(t *testing.T) {
	alias := func(text string) any {
		return map[string]any{"text": text, "pronunciation": map[string]any{}, "occurrences": []any{}}
	}
	s := serviceWithGuideFile(t, []any{map[string]any{
		"id":                "entity-wren",
		"canonical_name":    "Wren",
		"category":          "Character",
		"aliases":           []any{alias("the Sparrow"), alias("Jenny")},
		"occurrences":       []any{},
		"occurrence_count":  0,
		"pronunciation":     map[string]any{},
		"description":       map[string]any{"text": "", "evidence": map[string]any{}},
		"personality_notes": []any{},
		"relationships":     []any{},
		"properties":        []any{},
		"locked":            false,
		"manual":            false,
		"review_state":      "needs review",
		"review":            map[string]any{"entry": true, "aliases": []any{"the Sparrow"}},
	}})
	if err := s.MarkReviewed("entity-wren", nil); err != nil {
		t.Fatal(err)
	}
	checkStoredThenSent(t, "guide-review-marked-sidecar", "guide-review-marked", storedEntities(t, s))
	jenny, colour := 1, 3
	if err := s.FlagReview("entity-wren", &jenny); err != nil {
		t.Fatal(err)
	}
	if err := s.SetSpeakerColor("entity-wren", &colour); err != nil {
		t.Fatal(err)
	}
	checkStoredThenSent(t, "guide-review-flagged-sidecar", "guide-review-flagged", storedEntities(t, s))
}
