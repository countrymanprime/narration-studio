// Package masteringport declares the Mastering port (owner decision D86): which chain turns a narrator's audio into a
// mastered WAV is swappable, like the other providers, while what judges the result is not. Every row's written file is
// measured by internal/measure and judged by internal/deliveryprofile, the same code Master & QC and the proofing checks use,
// so a narrator reads one set of numbers whichever chain made the file (Judge, and the conformance suite's check that a row's
// Result is exactly Judge's answer).
//
// The rows:
//   - builtin (builtin.go): today's internal/mastering chain, EQ then limiter then gain, wrapped unchanged. The default.
//   - daw (daw.go): Experimental. It renders a region through the project's own track and master FX, through the DAW port's
//     render_with_fx role, with the narrator's approval for each render.
//   - audacity (mastering_audacity.go): Experimental. It applies the narrator's effect macro in Audacity, then exports, with the
//     narrator's approval for each render.
//
// A row's Descriptor.Modes say what it masters from: ModeWAV, a rendered WAV file at Request.Source; ModeDAWRegion, regions the DAW
// renders itself (Request.Region). Capabilities say how far it is built and what it needs.
package masteringport

import (
	"context"
	"errors"
	"fmt"
	"os"

	"desktop/internal/dawport"
	"desktop/internal/deliveryprofile"
	"desktop/internal/mastering"
	"desktop/internal/measure"
	"desktop/internal/port"
)

// The modes a row may declare: what it masters from.
const (
	// ModeWAV masters a rendered WAV file, Request.Source.
	ModeWAV = "wav"
	// ModeDAWRegion has the DAW render one region, Request.Region, through its own FX.
	ModeDAWRegion = "daw_region"
)

// Modes are every mode a row may declare.
var Modes = []string{ModeWAV, ModeDAWRegion}

// Request is one master: what to master from, the new WAV to write, and the delivery profile whose numbers it is mastered to and
// judged against.
type Request struct {
	// Source is the WAV a ModeWAV row reads. It is opened read-only and never written.
	Source string
	// Region is the region a ModeDAWRegion row asks the DAW to render, by the name the host wrote.
	Region string
	// Macro is the exact name of the effect macro a row that needs one applies (the Audacity row), as the
	// narrator's DAW lists it.
	Macro string
	// Destination is the new WAV. It must not exist: a master never replaces a file (ErrDestinationExists), and never writes over
	// its source (ErrSameFile). On failure, a cancelled ctx included, nothing is left there.
	Destination string
	Profile     deliveryprofile.Profile
	// Approved is the narrator's yes for this one master, given in the UI just before it runs. A row whose Capabilities say
	// NeedsApproval refuses without it (ErrNotApproved); the host never sets it on its own or remembers it between runs.
	Approved bool
	// ChainDigest is ChainDigest of the chain the narrator was shown and approved, for a row that lists its chain (ChainLister):
	// such a row refuses a request without one (ErrNoChainDigest) and a render whose chain differs from it (ErrChainChanged).
	ChainDigest string
	// Progress, when set, hears how far the master has got; done never goes back and reaches total on success.
	Progress func(done, total int64)
}

// Step is one stage of the chain that ran, in the chain's own words, for the narrator's report.
type Step struct {
	Name   string
	Detail string
}

// Result is what a row did and how its file measures.
type Result struct {
	// Provider is the row's name.
	Provider    string
	Source      string
	Destination string
	// Profile is the key of the profile the file was mastered to and judged against.
	Profile string
	// Chain is what ran, in order.
	Chain []Step
	// Before measures the source when the row read one (ModeWAV); nil for a row that rendered from the DAW.
	Before *measure.Report
	// After and Judgement are Judge's answer for Destination, whichever row wrote it.
	After     measure.Report
	Judgement deliveryprofile.Judgement
	// BuiltinReport is the built-in chain's own report (internal/mastering's Result), with the gain and high-pass numbers it chose,
	// for a caller that shows them; nil for every other row, whose chain the app does not set.
	BuiltinReport *mastering.Result
}

// Capabilities are what a row declares beyond its descriptor: how far it is built, and what it needs before it can run.
type Capabilities struct {
	// Level is how far the row is built: Supported, Experimental (built, not yet through the owner's pass), or NotYetAvailable
	// (declared; Master refuses). A registered row is never Unsupported.
	Level port.Level
	// NeedsApproval: each master needs Request.Approved. Every row that makes a DAW render needs it.
	NeedsApproval bool
	// NeedsMacro: each master needs Request.Macro, the name of the narrator's own effect macro, which the narrator gives with their
	// approval (the Audacity row).
	NeedsMacro bool
	// Needs are the DAW port capabilities the row uses, which the launch's DAW must have available.
	Needs []dawport.Capability
	// Chain is the row's own fixed chain, in order, in words that hold for any profile, so it can be shown before anything is
	// mastered; each master's Result.Chain says what ran with its numbers. Empty for a row whose chain is not the app's (the DAW
	// row: the project's own FX chain decides).
	Chain []Step
}

// Mastering is one mastering chain.
type Mastering interface {
	// Name is the registry row's name.
	Name() string
	// Capabilities is the row's declaration, the same on every call.
	Capabilities() Capabilities
	// Master writes req.Destination from the row's input and answers what ran and Judge's verdict on the file.
	Master(ctx context.Context, req Request) (Result, error)
}

// ChainLister is a row whose steps live outside the app, in the narrator's DAW: Chain reads the plug-ins a master would run now,
// so the narrator sees them before approving it (threat model row 5o). A row that declares its own steps (the built-in chain) or is
// named in the approval (Audacity's macro) does not implement it.
type ChainLister interface {
	Chain(ctx context.Context) ([]ChainTrack, error)
}

// ChainTrack is one track's plug-ins in the chain, in chain order: every track that has FX, then the master track's (Master).
type ChainTrack struct {
	Name   string
	Master bool
	FX     []ChainFX
}

// ChainFX is one plug-in as the DAW names it, and whether it is switched on.
type ChainFX struct {
	Name    string
	Enabled bool
}

// The refusals every row shares. The first two are internal/mastering's own, so a caller of either package checks one error.
var (
	ErrDestinationExists = mastering.ErrDestinationExists
	ErrSameFile          = mastering.ErrSameFile
	// ErrNotApproved is a master of a row that needs the narrator's approval, asked without it.
	ErrNotApproved = errors.New("this mastering chain runs only after you approve it")
)

// NewRegistry is an empty mastering registry. A test registers a fake on its own copy.
func NewRegistry() *port.Registry[Mastering] {
	return &port.Registry[Mastering]{Kind: "mastering chain"}
}

// Rows is the program's registry. builtin registers first (builtin.go), so it is the default; daw follows (daw.go).
var Rows = NewRegistry()

// Default is the row a project uses until it chooses another: the first row registered.
func Default(rows *port.Registry[Mastering]) (port.Entry[Mastering], bool) {
	entries := rows.Entries()
	if len(entries) == 0 {
		return port.Entry[Mastering]{}, false
	}
	return entries[0], true
}

// Support is a row's answer on platform, in the DAW port's Support shape: available when it is built (Experimental or Supported)
// and declared for the platform; otherwise why not, in a sentence for the narrator. A row that needs a DAW capability is
// available here when it is built; whether the launch's DAW has that capability now is the DAW port resolver's answer at run time.
func Support(entry port.Entry[Mastering], platform string) port.Support {
	level := entry.New().Capabilities().Level
	switch {
	case !entry.Descriptor.RunsOn(platform):
		return port.Support{Level: port.Unsupported, Reason: port.ReasonUnsupported,
			Message: fmt.Sprintf("%s is not available on this computer.", entry.Descriptor.Label)}
	case level < port.NotYetAvailable:
		return port.Support{Level: port.Unsupported, Reason: port.ReasonUnsupported,
			Message: fmt.Sprintf("%s cannot master audio.", entry.Descriptor.Label)}
	case level == port.NotYetAvailable:
		return port.Support{Level: level, Reason: port.ReasonNotYet, Message: NotYetMessage(entry.Descriptor.Label)}
	default:
		return port.Support{Level: level, Available: true}
	}
}

// NotYetMessage is the sentence a NotYetAvailable row refuses with.
func NotYetMessage(label string) string {
	return fmt.Sprintf("%s is not available yet.", label)
}

// NotYetAvailable is the refusal of a row that is declared but not built.
func NotYetAvailable(name, label string) error {
	return &port.NotSupportedError{
		Capability: name,
		Support:    port.Support{Level: port.NotYetAvailable, Reason: port.ReasonNotYet, Message: NotYetMessage(label)},
	}
}

// Judge measures path with internal/measure and judges it against profile with internal/deliveryprofile: the one verdict every
// row's Result carries. The file is opened read-only.
func Judge(ctx context.Context, path string, profile deliveryprofile.Profile) (measure.Report, deliveryprofile.Judgement, error) {
	file, err := os.Open(path) //nolint:gosec // G304: path is the file a row just wrote, which the host chose
	if err != nil {
		return measure.Report{}, deliveryprofile.Judgement{}, err
	}
	defer func() { _ = file.Close() }()
	report, err := measure.AnalyzeContext(ctx, file, measure.Options{})
	if err != nil {
		return measure.Report{}, deliveryprofile.Judgement{}, fmt.Errorf("%s: %w", path, err)
	}
	report.File = path
	return report, deliveryprofile.EvaluateFile(report, profile), nil
}
