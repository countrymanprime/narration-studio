package guide

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"unicode/utf8"
)

// suggestionLine is one decoded line of RuleSuggestions.
type suggestionLine struct {
	Source  string `json:"source"`
	Rule    string `json:"rule"`
	Payload struct {
		Kind    string   `json:"kind"`
		Name    string   `json:"name"`
		Type    string   `json:"type"`
		Aliases []string `json:"aliases"`
		Entry   string   `json:"entry"`
		Alias   string   `json:"alias"`
		Quote   string   `json:"quote"`
		Speaker string   `json:"speaker"`
	} `json:"payload"`
	Confidence *float64 `json:"confidence"`
	Quotes     []struct {
		ParagraphID string `json:"paragraphId"`
		Text        string `json:"text"`
	} `json:"quotes"`
	Note *string `json:"note"`
}

// suggestionsFor runs RuleSuggestions over the frozen case name and decodes its lines; paragraphs maps each paragraph id to its text.
func suggestionsFor(t *testing.T, name string) (lines []suggestionLine, paragraphs map[string]string) {
	t.Helper()
	root, cases, _ := readRuleCases(t)
	i := slices.IndexFunc(cases, func(c ruleCase) bool { return c.Name == name })
	if i < 0 {
		t.Fatalf("no case %q", name)
	}
	manuscript, bible := writeRuleCase(t, root, t.TempDir(), cases[i])
	got, err := RuleSuggestions(context.Background(), manuscript, bible)
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range got {
		var decoded suggestionLine
		if err := json.Unmarshal([]byte(line), &decoded); err != nil {
			t.Fatal(err)
		}
		lines = append(lines, decoded)
	}
	read, err := ruleManuscript(manuscript)
	if err != nil {
		t.Fatal(err)
	}
	paragraphs = map[string]string{}
	for _, p := range read {
		paragraphs[p.paragraphID] = string(p.text)
	}
	return lines, paragraphs
}

func ofKind(lines []suggestionLine, kind string) []suggestionLine {
	return slices.DeleteFunc(slices.Clone(lines), func(l suggestionLine) bool { return l.Payload.Kind != kind })
}

func names(lines []suggestionLine) []string {
	var out []string
	for _, l := range lines {
		out = append(out, l.Payload.Name+l.Payload.Alias+l.Payload.Speaker)
	}
	return out
}

// The Python acceptance tests of extraction_rules.py (SN-X32), ported: each runs over the Story Bible the Python test wrote.

func TestAMissingStoryBibleIsAnEmptyOne(t *testing.T) {
	lines, _ := suggestionsFor(t, "dawnspire-missing-bible")
	if !slices.Contains(names(ofKind(lines, "entry")), "Dawnspire") {
		t.Fatalf("entries = %v", names(ofKind(lines, "entry")))
	}
}

func TestANameTheStoryBibleLacksIsAnEntrySuggestion(t *testing.T) {
	lines, _ := suggestionsFor(t, "dawnspire-ada-captain")
	entries := ofKind(lines, "entry")
	// Dawnspire, named four times, comes before the Council of Ash, named once: the scan ranks names by their evidence.
	if got := names(entries); !slices.Equal(got, []string{"Dawnspire", "Council of Ash"}) {
		t.Fatalf("entries = %v", got)
	}
	if entries[1].Payload.Type != "Organization" {
		t.Errorf("Council of Ash type = %q", entries[1].Payload.Type)
	}
	for _, entry := range entries {
		if len(entry.Quotes) == 0 || entry.Source != "rules" {
			t.Errorf("entry %+v has no quote or another source", entry)
		}
	}
}

func TestANameHeldOnlyAsNeedsReviewIsOfferedAgainAndAKnownOneIsNot(t *testing.T) {
	lines, _ := suggestionsFor(t, "dawnspire-needs-review")
	if got := names(ofKind(lines, "entry")); !slices.Equal(got, []string{"Dawnspire"}) || ofKind(lines, "entry")[0].Rule != RuleNeedsReviewName {
		t.Fatalf("entries = %v", got)
	}
}

func TestASpellingTheEntryDoesNotHaveIsAnAliasSuggestion(t *testing.T) {
	lines, _ := suggestionsFor(t, "dawnspire-alias")
	aliases := ofKind(lines, "alias")
	if len(aliases) != 1 || aliases[0].Payload.Entry != "Arelian" || aliases[0].Payload.Alias != "Captain Arelian" {
		t.Fatalf("aliases = %+v", aliases)
	}
}

func TestASpeechTagNamingACharacterIsASpeakerSuggestionWithItsQuote(t *testing.T) {
	lines, _ := suggestionsFor(t, "dawnspire-ada-captain")
	speakers := ofKind(lines, "speaker")
	type row struct{ quote, speaker, text, paragraph string }
	var got []row
	for _, s := range speakers {
		got = append(got, row{s.Payload.Quote, s.Payload.Speaker, s.Quotes[0].Text, s.Quotes[0].ParagraphID})
	}
	want := []row{
		{"“We ride at dawn,”", "Ada", "“We ride at dawn,” Ada said", "p-000003"},
		{"“Then we ride together.”", "Captain Arelian", "Arelian said, “Then we ride together.”", "p-000004"},
	}
	if !slices.Equal(got, want) {
		t.Fatalf("speakers = %+v", got)
	}
}

func TestASpeechTagNamingAnEntryOfAnySpeakingTypeIsASpeakerSuggestion(t *testing.T) {
	lines, _ := suggestionsFor(t, "dawnspire-crew")
	if got := names(ofKind(lines, "speaker")); !slices.Equal(got, []string{"Ada", "Captain Arelian"}) {
		t.Fatalf("speakers = %v", got)
	}
}

func TestANeedsReviewNameIsNeverASpeakerSuggestion(t *testing.T) {
	lines, _ := suggestionsFor(t, "dawnspire-ada-needs-review")
	if got := names(ofKind(lines, "speaker")); !slices.Equal(got, []string{"Captain Arelian"}) {
		t.Fatalf("speakers = %v", got)
	}
}

func TestACueTheStoryBibleAlreadyAttributesIsNotOfferedAgain(t *testing.T) {
	lines, _ := suggestionsFor(t, "dawnspire-cues-stored")
	if speakers := ofKind(lines, "speaker"); len(speakers) != 0 {
		t.Fatalf("speakers = %v", names(speakers))
	}
}

func TestNoPropertyRelationshipOrClaimIsEmitted(t *testing.T) {
	lines, _ := suggestionsFor(t, "alice-chapters-alice-only")
	if len(lines) == 0 {
		t.Fatal("no suggestion for Alice")
	}
	for _, line := range lines {
		if !slices.Contains([]string{"entry", "alias", "speaker"}, line.Payload.Kind) {
			t.Errorf("kind %q", line.Payload.Kind)
		}
	}
}

func TestEveryRuleHasItsConfidenceOrNone(t *testing.T) {
	if len(RuleConfidence) != 4 {
		t.Fatalf("rules = %v", RuleConfidence)
	}
	for name, confidence := range RuleConfidence {
		if confidence != nil && (*confidence < 0 || *confidence > 1) {
			t.Errorf("%s confidence %v", name, *confidence)
		}
	}
	if strings.ToLower(strings.TrimSuffix(NoScore, ".")) != "the rules give no score for this" {
		t.Errorf("NoScore = %q", NoScore)
	}
}

func TestEachSuggestionTakesItsRulesConfidenceOrNullWithTheReason(t *testing.T) {
	lines, _ := suggestionsFor(t, "dawnspire-alias")
	kinds := map[string]bool{}
	for _, line := range lines {
		kinds[line.Payload.Kind] = true
		want := RuleConfidence[line.Rule]
		if (want == nil) != (line.Confidence == nil) || (want != nil && *want != *line.Confidence) {
			t.Errorf("%s confidence %v, want %v", line.Rule, line.Confidence, want)
		}
		if (want == nil) != (line.Note != nil && *line.Note == NoScore) {
			t.Errorf("%s note %v", line.Rule, line.Note)
		}
	}
	if len(kinds) != 3 {
		t.Fatalf("kinds = %v", kinds)
	}
}

func TestEveryQuoteIsASliceOfTheParagraphItNames(t *testing.T) {
	lines, paragraphs := suggestionsFor(t, "alice-chapters-alice-bible")
	if len(lines) == 0 {
		t.Fatal("no suggestion")
	}
	for _, line := range lines {
		for _, quote := range line.Quotes {
			if !strings.Contains(paragraphs[quote.ParagraphID], quote.Text) || utf8.RuneCountInString(quote.Text) > maxQuote {
				t.Errorf("%s quote %q is not a slice of %s of at most %d characters", line.Rule, quote.Text, quote.ParagraphID, maxQuote)
			}
		}
	}
}

func TestALockedEntryGetsNoEntryOrAliasSuggestion(t *testing.T) {
	lines, _ := suggestionsFor(t, "dawnspire-locked")
	for _, line := range lines {
		if touched := line.Payload.Entry + line.Payload.Name; line.Payload.Kind != "speaker" && slices.Contains([]string{"Arelian", "Captain Arelian", "Dawnspire"}, touched) {
			t.Errorf("a suggestion about %q", touched)
		}
	}
}

func TestANameAbsorbedIntoAnotherEntryIsNotOfferedAsNew(t *testing.T) {
	lines, _ := suggestionsFor(t, "dawnspire-absorbed")
	if slices.Contains(names(lines), "Dawnspire") {
		t.Fatalf("suggestions = %v", names(lines))
	}
}
