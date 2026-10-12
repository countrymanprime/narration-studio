package dawport

import (
	"reflect"

	"github.com/countrymanprime/narration-utils/shell/internal/port"
)

// Capability is one thing an engine can do for the host, named as it appears on the wire and in the settings key
// DAW.capability.<name>. Each has exactly one role interface (Spec.Role).
type Capability string

const (
	CapReview       Capability = "review"
	CapNavigate     Capability = "navigate"
	CapMarkers      Capability = "markers"
	CapPickups      Capability = "pickups"
	CapLineIdentity Capability = "line_identity"
	CapRenderConfig Capability = "render_config"
	CapCleanupTools Capability = "cleanup_tools"
	CapRetakeLanes  Capability = "retake_lanes"
	CapProjectState Capability = "project_state"
	CapTakeCreate   Capability = "take_create"
	CapHeartbeat    Capability = "heartbeat"
	CapProjectRead  Capability = "project_read"
	CapTrackState   Capability = "track_state"
	CapTrackSelect  Capability = "track_select"
	CapRecord       Capability = "record"
	CapPunch        Capability = "punch"
	CapRegions      Capability = "regions"
	CapTakes        Capability = "takes"
	CapFXChains     Capability = "fx_chains"
	CapItemGain     Capability = "item_gain"
	// CapRenderWithFX is the mastering port's DAW row (ADR 0306), declared but not yet built. It is the one
	// capability that makes the engine render, so each use needs the narrator's approval in the UI (threat model row 5o).
	CapRenderWithFX    Capability = "render_with_fx"
	CapMasterChainRead Capability = "master_chain_read"
	// CapMacroRender is the mastering port's Audacity row (ADR 0306, ADR 0460): applies the
	// narrator's chosen effect macro, then exports. Like render_with_fx it makes the engine act on the narrator's audio, so each
	// use needs their approval (threat model row 14f).
	CapMacroRender Capability = "macro_render"
	// The edit rows (SND-3): cutting words with their audio, an effect on words, stacking retries as takes, and cloning the audio
	// around an edit so it can be put back. Each engine declares them NotYetAvailable until its command lands.
	CapCutRange   Capability = "cut_range"
	CapFXRange    Capability = "fx_range"
	CapStackTakes Capability = "stack_takes"
	CapBackups    Capability = "backups"
)

// Needs is what a capability needs from the running engine before it can be used.
type Needs int

const (
	// NeedsRunning: a bridge whose engine is answering (almost everything).
	NeedsRunning Needs = iota
	// NeedsBridge: a bridge, answering or not. Only the heartbeat, which is what says whether the engine is answering.
	NeedsBridge
	// NeedsNothing: works offline, with the engine closed or absent (reading a saved project file).
	NeedsNothing
)

// Spec is the static description of a capability: its narrator label, what it needs at runtime, the role interface an adapter
// returns for it, and the capabilities it needs on every engine. An engine that needs more for a capability says so as a Requirer.
type Spec struct {
	Capability Capability
	Label      string
	Needs      Needs
	Role       reflect.Type
	// Requires is the capabilities this one cannot be used without, on every engine. No row has one today: Audacity's need of
	// backups is its own declaration, since REAPER and the built-in recorder keep takes themselves.
	Requires []Capability
}

// specs is the catalog, in the order the UI lists capabilities. Adding a capability is a row here, a role interface in roles.go and
// a conformance case; it is a normal change under ADR 0300.
var specs = []Spec{
	{CapReview, "Compare the recording with the manuscript", NeedsRunning, reflect.TypeFor[ReviewSession](), nil},
	{CapNavigate, "Go to and loop findings", NeedsRunning, reflect.TypeFor[Navigator](), nil},
	{CapMarkers, "Add markers", NeedsRunning, reflect.TypeFor[MarkerWriter](), nil},
	{CapPickups, "Pickup list", NeedsRunning, reflect.TypeFor[PickupList](), nil},
	{CapLineIdentity, "Line identity", NeedsRunning, reflect.TypeFor[LineStamper](), nil},
	{CapRenderConfig, "Chapter render setup", NeedsRunning, reflect.TypeFor[RenderConfigurer](), nil},
	{CapCleanupTools, "Cleanup tools", NeedsRunning, reflect.TypeFor[CleanupLauncher](), nil},
	{CapRetakeLanes, "Retake lanes", NeedsRunning, reflect.TypeFor[RetakeLanePicker](), nil},
	{CapProjectState, "Project change check", NeedsRunning, reflect.TypeFor[ProjectStateReader](), nil},
	{CapTakeCreate, "Create takes", NeedsRunning, reflect.TypeFor[TakeCreator](), nil},
	{CapHeartbeat, "Connection status", NeedsBridge, reflect.TypeFor[Heartbeat](), nil},
	{CapProjectRead, "Read the saved project", NeedsNothing, reflect.TypeFor[ProjectReader](), nil},
	{CapTrackState, "Read track arm state", NeedsRunning, reflect.TypeFor[TrackStateReader](), nil},
	{CapTrackSelect, "Select a track in REAPER", NeedsRunning, reflect.TypeFor[TrackSelector](), nil},
	{CapRecord, "Record", NeedsRunning, reflect.TypeFor[Recorder](), nil},
	{CapPunch, "Punch and roll", NeedsRunning, reflect.TypeFor[Puncher](), nil},
	{CapRegions, "Chapter regions", NeedsRunning, reflect.TypeFor[RegionWriter](), nil},
	{CapTakes, "Choose the active take", NeedsRunning, reflect.TypeFor[TakeSelector](), nil},
	{CapFXChains, "FX chains", NeedsRunning, reflect.TypeFor[FXManager](), nil},
	{CapItemGain, "Level matching", NeedsRunning, reflect.TypeFor[GainAdjuster](), nil},
	{CapRenderWithFX, "Mastering with the project's FX", NeedsRunning, reflect.TypeFor[FXRenderer](), nil},
	{CapMasterChainRead, "Master and track FX listing", NeedsRunning, reflect.TypeFor[MasterChainReader](), nil},
	{CapMacroRender, "Mastering with an effect macro", NeedsRunning, reflect.TypeFor[MacroRenderer](), nil},
	{CapCutRange, "Cut words and audio", NeedsRunning, reflect.TypeFor[RangeCutter](), nil},
	{CapFXRange, "Add an effect to words", NeedsRunning, reflect.TypeFor[RangeFXApplier](), nil},
	{CapStackTakes, "Stack takes", NeedsRunning, reflect.TypeFor[TakeStacker](), nil},
	{CapBackups, "Audio backups", NeedsRunning, reflect.TypeFor[BackupKeeper](), nil},
}

// Capabilities returns every capability's spec, in catalog order. The slice is the caller's own.
func Capabilities() []Spec {
	return append([]Spec(nil), specs...)
}

// SpecOf returns c's spec, or false for a name this build does not know.
func SpecOf(c Capability) (Spec, bool) {
	for _, s := range specs {
		if s.Capability == c {
			return s, true
		}
	}
	return Spec{}, false
}

// Mode is how a change that needs several edits is made. See port.Mode for each value.
type Mode = port.Mode

// The modes an adapter may declare, aliased from port.
const (
	ModeNative = port.ModeNative
	ModeApp    = port.ModeApp
	ModeSteps  = port.ModeSteps
)

// Depth is what an adapter declares about how a capability acts, beyond its Level: whether using it destroys audio that
// cannot be brought back, and how a multi-edit change is made. Like Declares it is static. The resolver copies it into every
// Support for the capability, available or not.
type Depth struct {
	Destructive bool
	Mode        Mode
}

// Describer is an adapter that declares a Depth for some capabilities. An adapter that is not one, and a capability it
// answers with the zero Depth for, declare neither field.
type Describer interface {
	Depth(c Capability) Depth
}

// Requirer is an adapter some of whose capabilities need another capability of its own to be usable, such as Audacity's takes,
// which exist only while its backups are on. Like Declares it is static. The resolver adds the answer to the catalogue's
// Spec.Requires and checks each required capability as it checks the capability itself:
//   - a capability the adapter declares Destructive (Describer) is usable without its requirement and stays destructive; with the
//     requirement available it is not destructive (a roll that the backups make safe);
//   - any other capability is refused while a requirement is, with the requirement's reason, so the narrator is told what to change.
type Requirer interface {
	Requires(c Capability) []Capability
}

// RequirementExplainer is a Requirer that words the refusal of c for its requirement required, refused with reason r: "Stacking
// takes needs Audacity backups. Turn on Audio backups in Settings." An empty answer falls back to the resolver's wording, which
// names both capabilities and gives the requirement's own sentence.
type RequirementExplainer interface {
	ExplainRequirement(c, required Capability, r Reason) string
}
