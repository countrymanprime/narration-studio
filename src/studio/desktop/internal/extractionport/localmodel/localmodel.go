// Package localmodel is the extraction port's local-model source (#3743): when the rules leave a quoted line's speaker unknown,
// it asks a small model that runs on this computer who is speaking, and offers the answer as a suggestion with a reason
// sentence. The model sits behind Asker, one method, so the host can put a sidecar process there and every test can put the
// deterministic fake in localmodeltest there; this package sends nothing anywhere and has no network code.
//
// The model only proposes. Code decides what is kept. The speaker must be one listed character, by name or by an alias no other
// character shares; that name must be written, as a whole word, in the passage the model was shown; the evidence must be found
// in the manuscript (extraction.VerifyEvidence), must name the speaker, and must come from outside the quote itself; and a
// reason sentence must come with it. An answer that fails any of these is dropped, so the line stays unknown. A confidence at or
// above extraction.VerifyBelow is lowered under it, so a model's guess is never accepted without the narrator.
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

// Extract asks the model about each question, up to MaxQuotes, and returns the answers that pass the checks above. It writes
// nothing. A model that fails ends the run early and says so through in.Note; what it had answered is kept, and the run does
// not fail, so the rules' result stands. A cancelled ctx returns ctx.Err(), also when it is cancelled during the last question.
func (s Source) Extract(ctx context.Context, in extractionport.Input) ([]extractionport.Raw, error) {
	if _, err := s.Extractor(); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	questions, err := s.Questions()
	if err != nil {
		return nil, fmt.Errorf("reading the quotes the rules left unknown: %w", err)
	}
	limit := 0
	if s.MaxQuotes != nil {
		limit = s.MaxQuotes()
	}
	raws := []extractionport.Raw{}
	for i, q := range questions {
		if i >= limit {
			break
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		answer, err := s.Ask.Ask(ctx, q)
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, ctxErr
		}
		if err != nil {
			s.log(fmt.Sprintf("the local model failed after %d of %d answers: %v", i, min(len(questions), limit), err))
			if in.Note != nil {
				in.Note("The local model stopped before it finished, so the lines after it keep the rules' answer.")
			}
			break
		}
		if raw, ok := accept(q, answer); ok {
			raws = append(raws, raw)
		}
	}
	return raws, nil
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
	name, names, ok := character(q.Characters, a.Speaker)
	if !ok || !namedIn(outsideTheQuote(q), names) {
		return extractionport.Raw{}, false
	}
	reason := cleanReason(a.Reason)
	if reason == "" || !namedIn([]extraction.Paragraph{{Text: reason}}, names) {
		return extractionport.Raw{}, false
	}
	evidence, ok := extraction.VerifyEvidence(q.Passage, a.Evidence, extraction.QuoteHint{ParagraphID: q.ParagraphID, ChapterID: q.ChapterID})
	if !ok || utf8.RuneCountInString(evidence.Text) > MaxEvidenceRunes || !namedIn([]extraction.Paragraph{{Text: evidence.Text}}, names) ||
		strings.Contains(foldString(q.Quote), foldString(evidence.Text)) {
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

// character resolves what the model called the speaker to one listed character, by name or alias with the folds NameSpans makes,
// and gives that character's name and every name it goes by. ok is false for an empty answer, a name nobody has, or one that two
// characters share: the line then stays unknown rather than going to whichever is listed first.
func character(characters []Character, said string) (name string, names []string, ok bool) {
	want := string(foldRunes(said))
	if want == "" {
		return "", nil, false
	}
	found := -1
	for i, c := range characters {
		if strings.TrimSpace(c.Name) == "" {
			continue
		}
		if !slices.ContainsFunc(append([]string{c.Name}, c.Aliases...), func(n string) bool { return string(foldRunes(n)) == want }) {
			continue
		}
		if found >= 0 && string(foldRunes(characters[found].Name)) != string(foldRunes(c.Name)) {
			return "", nil, false
		}
		if found < 0 {
			found = i
		}
	}
	if found < 0 {
		return "", nil, false
	}
	c := characters[found]
	return c.Name, append([]string{c.Name}, c.Aliases...), true
}

// outsideTheQuote is the passage with the quote itself taken out of its paragraph, so a name the quote only speaks (an address, "Where
// are you, Toby?") does not count as the speaker being in the scene.
func outsideTheQuote(q Question) []extraction.Paragraph {
	out := make([]extraction.Paragraph, len(q.Passage))
	for i, p := range q.Passage {
		if p.ID == q.ParagraphID && q.Quote != "" {
			p.Text = strings.Replace(p.Text, q.Quote, " ", 1)
		}
		out[i] = p
	}
	return out
}

// namedIn reports whether any of names is written as a whole word in the paragraphs.
func namedIn(paragraphs []extraction.Paragraph, names []string) bool {
	for _, p := range paragraphs {
		for _, n := range names {
			if len(NameSpans(p.Text, n)) > 0 {
				return true
			}
		}
	}
	return false
}

// cleanReason is a model's reason as one line of valid text: control characters and runs of white space become one space, format characters (a right-to-left override among them) are removed, and the
// rest is cut at MaxReasonRunes.
func cleanReason(s string) string {
	s = strings.ToValidUTF8(s, "")
	s = strings.Map(func(r rune) rune {
		switch {
		case unicode.IsControl(r):
			return ' '
		case unicode.Is(unicode.Cf, r):
			return -1
		}
		return r
	}, s)
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > MaxReasonRunes {
		s = string(r[:MaxReasonRunes])
	}
	return s
}

func foldString(s string) string { return string(foldRunes(s)) }
