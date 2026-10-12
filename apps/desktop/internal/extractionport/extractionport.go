// Package extractionport is the extraction port on the Go side (ADR 0301): the sources a Story Bible suggestion can come
// from, what the host knows about each without starting it, and the one role a source plays, Extractor, which offers raw
// suggestions. A source only offers Raw values (what it found, how sure it is, the quotes behind it); code computes the
// offsets, the status and the fingerprint (internal/extraction), so a source cannot set them. The host asks this registry
// by the name a suggestion stores (CheckExtract, AvailableNow, RunnableNames) and never compares source names itself. The
// extractionporttest suite runs over every row.
package extractionport

import (
	"context"
	"fmt"
	"slices"

	"github.com/countrymanprime/narration-utils/shell/internal/extraction"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
)

// Source names, as a suggestion's source field spells them (the mock's EXTRACTION_SOURCES ids).
const (
	Rules      = "rules"
	Imported   = "imported"
	LocalModel = "local-model"
	Gliner     = "gliner"
	BookNLP    = "booknlp"
)

// ModeExtract is the one role a source declares: it looks at the book and offers raw suggestions. Scan progress is the
// job's, not a role.
const ModeExtract = "extract"

// Modes is every role a row may declare.
func Modes() []string { return []string{ModeExtract} }

// FlagDuplicate marks a raw suggestion the source thinks repeats something else; its Note says what.
const FlagDuplicate = "duplicate"

// Quote is a stretch of the manuscript that backs a suggestion. ParagraphID is a hint and may be empty; Text is what the
// evidence check searches for.
type Quote struct {
	ParagraphID string
	Text        string
}

// Raw is what a source offers: no id, no offsets and no status. Confidence is 0..1, or nil when the source gave none.
type Raw struct {
	Payload    extraction.Payload
	Confidence *float64
	Quotes     []Quote
	ChapterID  string
	Flag       string
	Note       string
}

// Input is what a source looks at: the manuscript's paragraphs and, for an imported file, its text.
type Input struct {
	Paragraphs []extraction.Paragraph
	Text       string
}

// Extractor is the extract role. Extract never writes the Story Bible, and returns ctx.Err() once ctx is cancelled.
type Extractor interface {
	Extract(ctx context.Context, in Input) ([]Raw, error)
}

// Availability says whether a source can run now; Reason is a sentence for the narrator when it cannot.
type Availability struct {
	OK     bool
	Reason string
}

// Source is what the host knows about one extraction source.
type Source interface {
	// Name is the registry row's name.
	Name() string
	// Icon is the name of the icon the UI shows beside the source's suggestions.
	Icon() string
	// Runs reports whether the narrator can start the source from the Story Bible (an imported file is not started).
	Runs() bool
	// Assets are the asset ids the source runs from, any one of which is enough; none for a source that needs no download.
	Assets() []string
	// Scored reports whether the source gives a confidence at all; a source that does not returns nil for every item.
	Scored() bool
	// Available says whether the source can run, with its reason when it cannot. It starts nothing.
	Available() Availability
	// Extractor is the extract role, or a *port.NotSupportedError carrying the Available reason when the source cannot run.
	Extractor() (Extractor, error)
}

// builtin is a registered row. A row whose adapter is not built yet has no extractor and says so; reason, when set, is
// why the source can never run on this build.
type builtin struct {
	name, label, icon string
	runs, scored      bool
	assets            []string
	reason            string
	extractor         func() Extractor
}

func (s builtin) Name() string     { return s.name }
func (s builtin) Icon() string     { return s.icon }
func (s builtin) Runs() bool       { return s.runs }
func (s builtin) Assets() []string { return slices.Clone(s.assets) }
func (s builtin) Scored() bool     { return s.scored }

func (s builtin) Available() Availability {
	switch {
	case s.reason != "":
		return Availability{Reason: s.reason}
	case s.extractor == nil:
		return Availability{Reason: fmt.Sprintf("%s is not available yet.", s.label)}
	default:
		return Availability{OK: true}
	}
}

func (s builtin) Extractor() (Extractor, error) {
	if a := s.Available(); !a.OK {
		return nil, &port.NotSupportedError{
			Capability: s.name,
			Support:    port.Support{Level: port.NotYetAvailable, Reason: port.ReasonNotYet, Message: a.Reason},
		}
	}
	return s.extractor(), nil
}

func row(s builtin) port.Entry[Source] {
	return port.Entry[Source]{
		Name:       s.name,
		Descriptor: port.Descriptor{Label: s.label, Modes: []string{ModeExtract}},
		New:        func() Source { return s },
	}
}

// NewRegistry is a registry holding the built-in rows in the mock's order, rules first as the default. Here the rules,
// GLiNER and BookNLP rows have no extractor and say they are not available: the host registers the adapters in their
// place (the rules, gliner and booknlp packages, wired in the desktop host's extractionRegistry). The local model has
// none on this build. A test registers a fake on its own copy.
func NewRegistry() *port.Registry[Source] {
	r := &port.Registry[Source]{Kind: "extraction source"}
	r.Register(row(builtin{name: Rules, label: "Rules", icon: "auto", runs: true, scored: true}))
	r.Register(row(builtin{name: Imported, label: "Imported file", icon: "import", scored: true}))
	r.Register(row(builtin{name: LocalModel, label: "Local model", icon: "globe", runs: true, reason: "No local model is installed."}))
	r.Register(row(builtin{name: Gliner, label: "GLiNER", icon: "locate", runs: true, scored: true, assets: []string{"gliner"}}))
	r.Register(row(builtin{name: BookNLP, label: "BookNLP", icon: "dictionary", runs: true, scored: true,
		assets: []string{"booknlp-small", "booknlp-big"}}))
	return r
}

// Sources is the program's registry.
var Sources = NewRegistry()

// RunnableNames are the sources the narrator can start from the Story Bible, in registration order.
func RunnableNames() []string { return RunnableNamesIn(Sources) }

// RunnableNamesIn is RunnableNames over registry r.
func RunnableNamesIn(r *port.Registry[Source]) []string {
	names := []string{}
	for _, e := range r.Entries() {
		if e.Descriptor.Supports(ModeExtract) && e.New().Runs() {
			names = append(names, e.Name)
		}
	}
	return names
}

// CheckExtract refuses, with a *port.NotSupportedError, a source that is not registered or does not declare the extract role.
func CheckExtract(name string) error { return CheckExtractIn(Sources, name) }

// CheckExtractIn is CheckExtract over registry r.
func CheckExtractIn(r *port.Registry[Source], name string) error {
	entry, err := r.Lookup(name)
	if err != nil {
		return err
	}
	if !entry.Descriptor.Supports(ModeExtract) {
		return &port.NotSupportedError{
			Capability: name,
			Support: port.Support{
				Level:   port.Unsupported,
				Reason:  port.ReasonUnsupported,
				Message: fmt.Sprintf("%s cannot look for suggestions.", entry.Descriptor.Label),
			},
		}
	}
	return nil
}

// AvailableNow is whether source name can run with the assets installed: a source that runs from an asset needs one of
// its assets installed ("GLiNER is not downloaded."), and then answers for itself.
func AvailableNow(name string, installed []string) Availability {
	return AvailableNowIn(Sources, name, installed)
}

// AvailableNowIn is AvailableNow over registry r. An unregistered name is unavailable with the registry's refusal.
func AvailableNowIn(r *port.Registry[Source], name string, installed []string) Availability {
	entry, err := r.Lookup(name)
	if err != nil {
		return Availability{Reason: err.Error()}
	}
	source := entry.New()
	if assets := source.Assets(); len(assets) > 0 && !slices.ContainsFunc(assets, func(id string) bool { return slices.Contains(installed, id) }) {
		return Availability{Reason: fmt.Sprintf("%s is not downloaded.", entry.Descriptor.Label)}
	}
	return source.Available()
}
