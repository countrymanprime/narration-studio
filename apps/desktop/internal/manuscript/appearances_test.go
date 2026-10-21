package manuscript

import (
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/importer"
)

func appearancesOf(t *testing.T, draft importer.Draft) map[string]int {
	t.Helper()
	got := map[string]int{}
	candidates, ok := previewPayload(draft)["characterCandidates"].([]previewCandidate)
	if !ok {
		t.Fatalf("characterCandidates = %T, want []previewCandidate", previewPayload(draft)["characterCandidates"])
	}
	for _, candidate := range candidates {
		got[candidate.Name] = candidate.Appearances
	}
	return got
}

// A suggestion shows how often its first name turns up in the story: whole words only, any case of the surrounding punctuation, and a
// name inside another word ("Malice" for "Alice") never counts.
func TestPreviewCandidatesCarryTheirAppearances(t *testing.T) {
	draft := importer.Draft{
		Paragraphs: []importer.Paragraph{
			{Text: "Alice ran. \u201cAlice!\u201d called Rabbit. Malice was nowhere. Alice's hat."},
			{Text: "The White Rabbit looked at his watch; Mr. Holmes did not. Holmes sighed. \u00c9lodie smiled."},
		},
		CharacterCandidates: []importer.CharacterCandidate{
			{ID: "a", Name: "Alice"},
			{ID: "b", Name: "The White Rabbit"},
			{ID: "c", Name: "Mr. Holmes"},
			{ID: "d", Name: "\u00c9lodie Martin"},
			{ID: "e", Name: "Nobody"},
		},
	}
	want := map[string]int{"Alice": 3, "The White Rabbit": 1, "Mr. Holmes": 2, "\u00c9lodie Martin": 1, "Nobody": 0}
	got := appearancesOf(t, draft)
	for name, count := range want {
		if got[name] != count {
			t.Errorf("%s: %d appearances, want %d", name, got[name], count)
		}
	}
}

func TestPreviewCandidatesAreAnEmptyListWhenThereIsNoCast(t *testing.T) {
	if got := appearancesOf(t, importer.Draft{}); len(got) != 0 {
		t.Fatalf("got %v", got)
	}
}
