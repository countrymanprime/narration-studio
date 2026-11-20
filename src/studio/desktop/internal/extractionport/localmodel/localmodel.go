// Package localmodel is the extraction port's local-model source (#3743): when the rules leave a quoted line's speaker unknown,
// it asks a small model that runs on this computer who is speaking, and offers the answer as a suggestion with a reason
// sentence. The model sits behind Asker, one method, so the host can put a sidecar process there and every test can put the
// deterministic fake in localmodeltest there; this package sends nothing anywhere and has no network code.
//
// The model only proposes. Code decides what is kept. The speaker must be one listed character, by name or by an alias no other
// character shares; the evidence must be found in the passage the model was shown (extraction.VerifyEvidence) on whole words,
// must name the speaker outside the quote itself and not only as part of a longer listed name ("John" in "Little John"), must say
// more than the bare name, and must not overlap the quote; and a reason of at least three words that names the speaker must come
// with it. An answer that fails any of these is dropped, so the line stays unknown. A confidence at or
// above extraction.VerifyBelow is lowered under it, so a model's guess is never accepted without the narrator. Not enforced: that the
// reason says something true (it only has to name the speaker), and a quote repeated word for word in one paragraph is cut out once
// when the evidence is placed against it, and in full only when the name is looked for.
//
// This source replaces the registry's local-model row once the host registers it. It differs from that row on purpose: it is
// scored, because an answer carries the model's confidence, and it names the analysis tool its files come from. It is not
// started from the Story Bible (Runs is false): only "Attribute speakers" asks it, so a scan never starts a model.
package localmodel

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"

	"desktop/internal/extraction"
	"desktop/internal/extractionport"
	"desktop/internal/port"
)

// AssetID is the analysis tool whose files the model runs from.
const AssetID = "local-llm"

// MaxReasonRunes caps the reason sentence a model gives; the rest is cut.
const MaxReasonRunes = 300

// MinReasonWords is the fewest words a reason may have to be a sentence the narrator can read.
const MinReasonWords = 3

// MaxEvidenceRunes is the longest evidence the source keeps; longer is not a sentence that supports an answer, so the answer is
// dropped.
const MaxEvidenceRunes = 600

// Character is a speaking entry of the Story Bible as the model is told about it: a name and the other names it goes by.
type Character struct {
	Name    string
	Aliases []string
}

// Question is one quote the rules left unknown. Passage is the paragraphs the model reads: the quote's own and those around
// it, in reading order; ParagraphID and ChapterID say which of them holds the quote.
type Question struct {
	ChapterID   string
	ParagraphID string
	Quote       string
	Passage     []extraction.Paragraph
	Characters  []Character
}

// Answer is what a model says. Speaker is empty when it cannot tell. Confidence is nil when the model gives none. Evidence is
// a stretch of the passage that supports the answer; Reason is a sentence for the narrator.
type Answer struct {
	Speaker    string
	Confidence *float64
	Reason     string
	Evidence   string
}

// Asker is the model. Ask returns ctx.Err() once ctx is cancelled. It reads only q: no file, no network.
type Asker interface {
	Ask(ctx context.Context, q Question) (Answer, error)
}

// Source is the local-model row. Questions is asked for on each run, so the project open then is the one read; it gives the
// unknown, unconfirmed quotes and nothing else. MaxQuotes is how many questions one run may ask, from the narrator's setting;
// nil or below 1 asks none. Log receives a line when the model fails; nil logs a warning through slog. Whether the model's
// files are downloaded is the registry's asset check (Assets), not this source's.
type Source struct {
	Ask       Asker
	Questions func() ([]Question, error)
	MaxQuotes func() int
	Log       func(string)
}

var _ extractionport.Source = Source{}

// Entry is the registry row for s.
func Entry(s Source) port.Entry[extractionport.Source] {
	return port.Entry[extractionport.Source]{
		Name:       extractionport.LocalModel,
		Descriptor: port.Descriptor{Label: "Local model", Modes: []string{extractionport.ModeExtract}},
		New:        func() extractionport.Source { return s },
	}
}

// Name is extractionport.LocalModel.
func (Source) Name() string { return extractionport.LocalModel }

// Icon is the local-model row's icon, the one extractionport.NewRegistry gives it.
func (Source) Icon() string { return "globe" }

// Runs is false: the narrator does not start the model from the Story Bible; "Attribute speakers" asks it.
func (Source) Runs() bool { return false }

// Assets is the analysis tool the model runs from.
func (Source) Assets() []string { return []string{AssetID} }

// Scored is true: an answer carries the model's confidence.
func (Source) Scored() bool { return true }

// Available is ok when the model and the project's questions are wired.
func (s Source) Available() extractionport.Availability {
	if s.Ask == nil || s.Questions == nil {
		return extractionport.Availability{Reason: "No local model is installed."}
	}
	return extractionport.Availability{OK: true}
}

// Extractor is s, or a *port.NotSupportedError with the Available reason.
func (s Source) Extractor() (extractionport.Extractor, error) {
	if a := s.Available(); !a.OK {
		return nil, &port.NotSupportedError{
			Capability: extractionport.LocalModel,
			Support:    port.Support{Level: port.NotYetAvailable, Reason: port.ReasonNotYet, Message: a.Reason},
		}
	}
	return s, nil
}

// Answered is one suggestion and the place, in the list Questions gave, of the question it answers: what ties a suggestion
// back to its quote when two quotes read the same.
type Answered struct {
	Question int
	Raw      extractionport.Raw
}

// Answers is what one run gave: the suggestions that passed the checks, and Asked, how many questions, counted from the first,
// the model answered, whether or not its answer was kept.
type Answers struct {
	Kept  []Answered
	Asked int
}

// Extract is Answer without the questions' places. A cancelled ctx returns ctx.Err() and nothing else.
func (s Source) Extract(ctx context.Context, in extractionport.Input) ([]extractionport.Raw, error) {
	answers, err := s.Answer(ctx, in)
	if err != nil {
		return nil, err
	}
	raws := make([]extractionport.Raw, len(answers.Kept))
	for i, a := range answers.Kept {
		raws[i] = a.Raw
	}
	return raws, nil
}

// Answer asks the model about each question, up to MaxQuotes, and returns the answers that pass the checks above. It writes
// nothing. A model that fails ends the run early and says so through in.Note; what it had answered is kept, and the run does
// not fail, so the rules' result stands. A ctx that ends, also during the last question, returns ctx.Err() together with what
// the model had answered before it ended, so a caller with a deadline can keep that.
func (s Source) Answer(ctx context.Context, in extractionport.Input) (Answers, error) {
	if _, err := s.Extractor(); err != nil {
		return Answers{}, err
	}
	if err := ctx.Err(); err != nil {
		return Answers{}, err
	}
	questions, err := s.Questions()
	if err != nil {
		return Answers{}, fmt.Errorf("reading the quotes the rules left unknown: %w", err)
	}
	limit := 0
	if s.MaxQuotes != nil {
		limit = s.MaxQuotes()
	}
	answers := Answers{Kept: []Answered{}}
	for i, q := range questions {
		if i >= limit {
			break
		}
		if err := ctx.Err(); err != nil {
			return answers, err
		}
		answer, err := s.Ask.Ask(ctx, q)
		if ctxErr := ctx.Err(); ctxErr != nil {
			return answers, ctxErr
		}
		if err != nil {
			s.log(fmt.Sprintf("the local model failed after %d of %d answers: %v", i, min(len(questions), limit), err))
			if in.Note != nil {
				in.Note("The local model stopped before it finished, so the lines after it keep the rules' answer.")
			}
			break
		}
		answers.Asked = i + 1
		if raw, ok := accept(q, answer); ok {
			answers.Kept = append(answers.Kept, Answered{Question: i, Raw: raw})
		}
	}
	if err := ctx.Err(); err != nil {
		return answers, err
	}
	return answers, nil
}

func (s Source) log(line string) {
	if s.Log != nil {
		s.Log(line)
		return
	}
	slog.Warn(line)
}

// accept turns an answer into a suggestion when it passes the checks, or reports that it does not.
func accept(q Question, a Answer) (extractionport.Raw, bool) {
	if strings.TrimSpace(q.Quote) == "" {
		return extractionport.Raw{}, false
	}
	name, names, others, ok := character(q.Characters, a.Speaker)
	if !ok {
		return extractionport.Raw{}, false
	}
	reason := cleanReason(a.Reason)
	if len(strings.Fields(reason)) < MinReasonWords || !mentions(reason, names, others) {
		return extractionport.Raw{}, false
	}
	evidence, ok := extraction.VerifyEvidence(q.Passage, a.Evidence, extraction.QuoteHint{ParagraphID: q.ParagraphID, ChapterID: q.ChapterID})
	if !ok || utf8.RuneCountInString(evidence.Text) > MaxEvidenceRunes || !supports(q, evidence, names, others) {
		return extractionport.Raw{}, false
	}
	return extractionport.Raw{
		Payload:    extraction.Payload{Kind: extraction.KindSpeaker, Quote: q.Quote, Speaker: name},
		Confidence: capped(a.Confidence),
		Quotes:     []extractionport.Quote{{ParagraphID: evidence.ParagraphID, Text: evidence.Text}},
		ChapterID:  q.ChapterID,
		Note:       reason,
	}, true
}

// capped is c kept under extraction.VerifyBelow, or nil when c is not a confidence.
func capped(c *float64) *float64 {
	if c == nil || math.IsNaN(*c) || *c < 0 || *c > 1 {
		return nil
	}
	v := *c
	if v >= extraction.VerifyBelow {
		v = math.Nextafter(extraction.VerifyBelow, 0)
	}
	return &v
}

// character resolves what the model called the speaker to one listed character, by name or alias with the folds NameSpans makes.
// It gives that character's name, every name it goes by, and every name the other characters go by. ok is false for an empty
// answer, a name nobody has, or one that more than one listed character has (two entries with the same name included): the line
// then stays unknown rather than going to whichever is listed first. A character with a blank name is not listed.
func character(characters []Character, said string) (name string, names []string, others [][]string, ok bool) {
	want := string(foldRunes(said))
	if want == "" {
		return "", nil, nil, false
	}
	found := -1
	for i, c := range characters {
		if strings.TrimSpace(c.Name) == "" || !slices.ContainsFunc(append([]string{c.Name}, c.Aliases...), func(n string) bool { return string(foldRunes(n)) == want }) {
			continue
		}
		if found >= 0 {
			return "", nil, nil, false
		}
		found = i
	}
	if found < 0 {
		return "", nil, nil, false
	}
	for i, c := range characters {
		if i != found && strings.TrimSpace(c.Name) != "" {
			others = append(others, append([]string{c.Name}, c.Aliases...))
		}
	}
	c := characters[found]
	return c.Name, append([]string{c.Name}, c.Aliases...), others, true
}

// mentions reports whether any of names is written as a whole word in text, not counting a hit that sits inside a longer name
// another character goes by.
func mentions(text string, names []string, others [][]string) bool {
	var longer [][2]int
	for _, group := range others {
		for _, n := range group {
			longer = append(longer, NameSpans(text, n)...)
		}
	}
	for _, n := range names {
		for _, span := range NameSpans(text, n) {
			if !slices.ContainsFunc(longer, func(o [2]int) bool { return o[0] <= span[0] && span[1] <= o[1] && o != span }) {
				return true
			}
		}
	}
	return false
}

// supports reports whether the evidence backs the answer: it names the speaker outside the quote and says more than the name, it
// begins and ends on whole words, and it does not overlap the quote where the quote stands.
func supports(q Question, ev extraction.Evidence, names []string, others [][]string) bool {
	var paragraph string
	for _, p := range q.Passage {
		if p.ID == ev.ParagraphID {
			paragraph = p.Text
			break
		}
	}
	from, to := byteOffset(paragraph, ev.Start), byteOffset(paragraph, ev.End)
	if from > to || to > len(paragraph) || !wholeWords(paragraph, from, to) {
		return false
	}
	if quote, ok := extraction.VerifyEvidence([]extraction.Paragraph{{ID: ev.ParagraphID, Text: paragraph}}, q.Quote, extraction.QuoteHint{}); ok &&
		ev.Start < quote.End && quote.Start < ev.End {
		return false
	}
	text := withoutQuote(ev.Text, q.Quote)
	if !mentions(text, names, others) {
		return false
	}
	for _, n := range names {
		spans := NameSpans(text, n)
		for i := len(spans) - 1; i >= 0; i-- {
			text = text[:spans[i][0]] + " " + text[spans[i][1]:]
		}
	}
	return strings.ContainsFunc(text, func(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) })
}

// wholeWords reports whether text[from:to] begins and ends on word edges of text.
func wholeWords(text string, from, to int) bool {
	if from == to {
		return false
	}
	first, _ := utf8.DecodeRuneInString(text[from:to])
	last, _ := utf8.DecodeLastRuneInString(text[from:to])
	return (!isWordRune(first) || !wordBefore(text, from)) && (!isWordRune(last) || !wordAfter(text, to))
}

// withoutQuote is text with each copy of quote cut out and a space left, up to twenty copies. The quote is found as VerifyEvidence
// finds it, so curly and straight quotes and no-break spaces do not hide it.
func withoutQuote(text, quote string) string {
	for i := 0; i < 20; i++ {
		ev, ok := extraction.VerifyEvidence([]extraction.Paragraph{{ID: "x", Text: text}}, quote, extraction.QuoteHint{})
		if !ok {
			break
		}
		from, to := byteOffset(text, ev.Start), byteOffset(text, ev.End)
		text = text[:from] + " " + text[to:]
	}
	return text
}

// cleanReason is a model's reason as one line the narrator can be shown (extraction.CleanSentence), at most MaxReasonRunes.
func cleanReason(s string) string { return extraction.CleanSentence(s, MaxReasonRunes) }
