// Package reaper is the DAW port's REAPER adapter (ADR 0300). It wraps what exists and rewrites nothing: the
// synchronous roles are bridge.Navigator, bridge.Actions, bridge.CleanupClient, bridge.LevelMatchClient and
// daw.Reachability as they are, the review session (review.go, ADR 0143) sends the bridge commands transcript.Service sent
// before the extraction, the offline reader is tracks.Parse, and each asynchronous role writes the bridge command its service
// writes. A capability is declared Experimental when bridge.Actions gates its commands behind the "Experimental REAPER
// actions" switch (bridge's experimentalCommands), and Supported otherwise, except silence trim and level matching, which are
// not wired to a caller and so start Experimental.
//
// Importing the package registers its factory for dawport.KindREAPER.
package reaper

import (
	"context"
	"errors"
	"fmt"
	"maps"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

func init() { dawport.Register(dawport.KindREAPER, Factory) }

// ErrNoSession: the launch has no REAPER session directory (NarrationUtils_Launcher.lua makes one), so there is no bridge to wrap.
var ErrNoSession = errors.New("REAPER is not connected to this app: there is no REAPER session to talk to")

// declares is the adapter's static declaration. Promoting a command once the owner's REAPER verification pass has confirmed it
// (ADR 0400) is moving its capability from Experimental to Supported here, in the same PR that takes the
// command off bridge's experimentalCommands.
var declares = map[dawport.Capability]dawport.Level{
	dawport.CapReview:       dawport.Supported,
	dawport.CapNavigate:     dawport.Supported,
	dawport.CapMarkers:      dawport.Supported,
	dawport.CapPickups:      dawport.Supported,
	dawport.CapLineIdentity: dawport.Supported,
	dawport.CapRenderConfig: dawport.Supported,
	dawport.CapCleanupTools: dawport.Supported,
	dawport.CapRetakeLanes:  dawport.Supported,
	dawport.CapProjectState: dawport.Supported,
	dawport.CapTakeCreate:   dawport.Supported,
	dawport.CapHeartbeat:    dawport.Supported,
	dawport.CapProjectRead:  dawport.Supported,
	// bridge's experimentalCommands: chapter_track_state, select_track; arm_only, record_start, record_stop; punch_to,
	// play_position, roll; create_regions; set_active_take, hide_takes; list_fx_chains, apply_fx_chain, list_fx, add_take_fx; master_chain_read.
	dawport.CapTrackState:  dawport.Experimental,
	dawport.CapTrackSelect: dawport.Experimental,
	dawport.CapRecord:      dawport.Experimental,
	dawport.CapPunch:       dawport.Experimental,
	dawport.CapRegions:     dawport.Experimental,
	dawport.CapTakes:       dawport.Experimental,
	dawport.CapFXChains:    dawport.Experimental,
	// Built, never wired to a binding, so never gated: Experimental keeps them off until they are verified.
	dawport.CapSilenceTrim: dawport.Experimental,
	dawport.CapItemGain:    dawport.Experimental,
	// The mastering port's DAW row (ADR 0306, masterrender.go): Experimental until the owner's
	// REAPER pass. master_chain_read is one of bridge.Actions' gated commands; render_with_fx answers through the fan-out, and each
	// request carries the narrator's approval for that one render, which the bridge uses up.
	dawport.CapRenderWithFX:    dawport.Experimental,
	dawport.CapMasterChainRead: dawport.Experimental,
	// macro_render is the mastering port's Audacity row (ADR 0306, ADR 0460): REAPER has no macro manager, so this is Unsupported,
	// not NotYetAvailable (port.go's own example is exactly this shape, the other way around: "Audacity has no punch-and-roll").
	dawport.CapMacroRender: dawport.Unsupported,
	// The edit rows (SND-3): REAPER can make each edit, but the bridge has no command for them yet. Each command slice flips its own row
	// to Experimental.
	dawport.CapCutRange:   dawport.NotYetAvailable,
	dawport.CapFXRange:    dawport.NotYetAvailable,
	dawport.CapStackTakes: dawport.NotYetAvailable,
	dawport.CapBackups:    dawport.NotYetAvailable,
}

// commandCapability is the capability each of bridge.Actions' commands belongs to. Actions asks its gate about a command by name, and
// Gate answers with that capability's Allowed, so the resolver decides and the command list stays in bridge. Every command Actions
// sends has a row, whether or not it is still Experimental: promoting one is a declaration change above, not a change here.
var commandCapability = map[string]dawport.Capability{
	"chapter_track_state": dawport.CapTrackState,
	"select_track":        dawport.CapTrackSelect,
	"arm_only":            dawport.CapRecord,
	"record_start":        dawport.CapRecord,
	"record_stop":         dawport.CapRecord,
	"punch_to":            dawport.CapPunch,
	"play_position":       dawport.CapPunch,
	"roll":                dawport.CapPunch,
	"create_regions":      dawport.CapRegions,
	"set_active_take":     dawport.CapTakes,
	"hide_takes":          dawport.CapTakes,
	"list_fx_chains":      dawport.CapFXChains,
	"apply_fx_chain":      dawport.CapFXChains,
	"list_fx":             dawport.CapFXChains,
	"add_take_fx":         dawport.CapFXChains,
	"master_chain_read":   dawport.CapMasterChainRead,
}

// Gate is bridge.Actions' gate over allowed (the resolver's Allowed): a command is sent only when its capability is allowed. A nil
// allowed refuses every command as experimental and switched off, and a command with no capability is refused as a bug.
func Gate(allowed func(dawport.Capability) error) bridge.Gate {
	return func(command string) error {
		c, ok := commandCapability[command]
		if !ok {
			return fmt.Errorf("the REAPER adapter has no capability for the command %s", command)
		}
		if allowed == nil {
			return bridge.ErrExperimentalOff
		}
		return allowed(c)
	}
}

// Declaration is REAPER's declaration with no session behind it: an adapter whose Role is always nil. It exists only so the host can
// build a resolver to gate the bridge.Actions it still makes itself, until those consumers move onto this package's roles. It is never registered and fails the conformance suite by design; Role[T] on it is a *dawport.RoleError.
func Declaration() dawport.Adapter { return declaration{} }

type declaration struct{}

func (declaration) Kind() dawport.Kind                             { return dawport.KindREAPER }
func (declaration) Declares() map[dawport.Capability]dawport.Level { return maps.Clone(declares) }
func (declaration) Role(dawport.Capability) any                    { return nil }
func (declaration) Depth(c dawport.Capability) dawport.Depth       { return depthOf(c) }
func (d declaration) Explain(c dawport.Capability, r dawport.Reason) string {
	return (*Adapter)(nil).Explain(c, r)
}

// The host's existing wording for a REAPER that is not connected or not answering (bindings_navigation.go, bridge.ErrUnavailable
// and bridge.ErrNoAnswer), as whole sentences.
const (
	messageStandalone = "REAPER is not connected to this app. Open this app from the Narration Utils action in REAPER."
	messageNotRunning = "REAPER is not answering. Check that REAPER is open and the Narration Utils action is running, then try again."
)

// Adapter is REAPER over one session's file bridge. It holds that session's bridge client and one of each of today's bridge
// consumers over it, so every role shares the client's one fan-out and command counter.
type Adapter struct {
	heartbeat *daw.Reachability
	roles     map[dawport.Capability]any
}

var (
	_ dawport.Adapter   = (*Adapter)(nil)
	_ dawport.Explainer = (*Adapter)(nil)
	_ dawport.Describer = (*Adapter)(nil)
)

// Factory is the registry's REAPER factory: it opens env.SessionDir's bridge and wraps it. A launch with no session directory has
// no REAPER to talk to, and gets ErrNoSession.
func Factory(env dawport.Env) (dawport.Adapter, error) {
	if env.SessionDir == "" {
		return nil, ErrNoSession
	}
	client, err := bridge.New(env.SessionDir)
	if err != nil {
		return nil, err
	}
	if env.Log != nil {
		client.SetLog(env.Log)
	}
	return New(client, env.Allowed)
}

// New wraps client, which must not be nil (ErrNoSession). allowed is the resolver's Allowed, asked through Gate before each of
// bridge.Actions' commands is sent; nil refuses them all as experimental and switched off.
//
// Each wrapped consumer subscribes to client here, once. Use one adapter per client.
func New(client *bridge.Client, allowed func(dawport.Capability) error) (*Adapter, error) {
	if client == nil {
		return nil, ErrNoSession
	}
	navigator := bridge.NewNavigator(client)
	actions := bridge.NewActions(client, Gate(allowed))
	heartbeat := daw.NewReachability(client)
	commands := events{client: client}
	return &Adapter{
		heartbeat: heartbeat,
		roles: map[dawport.Capability]any{
			dawport.CapReview:          review{client: client},
			dawport.CapNavigate:        navigator,
			dawport.CapMarkers:         navigator,
			dawport.CapPickups:         pickupList{commands},
			dawport.CapLineIdentity:    lineStamper{commands},
			dawport.CapRenderConfig:    renderConfigurer{commands},
			dawport.CapCleanupTools:    cleanupLauncher{commands},
			dawport.CapRetakeLanes:     retakeLanePicker{commands},
			dawport.CapProjectState:    projectStateReader{commands},
			dawport.CapTakeCreate:      takeCreator{commands},
			dawport.CapHeartbeat:       heartbeat,
			dawport.CapProjectRead:     ProjectReader{},
			dawport.CapTrackState:      actions,
			dawport.CapTrackSelect:     actions,
			dawport.CapRecord:          actions,
			dawport.CapPunch:           puncher{actions, allowed},
			dawport.CapRegions:         actions,
			dawport.CapTakes:           takeSelector{actions, allowed},
			dawport.CapFXChains:        actions,
			dawport.CapSilenceTrim:     bridge.NewCleanupClient(client),
			dawport.CapItemGain:        bridge.NewLevelMatchClient(client),
			dawport.CapRenderWithFX:    fxRenderer{commands},
			dawport.CapMasterChainRead: masterChainReader{actions},
		},
	}, nil
}

func (a *Adapter) Kind() dawport.Kind { return dawport.KindREAPER }

// Declares returns a copy of the declaration, the same on every call.
func (a *Adapter) Declares() map[dawport.Capability]dawport.Level { return maps.Clone(declares) }

// Role is c's role for every capability REAPER declares, and nil for a name the port does not know.
func (a *Adapter) Role(c dawport.Capability) any {
	if declares[c] < dawport.Experimental {
		return nil
	}
	return a.roles[c]
}

// Depth is what REAPER declares about how a capability acts, the same with REAPER up or down.
func (a *Adapter) Depth(c dawport.Capability) dawport.Depth { return depthOf(c) }

// depthOf: a roll keeps the earlier audio as a take (ADR 0860 point 1), so punch is not destructive, and REAPER makes it
// itself. That rests on the overlapping-recording setting the roll command reads and refuses without; the QA pass (#1495)
// confirms that setting keeps the audio.
func depthOf(c dawport.Capability) dawport.Depth {
	if c == dawport.CapPunch {
		return dawport.Depth{Mode: dawport.ModeNative}
	}
	return dawport.Depth{}
}

// Runtime is the resolver's view of this session: always a bridge, answering while the heartbeat is fresh.
func (a *Adapter) Runtime() dawport.Runtime {
	return dawport.Runtime{Bridge: true, Reachable: a.heartbeat.Reachable()}
}

// Explain words a REAPER that is not connected or not answering as the host already does; every other refusal takes the
// resolver's wording.
func (a *Adapter) Explain(_ dawport.Capability, r dawport.Reason) string {
	switch r {
	case dawport.ReasonStandalone:
		return messageStandalone
	case dawport.ReasonNotRunning:
		return messageNotRunning
	default:
		return ""
	}
}

// ProjectReader reads a saved .rpp with REAPER closed. It needs no live session (project_read's Needs is NeedsNothing,
// capability.go), so it is exported: a caller that only wants the offline read (tracks.go and its neighbours) may use it directly, the same value New wires in as the resolver's role for CapProjectRead.
type ProjectReader struct{}

func (ProjectReader) ReadProject(path string) (dawport.Project, error) { return tracks.Parse(path) }

// takeSelector is the takes role: bridge.Actions' SetActiveTake as it is, and HideTakes answering a dawport.Result (ADR 0810),
// which bridge cannot import.
type takeSelector struct {
	*bridge.Actions
	allowed func(dawport.Capability) error
}

var _ dawport.TakeSelector = takeSelector{}

// HideTakes mutes every take of itemGUID but keepTakeGUID (bridge's hide_takes). It asks allowed itself first, so a refusal is
// the capability's own sentence rather than bridge's ErrExperimentalOff.
func (t takeSelector) HideTakes(ctx context.Context, itemGUID, keepTakeGUID string) (dawport.Result, error) {
	if t.allowed != nil {
		if refused, ok := dawport.RefusedFrom(t.allowed(dawport.CapTakes)); ok {
			return refused, nil
		}
	}
	got, err := t.Actions.HideTakes(ctx, itemGUID, keepTakeGUID)
	var stale *bridge.StaleError
	switch {
	case errors.As(err, &stale) && stale.Reason == "take":
		return dawport.RefusedStale("That item no longer has the take you kept. Read the project again."), nil
	case errors.As(err, &stale):
		return dawport.RefusedStale("That passage's item is no longer in the REAPER project. Read the project again."), nil
	case errors.Is(err, bridge.ErrRecording):
		return dawport.Refused("REAPER is recording. Stop recording first."), nil
	case errors.Is(err, bridge.ErrExperimentalOff):
		return dawport.Refused(err.Error()), nil
	case err != nil:
		return dawport.Result{}, err
	}
	return dawport.OK(hiddenMessage(got), got.Changed), nil
}

const messageRollStopped = "REAPER stopped recording for the roll but did not record again. The earlier audio is kept; press record to go on."

// puncher is the punch role: bridge.Actions' PunchTo and PlayPosition as they are, and Roll answering a dawport.Result
// (ADR 0810), which bridge cannot import.
type puncher struct {
	*bridge.Actions
	allowed func(dawport.Capability) error
}

var _ dawport.Puncher = puncher{}

// Roll records again from at on trackGUID while the app's recording runs there (bridge's roll). It asks allowed itself first,
// so a refusal is the capability's own sentence rather than bridge's ErrExperimentalOff.
func (p puncher) Roll(ctx context.Context, trackGUID string, at float64) (dawport.Result, error) {
	if p.allowed != nil {
		if refused, ok := dawport.RefusedFrom(p.allowed(dawport.CapPunch)); ok {
			return refused, nil
		}
	}
	got, err := p.Actions.Roll(ctx, trackGUID, at)
	var stale *bridge.TrackStaleError
	var refusal *bridge.RefusalError
	switch {
	case errors.As(err, &stale):
		return dawport.RefusedStale("That track is no longer in the REAPER project. Read the project again."), nil
	case errors.Is(err, bridge.ErrNotOurRecording):
		return dawport.Refused("REAPER is not recording anything this app started on that track, so there is nothing to roll."), nil
	case errors.Is(err, bridge.ErrBadRoll):
		return dawport.Refused("The roll time is not a usable number of seconds."), nil
	case errors.As(err, &refusal):
		return dawport.Refused(refusal.Sentence), nil
	case errors.Is(err, bridge.ErrExperimentalOff):
		return dawport.Refused(err.Error()), nil
	case errors.Is(err, bridge.ErrRollStopped):
		// Not a refusal: the recording has ended. Nothing was deleted and the roll added no undo point.
		return dawport.Result{Changed: true, Message: messageRollStopped}, nil
	case err != nil:
		return dawport.Result{}, err
	}
	message := fmt.Sprintf("Rolled again from %.1f seconds. The earlier audio is kept as a take.", got.At)
	return dawport.OK(message, true).WithUndoSteps(got.UndoPoints), nil
}

func hiddenMessage(got bridge.TakesHidden) string {
	switch {
	case got.Hidden == 1:
		return "Muted 1 other take in REAPER. It is still in the project."
	case got.Hidden > 1:
		return fmt.Sprintf("Muted %d other takes in REAPER. They are still in the project.", got.Hidden)
	case got.Changed:
		return "No other take to mute in REAPER; the kept take is the active one."
	default:
		return "No other take to mute in REAPER."
	}
}
