package guide

import (
	"os"
	"testing"
	"time"
)

const splitBible = `{"schema_version": 2, "types": [{"name": "Character", "colour": "green", "speaks": true}], ` +
	`"entities": [{"id": "e1", "canonical_name": "Alice", "category": "Character"}], ` +
	`"dialogue_cues": [{"id": "q1", "chapterId": "c1", "paragraphId": "p1", "quote_text": "Hello", "speaker_entity_id": "e1"}]}`

// The Script page asks for the entries, the types and the cues on every load, and each parsed the whole file (issue 3766): the file is
// split once for as long as it holds the same bytes.
func TestTheStoryBibleIsSplitOncePerFileContentWhateverReadsIt(t *testing.T) {
	service, _, _ := guideFile(t, splitBible)
	for range 3 {
		if entities, err := service.Entities(); err != nil || len(entities) != 1 {
			t.Fatalf("entities = %v, %v", entities, err)
		}
		if types, err := service.Types(); err != nil || len(types) != 1 || types[0].Name != "Character" {
			t.Fatalf("types = %v, %v", types, err)
		}
		if cues, err := service.DialogueCues(); err != nil || len(cues) != 1 || cues[0].QuoteText != "Hello" {
			t.Fatalf("cues = %v, %v", cues, err)
		}
	}
	if got := service.splits.Load(); got != 1 {
		t.Fatalf("the file was split %d times for nine reads of the same bytes, want 1", got)
	}
}

// What is kept is never answered for a file that says something else: a rewrite of the same length with the same modification time,
// which a cache keyed on size and time would miss, is read.
func TestAChangedStoryBibleIsReadEvenWithTheSameSizeAndTime(t *testing.T) {
	service, _, path := guideFile(t, splitBible)
	if _, err := service.DialogueCues(); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	changed := []byte(splitBible)
	copy(changed[len(splitBible)-len(`Hello", "speaker_entity_id": "e1"}]}`):], "Jello")
	if err := os.WriteFile(path, changed, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, time.Now(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	cues, err := service.DialogueCues()
	if err != nil || len(cues) != 1 || cues[0].QuoteText != "Jello" {
		t.Fatalf("cues after the rewrite = %v, %v", cues, err)
	}
	// A file that is gone reads as empty, not as what was kept.
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if cues, err := service.DialogueCues(); err != nil || len(cues) != 0 {
		t.Fatalf("cues with no file = %v, %v", cues, err)
	}
	if entities, err := service.Entities(); err != nil || len(entities) != 0 {
		t.Fatalf("entities with no file = %v, %v", entities, err)
	}
}

// Readers write into what they are given (normalizeEntity, the bindings): none of it reaches the next reader.
func TestWhatAReaderChangesDoesNotReachTheNextRead(t *testing.T) {
	service, _, _ := guideFile(t, splitBible)
	entities, err := service.Entities()
	if err != nil {
		t.Fatal(err)
	}
	entities[0]["canonical_name"] = "Mallory"
	delete(entities[0], "category")
	cues, err := service.DialogueCues()
	if err != nil {
		t.Fatal(err)
	}
	cues[0].QuoteText = "changed"
	cues = append(cues[:0], DialogueCue{ID: "other"})
	_ = cues

	again, err := service.Entities()
	if err != nil || again[0]["canonical_name"] != "Alice" || again[0]["category"] != "Character" {
		t.Fatalf("entities = %v, %v", again, err)
	}
	if fresh, err := service.DialogueCues(); err != nil || len(fresh) != 1 || fresh[0].ID != "q1" || fresh[0].QuoteText != "Hello" {
		t.Fatalf("cues = %v, %v", fresh, err)
	}
}

// A member of the wrong shape is refused on every read, kept or not.
func TestInvalidMembersAreRefusedOnEveryRead(t *testing.T) {
	service, _, _ := guideFile(t, `{"schema_version": 2, "entities": {}, "dialogue_cues": "no", "types": []}`)
	for range 2 {
		if _, err := service.Entities(); err == nil {
			t.Fatal("entities that are not a list must be refused")
		}
		if _, err := service.DialogueCues(); err == nil {
			t.Fatal("cues that are not a list must be refused")
		}
		if _, err := service.Types(); err == nil {
			t.Fatal("an empty types list must be refused")
		}
	}
}
