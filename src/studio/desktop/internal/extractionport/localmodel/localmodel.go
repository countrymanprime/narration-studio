// Package localmodel is the extraction port's local-model source (#3743): when the rules leave a quoted line's speaker unknown,
// it asks a small model that runs on this computer who is speaking, and offers the answer as a suggestion with a reason
// sentence. The model sits behind Asker, one method, so the host can put a sidecar process there and every test can put the
// deterministic fake in localmodeltest there; this package sends nothing anywhere and has no network code.
//
// The model only proposes. Code decides what is kept: the speaker must be a listed character or one of that character's
// aliases, the name must appear in the passage the model was shown, the evidence must be found in the manuscript
// (extraction.VerifyEvidence), and a reason sentence must come with it. An answer that fails any of these is dropped, so the
// line stays unknown. A confidence at or above extraction.VerifyBelow is lowered under it, so a model's guess is never
// accepted without the narrator.
package localmodel

import (
	"context"
	"math"
	"slices"
	"strings"
	"unicode/utf8"

	"desktop/internal/extraction"
	"desktop/internal/extractionport"
	"desktop/internal/port"
)

// AssetID is the analysis tool whose files the model runs from.
const AssetID = "local-llm"

// MaxReasonRunes caps the reason sentence a model gives; the rest is cut.
const MaxReasonRunes = 300

// Character is a speaking entry of the Story Bible as the model is told about it: a name and the other names it goes by.
type Character struct {
	Name    string
	Aliases []string
}

// Question is one quote the rules left unknown. Passage is the paragraphs the model reads: the quote's own and those around
// it, in reading order; ParagraphID and ChapterID say which of them holds the quote.
type Question struct {
	CueID       string
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
// nil or below 1 asks none. Installed says whether the model's files are in place; nil means they are.
type Source struct {
	Ask       Asker
	Questions func() ([]Question, error)
	MaxQuotes func() int
	Installed func() bool
}

var _ extractionport.Source = Source{}

// Entry is the registry row for s, as extractionport.NewRegistry describes the local-model row.
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

// Runs is true, as in the registry's row: the narrator starts it from the Story Bible until the row is changed.
func (Source) Runs() bool { return true }

// Assets is the analysis tool the model runs from.
func (Source) Assets() []string { return []string{AssetID} }

// Scored is true: an answer carries the model's confidence.
func (Source) Scored() bool { return true }

// Available is ok when the model and the project's questions are wired and its files are in place.
func (s Source) Available() extractionport.Availability {
	if s.Ask == nil || s.Questions == nil || (s.Installed != nil && !s.Installed()) {
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
// not fail, so the rules' result stands. A cancelled ctx returns ctx.Err().
func (s Source) Extract(ctx context.Context, in extractionport.Input) ([]extractionport.Raw, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	questions, err := s.Questions()
	if err != nil {
		return nil, err
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
		if err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return nil, ctxErr
			}
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

// accept turns an answer into a suggestion when it passes the checks, or reports that it does not.
func accept(q Question, a Answer) (extractionport.Raw, bool) {
	name, ok := character(q.Characters, a.Speaker)
	if !ok || !namedIn(q, name) {
		return extractionport.Raw{}, false
	}
	reason := strings.TrimSpace(a.Reason)
	if reason == "" {
		return extractionport.Raw{}, false
	}
	if utf8.RuneCountInString(reason) > MaxReasonRunes {
		reason = string([]rune(reason)[:MaxReasonRunes])
	}
	evidence, ok := extraction.VerifyEvidence(q.Passage, a.Evidence, extraction.QuoteHint{ParagraphID: q.ParagraphID, ChapterID: q.ChapterID})
	if !ok {
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

// character resolves what the model called the speaker to a listed character's name, by name or alias, ignoring case and
// surrounding space; ok is false for an empty answer or a name nobody has.
func character(characters []Character, said string) (string, bool) {
	said = fold(said)
	if said == "" {
		return "", false
	}
	for _, c := range characters {
		if fold(c.Name) == said || slices.ContainsFunc(c.Aliases, func(alias string) bool { return fold(alias) == said }) {
			return c.Name, true
		}
	}
	return "", false
}

// namedIn reports whether the character's name or one of its aliases is written in the passage the model was shown.
func namedIn(q Question, name string) bool {
	var names []string
	for _, c := range q.Characters {
		if c.Name == name {
			names = append(names, c.Name)
			names = append(names, c.Aliases...)
		}
	}
	for _, p := range q.Passage {
		text := strings.ToLower(p.Text)
		for _, n := range names {
			if n = fold(n); n != "" && strings.Contains(text, n) {
				return true
			}
		}
	}
	return false
}

func fold(s string) string { return strings.ToLower(strings.TrimSpace(s)) }
