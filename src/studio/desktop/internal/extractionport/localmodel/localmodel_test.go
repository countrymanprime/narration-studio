package localmodel_test

import (
	"context"
	"errors"
	"math"
	"strings"
	"testing"
	"unicode/utf8"

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

const evidenceText = "Mira crossed the room and stopped at the window."

// passage is a scene whose last quote has no speech tag: the rules would leave it unknown.
func passage() []extraction.Paragraph {
	return []extraction.Paragraph{
		{ID: "p1", ChapterID: "c1", Text: evidenceText},
		{ID: "p2", ChapterID: "c1", Text: "\"You are late again.\""},
	}
}

func question() localmodel.Question {
	return localmodel.Question{ChapterID: "c1", ParagraphID: "p2", Quote: "\"You are late again.\"", Passage: passage(), Characters: cast}
}

func source(ask localmodel.Asker, qs ...localmodel.Question) localmodel.Source {
	return localmodel.Source{
		Ask:       ask,
		Questions: func() ([]localmodel.Question, error) { return qs, nil },
		MaxQuotes: func() int { return 100 },
		Log:       func(string) {},
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

// good is an answer that passes every check against question().
func good() localmodel.Answer {
	return localmodel.Answer{Speaker: "Mira", Reason: "Mira was named just before.", Evidence: evidenceText}
}

func TestTheSourcePassesTheExtractionSuite(t *testing.T) {
	q := localmodel.Question{
		ChapterID: "1", ParagraphID: "1-2", Quote: "\"Hello.\"",
		Passage: []extraction.Paragraph{
			{ID: "1-1", ChapterID: "1", Text: "Alice was beginning to get very tired."},
			{ID: "1-2", ChapterID: "1", Text: "\"Hello.\""},
		},
		Characters: []localmodel.Character{{Name: "Alice"}},
	}
	s := source(localmodeltest.Asker{}, q)
	if raws := extract(t, s); len(raws) != 1 {
		t.Fatalf("the suite's input must give the source one suggestion to check, got %d", len(raws))
	}
	for _, p := range extractionporttest.Problems(localmodel.Entry(s)) {
		t.Error(p)
	}
}

func TestTheRowIsNotStartedFromAScanAndNamesItsTool(t *testing.T) {
	s := source(localmodeltest.Asker{})
	if s.Runs() {
		t.Error("Runs = true: a Story Bible scan would start the model")
	}
	if got := s.Assets(); len(got) != 1 || got[0] != localmodel.AssetID {
		t.Errorf("Assets = %v", got)
	}
}

func TestAnUnwiredSourceSaysNoModelIsInstalled(t *testing.T) {
	for name, s := range map[string]localmodel.Source{
		"no model":     {Questions: func() ([]localmodel.Question, error) { return nil, nil }},
		"no questions": {Ask: localmodeltest.Asker{}},
	} {
		t.Run(name, func(t *testing.T) {
			if a := s.Available(); a.OK || a.Reason != "No local model is installed." {
				t.Fatalf("Available = %+v", a)
			}
			var unsupported *port.NotSupportedError
			if _, err := s.Extractor(); !errors.As(err, &unsupported) {
				t.Fatalf("Extractor error = %v, want a *port.NotSupportedError", err)
			}
			if _, err := s.Extract(context.Background(), extractionport.Input{}); !errors.As(err, &unsupported) {
				t.Fatalf("Extract on an unwired source = %v, want a *port.NotSupportedError, not a nil dereference", err)
			}
		})
	}
}

func TestAGoodAnswerBecomesASuggestionWithItsReasonAndEvidence(t *testing.T) {
	raws := extract(t, source(localmodeltest.Asker{}, question()))
	if len(raws) != 1 {
		t.Fatalf("got %d suggestions, want 1", len(raws))
	}
	got := raws[0]
	if got.Payload.Kind != extraction.KindSpeaker || got.Payload.Speaker != "Mira" || got.Payload.Quote != "\"You are late again.\"" {
		t.Errorf("payload = %+v", got.Payload)
	}
	if got.Confidence == nil || *got.Confidence != localmodeltest.Confidence {
		t.Errorf("confidence = %v, want %v", got.Confidence, localmodeltest.Confidence)
	}
	if got.Note != "Mira is the last character named before this line." || got.ChapterID != "c1" {
		t.Errorf("note %q chapter %q", got.Note, got.ChapterID)
	}
	if len(got.Quotes) != 1 || got.Quotes[0].ParagraphID != "p1" || got.Quotes[0].Text != evidenceText {
		t.Errorf("evidence = %+v", got.Quotes)
	}
}

func TestAnAliasResolvesToTheCharactersName(t *testing.T) {
	q := question()
	q.Passage[0].Text = "Arelian crossed the room."
	raws := extract(t, source(answering{Speaker: "  arelian ", Reason: "Arelian is the one named.", Evidence: "Arelian crossed the room."}, q))
	if len(raws) != 1 || raws[0].Payload.Speaker != "Captain Arelian" {
		t.Fatalf("got %+v", raws)
	}
}

// Code decides what is kept: each answer below breaks one check and must come back as no suggestion.
func TestAnAnswerThatBreaksACheckIsDropped(t *testing.T) {
	with := func(f func(*localmodel.Answer)) localmodel.Answer { a := good(); f(&a); return a }
	cases := map[string]localmodel.Answer{
		"no speaker":                     with(func(a *localmodel.Answer) { a.Speaker = "" }),
		"not a listed character":         with(func(a *localmodel.Answer) { a.Speaker = "Dawn" }),
		"listed but not in the passage":  with(func(a *localmodel.Answer) { a.Speaker = "Toby" }),
		"evidence not in the manuscript": with(func(a *localmodel.Answer) { a.Evidence = "Mira shouted across the harbour." }),
		"no evidence":                    with(func(a *localmodel.Answer) { a.Evidence = "" }),
		"one letter as evidence":         with(func(a *localmodel.Answer) { a.Evidence = "i" }),
		"the quote itself as evidence":   with(func(a *localmodel.Answer) { a.Evidence = "\"You are late again.\"" }),
		"evidence that names nobody":     with(func(a *localmodel.Answer) { a.Evidence = "You are late again" }),
		"no reason":                      with(func(a *localmodel.Answer) { a.Reason = "" }),
		"blank reason":                   with(func(a *localmodel.Answer) { a.Reason = "  \n" }),
		"a reason that names another":    with(func(a *localmodel.Answer) { a.Reason = "Toby says this." }),
		"evidence too long":              with(func(a *localmodel.Answer) { a.Evidence = evidenceText + strings.Repeat(" Mira waited.", 60) }),
	}
	// The long evidence must exist in the manuscript, or it would be dropped for that reason instead.
	long := question()
	long.Passage[0].Text = evidenceText + strings.Repeat(" Mira waited.", 60)
	if raws := extract(t, source(answering(cases["evidence too long"]), long)); len(raws) != 0 {
		t.Errorf("evidence too long: got %+v", raws)
	}
	delete(cases, "evidence too long")
	for name, answer := range cases {
		t.Run(name, func(t *testing.T) {
			if raws := extract(t, source(answering(answer), question())); len(raws) != 0 {
				t.Fatalf("got %+v, want none", raws)
			}
		})
	}
	if raws := extract(t, source(answering(good()), question())); len(raws) != 1 {
		t.Fatal("the control answer was dropped too: the cases above prove nothing")
	}
}

// A name counts only as a whole word in the passage outside the quote itself.
func TestANameCountsOnlyAsAWholeWordOutsideTheQuote(t *testing.T) {
	people := []localmodel.Character{{Name: "Tom"}, {Name: "Ann"}, {Name: "Will"}}
	cases := map[string]struct {
		text, quote string
	}{
		"inside a longer word":       {"The atom split.", "\"Hi.\""},
		"inside cannot":              {"She cannot stay.", "\"Hi.\""},
		"only in the quote itself":   {"The room was quiet.", "\"Where are you, Tom?\""},
		"verb with the same letters": {"\"I will not go.\"", "\"I will not go.\""},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			speaker := "Tom"
			switch name {
			case "inside cannot":
				speaker = "Ann"
			case "verb with the same letters":
				speaker = "Will"
			}
			q := localmodel.Question{
				ChapterID: "c1", ParagraphID: "p2", Quote: c.quote, Characters: people,
				Passage: []extraction.Paragraph{{ID: "p1", ChapterID: "c1", Text: c.text}, {ID: "p2", ChapterID: "c1", Text: c.quote}},
			}
			if c.text == c.quote {
				q.Passage = q.Passage[1:]
			}
			ev := c.text
			if ev == c.quote {
				ev = "will"
			}
			if raws := extract(t, source(answering{Speaker: speaker, Reason: speaker + " is here.", Evidence: ev}, q)); len(raws) != 0 {
				t.Fatalf("got %+v, want none", raws)
			}
		})
	}
}

// Evidence that names the speaker only inside the quote (an address), or that names someone else while the speaker is named elsewhere,
// does not support the answer.
func TestEvidenceMustNameTheSpeakerOutsideTheQuote(t *testing.T) {
	cases := map[string]struct {
		speaker  string
		passage  []extraction.Paragraph
		quote    string
		evidence string
	}{
		"evidence spans the quote and its tag, the name only in the quote": {
			speaker:  "Tom",
			quote:    "\"Where are you, Tom?\"",
			passage:  []extraction.Paragraph{{ID: "p2", ChapterID: "c1", Text: "\"Where are you, Tom?\" she asked."}},
			evidence: "\"Where are you, Tom?\" she asked.",
		},
		"the speaker is named elsewhere but the evidence names another": {
			speaker:  "Mira",
			quote:    "\"Hi.\"",
			passage:  []extraction.Paragraph{{ID: "p1", ChapterID: "c1", Text: "Toby left. Mira sat down."}, {ID: "p2", ChapterID: "c1", Text: "\"Hi.\""}},
			evidence: "Toby left.",
		},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			q := localmodel.Question{ChapterID: "c1", ParagraphID: "p2", Quote: c.quote, Passage: c.passage, Characters: []localmodel.Character{{Name: "Tom"}, {Name: "Mira"}, {Name: "Toby"}}}
			if raws := extract(t, source(answering{Speaker: c.speaker, Reason: c.speaker + " is here.", Evidence: c.evidence}, q)); len(raws) != 0 {
				t.Fatalf("got %+v, want none", raws)
			}
		})
	}
}

func TestANameThatIsWrittenWithTypographyOrCasingStillMatches(t *testing.T) {
	cases := map[string]struct{ character, text string }{
		"curly apostrophe":    {"O'Brien", "O’Brien raised a hand."},
		"no-break space":      {"Captain Arelian", "Captain Arelian raised a hand."},
		"upper case":          {"Élodie", "ÉLODIE raised a hand."},
		"final sigma":         {"Οδυσσεύς", "ΟΔΥΣΣΕΎΣ raised a hand."},
		"possessive":          {"Tom", "Tom's hand rose."},
		"followed by a comma": {"Tom", "Tom, tired, raised a hand."},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			q := localmodel.Question{
				ChapterID: "c1", ParagraphID: "p2", Quote: "\"Hi.\"", Characters: []localmodel.Character{{Name: c.character}},
				Passage: []extraction.Paragraph{{ID: "p1", ChapterID: "c1", Text: c.text}, {ID: "p2", ChapterID: "c1", Text: "\"Hi.\""}},
			}
			raws := extract(t, source(answering{Speaker: c.character, Reason: c.character + " raised a hand.", Evidence: c.text}, q))
			if len(raws) != 1 {
				t.Fatalf("got %d suggestions, want 1", len(raws))
			}
		})
	}
}

func TestAnAliasTwoCharactersShareIsDroppedNotGivenToTheFirst(t *testing.T) {
	people := []localmodel.Character{
		{Name: "Mira", Aliases: []string{"the captain"}},
		{Name: "Captain Arelian", Aliases: []string{"the captain"}},
		{Name: "Dawn", Aliases: []string{"Mira"}},
	}
	for _, said := range []string{"the captain", "The Captain", "Mira"} {
		t.Run(said, func(t *testing.T) {
			q := localmodel.Question{
				ChapterID: "c1", ParagraphID: "p2", Quote: "\"Hi.\"", Characters: people,
				Passage: []extraction.Paragraph{{ID: "p1", ChapterID: "c1", Text: "The captain and Mira raised a hand."}, {ID: "p2", ChapterID: "c1", Text: "\"Hi.\""}},
			}
			if raws := extract(t, source(answering{Speaker: said, Reason: "The captain and Mira are named.", Evidence: "The captain and Mira raised a hand."}, q)); len(raws) != 0 {
				t.Fatalf("got %+v, want none", raws)
			}
		})
	}
}

func TestASuggestionWithABlankQuoteOrSpeakerIsNeverEmitted(t *testing.T) {
	blankQuote := question()
	blankQuote.Quote = "  "
	blankName := question()
	blankName.Characters = []localmodel.Character{{Name: "", Aliases: []string{"Mira"}}}
	for name, q := range map[string]localmodel.Question{"blank quote": blankQuote, "character with no name": blankName} {
		t.Run(name, func(t *testing.T) {
			raws := extract(t, source(answering(good()), q))
			for _, raw := range raws {
				if raw.Payload.Quote == "" || raw.Payload.Speaker == "" {
					t.Fatalf("emitted %+v", raw.Payload)
				}
			}
		})
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
			a := good()
			a.Confidence = c.in
			raws := extract(t, source(answering(a), question()))
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

func TestAReasonIsCleanedAndCutAtItsCap(t *testing.T) {
	a := good()
	a.Reason = "Mira\x00 is\n\u202ehere\u202c.\xff" + strings.Repeat("é", localmodel.MaxReasonRunes+50)
	raws := extract(t, source(answering(a), question()))
	if len(raws) != 1 {
		t.Fatalf("got %d suggestions", len(raws))
	}
	note := raws[0].Note
	if !utf8.ValidString(note) || strings.ContainsAny(note, "\x00\n\u202e\u202c") || utf8.RuneCountInString(note) != localmodel.MaxReasonRunes {
		t.Fatalf("note %q (%d runes)", note, utf8.RuneCountInString(note))
	}
	if !strings.HasPrefix(note, "Mira is here.") {
		t.Fatalf("note = %q", note)
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

func TestAModelThatFailsKeepsWhatItAnsweredLogsWhyAndTellsTheNarrator(t *testing.T) {
	n := 0
	var notes, logs []string
	s := source(failingAfter{ok: 1, n: &n}, question(), question(), question())
	s.Log = func(line string) { logs = append(logs, line) }
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
	if len(logs) != 1 || !strings.Contains(logs[0], "the model process died") {
		t.Fatalf("logs = %q: a dead model must leave its error somewhere a person can read", logs)
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

// cancelling cancels the run during its Ask and then answers, or fails, as configured.
type cancelling struct {
	cancel func()
	answer localmodel.Answer
	err    error
}

func (c cancelling) Ask(context.Context, localmodel.Question) (localmodel.Answer, error) {
	c.cancel()
	return c.answer, c.err
}

func TestACancelDuringAnAskReturnsTheContextErrorWhateverTheAskerDoes(t *testing.T) {
	for name, answer := range map[string]func(cancel func()) cancelling{
		"asker returns the context error": func(cancel func()) cancelling { return cancelling{cancel: cancel, err: context.Canceled} },
		"asker ignores the cancel and answers": func(cancel func()) cancelling {
			return cancelling{cancel: cancel, answer: good()}
		},
		"asker fails another way": func(cancel func()) cancelling {
			return cancelling{cancel: cancel, err: errors.New("pipe closed")}
		},
	} {
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			raws, err := source(answer(cancel), question()).Extract(ctx, extractionport.Input{})
			if !errors.Is(err, context.Canceled) || raws != nil {
				t.Fatalf("got %+v, %v: a cancel must return the context error, not a result or a model failure", raws, err)
			}
		})
	}
}

func TestAQuestionsErrorFailsTheRunAndKeepsItsCause(t *testing.T) {
	boom := errors.New("no project is open")
	s := localmodel.Source{Ask: localmodeltest.Asker{}, Questions: func() ([]localmodel.Question, error) { return nil, boom }, MaxQuotes: func() int { return 5 }}
	if _, err := s.Extract(context.Background(), extractionport.Input{}); !errors.Is(err, boom) {
		t.Fatalf("err = %v", err)
	}
}

func TestNameSpansFindsWholeWordsAtValidByteOffsets(t *testing.T) {
	cases := []struct {
		text, name string
		want       []string
	}{
		{"Mira met Mira.", "mira", []string{"Mira", "Mira"}},
		{"Tomorrow, atom, Tom.", "Tom", []string{"Tom"}},
		{"ȺȺȺ Mira", "Mira", []string{"Mira"}},
		{"İİİ Mira sat.", "Mira", []string{"Mira"}},
		{"STRAẞE Mira sat.", "Mira", []string{"Mira"}},
		{"\xff\xff\xff Mira sat.", "Mira", []string{"Mira"}},
		{"ليلى 🐉 نظرت", "ليلى 🐉", []string{"ليلى 🐉"}},
		{"anything", "", nil},
		{"", "Mira", nil},
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
