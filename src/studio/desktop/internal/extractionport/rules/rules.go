// Package rules is the extraction port's rules source (SN-X32): it starts the Manuscript Guide sidecar's `suggest`
// command through the process supervisor and turns the JSON lines it prints into raw suggestions. The sidecar's output
// is checked as untrusted: the whole output, each line and each field have a byte cap, a line must have exactly the
// fields of the format and a kind the rules emit, and each quote must be found in the paragraph it names
// (extraction.VerifyEvidence) or its suggestion is dropped with a log line. Cancelling the context kills the sidecar.
//
// The line format is pinned by testdata/suggest-lines.json, which the sidecar's own contract test writes.
package rules

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"slices"
	"strings"
	"sync"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/extractionport"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
	"github.com/countrymanprime/narration-utils/shell/internal/process"
)

// The caps on what the sidecar may print. A run over one is stopped and refused.
const (
	MaxOutputBytes = 8 << 20
	MaxLineBytes   = 64 << 10
	MaxFieldBytes  = 8 << 10
)

// Kinds are the payload kinds the rules emit; properties, relationships and claims need a language model.
var Kinds = []extraction.Kind{extraction.KindEntry, extraction.KindAlias, extraction.KindSpeaker}

// Command is how to start the sidecar and what it reads. Args go before the subcommand: the backend script in
// development, none for the frozen sidecar.
type Command struct {
	Program    string
	Args       []string
	Manuscript string
	Guide      string
}

// Source is the rules row. Command is asked for on each run, so a project opened later is the one read. Log receives the
// line for each dropped suggestion; nil logs a warning through slog.
type Source struct {
	Supervisor *process.Supervisor
	Command    func() (Command, error)
	Log        func(string)
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

// Available is ok once the source has a supervisor and a command.
func (s Source) Available() extractionport.Availability {
	if s.Supervisor == nil || s.Command == nil {
		return extractionport.Availability{Reason: "The Story Bible sidecar is not set up."}
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

// Extract runs `suggest` and returns its suggestions whose quotes are in in.Paragraphs. It writes nothing.
func (s Source) Extract(ctx context.Context, in extractionport.Input) ([]extractionport.Raw, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	command, err := s.Command()
	if err != nil {
		return nil, err
	}
	lines, err := s.run(ctx, command)
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

// run starts the sidecar and collects its stdout lines, stopping it at the first line or byte over a cap.
func (s Source) run(ctx context.Context, command Command) ([]string, error) {
	runCtx, stop := context.WithCancel(ctx)
	defer stop()
	var mu sync.Mutex
	var lines []string
	var refused error
	total := 0
	onLine := func(line string) {
		mu.Lock()
		defer mu.Unlock()
		if refused != nil {
			return
		}
		total += len(line) + 1
		switch {
		case total > MaxOutputBytes:
			refused = fmt.Errorf("the rules printed more than %d MB of suggestions", MaxOutputBytes>>20)
		case len(line) > MaxLineBytes:
			refused = fmt.Errorf("the rules printed a line over %d KB", MaxLineBytes>>10)
		default:
			lines = append(lines, line)
			return
		}
		stop()
	}
	args := append(slices.Clone(command.Args), "suggest", "--manuscript", command.Manuscript, "--guide", command.Guide)
	child, err := s.Supervisor.StartStream(runCtx, onLine, command.Program, args...)
	if err != nil {
		return nil, err
	}
	<-child.Done()
	mu.Lock()
	defer mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if refused != nil {
		return nil, refused
	}
	if code, _ := child.ExitCode(); code != 0 {
		message := strings.TrimSpace(child.StderrTail())
		if i := strings.LastIndex(message, "\n"); i >= 0 {
			message = message[i+1:]
		}
		return nil, fmt.Errorf("the rules could not look for suggestions (exit %d): %s", code, message)
	}
	return lines, nil
}

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
