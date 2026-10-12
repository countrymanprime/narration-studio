// Package gliner is the extraction port's GLiNER source (SN-X71): it starts the Manuscript Guide sidecar's
// `suggest --source gliner` command through the process supervisor and turns the JSON lines it prints into raw suggestions.
// GLiNER is an optional download: the source is unavailable ("GLiNER is not downloaded.") until the asset registry says the
// tool is installed and verified, and the sidecar is given the install folder and reads nothing else (ADR 0848).
//
// The sidecar's output is checked as untrusted, as the rules source checks its own: the whole output, each line and each
// field have a byte cap; a line must have exactly the fields of the format, the source gliner, an entry payload with no
// aliases and a type from Types; and each quote must be found in the paragraph it names (extraction.VerifyEvidence) or its
// suggestion is dropped with a log line. Cancelling the context kills the sidecar.
//
// The line format is pinned by testdata/suggest-lines.json, which the sidecar's own test writes.
package gliner

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

// AssetID is the analysis tool the source runs from (config/analysis-assets.json).
const AssetID = "gliner"

// Types are the Story Bible categories GLiNER's labels map to (LABELS in extraction_gliner.py).
var Types = []string{"Character", "Place", "Item", "Organization"}

// The sentences the narrator reads when the source cannot run.
const (
	reasonNotDownloaded = "GLiNER is not downloaded."
	reasonNotSetUp      = "The Story Bible sidecar is not set up."
)

// Command is how to start the sidecar and what it reads. Args go before the subcommand: the backend script in
// development, none for the frozen sidecar.
type Command struct {
	Program    string
	Args       []string
	Manuscript string
	Guide      string
}

// Source is the GLiNER row. Command is asked for on each run, so a project opened later is the one read. Install answers
// the tool's install folder and whether the asset registry has it installed and verified. Log receives the line for each
// dropped suggestion; nil logs a warning through slog.
type Source struct {
	Supervisor *process.Supervisor
	Command    func() (Command, error)
	Install    func() (dir string, ok bool)
	Log        func(string)
}

var _ extractionport.Source = Source{}

// Entry is the registry row for s, as extractionport.NewRegistry describes the GLiNER row.
func Entry(s Source) port.Entry[extractionport.Source] {
	return port.Entry[extractionport.Source]{
		Name:       extractionport.Gliner,
		Descriptor: port.Descriptor{Label: "GLiNER", Modes: []string{extractionport.ModeExtract}},
		New:        func() extractionport.Source { return s },
	}
}

// Name is extractionport.Gliner.
func (Source) Name() string { return extractionport.Gliner }

// Icon is the GLiNER row's icon.
func (Source) Icon() string { return "locate" }

// Runs is true: the narrator starts GLiNER from the Story Bible once it is installed.
func (Source) Runs() bool { return true }

// Assets is the one analysis tool GLiNER runs from.
func (Source) Assets() []string { return []string{AssetID} }

// Scored is true: GLiNER gives a score per span, passed through unchanged.
func (Source) Scored() bool { return true }

// installed is the install folder when the registry has the tool installed and verified.
func (s Source) installed() (string, bool) {
	if s.Install == nil {
		return "", false
	}
	dir, ok := s.Install()
	return dir, ok && dir != ""
}

// Available is ok once the tool is installed and the source has a supervisor and a command.
func (s Source) Available() extractionport.Availability {
	if _, ok := s.installed(); !ok {
		return extractionport.Availability{Reason: reasonNotDownloaded}
	}
	if s.Supervisor == nil || s.Command == nil {
		return extractionport.Availability{Reason: reasonNotSetUp}
	}
	return extractionport.Availability{OK: true}
}

// Extractor is s, or a *port.NotSupportedError with the Available reason.
func (s Source) Extractor() (extractionport.Extractor, error) {
	if a := s.Available(); !a.OK {
		return nil, &port.NotSupportedError{
			Capability: extractionport.Gliner,
			Support:    port.Support{Level: port.NotYetAvailable, Reason: port.ReasonNotYet, Message: a.Reason},
		}
	}
	return s, nil
}

// Extract runs `suggest --source gliner` and returns its suggestions whose quotes are in in.Paragraphs. It writes nothing.
func (s Source) Extract(ctx context.Context, in extractionport.Input) ([]extractionport.Raw, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	dir, ok := s.installed()
	if !ok {
		return nil, fmt.Errorf("%s", reasonNotDownloaded)
	}
	command, err := s.Command()
	if err != nil {
		return nil, err
	}
	lines, err := s.run(ctx, command, dir)
	if err != nil {
		return nil, err
	}
	raws := []extractionport.Raw{}
	for i, line := range lines {
		raw, err := parse(line)
		if err != nil {
			return nil, fmt.Errorf("GLiNER gave a bad suggestion on line %d: %w", i+1, err)
		}
		if missing, ok := verified(in.Paragraphs, raw); !ok {
			s.log(fmt.Sprintf("Dropped a GLiNER suggestion: its quote %q is not in paragraph %q.", missing.Text, missing.ParagraphID))
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
func (s Source) run(ctx context.Context, command Command, dir string) ([]string, error) {
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
			refused = fmt.Errorf("GLiNER printed more than %d MB of suggestions", MaxOutputBytes>>20)
		case len(line) > MaxLineBytes:
			refused = fmt.Errorf("GLiNER printed a line over %d KB", MaxLineBytes>>10)
		default:
			lines = append(lines, line)
			return
		}
		stop()
	}
	args := append(slices.Clone(command.Args), "suggest", "--source", extractionport.Gliner,
		"--manuscript", command.Manuscript, "--guide", command.Guide, "--install", dir)
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
		return nil, fmt.Errorf("GLiNER could not look for suggestions (exit %d): %s", code, lastMessage(child.StderrTail()))
	}
	return lines, nil
}

// lastMessage is the sidecar's last stderr line: the message of its JSON log record, without the "ERROR: " the sidecar puts
// before a failure, or the line itself when it is not a record.
func lastMessage(stderr string) string {
	line := strings.TrimSpace(stderr)
	if i := strings.LastIndex(line, "\n"); i >= 0 {
		line = strings.TrimSpace(line[i+1:])
	}
	var record struct {
		Msg string `json:"msg"`
	}
	if json.Unmarshal([]byte(line), &record) == nil && record.Msg != "" {
		line = record.Msg
	}
	return strings.TrimPrefix(line, "ERROR: ")
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
}

type wireLine struct {
	Source     string      `json:"source"`
	Payload    wirePayload `json:"payload"`
	Confidence *float64    `json:"confidence"`
	Quotes     []wireQuote `json:"quotes"`
	ChapterID  string      `json:"chapterId"`
}

// parse reads one line strictly: no unknown field, a field under MaxFieldBytes, the source gliner, an entry with no aliases
// and a type from Types, and a confidence within 0..1 or null.
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
	fields := append([]string{w.Source, w.ChapterID, p.Kind, p.Name, p.Type, p.Description}, p.AppearsIn...)
	for _, q := range w.Quotes {
		fields = append(fields, q.ParagraphID, q.Text)
	}
	if slices.ContainsFunc(fields, func(f string) bool { return len(f) > MaxFieldBytes }) {
		return extractionport.Raw{}, fmt.Errorf("a field over %d KB", MaxFieldBytes>>10)
	}
	switch {
	case w.Source != extractionport.Gliner:
		return extractionport.Raw{}, fmt.Errorf("the source %q is not %q", w.Source, extractionport.Gliner)
	case extraction.Kind(p.Kind) != extraction.KindEntry:
		return extractionport.Raw{}, fmt.Errorf("the kind %q is not one GLiNER emits", p.Kind)
	case !slices.Contains(Types, p.Type):
		return extractionport.Raw{}, fmt.Errorf("the type %q is not one of %v", p.Type, Types)
	case len(p.Aliases) > 0:
		return extractionport.Raw{}, fmt.Errorf("GLiNER gives no aliases, but %q has %d", p.Name, len(p.Aliases))
	case w.Confidence != nil && (math.IsNaN(*w.Confidence) || *w.Confidence < 0 || *w.Confidence > 1):
		return extractionport.Raw{}, fmt.Errorf("the confidence %v is not within 0..1", *w.Confidence)
	}
	quotes := make([]extractionport.Quote, len(w.Quotes))
	for i, q := range w.Quotes {
		quotes[i] = extractionport.Quote{ParagraphID: q.ParagraphID, Text: q.Text}
	}
	return extractionport.Raw{
		Payload: extraction.Payload{
			Kind: extraction.KindEntry, Name: p.Name, Type: p.Type, Description: p.Description, AppearsIn: p.AppearsIn,
		},
		Confidence: w.Confidence,
		Quotes:     quotes,
		ChapterID:  w.ChapterID,
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
