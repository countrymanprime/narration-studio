// Package audacity is the DAW port's Audacity adapter (ADR 0300, ADR 0355). It drives
// Audacity over its scripting pipe (internal/audacitybridge), which only Audacity 3.x with mod-script-pipe enabled has: Audacity 4.0
// has no scripting interface, so there every request reports that Audacity is not reachable.
//
// It declares Experimental exactly what it builds, until the owner's verification pass confirms it
// (docs/operations/audacity-verification-pass.md): the port's navigate role (go to and loop a time), markers role (add a label),
// macro_render role (the mastering port's Audacity row, ADR 0306, ADR 0460: import a rendered WAV as its own track, apply the
// narrator's chosen macro to it, export the result; macrorender.go), and backups role (ADR 0863: clone a window of audio to a
// muted track of its own before an edit and put it back on request, with a table in the project folder; backups.go; the host prunes
// the table when the project opens, through Backups). Takes, punch, stack_takes, cut_range and fx_range exist in Audacity only
// with backups on (the Studio Next mock's capabilitiesFor, PRD DQ-18): the adapter declares them Experimental and requires backups
// for each (a dawport.Requirer), a roll destructive until backups make it safe and the three edits made in steps (a
// dawport.Describer). Their role makes each edit as a listed series of pipe commands after a backup (steps.go). Session
// carries the Audacity-only operations the port has no capability for yet (import findings as labels, read them back, mark one
// reviewed, export a chapter, write a hand-off label file). Every other capability stays NotYetAvailable with ADR 0144's
// sentence; the review workflow's session on an Audacity launch still refuses every request with it (UnavailableReview).
//
// Importing the package registers its factory for dawport.KindAudacity.
package audacity

import (
	"maps"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

func init() { dawport.Register(dawport.KindAudacity, Factory) }

// NotAvailableError is a DAW the suite recognises but cannot drive yet. Its text is a whole sentence for the narrator (the review
// workflow shows it as the run's message), which is why it is a type rather than an errors.New lower-case fragment.
type NotAvailableError string

func (e NotAvailableError) Error() string { return string(e) }

// ErrNotAvailable is what every capability the adapter does not build answers (ADR 0144), and what the review workflow's session
// answers on an Audacity launch.
const ErrNotAvailable = NotAvailableError("Audacity support is not available yet. This version can't read audio from Audacity or add labels to it, so open the project from REAPER to compare it.")

// UnavailableReview is the review workflow's role on an Audacity launch: comparing a recording needs the recorded audio from the
// engine, which the Audacity adapter does not build, so every request refuses with ErrNotAvailable and it never has an event.
func UnavailableReview() dawport.ReviewSession { return unavailableReview{} }

type unavailableReview struct{}

var _ dawport.ReviewSession = unavailableReview{}

func (unavailableReview) Subscribe(dawport.Subscription) (unsubscribe func()) { return func() {} }
func (unavailableReview) Dispatch() error                                     { return nil }
func (unavailableReview) PrepareReview(string, string) error                  { return ErrNotAvailable }
func (unavailableReview) InspectFindings(string, string) error                { return ErrNotAvailable }
func (unavailableReview) NavigateToFinding(string, string) error              { return ErrNotAvailable }
func (unavailableReview) ExportFindings(string, string, dawport.MarkerColors) error {
	return ErrNotAvailable
}

// declares is the adapter's static declaration. Promoting a capability once the owner's pass has confirmed it is moving it to
// Supported here, in the PR that records the pass (ADR 0355).
var declares = func() map[dawport.Capability]dawport.Level {
	d := map[dawport.Capability]dawport.Level{}
	for _, spec := range dawport.Capabilities() {
		d[spec.Capability] = dawport.NotYetAvailable
	}
	d[dawport.CapNavigate] = dawport.Experimental
	d[dawport.CapMarkers] = dawport.Experimental
	d[dawport.CapMacroRender] = dawport.Experimental
	d[dawport.CapBackups] = dawport.Experimental
	for c := range needBackups {
		d[c] = dawport.Experimental
	}
	return d
}()

// needBackups is each capability that Audacity has only with its backups on, and the words a refusal for them starts with. Audacity
// keeps no takes and changes the audio itself, so keeping, stacking or cutting takes, and an effect on words, need a backup first.
var needBackups = map[dawport.Capability]string{
	dawport.CapTakes:      "Keeping takes",
	dawport.CapPunch:      "Rolling without losing the earlier audio",
	dawport.CapStackTakes: "Stacking takes",
	dawport.CapCutRange:   "Cutting words and their audio",
	dawport.CapFXRange:    "Adding an effect to words",
}

// requires is the declaration's requirement: backups, for each capability in needBackups.
func requires(c dawport.Capability) []dawport.Capability {
	if _, ok := needBackups[c]; ok {
		return []dawport.Capability{dawport.CapBackups}
	}
	return nil
}

// depth is how the capabilities that need backups act: a roll replaces the audio it records over, so it is destructive until the
// backups keep it (the resolver clears the flag while backups are available), and a stack, a cut or an effect on words is a
// series of Audacity commands with one undo step each.
func depth(c dawport.Capability) dawport.Depth {
	switch c {
	case dawport.CapPunch:
		return dawport.Depth{Destructive: true}
	case dawport.CapStackTakes, dawport.CapCutRange, dawport.CapFXRange:
		return dawport.Depth{Mode: dawport.ModeSteps}
	default:
		return dawport.Depth{}
	}
}

// explainRequirement is the one sentence for a capability refused because backups are turned off, by the narrator's toggle or by
// the Experimental switch. Any other refusal of backups is worded by the resolver from backups' own sentence.
func explainRequirement(c, required dawport.Capability, r dawport.Reason) string {
	if required != dawport.CapBackups || (r != dawport.ReasonTurnedOff && r != dawport.ReasonExperimentalOff) {
		return ""
	}
	if _, ok := needBackups[c]; ok {
		return backupsSentence(c)
	}
	return ""
}

// The sentences a refusal shows the narrator.
const (
	// messageNotConnected: the host does not open the pipe from any page yet, so an Audacity
	// launch's resolver has no connection.
	messageNotConnected = "Audacity isn't connected to this app yet. This part of Audacity support is still being tested."
	// messageNotReachable: the pipe is not there or not answering.
	messageNotReachable = "Audacity is not answering. Open Audacity 3 with mod-script-pipe enabled in Preferences > Modules, then try again. Audacity 4.0 has no scripting pipe."
)

// Adapter is Audacity over one pipe client.
type Adapter struct {
	client  *audacitybridge.Client
	session *Session
	backups *Backups
	steps   *steps
}

var (
	_ dawport.Adapter              = (*Adapter)(nil)
	_ dawport.Explainer            = (*Adapter)(nil)
	_ dawport.Requirer             = (*Adapter)(nil)
	_ dawport.Describer            = (*Adapter)(nil)
	_ dawport.RequirementExplainer = (*Adapter)(nil)
)

// Factory is the registry's Audacity factory: the Windows scripting pipe, opened on the first request. It never touches REAPER's
// session directory, even when one is passed.
func Factory(dawport.Env) (dawport.Adapter, error) {
	return New(audacitybridge.New(audacitybridge.PipeTransport(), audacitybridge.Options{})), nil
}

// New is the adapter over client, with no project folder for backups: its backups role refuses every call until the host builds
// the adapter with NewWithBackups.
func New(client *audacitybridge.Client) *Adapter { return NewWithBackups(client, BackupsConfig{}) }

// NewWithBackups is the adapter over client whose backups role keeps its table under backups.Project.
func NewWithBackups(client *audacitybridge.Client, backups BackupsConfig) *Adapter {
	keeper := NewBackups(client, backups)
	return &Adapter{client: client, session: NewSession(client), backups: keeper, steps: &steps{client: client, backups: keeper}}
}

func (a *Adapter) Kind() dawport.Kind { return dawport.KindAudacity }

// Declares returns a copy of the declaration, the same on every call.
func (a *Adapter) Declares() map[dawport.Capability]dawport.Level { return maps.Clone(declares) }

// Role is the session for navigate and markers, the macro renderer for macro_render, the backups for backups, the steps for
// each capability that needs backups, and nil for everything else.
func (a *Adapter) Role(c dawport.Capability) any {
	if _, ok := needBackups[c]; ok {
		return a.steps
	}
	switch c {
	case dawport.CapNavigate, dawport.CapMarkers:
		return a.session
	case dawport.CapMacroRender:
		return macroRender{a.client}
	case dawport.CapBackups:
		return a.backups
	default:
		return nil
	}
}

// Requires is backups, for each capability Audacity has only with backups on.
func (a *Adapter) Requires(c dawport.Capability) []dawport.Capability { return requires(c) }

// Depth is a destructive roll and the edits made in steps.
func (a *Adapter) Depth(c dawport.Capability) dawport.Depth { return depth(c) }

// ExplainRequirement words a capability refused because backups are off.
func (a *Adapter) ExplainRequirement(c, required dawport.Capability, r dawport.Reason) string {
	return explainRequirement(c, required, r)
}

// Session is the Audacity-only operations over the same client (ADR 0355 point 4).
func (a *Adapter) Session() *Session { return a.session }

// Backups is the backups role itself, for what the host does beyond BackupKeeper: read the table for the narrator's list and prune
// it when the project opens, with the narrator's retention (SN-D82). Prune waits for a restore in flight.
func (a *Adapter) Backups() *Backups { return a.backups }

// Runtime is the resolver's view: always a connection, answering while the last request got a complete reply.
func (a *Adapter) Runtime() dawport.Runtime {
	return dawport.Runtime{Bridge: true, Reachable: a.client.Reachable()}
}

// Explain words a pipe that is missing or silent, and ADR 0144's sentence for what is not built.
func (a *Adapter) Explain(_ dawport.Capability, r dawport.Reason) string {
	switch r {
	case dawport.ReasonNotYet:
		return string(ErrNotAvailable)
	case dawport.ReasonStandalone, dawport.ReasonNotRunning:
		return messageNotReachable
	default:
		return ""
	}
}

// Declaration is Audacity's declaration with no pipe behind it: an adapter whose Role is always nil, for the host to build a
// resolver from on an Audacity launch while no page opens the pipe. It is never registered and fails the conformance suite by
// design, as reaper.Declaration does.
func Declaration() dawport.Adapter { return declaration{} }

type declaration struct{}

func (declaration) Kind() dawport.Kind                                 { return dawport.KindAudacity }
func (declaration) Declares() map[dawport.Capability]dawport.Level     { return maps.Clone(declares) }
func (declaration) Role(dawport.Capability) any                        { return nil }
func (declaration) Requires(c dawport.Capability) []dawport.Capability { return requires(c) }
func (declaration) Depth(c dawport.Capability) dawport.Depth           { return depth(c) }
func (declaration) ExplainRequirement(c, required dawport.Capability, r dawport.Reason) string {
	return explainRequirement(c, required, r)
}
func (declaration) Explain(_ dawport.Capability, r dawport.Reason) string {
	switch r {
	case dawport.ReasonNotYet:
		return string(ErrNotAvailable)
	case dawport.ReasonStandalone, dawport.ReasonNotRunning:
		return messageNotConnected
	default:
		return ""
	}
}
