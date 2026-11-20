package localmodel_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"desktop/internal/extraction"
	"desktop/internal/extractionport"
	"desktop/internal/extractionport/localmodel"
)

// asked runs one question and one answer through a source and returns the suggestions.
func asked(t *testing.T, q localmodel.Question, a localmodel.Answer) []extractionport.Raw {
	t.Helper()
	return extract(t, source(answering(a), q))
}

func people(names ...string) []localmodel.Character {
	var out []localmodel.Character
	for _, n := range names {
		out = append(out, localmodel.Character{Name: n})
	}
	return out
}

func scene(characters []localmodel.Character, quote string, paragraphs ...string) localmodel.Question {
	q := localmodel.Question{ChapterID: "c1", ParagraphID: "p9", Quote: quote, Characters: characters}
	for i, text := range paragraphs {
		id := "p" + string(rune('1'+i))
		q.Passage = append(q.Passage, extraction.Paragraph{ID: id, ChapterID: "c1", Text: text})
	}
	q.Passage = append(q.Passage, extraction.Paragraph{ID: "p9", ChapterID: "c1", Text: quote})
	return q
}

// Evidence that runs into the quote counts the quote's own words as the speaker being named.
func TestEvidenceThatOverlapsTheQuoteIsDropped(t *testing.T) {
	q := scene(people("Tom", "Ann"), "\"Where are you, Tom?\"", "Tom had left an hour ago. Ann stood alone.")
	q.Passage[1].Text = "\"Where are you, Tom?\" she asked."
	q.ParagraphID = "p9"
	got := asked(t, q, localmodel.Answer{Speaker: "Tom", Reason: "Tom is named here.", Evidence: "you, Tom?\" she asked."})
	if len(got) != 0 {
		t.Fatalf("got %+v, want none: the only Tom in the evidence is inside the quote", got)
	}
}

func TestACurlyQuoteOrARepeatedQuoteOrNoParagraphIdStillHidesTheNameInsideIt(t *testing.T) {
	cases := map[string]struct {
		paragraph, quote, evidence, paragraphID string
	}{
		"curly quotes in the text, straight in the quote": {"“Where are you, Tom?” she asked.", "\"Where are you, Tom?\"", "Tom?” she asked.", "p9"},
		"the quote repeated in its paragraph":             {"\"Tom!\" she called. \"Tom!\"", "\"Tom!\"", "she called. \"Tom!\"", "p9"},
		"no paragraph id":                                 {"\"Where are you, Tom?\" she asked.", "\"Where are you, Tom?\"", "Tom?\" she asked.", ""},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			q := scene(people("Tom"), c.quote, "The room was quiet.")
			q.Passage[1].Text = c.paragraph
			q.ParagraphID = c.paragraphID
			got := asked(t, q, localmodel.Answer{Speaker: "Tom", Reason: "Tom is named here.", Evidence: c.evidence})
			if len(got) != 0 {
				t.Fatalf("got %+v, want none", got)
			}
		})
	}
}

// A name is a proper noun when it is written as one, and not a longer name or a hyphenated one.
func TestANameNeverMatchesACommonWordALongerNameOrAHyphenatedOne(t *testing.T) {
	cases := map[string]struct {
		characters []localmodel.Character
		speaker    string
		sentence   string
	}{
		"Will against the verb":        {people("Will", "Ann"), "Will", "Ann said she will go."},
		"a one-letter name":            {people("A", "Ann"), "A", "Ann took a seat."},
		"John inside Little John":      {people("John", "Little John"), "John", "Little John laughed."},
		"Ann inside Ann-Marie":         {people("Ann", "Ann-Marie"), "Ann", "Ann-Marie laughed."},
		"Ann inside Ann-Marie, hyphen": {people("Ann", "Ann‐Marie"), "Ann", "Ann‐Marie laughed."},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			q := scene(c.characters, "\"Hi.\"", c.sentence)
			got := asked(t, q, localmodel.Answer{Speaker: c.speaker, Reason: c.speaker + " is the one who spoke.", Evidence: c.sentence})
			if len(got) != 0 {
				t.Fatalf("got %+v, want none", got)
			}
		})
	}
}

func TestTwoEntriesWithTheSameNameAreAmbiguous(t *testing.T) {
	q := scene([]localmodel.Character{{Name: "Sam", Aliases: []string{"Samuel"}}, {Name: "SAM", Aliases: []string{"Samantha"}}}, "\"Hi.\"", "Sam sat down.")
	if got := asked(t, q, localmodel.Answer{Speaker: "Sam", Reason: "Sam sat down first.", Evidence: "Sam sat down."}); len(got) != 0 {
		t.Fatalf("got %+v, want none", got)
	}
}

func TestEvidenceMustBeWholeWordsSayMoreThanTheNameAndNameTheSpeaker(t *testing.T) {
	cases := map[string]struct {
		paragraphs []string
		speaker    string
		evidence   string
	}{
		"cut out of Tomorrow":                {[]string{"Tomorrow would be worse.", "Tom's dog barked."}, "Tom", "Tom"},
		"cut out of Samira":                  {[]string{"Samira sat down.", "Nobody had seen Mira for days."}, "Mira", "mira sat down."},
		"only the name":                      {[]string{"Mira sat."}, "Mira", "Mira"},
		"the name and punctuation only":      {[]string{"Mira."}, "Mira", "Mira."},
		"a stretch that begins mid-word":     {[]string{"Toby sat. Mira smiled."}, "Mira", "ira smiled."},
		"names Mira but starts inside xMira": {[]string{"Mira sat down.", "Toby saw xMira smiled."}, "Mira", "Mira smiled."},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			q := scene(people("Tom", "Mira", "Toby"), "\"Hi.\"", c.paragraphs...)
			if got := asked(t, q, localmodel.Answer{Speaker: c.speaker, Reason: c.speaker + " is the one named.", Evidence: c.evidence}); len(got) != 0 {
				t.Fatalf("got %+v, want none", got)
			}
		})
	}
}

func TestAReasonMustBeASentenceThatNamesTheSpeaker(t *testing.T) {
	for _, reason := range []string{"mira", "Mira said", "It is her.", "Toby is here now."} {
		a := good()
		a.Reason = reason
		if got := extract(t, source(answering(a), question())); len(got) != 0 {
			t.Errorf("reason %q was accepted: %+v", reason, got)
		}
	}
}

func TestANameWithAZeroWidthJoinerStillMatchesTheReasonAndTheText(t *testing.T) {
	for _, name := range []string{"علی\u200cرضا", "👩\u200d🚀"} {
		t.Run(name, func(t *testing.T) {
			q := scene(people(name), "\"Hi.\"", name+" sat down.")
			got := asked(t, q, localmodel.Answer{Speaker: name, Reason: name + " sat down first.", Evidence: name + " sat down."})
			if len(got) != 1 {
				t.Fatalf("got %d suggestions, want 1", len(got))
			}
		})
	}
}

func TestEvidenceIsPlacedByTheQuotesParagraphAndChapterFirst(t *testing.T) {
	q := localmodel.Question{
		ChapterID: "c1", ParagraphID: "p2", Quote: "\"Hi.\"", Characters: people("Mira"),
		Passage: []extraction.Paragraph{
			{ID: "p0", ChapterID: "c0", Text: evidenceText},
			{ID: "p1", ChapterID: "c1", Text: evidenceText},
			{ID: "p2", ChapterID: "c1", Text: "\"Hi.\""},
		},
	}
	got := asked(t, q, good())
	if len(got) != 1 || got[0].Quotes[0].ParagraphID != "p1" {
		t.Fatalf("got %+v, want the evidence placed in p1, the quote's own chapter", got)
	}
}

func TestACancelReachedWhileReadingTheQuestionsIsReportedEvenWithNothingToAsk(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	s := localmodel.Source{
		Ask:       answering{},
		Questions: func() ([]localmodel.Question, error) { cancel(); return nil, nil },
		MaxQuotes: func() int { return 5 },
	}
	if _, err := s.Extract(ctx, extractionport.Input{}); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
	ctx, cancel = context.WithCancel(context.Background())
	s.Questions = func() ([]localmodel.Question, error) { return []localmodel.Question{question()}, nil }
	s.MaxQuotes = func() int { cancel(); return 0 }
	if _, err := s.Extract(ctx, extractionport.Input{}); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}

func TestAFailingModelWithNoNoteOrLogHookDoesNotPanic(t *testing.T) {
	n := 0
	s := source(failingAfter{ok: 0, n: &n}, question())
	s.Log = nil
	if _, err := s.Extract(context.Background(), extractionport.Input{}); err != nil {
		t.Fatal(err)
	}
}

func TestTheRowKeepsTheRegistrysIconAndLabel(t *testing.T) {
	s := source(answering{})
	if s.Icon() != "globe" || s.Name() != extractionport.LocalModel || !s.Scored() {
		t.Fatalf("icon %q name %q scored %v", s.Icon(), s.Name(), s.Scored())
	}
}

func TestABlankQuoteGivesNoSuggestion(t *testing.T) {
	q := question()
	q.Quote = "  "
	if got := extract(t, source(answering(good()), q)); len(got) != 0 {
		t.Fatalf("got %+v", got)
	}
}

func TestNameSpansRules(t *testing.T) {
	cases := []struct {
		text, name string
		want       []string
	}{
		{"Ann2 sat.", "Ann", nil},
		{"Aná sat.", "Ana", nil},
		{"OʼBrien sat.", "O'Brien", []string{"OʼBrien"}},
		{"Ann-Marie and Ann.", "Ann", []string{"Ann"}},
		{"Ann—she said.", "Ann", []string{"Ann"}},
		{"She will go. Will you?", "Will", []string{"Will"}},
		{"WILL went.", "Will", []string{"WILL"}},
		{"a sat.", "A", nil},
		{"A man sat.", "A", nil},
		{"Mira", "mira", []string{"Mira"}},
	}
	for _, c := range cases {
		var got []string
		for _, span := range localmodel.NameSpans(c.text, c.name) {
			got = append(got, c.text[span[0]:span[1]])
		}
		if strings.Join(got, "|") != strings.Join(c.want, "|") {
			t.Errorf("NameSpans(%q, %q) = %q, want %q", c.text, c.name, got, c.want)
		}
	}
}
