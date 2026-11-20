package localmodel_test

import (
	"context"
	"errors"
	"math"
	"strings"
	"testing"

	"desktop/internal/extraction"
	"desktop/internal/extractionport"
	"desktop/internal/extractionport/extractionporttest"
	"desktop/internal/extractionport/localmodel"
	"desktop/internal/extractionport/localmodeltest"
	"desktop/internal/port"
)

var cast = []localmodel.Character{
	{Name: "Mira"},
	{Name: "Captain Arelian", Aliases: []string{"Arelian"}},
	{Name: "Toby"},
}

// passage is a scene whose last quote has no speech tag: the rules would leave it unknown.
func passage() []extraction.Paragraph {
	return []extraction.Paragraph{
		{ID: "p1", ChapterID: "c1", Text: "Mira crossed the room and stopped at the window."},
		{ID: "p2", ChapterID: "c1", Text: "\"You are late again.\""},
	}
}

func question() localmodel.Question {
	return localmodel.Question{CueID: "cue-1", ChapterID: "c1", ParagraphID: "p2", Quote: "\"You are late again.\"", Passage: passage(), Characters: cast}
}

func source(ask localmodel.Asker, qs ...localmodel.Question) localmodel.Source {
	return localmodel.Source{
		Ask:       ask,
		Questions: func() ([]localmodel.Question, error) { return qs, nil },
		MaxQuotes: func() int { return 100 },
	}
}

// answering is an Asker that returns a fixed answer.
type answering localmodel.Answer

func (a answering) Ask(context.Context, localmodel.Question) (localmodel.Answer, error) {
	return localmodel.Answer(a), nil
}

func extract(t *testing.T, s localmodel.Source) []extractionport.Raw {
	t.Helper()
	raws, err := s.Extract(context.Background(), extractionport.Input{Paragraphs: passage()})
	if err != nil {
		t.Fatal(err)
	}
	return raws
}

func TestTheSourcePassesTheExtractionSuite(t *testing.T) {
	q := localmodel.Question{
		CueID: "q", ChapterID: "1", ParagraphID: "1-1", Quote: "tired",
		Passage:    extractionporttest.Sample.Paragraphs,
		Characters: []localmodel.Character{{Name: "Alice"}},
	}
	for _, p := range extractionporttest.Problems(localmodel.Entry(source(localmodeltest.Asker{}, q))) {
		t.Error(p)
	}
}

func TestAnUnwiredSourceSaysNoModelIsInstalled(t *testing.T) {
	for name, s := range map[string]localmodel.Source{
		"no model":      {Questions: func() ([]localmodel.Question, error) { return nil, nil }},
		"no questions":  {Ask: localmodeltest.Asker{}},
		"files missing": {Ask: localmodeltest.Asker{}, Questions: func() ([]localmodel.Question, error) { return nil, nil }, Installed: func() bool { return false }},
	} {
		t.Run(name, func(t *testing.T) {
			if a := s.Available(); a.OK || a.Reason != "No local model is installed." {
				t.Fatalf("Available = %+v", a)
			}
			_, err := s.Extractor()
			var unsupported *port.NotSupportedError
			if !errors.As(err, &unsupported) {
				t.Fatalf("Extractor error = %v, want a *port.NotSupportedError", err)
			}
		})
	}
}

func TestTheFakeNamesTheCharacterLastNamedBeforeTheQuote(t *testing.T) {
	raws := extract(t, source(localmodeltest.Asker{}, question()))
	if len(raws) != 1 {
		t.Fatalf("got %d suggestions, want 1", len(raws))
	}
	got := raws[0]
	if got.Payload.Kind != extraction.KindSpeaker || got.Payload.Speaker != "Mira" || got.Payload.Quote != "\"You are late again.\"" {
		t.Errorf("payload = %+v", got.Payload)
	}
	if got.Confidence == nil || *got.Confidence >= extraction.VerifyBelow {
		t.Errorf("confidence = %v, want under %v", got.Confidence, extraction.VerifyBelow)
	}
	if got.Note != "Mira is the last character named before this line." || got.ChapterID != "c1" {
		t.Errorf("note %q chapter %q", got.Note, got.ChapterID)
	}
	if len(got.Quotes) != 1 || got.Quotes[0].ParagraphID != "p1" || got.Quotes[0].Text != "Mira crossed the room and stopped at the window." {
		t.Errorf("evidence = %+v", got.Quotes)
	}
}

func TestTheFakeLeavesTheLineUnknownWhenNobodyIsNamed(t *testing.T) {
	q := question()
	q.Passage = []extraction.Paragraph{{ID: "p2", ChapterID: "c1", Text: "\"You are late again.\""}}
	if raws := extract(t, source(localmodeltest.Asker{}, q)); len(raws) != 0 {
		t.Fatalf("got %+v, want none", raws)
	}
}

func TestTheFakeAnswersTheSameEveryTime(t *testing.T) {
	a, _ := localmodeltest.Asker{}.Ask(context.Background(), question())
	b, _ := localmodeltest.Asker{}.Ask(context.Background(), question())
	if a.Speaker != b.Speaker || a.Reason != b.Reason || a.Evidence != b.Evidence || *a.Confidence != *b.Confidence {
		t.Fatalf("%+v differs from %+v", a, b)
	}
}

func TestAnAliasResolvesToTheCharactersName(t *testing.T) {
	q := question()
	q.Passage[0].Text = "Arelian crossed the room."
	raws := extract(t, source(answering{Speaker: "  arelian ", Reason: "He is the one named.", Evidence: "Arelian crossed the room."}, q))
	if len(raws) != 1 || raws[0].Payload.Speaker != "Captain Arelian" {
		t.Fatalf("got %+v", raws)
	}
}

// Code decides what is kept: each answer below breaks one check and must come back as no suggestion.
func TestAnAnswerThatBreaksACheckIsDropped(t *testing.T) {
	good := localmodel.Answer{Speaker: "Mira", Reason: "Mira was named just before.", Evidence: "Mira crossed the room and stopped at the window."}
	withReason := func(r string) localmodel.Answer { a := good; a.Reason = r; return a }
	cases := map[string]localmodel.Answer{
		"no speaker":                 {Reason: good.Reason, Evidence: good.Evidence},
		"not a listed character":     {Speaker: "Dawn", Reason: good.Reason, Evidence: good.Evidence},
		"listed but not in passage":  {Speaker: "Toby", Reason: good.Reason, Evidence: good.Evidence},
		"evidence not in manuscript": {Speaker: "Mira", Reason: good.Reason, Evidence: "Mira shouted across the harbour."},
		"no evidence":                {Speaker: "Mira", Reason: good.Reason},
		"no reason":                  withReason(""),
		"blank reason":               withReason("  \n"),
	}
	for name, answer := range cases {
		t.Run(name, func(t *testing.T) {
			if raws := extract(t, source(answering(answer), question())); len(raws) != 0 {
				t.Fatalf("got %+v, want none", raws)
			}
		})
	}
	if raws := extract(t, source(answering(good), question())); len(raws) != 1 {
		t.Fatal("the control answer was dropped too: the cases above prove nothing")
	}
}

func TestAConfidenceIsKeptUnderTheAcceptanceThreshold(t *testing.T) {
	at := func(c float64) *float64 { return &c }
	cases := map[string]struct {
		in   *float64
		want *float64
	}{
		"none":         {nil, nil},
		"low":          {at(0.3), at(0.3)},
		"at threshold": {at(extraction.VerifyBelow), at(math.Nextafter(extraction.VerifyBelow, 0))},
		"certain":      {at(1), at(math.Nextafter(extraction.VerifyBelow, 0))},
		"negative":     {at(-0.2), nil},
		"above one":    {at(7), nil},
		"not a number": {at(math.NaN()), nil},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			raws := extract(t, source(answering{Speaker: "Mira", Confidence: c.in, Reason: "Named before.", Evidence: "Mira crossed the room and stopped at the window."}, question()))
			if len(raws) != 1 {
				t.Fatalf("got %d suggestions", len(raws))
			}
			got := raws[0].Confidence
			switch {
			case c.want == nil && got != nil, c.want != nil && got == nil, c.want != nil && got != nil && *got != *c.want:
				t.Fatalf("confidence = %v, want %v", got, c.want)
			}
			if got != nil && extraction.Confident(got) {
				t.Fatalf("confidence %v would be accepted without the narrator", *got)
			}
		})
	}
}

func TestAReasonIsCutAtItsCap(t *testing.T) {
	long := strings.Repeat("é", localmodel.MaxReasonRunes+50)
	raws := extract(t, source(answering{Speaker: "Mira", Reason: long, Evidence: "Mira crossed the room and stopped at the window."}, question()))
	if len(raws) != 1 || len([]rune(raws[0].Note)) != localmodel.MaxReasonRunes {
		t.Fatalf("got %d suggestions, note of %d runes", len(raws), len([]rune(raws[0].Note)))
	}
}

func TestOnlyMaxQuotesQuestionsAreAsked(t *testing.T) {
	asked := 0
	counting := countingAsker(func() { asked++ })
	qs := []localmodel.Question{question(), question(), question(), question()}
	for _, c := range []struct {
		name string
		max  func() int
		want int
	}{
		{"two", func() int { return 2 }, 2},
		{"zero", func() int { return 0 }, 0},
		{"negative", func() int { return -3 }, 0},
		{"no setting wired", nil, 0},
		{"more than there are", func() int { return 99 }, 4},
	} {
		t.Run(c.name, func(t *testing.T) {
			asked = 0
			s := source(counting, qs...)
			s.MaxQuotes = c.max
			extract(t, s)
			if asked != c.want {
				t.Fatalf("asked %d, want %d", asked, c.want)
			}
		})
	}
}

type countingAsker func()

func (f countingAsker) Ask(context.Context, localmodel.Question) (localmodel.Answer, error) {
	f()
	return localmodel.Answer{}, nil
}

type failingAfter struct {
	ok int
	n  *int
}

func (f failingAfter) Ask(ctx context.Context, q localmodel.Question) (localmodel.Answer, error) {
	*f.n++
	if *f.n > f.ok {
		return localmodel.Answer{}, errors.New("the model process died")
	}
	return localmodeltest.Asker{}.Ask(ctx, q)
}

func TestAModelThatFailsKeepsWhatItAnsweredAndTellsTheNarrator(t *testing.T) {
	n := 0
	var notes []string
	s := source(failingAfter{ok: 1, n: &n}, question(), question(), question())
	raws, err := s.Extract(context.Background(), extractionport.Input{Note: func(sentence string) { notes = append(notes, sentence) }})
	if err != nil {
		t.Fatalf("the run failed: %v", err)
	}
	if len(raws) != 1 || n != 2 {
		t.Fatalf("got %d suggestions after %d asks, want 1 after 2 (it stops at the first failure)", len(raws), n)
	}
	if len(notes) != 1 || !strings.Contains(notes[0], "stopped") {
		t.Fatalf("notes = %q", notes)
	}
}

func TestACancelledRunReturnsTheContextErrorAndAsksNothing(t *testing.T) {
	asked := 0
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := source(countingAsker(func() { asked++ }), question()).Extract(ctx, extractionport.Input{})
	if !errors.Is(err, context.Canceled) || asked != 0 {
		t.Fatalf("err = %v, asked = %d", err, asked)
	}
}

func TestACancelDuringAnAskReturnsTheContextError(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	s := source(cancelling{cancel}, question(), question())
	if _, err := s.Extract(ctx, extractionport.Input{}); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled (a cancel must not look like a model failure)", err)
	}
}

type cancelling struct{ cancel func() }

func (c cancelling) Ask(ctx context.Context, _ localmodel.Question) (localmodel.Answer, error) {
	c.cancel()
	return localmodel.Answer{}, ctx.Err()
}

func TestAQuestionsErrorFailsTheRun(t *testing.T) {
	boom := errors.New("no project is open")
	s := localmodel.Source{Ask: localmodeltest.Asker{}, Questions: func() ([]localmodel.Question, error) { return nil, boom }, MaxQuotes: func() int { return 5 }}
	if _, err := s.Extract(context.Background(), extractionport.Input{}); !errors.Is(err, boom) {
		t.Fatalf("err = %v", err)
	}
}

func TestRightToLeftAndEmojiNamesResolve(t *testing.T) {
	q := localmodel.Question{
		CueID: "q", ChapterID: "c1", ParagraphID: "p2", Quote: "\"مرحبا\"",
		Passage:    []extraction.Paragraph{{ID: "p1", ChapterID: "c1", Text: "ليلى 🐉 نظرت إليه."}, {ID: "p2", ChapterID: "c1", Text: "\"مرحبا\""}},
		Characters: []localmodel.Character{{Name: "ليلى 🐉"}},
	}
	raws := extract(t, source(localmodeltest.Asker{}, q))
	if len(raws) != 1 || raws[0].Payload.Speaker != "ليلى 🐉" {
		t.Fatalf("got %+v", raws)
	}
}
