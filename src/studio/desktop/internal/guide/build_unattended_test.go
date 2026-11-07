package guide

import (
	"errors"
	"os"
	"slices"
	"strings"
	"testing"
)

// unattendedBook is a short book with a character who speaks (Clara), one with a title (Mr. Darcy), a place (the Wild Wood), a name
// that never shows what it is (Hertford, capitalised mid-sentence in every paragraph), a name mentioned twice (Bob), and the words that
// only look like names ("I'm", "Oh", "Hullo").
func unattendedBook(t *testing.T, previous string) *Service {
	t.Helper()
	var paragraphs []string
	for range 4 {
		paragraphs = append(paragraphs,
			"“I’m cold,” said Clara. Oh, the night was long, and Mr. Darcy walked through the Wild Wood, thinking of Hertford.",
			"“Hullo!” cried Clara, and they spoke of Hertford again.")
	}
	paragraphs = append(paragraphs, "They met Bob at the gate.", "Later they thought of Bob once more.")
	return book(t, previous, paragraphs...)
}

func TestBuildUnattendedFilesNamesByTheConfidenceRule(t *testing.T) {
	s := unattendedBook(t, "")
	s.buildModel = &stubModel{}
	report, err := s.BuildUnattended("", "", RulesOnly)
	if err != nil {
		t.Fatal(err)
	}
	names := byName(readJSONFile[map[string]any](t, s.guidePath()))
	for name, want := range map[string]string{"Clara": categoryCharacter, "Mr. Darcy": categoryCharacter, "Wild Wood": categoryPlace, "Hertford": categoryNeedsReview} {
		entry, ok := names[name]
		if !ok {
			t.Errorf("no entry for %s (entries: %v)", name, slices.Collect(mapKeys(names)))
			continue
		}
		if entry["category"] != want {
			t.Errorf("%s: %v, want %s", name, entry["category"], want)
		}
		if review := entry["review"].(map[string]any)["entry"]; review != (want == categoryNeedsReview) {
			t.Errorf("%s: review flag %v", name, review)
		}
	}
	for _, junk := range []string{"I’m", "Oh", "Hullo", "Bob"} {
		if _, ok := names[junk]; ok {
			t.Errorf("an entry for %q", junk)
		}
	}
	want := UnattendedReport{Characters: 2, Places: 1, Review: 1, LeftOut: []string{"Bob"}}
	if !slices.Equal(report.LeftOut, want.LeftOut) || report.Characters != want.Characters || report.Places != want.Places || report.Review != want.Review || report.Other != 0 || report.Model {
		t.Errorf("report %+v, want %+v", report, want)
	}
	if got := report.Sentence(); got != "Story Bible built from the import: 2 characters and 1 place; 1 name to check under Needs review. Left out, named only once or twice: Bob. Built without the language model." {
		t.Errorf("sentence %q", got)
	}
}

func TestBuildUnattendedReadsTheModelAsOneVote(t *testing.T) {
	s := unattendedBook(t, "")
	// The model calls Hertford a person, which is not enough on its own: the book never shows Hertford speak or act.
	s.buildModel = &stubModel{labels: map[string]string{"Hertford": "PERSON", "Clara": "PERSON"}}
	report, err := s.BuildUnattended("", "", "stub-model")
	if err != nil {
		t.Fatal(err)
	}
	if !report.Model {
		t.Error("the report says the model was not used")
	}
	if names := byName(readJSONFile[map[string]any](t, s.guidePath())); names["Hertford"]["category"] != categoryNeedsReview {
		t.Errorf("Hertford: %v, want Needs Review: the model's label alone is not evidence", names["Hertford"]["category"])
	}
	if !strings.HasSuffix(report.Sentence(), "Bob.") {
		t.Errorf("sentence %q says the model was not used", report.Sentence())
	}
}

func TestBuildUnattendedLeavesAStoryBibleWithEntriesAsItWas(t *testing.T) {
	previous := `{"schema_version": 2, "entities": [{"id": "ada", "canonical_name": "Ada", "category": "Character", "aliases": []}]}`
	s := unattendedBook(t, previous)
	model := &stubModel{}
	s.buildModel = model
	if _, err := s.BuildUnattended("", "", RulesOnly); !errors.Is(err, ErrBibleNotEmpty) {
		t.Fatalf("err %v, want ErrBibleNotEmpty", err)
	}
	raw, err := os.ReadFile(s.guidePath())
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != previous {
		t.Errorf("the Story Bible changed:\n%s", raw)
	}
	if len(model.asked) != 0 {
		t.Errorf("the build asked for pronunciations: %v", model.asked)
	}
}

func TestBuildUnattendedBuildsAnEmptyStoryBible(t *testing.T) {
	s := unattendedBook(t, `{"schema_version": 2, "entities": [], "dialogue_cues": []}`)
	s.buildModel = &stubModel{}
	if _, err := s.BuildUnattended("", "", RulesOnly); err != nil {
		t.Fatal(err)
	}
	if _, ok := byName(readJSONFile[map[string]any](t, s.guidePath()))["Clara"]; !ok {
		t.Error("no entry for Clara")
	}
}

func TestUnattendedSentence(t *testing.T) {
	many := []string{"A1", "B2", "C3", "D4", "E5", "F6", "G7", "H8", "I9", "J10"}
	for _, test := range []struct {
		report UnattendedReport
		want   string
	}{
		{UnattendedReport{Characters: 1, Places: 2, Other: 1, Model: true}, "Story Bible built from the import: 1 character and 2 places, 1 other entry."},
		{UnattendedReport{Characters: 3, Review: 2, LeftOut: many, Model: true},
			"Story Bible built from the import: 3 characters and 0 places; 2 names to check under Needs review. Left out, named only once or twice: A1, B2, C3, D4, E5, F6, G7, H8 and 2 more."},
	} {
		if got := test.report.Sentence(); got != test.want {
			t.Errorf("%+v:\n got %q\nwant %q", test.report, got, test.want)
		}
	}
}

func mapKeys[V any](m map[string]V) func(func(string) bool) {
	return func(yield func(string) bool) {
		for k := range m {
			if !yield(k) {
				return
			}
		}
	}
}

// A left-out name of any length stays short in the sentence, which is also the toast and the OS notification.
func TestUnattendedSentenceCapsAHugeLeftOutName(t *testing.T) {
	huge := strings.Repeat("A", 10_000)
	got := UnattendedReport{Characters: 1, LeftOut: []string{huge, "Bob"}, Model: true}.Sentence()
	if n := len([]rune(got)); n > 400 {
		t.Fatalf("the sentence is %d characters long", n)
	}
	if !strings.Contains(got, "…") || !strings.Contains(got, "Bob") {
		t.Errorf("sentence %q", got)
	}
}

// A book the build files nothing from says so and says what to do, rather than "0 characters and 0 places".
func TestUnattendedSentenceForABookWithNoNames(t *testing.T) {
	want := "Story Bible built from the import, but the book named no character or place clearly enough to file. Add them yourself on the Story Bible page, or use Scan the manuscript there."
	if got := (UnattendedReport{Model: true}).Sentence(); got != want {
		t.Errorf("sentence %q", got)
	}
}

// A Story Bible file the build cannot read as one is never replaced by a build nobody asked for: its bytes stay, and the answer says
// why.
func TestBuildUnattendedNeverOverwritesADamagedStoryBible(t *testing.T) {
	for _, damaged := range []string{`{"entities": [ {`, `[]`, `null`, "\x00\x01", `{"entities": "x"}`} {
		s := unattendedBook(t, damaged)
		s.buildModel = &stubModel{}
		_, err := s.BuildUnattended("", "", RulesOnly)
		// A file every build refuses ({"entities": "x"}) keeps its own error; the rest are refused by the unattended build alone.
		if err == nil || (damaged != `{"entities": "x"}` && !errors.Is(err, ErrBibleUnreadable)) {
			t.Errorf("%q: err %v, want ErrBibleUnreadable", damaged, err)
		}
		if raw, _ := os.ReadFile(s.guidePath()); string(raw) != damaged {
			t.Errorf("%q: the file became %q", damaged, raw)
		}
	}
}
