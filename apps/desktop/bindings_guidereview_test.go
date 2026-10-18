package main

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/guide"
)

// The review and colour bindings change the Story Bible in the host (guide.Service, mutate.go): no sidecar process, and the change is in
// the file. They used to be one sidecar call each.

func reviewOf(t *testing.T, service *guide.Service) (map[string]any, map[string]any) {
	t.Helper()
	entities, err := service.Entities()
	if err != nil || len(entities) != 1 {
		t.Fatalf("entities = %v, %v", entities, err)
	}
	review, _ := entities[0]["review"].(map[string]any)
	return entities[0], review
}

func TestGuideReviewBindingsChangeTheFileWithoutTheSidecar(t *testing.T) {
	one := 1
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := &Host{guide: service}
	steps := []struct {
		name string
		call func() (string, error)
		want map[string]any
	}{
		{"flag the entry", func() (string, error) { return host.GuideFlagReview("entity-1", nil) }, map[string]any{"entry": true, "aliases": []any{}}},
		{"flag one name", func() (string, error) { return host.GuideFlagReview("entity-1", &one) }, map[string]any{"entry": true, "aliases": []any{"Alfie"}}},
		{"mark one name reviewed", func() (string, error) { return host.GuideMarkReviewed("entity-1", &one) }, map[string]any{"entry": true, "aliases": []any{}}},
		{"mark the entry reviewed", func() (string, error) { return host.GuideMarkReviewed("entity-1", nil) }, map[string]any{"entry": false, "aliases": []any{}}},
	}
	for _, step := range steps {
		if result, err := step.call(); err != nil || result != "null" {
			t.Fatalf("%s: %q, %v", step.name, result, err)
		}
		if _, review := reviewOf(t, service); !reflect.DeepEqual(review, step.want) {
			t.Fatalf("%s: review = %v, want %v", step.name, review, step.want)
		}
	}
	if got := calls(); len(got) != 0 {
		t.Fatalf("the sidecar was started: %v", got)
	}
}

func TestGuideSetSpeakerColorStoresTheIndexAndNilAsAutomatic(t *testing.T) {
	three := 3
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := &Host{guide: service}
	if _, err := host.GuideSetSpeakerColor("entity-1", &three); err != nil {
		t.Fatal(err)
	}
	if entity, _ := reviewOf(t, service); entity["speaker_color"] != float64(3) {
		t.Fatalf("speaker_color = %v", entity["speaker_color"])
	}
	if _, err := host.GuideSetSpeakerColor("entity-1", nil); err != nil {
		t.Fatal(err)
	}
	if entity, _ := reviewOf(t, service); entity["speaker_color"] != nil {
		t.Fatalf("automatic left speaker_color = %v", entity["speaker_color"])
	}
	if got := calls(); len(got) != 0 {
		t.Fatalf("the sidecar was started: %v", got)
	}
}

func TestGuideSetSpeakerColorRefusesAnIndexOutsideOneToSevenBeforeTheSidecar(t *testing.T) {
	for _, bad := range []int{-1, 8} {
		service, calls := countingGuide(t)
		if _, err := (&Host{guide: service}).GuideSetSpeakerColor("entity-1", &bad); err == nil {
			t.Fatalf("GuideSetSpeakerColor(%d) accepted", bad)
		}
		if len(calls()) != 0 {
			t.Fatal("the sidecar started")
		}
	}
}

func TestGuideReviewBindingsWithoutAStoryBible(t *testing.T) {
	host := &Host{}
	if _, err := host.GuideMarkReviewed("a", nil); err == nil {
		t.Fatal("GuideMarkReviewed accepted")
	}
	if _, err := host.GuideFlagReview("a", nil); err == nil {
		t.Fatal("GuideFlagReview accepted")
	}
	if _, err := host.GuideSetSpeakerColor("a", nil); err == nil {
		t.Fatal("GuideSetSpeakerColor accepted")
	}
}

// The host, not only the button, refuses Mark reviewed on an entry with a suggestion still to verify (extraction.test.tsx row 18): the
// refusal is the reason the button gives, and the sidecar is never asked, so no flag is cleared. One name, or an entry with nothing to
// verify, is still marked.
func TestGuideMarkReviewedRefusesAnEntryWithSuggestionsToVerify(t *testing.T) {
	host, _ := extractionHost(t)
	service, calls, project := countingGuideIn(t)
	host.guide = service
	follows := suggestionAbout(t, host, "follows")
	if follows.Status != extraction.StatusNeedsVerification || follows.EntryID == nil || *follows.EntryID != "alice" {
		t.Fatalf("the fixture's relationship waits on Alice: %+v", follows)
	}
	before, err := host.ExtractionList()
	if err != nil {
		t.Fatal(err)
	}

	if result, err := host.GuideMarkReviewed("alice", nil); err == nil || err.Error() != sentenceVerifyFirst || result != "" {
		t.Fatalf("GuideMarkReviewed(alice) = %q, %v; want the refusal %q", result, err, sentenceVerifyFirst)
	}
	if len(calls()) != 0 {
		t.Fatalf("the sidecar was asked: %v", calls())
	}
	if after, err := host.ExtractionList(); err != nil || after != before {
		t.Fatalf("the suggestions changed: %v", err)
	}

	dodo := suggestionAbout(t, host, "The Dodo")
	bible := fmt.Sprintf(`{"schema_version": 2, "entities": [
		{"id": "alice", "canonical_name": "Alice", "category": "Character", "aliases": [{"text": "Al"}], "review": {"entry": true, "aliases": ["Al"]}},
		{"id": %q, "canonical_name": "The Dodo", "category": "Character", "aliases": [], "review_state": "needs review"}]}`, *dodo.EntryID)
	if err := os.MkdirAll(filepath.Join(project, "ManuscriptGuide"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"), []byte(bible), 0o600); err != nil {
		t.Fatal(err)
	}
	one := 0
	if _, err := host.GuideMarkReviewed("alice", &one); err != nil {
		t.Fatalf("one name of Alice: %v", err)
	}
	if _, err := host.GuideMarkReviewed(*dodo.EntryID, nil); err != nil {
		t.Fatalf("an entry with nothing to verify: %v", err)
	}
	entities, err := service.Entities()
	if err != nil {
		t.Fatal(err)
	}
	// Alice's name is cleared and her entry is still flagged; the Dodo is reviewed. Neither started the sidecar.
	if got := entities[0]["review"]; !reflect.DeepEqual(got, map[string]any{"entry": true, "aliases": []any{}}) {
		t.Fatalf("Alice's review = %v", got)
	}
	if entities[1]["review_state"] != "reviewed" {
		t.Fatalf("the Dodo = %v", entities[1])
	}
	if got := calls(); len(got) != 0 {
		t.Fatalf("calls = %v", got)
	}
}
