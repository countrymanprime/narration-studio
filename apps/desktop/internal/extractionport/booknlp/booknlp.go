// Package booknlp is the extraction port's BookNLP source (SN-X72): it starts the Manuscript Guide sidecar's
// `suggest --source booknlp` command through the process supervisor and turns the JSON lines it prints into raw suggestions:
// characters with their names, a flagged merge for a group BookNLP split in two, the speaker of each quoted line, and a
// Gender property. BookNLP is an optional download in two variants: the source runs the large weights when the asset
// registry has them installed and verified, else the small ones, and is unavailable ("BookNLP is not downloaded.") with
// neither. The sidecar is given that one install folder and reads nothing else (ADR 0848).
//
// The sidecar's output is checked as untrusted, as the GLiNER source checks its own: the whole output, each line and each
// field have a byte cap; a line must have exactly the fields of the format, the source booknlp, a payload of a kind BookNLP
// offers with the fields that kind needs (a Character entry, an alias, a speaker, or a Gender property of Female or Male),
// a confidence within 0..1 or null, and the duplicate flag only on an alias, with a note; and each quote must be found in
// the paragraph it names (extraction.VerifyEvidence) or its suggestion is dropped with a log line. Cancelling the context
// kills the sidecar.
//
// The line format is pinned by testdata/suggest-lines.json, which the sidecar's own test writes.
package booknlp

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

// The analysis tools the source runs from (config/analysis-assets.json).
const (
	AssetSmall = "booknlp-small"
	AssetBig   = "booknlp-big"
)

// Preference is the order the variants are tried in: the large weights when installed, as the registry ranks them.
var Preference = []string{AssetBig, AssetSmall}

// What BookNLP offers: characters only, and a Gender property of one of two values (GENDERS in extraction_booknlp.py).
const (
	EntryType   = "Character"
	GenderKey   = "Gender"
	labelSource = "BookNLP"
)

// GenderValues are the values a Gender property may take.
var GenderValues = []string{"Female", "Male"}

// The sentences the narrator reads when the source cannot run.
const (
	reasonNotDownloaded = "BookNLP is not downloaded."
	reasonNotSetUp      = "The Story Bible sidecar is not set up."
)

// Command is how to start the sidecar and what it reads. Args go before the subcommand: the backend script in
// development, none for the frozen sidecar. SpacyModel is the spaCy model BookNLP parses with, an installed model's folder
// or a name; empty leaves the sidecar's default.
type Command struct {
	Program    string
	Args       []string
	Manuscript string
	Guide      string
	SpacyModel string
}

// Source is the BookNLP row. Command is asked for on each run, so a project opened later is the one read. Install answers
// a variant's install folder and whether the asset registry has it installed and verified. Log receives the line for each
// dropped suggestion; nil logs a warning through slog.
type Source struct {
	Supervisor *process.Supervisor
	Command    func() (Command, error)
	Install    func(id string) (dir string, ok bool)
	Log        func(string)
}

var _ extractionport.Source = Source{}

// Entry is the registry row for s, as extractionport.NewRegistry describes the BookNLP row.
func Entry(s Source) port.Entry[extractionport.Source] {
	return port.Entry[extractionport.Source]{
		Name:       extractionport.BookNLP,
		Descriptor: port.Descriptor{Label: labelSource, Modes: []string{extractionport.ModeExtract}},
		New:        func() extractionport.Source { return s },
	}
}

// Name is extractionport.BookNLP.
func (Source) Name() string { return extractionport.BookNLP }

// Icon is the BookNLP row's icon.
func (Source) Icon() string { return "dictionary" }

// Runs is true: the narrator starts BookNLP from the Story Bible once it is installed.
func (Source) Runs() bool { return true }

// Assets are the two variants, either of which is enough, in the program row's order.
func (Source) Assets() []string { return []string{AssetSmall, AssetBig} }

// Scored is true: speakers and genders carry a confidence; characters and merges carry none.
func (Source) Scored() bool { return true }

// installed is the folder of the first variant in Preference the registry has installed and verified.
func (s Source) installed() (string, bool) {
	if s.Install == nil {
		return "", false
	}
	for _, id := range Preference {
		if dir, ok := s.Install(id); ok && dir != "" {
			return dir, true
		}
	}
	return "", false
}

// Available is ok once a variant is installed and the source has a supervisor and a command.
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
			Capability: extractionport.BookNLP,
			Support:    port.Support{Level: port.NotYetAvailable, Reason: port.ReasonNotYet, Message: a.Reason},
		}
	}
	return s, nil
}

// Extract runs `suggest --source booknlp` and returns its suggestions whose quotes are in in.Paragraphs. It writes nothing.
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
			return nil, fmt.Errorf("BookNLP gave a bad suggestion on line %d: %w", i+1, err)
		}
		if missing, ok := verified(in.Paragraphs, raw); !ok {
			s.log(fmt.Sprintf("Dropped a BookNLP suggestion: its quote %q is not in paragraph %q.", missing.Text, missing.ParagraphID))
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
			refused = fmt.Errorf("BookNLP printed more than %d MB of suggestions", MaxOutputBytes>>20)
		case len(line) > MaxLineBytes:
			refused = fmt.Errorf("BookNLP printed a line over %d KB", MaxLineBytes>>10)
		default:
			lines = append(lines, line)
			return
		}
		stop()
	}
	args := append(slices.Clone(command.Args), "suggest", "--source", extractionport.BookNLP,
		"--manuscript", command.Manuscript, "--guide", command.Guide, "--install", dir)
	if command.SpacyModel != "" {
		args = append(args, "--spacy-model", command.SpacyModel)
	}
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
		return nil, fmt.Errorf("BookNLP could not look for suggestions (exit %d): %s", code, lastMessage(child.StderrTail()))
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
	Entry       string   `json:"entry"`
	Alias       string   `json:"alias"`
	Key         string   `json:"key"`
	Value       string   `json:"value"`
	Quote       string   `json:"quote"`
	Speaker     string   `json:"speaker"`
}

type wireLine struct {
	Source     string      `json:"source"`
	Payload    wirePayload `json:"payload"`
	Confidence *float64    `json:"confidence"`
	Quotes     []wireQuote `json:"quotes"`
	ChapterID  string      `json:"chapterId"`
	Flag       string      `json:"flag"`
	Note       string      `json:"note"`
}

// needs are the payload fields each kind BookNLP offers must fill.
func needs(p wirePayload) map[string]string {
	switch extraction.Kind(p.Kind) {
	case extraction.KindEntry:
		return map[string]string{"name": p.Name}
	case extraction.KindAlias:
		return map[string]string{"entry": p.Entry, "alias": p.Alias}
	case extraction.KindSpeaker:
		return map[string]string{"quote": p.Quote, "speaker": p.Speaker}
	case extraction.KindProperty:
		return map[string]string{"entry": p.Entry, "key": p.Key, "value": p.Value}
	}
	return nil
}

// parse reads one line strictly: no unknown field, a field under MaxFieldBytes, the source booknlp, a kind BookNLP offers
// with its fields filled, a Character entry, a Gender property of Female or Male, a confidence within 0..1 or null, and the
// duplicate flag only on an alias, with a note.
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
	fields := []string{w.Source, w.ChapterID, w.Flag, w.Note, p.Kind, p.Name, p.Type, p.Description, p.Entry, p.Alias, p.Key, p.Value, p.Quote, p.Speaker}
	fields = append(append(fields, p.Aliases...), p.AppearsIn...)
	for _, q := range w.Quotes {
		fields = append(fields, q.ParagraphID, q.Text)
	}
	if slices.ContainsFunc(fields, func(f string) bool { return len(f) > MaxFieldBytes }) {
		return extractionport.Raw{}, fmt.Errorf("a field over %d KB", MaxFieldBytes>>10)
	}
	kind := extraction.Kind(p.Kind)
	required := needs(p)
	if w.Source != extractionport.BookNLP {
		return extractionport.Raw{}, fmt.Errorf("the source %q is not %q", w.Source, extractionport.BookNLP)
	}
	if required == nil {
		return extractionport.Raw{}, fmt.Errorf("the kind %q is not one BookNLP emits", p.Kind)
	}
	for name, value := range required {
		if strings.TrimSpace(value) == "" {
			return extractionport.Raw{}, fmt.Errorf("a %s needs %s", p.Kind, name)
		}
	}
	switch {
	case kind == extraction.KindEntry && p.Type != EntryType:
		return extractionport.Raw{}, fmt.Errorf("the type %q is not %q", p.Type, EntryType)
	case kind == extraction.KindProperty && p.Key != GenderKey:
		return extractionport.Raw{}, fmt.Errorf("the property %q is not %q", p.Key, GenderKey)
	case kind == extraction.KindProperty && !slices.Contains(GenderValues, p.Value):
		return extractionport.Raw{}, fmt.Errorf("the gender %q is not one of %v", p.Value, GenderValues)
	case w.Flag != "" && w.Flag != extractionport.FlagDuplicate:
		return extractionport.Raw{}, fmt.Errorf("the flag %q is not %q", w.Flag, extractionport.FlagDuplicate)
	case w.Flag != "" && kind != extraction.KindAlias:
		return extractionport.Raw{}, fmt.Errorf("only a merge (an alias) is flagged %q, not a %s", w.Flag, p.Kind)
	case w.Flag != "" && strings.TrimSpace(w.Note) == "":
		return extractionport.Raw{}, fmt.Errorf("a flagged merge needs a note naming both groups")
	case w.Confidence != nil && (math.IsNaN(*w.Confidence) || *w.Confidence < 0 || *w.Confidence > 1):
		return extractionport.Raw{}, fmt.Errorf("the confidence %v is not within 0..1", *w.Confidence)
	}
	quotes := make([]extractionport.Quote, len(w.Quotes))
	for i, q := range w.Quotes {
		quotes[i] = extractionport.Quote{ParagraphID: q.ParagraphID, Text: q.Text}
	}
	return extractionport.Raw{
		Payload: extraction.Payload{
			Kind: kind, Name: p.Name, Type: p.Type, Aliases: p.Aliases, Description: p.Description, AppearsIn: p.AppearsIn,
			Entry: p.Entry, Alias: p.Alias, Key: p.Key, Value: p.Value, Quote: p.Quote, Speaker: p.Speaker,
		},
		Confidence: w.Confidence,
		Quotes:     quotes,
		ChapterID:  w.ChapterID,
		Flag:       w.Flag,
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
