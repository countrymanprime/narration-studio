// Package rules is the extraction port's rules source (SN-X32): the Story Bible's own rules, run in the host by
// guide.RuleSuggestions, which gives the JSON lines the Manuscript Guide sidecar's `suggest` printed before #2251 step 3 moved
// it here. The lines are read as they were: the whole output, each line and each field have a byte cap, a line must have
// exactly the fields of the format and a kind the rules emit, and each quote must be found in the paragraph it names
// (extraction.VerifyEvidence) or its suggestion is dropped with a log line. Cancelling the context stops the run.
//
// The line format is pinned by testdata/suggest-lines.json, which TestTheSuggestLinesMatchTheContractFile writes.
package rules

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"slices"
	"strings"

	"desktop/internal/extraction"
	"desktop/internal/extractionport"
	"desktop/internal/guide"
	"desktop/internal/port"
)

// The caps on what the rules may give. A run over one is refused.
const (
	MaxOutputBytes = 8 << 20
	MaxLineBytes   = 64 << 10
	MaxFieldBytes  = 8 << 10
)

// Kinds are the payload kinds the rules emit; properties, relationships and claims need a language model.
var Kinds = []extraction.Kind{extraction.KindEntry, extraction.KindAlias, extraction.KindSpeaker}

// Files are what the rules read: the project's canonical manuscript and its Story Bible.
type Files struct {
	Manuscript string
	Guide      string
}

// Source is the rules row. Files is asked for on each run, so a project opened later is the one read. Suggest gives the lines
// for those files; nil is guide.RuleSuggestions. Log receives the line for each dropped suggestion; nil logs a warning
// through slog.
type Source struct {
	Files   func() (Files, error)
	Suggest func(ctx context.Context, manuscript, guide string) ([]string, error)
	Log     func(string)
}

var _ extractionport.Source = Source{}

// Entry is the registry row for s, as extractionport.NewRegistry describes the rules row.
func Entry(s Source) port.Entry[extractionport.Source] {
	return port.Entry[extractionport.Source]{
		Name:       extractionport.Rules,
		Descriptor: port.Descriptor{Label: "Rules", Modes: []string{extractionport.ModeExtract}},
		New:        func() extractionport.Source { return s },
	}
}

// Name is extractionport.Rules.
func (Source) Name() string { return extractionport.Rules }

// Icon is the rules row's icon.
func (Source) Icon() string { return "auto" }

// Runs is true: the narrator starts the rules from the Story Bible.
func (Source) Runs() bool { return true }

// Assets is empty: the rules need no download.
func (Source) Assets() []string { return nil }

// Scored is true: a rule with a measured precision gives it.
func (Source) Scored() bool { return true }

// Available is ok once the source knows where its files are. The rules run in the host, so nothing else can be missing.
func (s Source) Available() extractionport.Availability {
	if s.Files == nil {
		return extractionport.Availability{Reason: "The rules have no project to read."}
	}
	return extractionport.Availability{OK: true}
}

// Extractor is s, or a *port.NotSupportedError with the Available reason.
func (s Source) Extractor() (extractionport.Extractor, error) {
	if a := s.Available(); !a.OK {
		return nil, &port.NotSupportedError{
			Capability: extractionport.Rules,
			Support:    port.Support{Level: port.NotYetAvailable, Reason: port.ReasonNotYet, Message: a.Reason},
		}
	}
	return s, nil
}

// Extract runs the rules and returns their suggestions whose quotes are in in.Paragraphs. It writes nothing.
func (s Source) Extract(ctx context.Context, in extractionport.Input) ([]extractionport.Raw, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	files, err := s.Files()
	if err != nil {
		return nil, err
	}
	lines, err := s.run(ctx, files)
	if err != nil {
		return nil, err
	}
	raws := []extractionport.Raw{}
	for i, line := range lines {
		raw, err := parse(line)
		if err != nil {
			return nil, fmt.Errorf("the rules gave a bad suggestion on line %d: %w", i+1, err)
		}
		if missing, ok := verified(in.Paragraphs, raw); !ok {
			s.log(fmt.Sprintf("Dropped a %s suggestion from the rules: its quote %q is not in paragraph %q.", raw.Payload.Kind, missing.Text, missing.ParagraphID))
			continue
		}
		raws = append(raws, raw)
	}
	return raws, nil
}

func (s Source) log(message string) {
	if s.Log != nil {
		s.Log(message)
		return
	}
	slog.Warn(message)
}

// run gives the rules' lines for files, refusing the run at the first line or byte over a cap.
func (s Source) run(ctx context.Context, files Files) ([]string, error) {
	suggest := s.Suggest
	if suggest == nil {
		suggest = guide.RuleSuggestions
	}
	lines, err := suggest(ctx, files.Manuscript, files.Guide)
	if ctxErr := ctx.Err(); ctxErr != nil {
		return nil, ctxErr
	}
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return nil, err
		}
		return nil, refusedError{err}
	}
	total := 0
	for _, line := range lines {
		total += len(line) + 1
		switch {
		case total > MaxOutputBytes:
			return nil, fmt.Errorf("the rules gave more than %d MB of suggestions", MaxOutputBytes>>20)
		case len(line) > MaxLineBytes:
			return nil, fmt.Errorf("the rules gave a line over %d KB", MaxLineBytes>>10)
		}
	}
	return lines, nil
}

// refusedError is the rules' refusal (a manuscript to import, a Story Bible that cannot be read) as the scan reports it: its
// sentence after "the rules could not look for suggestions:", without the full stop the scan's own message adds.
type refusedError struct{ err error }

func (e refusedError) Error() string {
	return "the rules could not look for suggestions: " + strings.TrimSuffix(e.err.Error(), ".")
}

func (e refusedError) Unwrap() error { return e.err }

type wireQuote struct {
	ParagraphID string `json:"paragraphId"`
	Text        string `json:"text"`
}

type wirePayload struct {
	Kind        string   `json:"kind"`
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Aliases     []string `json:"aliases"`
	Description string   `json:"description"`
	AppearsIn   []string `json:"appearsIn"`
	Entry       string   `json:"entry"`
	Alias       string   `json:"alias"`
	Quote       string   `json:"quote"`
	Speaker     string   `json:"speaker"`
}

type wireLine struct {
	Source     string      `json:"source"`
	Rule       string      `json:"rule"`
	Payload    wirePayload `json:"payload"`
	Confidence *float64    `json:"confidence"`
	Quotes     []wireQuote `json:"quotes"`
	ChapterID  string      `json:"chapterId"`
	Note       string      `json:"note"`
}

// parse reads one line strictly: no unknown field, a field under MaxFieldBytes, a kind the rules emit and a confidence
// within 0..1.
func parse(line string) (extractionport.Raw, error) {
	decoder := json.NewDecoder(strings.NewReader(line))
	decoder.DisallowUnknownFields()
	var w wireLine
	if err := decoder.Decode(&w); err != nil {
		return extractionport.Raw{}, err
	}
	if decoder.More() {
		return extractionport.Raw{}, fmt.Errorf("more than one value on the line")
	}
	p := w.Payload
	fields := append([]string{w.Source, w.Rule, w.ChapterID, w.Note, p.Kind, p.Name, p.Type, p.Description, p.Entry, p.Alias, p.Quote, p.Speaker}, p.Aliases...)
	fields = append(fields, p.AppearsIn...)
	for _, q := range w.Quotes {
		fields = append(fields, q.ParagraphID, q.Text)
	}
	if slices.ContainsFunc(fields, func(f string) bool { return len(f) > MaxFieldBytes }) {
		return extractionport.Raw{}, fmt.Errorf("a field over %d KB", MaxFieldBytes>>10)
	}
	switch {
	case w.Source != extractionport.Rules:
		return extractionport.Raw{}, fmt.Errorf("the source %q is not %q", w.Source, extractionport.Rules)
	case !slices.Contains(Kinds, extraction.Kind(p.Kind)):
		return extractionport.Raw{}, fmt.Errorf("the kind %q is not one the rules emit", p.Kind)
	case w.Confidence != nil && (math.IsNaN(*w.Confidence) || *w.Confidence < 0 || *w.Confidence > 1):
		return extractionport.Raw{}, fmt.Errorf("the confidence %v is not within 0..1", *w.Confidence)
	}
	quotes := make([]extractionport.Quote, len(w.Quotes))
	for i, q := range w.Quotes {
		quotes[i] = extractionport.Quote{ParagraphID: q.ParagraphID, Text: q.Text}
	}
	return extractionport.Raw{
		Payload: extraction.Payload{
			Kind: extraction.Kind(p.Kind), Name: p.Name, Type: p.Type, Aliases: p.Aliases, Description: p.Description,
			AppearsIn: p.AppearsIn, Entry: p.Entry, Alias: p.Alias, Quote: p.Quote, Speaker: p.Speaker,
		},
		Confidence: w.Confidence,
		Quotes:     quotes,
		ChapterID:  w.ChapterID,
		Note:       w.Note,
	}, nil
}

// verified reports whether every quote of raw is in the paragraph it names, and the first one that is not.
func verified(paragraphs []extraction.Paragraph, raw extractionport.Raw) (extractionport.Quote, bool) {
	for _, q := range raw.Quotes {
		ev, ok := extraction.VerifyEvidence(paragraphs, q.Text, extraction.QuoteHint{ParagraphID: q.ParagraphID, ChapterID: raw.ChapterID})
		if !ok || (q.ParagraphID != "" && ev.ParagraphID != q.ParagraphID) {
			return q, false
		}
	}
	return extractionport.Quote{}, true
}
