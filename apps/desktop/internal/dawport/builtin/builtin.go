// Package builtin is the DAW port's adapter for the app's own recorder (internal/recording, ADR 0455): the engine of a launch with
// no DAW whose project records with the built-in recorder (dawport.LaunchKind). It wraps the recorder through Recorder, an
// interface declared here that recording.Service satisfies, so the recorder itself knows nothing of the port.
//
// It declares what the recorder does: record (Experimental until the owner's hardware pass) and takes (choosing a line's take
// marks it the keeper, keeper.go in internal/recording). It keeps no saved project, so project_read is Unsupported with its own
// sentence. Punch and the edit rows the app will make itself (stack_takes, cut_range, fx_range) are NotYetAvailable; once one
// has a role it declares mode "app" (Depth). Everything else is Unsupported.
//
// Importing the package registers its factory for dawport.KindBuiltIn.
package builtin

import (
	"context"
	"errors"
	"maps"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

func init() { dawport.Register(dawport.KindBuiltIn, Factory) }

// Recorder is what the adapter asks of the built-in recorder; recording.Service is the one implementation.
type Recorder interface {
	// Start records a new take of device into the project's Recordings folder.
	Start(device string) error
	// Stop asks the running take to end and returns at once.
	Stop()
	// SetTakeKeeper marks or unmarks a take the keeper of its line.
	SetTakeKeeper(takeName string, keeper bool) error
}

// Config is the adapter's recorder and where it reads the narrator's microphone.
type Config struct {
	// Recorder is the project's recorder; nil refuses every request.
	Recorder Recorder
	// Device is the narrator's chosen input device (the Recording.device row); nil reads as none chosen.
	Device func() string
}

// The sentences a refusal shows the narrator.
const (
	// MessageNoSavedProject is project_read's: the takes live in the project folder, with no project file of the engine's own.
	MessageNoSavedProject = "The built-in recorder keeps no saved project."
	// MessageUnsupported is every capability the built-in recorder has no part in (the Studio Next mock's wording).
	MessageUnsupported = "Not available with the built-in recorder."
	// MessageNotYet is a capability the app will make itself and has not built yet.
	MessageNotYet = "Not available with the built-in recorder yet."
	// MessageNoSplit is the takes role's answer to a split: the recorder lists every take file in its folder, so cutting one
	// into two listed takes would leave the whole file listed beside them unless it deleted or rewrote it (CF-1: never).
	MessageNoSplit = "The built-in recorder cannot split a take into two yet: it keeps each take as one audio file and never rewrites one."
	// messageNotReady is a runtime refusal; the recorder is the app's own, so only a missing recorder causes one.
	messageNotReady = "The built-in recorder is not ready. Open a project, then try again."
)

// errNoRecorder is a role called on an adapter with no recorder behind it.
var errNoRecorder = errors.New("open a project before recording: its takes are saved in the project folder")

// declares is the adapter's static declaration: every capability has a row. Promoting record once the owner's pass has confirmed
// it is moving it to Supported here.
var declares = func() map[dawport.Capability]dawport.Level {
	d := map[dawport.Capability]dawport.Level{}
	for _, spec := range dawport.Capabilities() {
		d[spec.Capability] = dawport.Unsupported
	}
	d[dawport.CapRecord] = dawport.Experimental
	d[dawport.CapTakes] = dawport.Experimental
	for c := range appMade {
		d[c] = dawport.NotYetAvailable
	}
	d[dawport.CapPunch] = dawport.NotYetAvailable
	return d
}()

// appMade are the multi-edit capabilities the app performs itself on the built-in recorder's takes (the mock's built-in setup).
var appMade = map[dawport.Capability]bool{dawport.CapStackTakes: true, dawport.CapCutRange: true, dawport.CapFXRange: true}

// depthOf is mode "app" for an app-made capability once levels gives it a role, and nothing otherwise; never destructive.
func depthOf(levels map[dawport.Capability]dawport.Level, c dawport.Capability) dawport.Depth {
	if appMade[c] && levels[c] >= dawport.Experimental {
		return dawport.Depth{Mode: dawport.ModeApp}
	}
	return dawport.Depth{}
}

// explain words a refusal for the built-in recorder.
func explain(c dawport.Capability, r dawport.Reason) string {
	switch {
	case c == dawport.CapProjectRead && r == dawport.ReasonUnsupported:
		return MessageNoSavedProject
	case r == dawport.ReasonUnsupported:
		return MessageUnsupported
	case r == dawport.ReasonNotYet:
		return MessageNotYet
	case r == dawport.ReasonStandalone || r == dawport.ReasonNotRunning:
		return messageNotReady
	default:
		return ""
	}
}

// runtime is always there and answering: the recorder is part of the app, not an engine it connects to.
func runtime() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} }

// Adapter is the built-in recorder.
type Adapter struct {
	session *session
}

var (
	_ dawport.Adapter   = (*Adapter)(nil)
	_ dawport.Explainer = (*Adapter)(nil)
	_ dawport.Describer = (*Adapter)(nil)
)

// Factory is the registry's built-in factory. A dawport.Env names no recorder, so it builds an adapter with none, which refuses
// every request; a host that drives the recorder through the port builds one with New over the project's recorder.
func Factory(dawport.Env) (dawport.Adapter, error) { return New(Config{}), nil }

// New is the adapter over config's recorder.
func New(config Config) *Adapter { return &Adapter{session: &session{config: config}} }

func (a *Adapter) Kind() dawport.Kind { return dawport.KindBuiltIn }

// Declares returns a copy of the declaration, the same on every call.
func (a *Adapter) Declares() map[dawport.Capability]dawport.Level { return maps.Clone(declares) }

// Role is the session for record and takes, and nil for everything else.
func (a *Adapter) Role(c dawport.Capability) any {
	switch c {
	case dawport.CapRecord, dawport.CapTakes:
		return a.session
	default:
		return nil
	}
}

// Runtime is the resolver's view: always there and answering.
func (a *Adapter) Runtime() dawport.Runtime { return runtime() }

func (a *Adapter) Explain(c dawport.Capability, r dawport.Reason) string { return explain(c, r) }

func (a *Adapter) Depth(c dawport.Capability) dawport.Depth { return depthOf(declares, c) }

// Declaration is the built-in recorder's declaration with no recorder behind it: an adapter whose Role is always nil, for the host
// to build the capability payload's resolver from. It is never registered and fails the conformance suite by design, as
// reaper.Declaration does.
func Declaration() dawport.Adapter { return declaration{} }

type declaration struct{}

func (declaration) Kind() dawport.Kind                                    { return dawport.KindBuiltIn }
func (declaration) Declares() map[dawport.Capability]dawport.Level        { return maps.Clone(declares) }
func (declaration) Role(dawport.Capability) any                           { return nil }
func (declaration) Runtime() dawport.Runtime                              { return runtime() }
func (declaration) Explain(c dawport.Capability, r dawport.Reason) string { return explain(c, r) }
func (declaration) Depth(c dawport.Capability) dawport.Depth              { return depthOf(declares, c) }

// session is the record and takes roles over one recorder.
type session struct {
	config Config
}

var (
	_ dawport.Recorder     = (*session)(nil)
	_ dawport.TakeSelector = (*session)(nil)
	_ dawport.TakeSplitter = (*session)(nil)
)

func (s *session) ready(ctx context.Context) (Recorder, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if s.config.Recorder == nil {
		return nil, errNoRecorder
	}
	return s.config.Recorder, nil
}

// ArmOnly has nothing to arm: the built-in recorder keeps its own takes per chapter and needs no track.
func (s *session) ArmOnly(ctx context.Context, trackGUID string) (dawport.Armed, error) {
	if _, err := s.ready(ctx); err != nil {
		return dawport.Armed{}, err
	}
	return dawport.Armed{TrackGUID: trackGUID}, nil
}

// RecordStart starts a take on the narrator's chosen microphone; trackGUID and opts are a DAW's and are ignored.
func (s *session) RecordStart(ctx context.Context, trackGUID string, _ dawport.RecordOptions) (dawport.RecordStarted, error) {
	recorder, err := s.ready(ctx)
	if err != nil {
		return dawport.RecordStarted{}, err
	}
	device := ""
	if s.config.Device != nil {
		device = s.config.Device()
	}
	if err := recorder.Start(device); err != nil {
		return dawport.RecordStarted{}, err
	}
	return dawport.RecordStarted{TrackGUID: trackGUID}, nil
}

// RecordStop asks the take to end; its end arrives as the recorder's own state change.
func (s *session) RecordStop(ctx context.Context) (dawport.RecordStopped, error) {
	recorder, err := s.ready(ctx)
	if err != nil {
		return dawport.RecordStopped{}, err
	}
	recorder.Stop()
	return dawport.RecordStopped{}, nil
}

// OnRecordEnded never fires: only the app stops the built-in recorder, so no take ends behind its back.
func (s *session) OnRecordEnded(func(dawport.RecordEnded)) {}

// SetActiveTake marks takeGUID (a take's name, "Take 003") the keeper of its line; itemGUID is the line and is echoed back.
func (s *session) SetActiveTake(ctx context.Context, itemGUID, takeGUID string) (dawport.ActiveTakeSet, error) {
	recorder, err := s.ready(ctx)
	if err != nil {
		return dawport.ActiveTakeSet{}, err
	}
	if err := recorder.SetTakeKeeper(takeGUID, true); err != nil {
		return dawport.ActiveTakeSet{}, err
	}
	return dawport.ActiveTakeSet{ItemGUID: itemGUID, TakeGUID: takeGUID, Changed: true}, nil
}

// HideTakes changes nothing: the built-in recorder plays only the kept take of a line, so the others are already silent.
func (s *session) HideTakes(ctx context.Context, _, _ string) (dawport.Result, error) {
	if _, err := s.ready(ctx); err != nil {
		return dawport.Result{}, err
	}
	return dawport.OK("The built-in recorder plays only the kept take, so there is nothing to mute.", false), nil
}

// SplitTake changes nothing and says why: every "Take NNN.wav" in the Recordings folder is a take (internal/recording's
// listTakes), so two takes cut from one would be listed beside the whole one, and the recorder deletes and rewrites no take.
func (s *session) SplitTake(ctx context.Context, _, _ string, _ float64) (dawport.Result, error) {
	if _, err := s.ready(ctx); err != nil {
		return dawport.Result{}, err
	}
	return dawport.Refused(MessageNoSplit), nil
}
