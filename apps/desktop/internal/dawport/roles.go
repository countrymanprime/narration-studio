package dawport

import (
	"context"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

// The values the roles exchange. They are aliases of the types the REAPER bridge and the .rpp reader already use, so the REAPER
// adapter wraps today's code without converting anything and a consumer moved onto a role keeps its types (migrating a consumer changes
// constructors, not bodies). A caller names them through this package; when a second engine needs a neutral shape, the alias
// becomes a type here and no caller changes.
type (
	Event        = bridge.Event
	Subscription = bridge.Subscription

	Target       = bridge.Target
	Navigated    = bridge.Navigated
	LoopStarted  = bridge.LoopStarted
	LoopStopped  = bridge.LoopStopped
	Marker       = bridge.Marker
	MarkerResult = bridge.MarkerResult

	TrackState    = bridge.TrackState
	TrackItem     = bridge.TrackItem
	SelectedTrack = bridge.SelectedTrack
	Armed         = bridge.Armed
	RecordStarted = bridge.RecordStarted
	RecordOptions = bridge.RecordOptions
	StartRule     = bridge.StartRule
	RecordStopped = bridge.RecordStopped
	RecordEnded   = bridge.RecordEnded
	PlayPosition  = bridge.PlayPosition

	Region         = bridge.Region
	RegionsCreated = bridge.RegionsCreated
	ActiveTakeSet  = bridge.ActiveTakeSet

	FXChains       = bridge.FXChains
	FXChainApplied = bridge.FXChainApplied

	GainCandidate   = bridge.GainCandidate
	ApplyGainResult = bridge.ApplyGainResult

	FilePreview        = bridge.FilePreview
	FilePreviewStarted = bridge.FilePreviewStarted
	FilePreviewStopped = bridge.FilePreviewStopped
	FileRevealed       = bridge.FileRevealed

	Project = tracks.Project

	Transport = daw.Transport
)

// The mastering port's DAW row (ADR 0306) exchanges values the bridge has no command for yet, so they are dawport's own types rather
// than aliases: the REAPER phase that builds render_with_fx and master_chain_read gives the bridge matching shapes.

// MacroRender asks the engine to apply one named effect macro to the narrator's audio and export the result (the mastering port's
// Audacity row, ADR 0306, ADR 0460). Unlike FXRender it names no region and no per-track chain: Audacity's macros are opaque, one
// named chain the narrator built in its own Macro Manager, not a list of plugins this app can read back.
type MacroRender struct {
	// Source is the WAV to master, imported into the engine before the macro runs.
	Source string
	// Macro is the exact name of the narrator's chosen macro, as their engine's macro manager lists it.
	Macro string
	// OutputPath is where the engine exports the result: a path inside a folder the host made for this run, which does not exist
	// yet (the adapter never lets the engine overwrite a file).
	OutputPath string
	// Approval is the narrator's yes for this one render, from the UI's confirm naming the macro. The host sends only an approval
	// it was just given; an adapter refuses a request without one.
	Approval string
}

// MacroRendered is what a macro render wrote.
type MacroRendered struct {
	// Path is the file the engine exported, OutputPath unchanged on success.
	Path string
}

// FXRender asks the engine to render regions through the project's track and master FX, as a render from the engine's own
// dialog would, into a folder the host chose.
type FXRender struct {
	// Regions names the regions to render, one file each, by the region names the host wrote (CreateRegions).
	Regions []string
	// OutputFolder is where the files go: a folder the host made inside the app's project folder for this run, empty, and never
	// the recording's own folder. The engine writes nothing outside it.
	OutputFolder string
	// Approval is the narrator's yes for this one render, from the UI's confirm naming the regions, the chain and the folder. The
	// host sends only an approval it was just given; an adapter refuses a request without one.
	Approval string
}

// FXRendered is what a render wrote: one file per region, in the order asked.
type FXRendered struct {
	Files []FXRenderedFile
}

// FXRenderedFile is one region's rendered file, a path inside FXRender.OutputFolder.
type FXRenderedFile struct {
	Region string
	Path   string
}

// MasterChain is the FX a render runs, in chain order: every track's FX, then the master track's.
type MasterChain struct {
	Tracks []TrackFX
	Master []FXSlot
}

// TrackFX is one track's FX chain.
type TrackFX struct {
	TrackGUID string
	Name      string
	FX        []FXSlot
}

// FXSlot is one plugin in a chain, as the engine names it, and whether it is switched on.
type FXSlot struct {
	Name    string
	Enabled bool
}

// Trace ties a request to the host's run log (runlog.Run's ID and Level), for the commands whose script logs under the host's run.
type Trace struct{ RunID, Level string }

// Events is how a role that answers later reports back: consumers subscribe for the tags they own, and Dispatch delivers what the
// engine has reported since the last call, in order, once. The event vocabulary is part of the contract (ADR 0143): another engine
// reports the same tags and fields.
type Events interface {
	Subscribe(sub Subscription) (unsubscribe func())
	Dispatch() error
}

// MarkerColors are the colours, as RRGGBB hex, the host resolves from the layered settings and passes with an export, so the DAW
// never reads the settings files itself.
type MarkerColors struct{ Misread, Skipped, Extra string }

// Asynchronous roles: each request method only asks, returns an error only when the request could not be handed to the engine, and
// the answer arrives through Events tagged with runID. They mirror the commands their services send today, one method per command.

// ReviewSession is the review workflow's role (ADR 0143's original dawadapter.Review): prepare, inspect, navigate to and export
// findings.
//
// Take management (take creation, pickups, line identity, render setup) is deliberately not here: it has no Audacity equivalent
// (docs/architecture/daw-integration.md, "Audacity boundary"), so those services take their own roles instead.
type ReviewSession interface {
	Events
	// PrepareReview asks the engine for the audio the narrator selected, to compare against the manuscript (COMPARE_PREPARED).
	// projectFolder is the app's project folder, where the manuscript is read and the diffs are written, which need not be the
	// engine's own project file's folder; empty means the engine project file's folder.
	PrepareReview(runID, projectFolder string) error
	// InspectFindings asks the engine which of the findings in findingsPath it already carries as a marker or label, which is how
	// a finding that was reviewed earlier is recognised (COMPARE_MARKER per finding, then COMPARE_INSPECTED).
	InspectFindings(runID, findingsPath string) error
	// NavigateToFinding moves the engine's cursor or selection to one finding of the run.
	NavigateToFinding(runID, findingID string) error
	// ExportFindings writes the run's pending findings into the engine as markers or labels, skipping any it already has
	// (COMPARE_EXPORT_MARKER per finding, then COMPARE_EXPORTED).
	ExportFindings(runID, findingsPath string, colors MarkerColors) error
}

// PickupList imports, exports, walks, resolves, reopens and lists the pickup list (PICKUPS_* and PICKUP_* events).
type PickupList interface {
	Events
	ImportPickups(runID, payloadPath string) error
	ExportPickups(runID, outputPath string) error
	NextPickup(runID string) error
	ResolvePickup(runID string, position float64) error
	// ReopenPickup puts the resolved pickup nearest position back to open (PICKUP_REOPENED).
	ReopenPickup(runID string, position float64) error
	// ListPickupMarkers writes every pickup marker, open or done, to outputPath (PICKUP_MARKERS_LISTED).
	ListPickupMarkers(runID, outputPath string) error
	CountPickups(runID string) error
}

// LineStamper writes the manuscript's line identity onto recorded items and reads it back (LINES_* events).
type LineStamper interface {
	Events
	StampLines(runID, payloadPath string, overwrite bool) error
	ReadLineIDs(runID, outputPath string) error
}

// RenderConfigurer sets the engine's render settings for chapter files (RENDER_CONFIGURED).
type RenderConfigurer interface {
	Events
	ConfigureChapterRender(runID, outputFolder string) error
}

// CleanupLauncher opens one of the engine's own allow-listed cleanup dialogs on the selected items (CLEANUP_LAUNCHED).
type CleanupLauncher interface {
	Events
	LaunchCleanupTool(runID, toolKey string, trace Trace) error
}

// RetakeLanePicker plays one retake on a fixed-lane track (RETAKE_LANE_PICKED).
type RetakeLanePicker interface {
	Events
	PickRetakeLane(runID, lineID, itemGUID string, trace Trace) error
}

// ProjectStateReader asks for the live change count and the current project's saved file (PROJECT_STATE).
type ProjectStateReader interface {
	Events
	RequestProjectState(runID string) error
}

// TakeCreator creates a take from a request payload file (TAKE_CREATED or TAKE_STALE).
type TakeCreator interface {
	Events
	CreateTake(runID, payloadPath string) error
}

// FXRenderer renders regions through the project's own FX into a folder the host chose (the mastering port's DAW row, ADR 0306).
// It is the one role that makes the engine render: each request carries the narrator's approval and runs only on their action.
// The answer arrives through Events tagged with runID (a FXRendered).
type FXRenderer interface {
	Events
	RenderWithFX(runID string, render FXRender) error
}

// Synchronous roles: a call returns once the engine has answered (bridge.Actions, bridge.Navigator), so it must never be made from a
// Subscription's Handle. The method sets are exactly the concrete types' so the REAPER adapter hands those types out as they are.

// Navigator moves the engine's cursor to a place, and loops or stops looping it.
type Navigator interface {
	Navigate(ctx context.Context, target Target) (Navigated, error)
	Loop(ctx context.Context, target Target) (LoopStarted, error)
	StopLoop(ctx context.Context) (LoopStopped, error)
}

// MarkerWriter adds one marker at a place.
type MarkerWriter interface {
	AddMarker(ctx context.Context, target Target, marker Marker) (MarkerResult, error)
}

// Heartbeat is what the host knows of the engine without asking it: whether it is answering, which project it has open, that
// project's change count, and whether the engine is playing or recording (ADR 0305). It reads; a request that
// waits for an answer is ProjectStateReader. Transport's ok is false when the engine is not answering or does not report it.
type Heartbeat interface {
	Reachable() bool
	CurrentProject() (path string, unsaved bool)
	Matches(linkedPath string) bool
	ChangeCount() (count int, ok bool)
	Transport() (transport Transport, ok bool)
}

// ProjectReader reads a saved project file offline, with the engine closed.
type ProjectReader interface {
	ReadProject(path string) (Project, error)
}

// TrackStateReader reads one track's arm and record state.
type TrackStateReader interface {
	ChapterTrackState(ctx context.Context, trackGUID string) (TrackState, error)
}

// TrackSelector selects one track in REAPER ("Select in REAPER"), deselecting
// every other one. It changes nothing else.
type TrackSelector interface {
	SelectTrack(ctx context.Context, trackGUID string) (SelectedTrack, error)
}

// FilePreviewer plays a stretch of a file on disk through the engine's own preview, and stops it. It never inserts the file,
// makes an undo point or moves the project's transport: the project is unchanged. The path is one the narrator picked; a path
// that is not an absolute local path to an audio file is refused before anything is sent.
type FilePreviewer interface {
	PreviewFileRange(ctx context.Context, preview FilePreview) (FilePreviewStarted, error)
	StopFilePreview(ctx context.Context) (FilePreviewStopped, error)
}

// FileRevealer shows a file on disk in the engine's own file browser without importing or playing it. The project is unchanged.
type FileRevealer interface {
	RevealFile(ctx context.Context, path string) (FileRevealed, error)
}

// Recorder arms a track, starts and stops recording, and reports a recording the narrator stopped in the engine.
type Recorder interface {
	ArmOnly(ctx context.Context, trackGUID string) (Armed, error)
	RecordStart(ctx context.Context, trackGUID string, opts RecordOptions) (RecordStarted, error)
	RecordStop(ctx context.Context) (RecordStopped, error)
	OnRecordEnded(handler func(RecordEnded))
}

// Puncher punches in at a word, reads the play position, and rolls again while recording.
type Puncher interface {
	PunchTo(ctx context.Context, wordTime, preRoll float64) (float64, error)
	PlayPosition(ctx context.Context) (PlayPosition, error)
	// Roll stops the recording the app started on trackGUID and records again from at (project seconds), keeping the
	// earlier audio (ADR 0860 point 1). An engine where that replaces audio declares punch destructive and the page asks
	// first; the call itself never asks. A recording the app did not start, or a setting that would not keep the
	// earlier audio, is Refused in a whole sentence; a track that is gone is RefusedStale.
	Roll(ctx context.Context, trackGUID string, at float64) (Result, error)
}

// RegionWriter creates (or updates) chapter regions.
type RegionWriter interface {
	CreateRegions(ctx context.Context, rows []Region, colour string, update bool) (RegionsCreated, error)
}

// TakeSelector makes one take of an item the active one, and hides (mutes, never deletes) the item's other takes.
type TakeSelector interface {
	SetActiveTake(ctx context.Context, itemGUID, takeGUID string) (ActiveTakeSet, error)
	// HideTakes mutes every take of itemGUID but keepTakeGUID and makes that one active, as one undo point. The Result is
	// changed when a take was hidden; an item or take that is gone is RefusedStale, and nothing is ever deleted.
	HideTakes(ctx context.Context, itemGUID, keepTakeGUID string) (Result, error)
}

// TakeSplitter cuts a take that reads its line twice into two takes of one item at a project time, the second read as its own
// take, in one undo step of the engine's own. Nothing is deleted. It is a second role of the takes capability: an engine's takes
// role is also a TakeSplitter when the engine can split, and the takes capability's level, toggle and refusals cover it. An item
// or take that is gone, or a cut no longer inside the item, is RefusedStale; an engine that cannot cut its own take answers a
// refusal in a whole sentence.
type TakeSplitter interface {
	SplitTake(ctx context.Context, itemGUID, takeGUID string, at float64) (Result, error)
}

// FXManager lists FX chains and applies one to a track.
type FXManager interface {
	ListFXChains(ctx context.Context) (FXChains, error)
	ApplyFXChain(ctx context.Context, track, chain string) (FXChainApplied, error)
}

// GainAdjuster applies per-item gain to match levels.
type GainAdjuster interface {
	Apply(ctx context.Context, candidates []GainCandidate) (ApplyGainResult, error)
}

// MasterChainReader lists the FX a render with FX would run, so the UI can show the narrator the chain before they approve it. It
// reads and changes nothing.
type MasterChainReader interface {
	ReadMasterChain(ctx context.Context) (MasterChain, error)
}

// MacroRenderer applies one named effect macro and exports the result (the mastering port's Audacity row, ADR 0306, ADR 0460). It
// is synchronous, unlike FXRenderer: the engine it drives answers a scripting command directly, with no separate event log to poll.
// It is the one role that makes the engine render, so each call carries the narrator's approval and runs only on their action.
type MacroRenderer interface {
	RenderWithMacro(ctx context.Context, request MacroRender) (MacroRendered, error)
}

// The edit roles (SND-3) change the audio of the project the engine has open. Their requests are dawport's own values: no bridge
// command takes them yet, and the command slices adapt them to their arguments. A request names items, takes and times as the app
// last read them, never a file. Each method answers a Result (ADR 0810): a refusal (an item that changed since the app read it, an
// engine that cannot make the edit) is a refused Result that changed nothing; the error is only a call that never reached the engine.

// CutMode is what happens to the time a cut leaves behind.
type CutMode string

const (
	// CutClose moves the audio after the cut up to close the gap.
	CutClose CutMode = "close"
	// CutGap keeps the length, filling the cut with room tone.
	CutGap CutMode = "gap"
)

// RangeRequest is a stretch of words in a chapter's recording: the audio from Start to End seconds (snapped to a zero crossing) of
// the item the words sit in.
type RangeRequest struct {
	ChapterID string
	// ItemKey is the passage the words sit in, or with none the chapter's track.
	ItemKey string
	// ItemGUID is the item's id as the app last read it; the engine refuses a request whose id no longer matches.
	ItemGUID string
	Start    float64
	End      float64
	// Words is how many words the range holds, for the undo point's name.
	Words int
}

// DeleteRangeRequest cuts a range's words and audio.
type DeleteRangeRequest struct {
	RangeRequest
	Mode   CutMode
	FadeMs int
}

// FXRangeRequest puts one of the engine's own saved chains, effects or macros on a range. ChainID and ChainName are as the engine
// listed them; the host never sends a chain the engine did not offer.
type FXRangeRequest struct {
	RangeRequest
	ChainID   string
	ChainName string
	FadeMs    int
}

// StackMove is one take a stack (or unstack) moves: where it began and where it begins afterwards, seconds into the chapter's
// recording, and its length.
type StackMove struct {
	TakeID string
	From   float64
	To     float64
	Len    float64
}

// StackGroup is the takes of one passage a stack moves onto the base read's spot. ItemGUID is the item as the app last read it; the
// engine refuses a request whose id no longer matches.
type StackGroup struct {
	PassageID string
	ItemGUID  string
	Base      string
	Moves     []StackMove
}

// StackRequest stacks (or unstacks) the retries of a chapter's passages. Shift is how far the audio that follows moves, summed over
// the groups (negative: earlier).
type StackRequest struct {
	ChapterID string
	Groups    []StackGroup
	Shift     float64
}

// BackupRequest asks the engine to clone the audio from Start to End seconds of a chapter's track before it is changed. GUID is the
// track or item the audio sits in, as the app last read it. Label says what the backup is for ("Roll at ¶ 3"), for the narrator's
// list; empty is no label.
type BackupRequest struct {
	GUID      string
	ChapterID string
	Start     float64
	End       float64
	Label     string
}

// RangeCutter cuts words and their audio: split the item at both ends and take the middle piece out. One undo point where the engine
// can make it as one action; the Result says how many it added, and the Steps it performed when it had to make it in several.
type RangeCutter interface {
	DeleteRange(ctx context.Context, request DeleteRangeRequest) (Result, error)
}

// RangeFXApplier puts one of the engine's own saved chains on the middle piece of a range, and takes it off again (the piece is
// joined back). The same refusals and undo rule as RangeCutter.
type RangeFXApplier interface {
	ApplyFXToRange(ctx context.Context, request FXRangeRequest) (Result, error)
	RemoveFXFromRange(ctx context.Context, itemGUID, chainName string) (Result, error)
}

// TakeStacker puts the later reads of a passage on the first read's spot as takes, and moves them back. Refused when an item changed
// since the app read it, and where the engine cannot stack.
type TakeStacker interface {
	StackTakes(ctx context.Context, request StackRequest) (Result, error)
	UnstackTakes(ctx context.Context, request StackRequest) (Result, error)
}

// BackupKeeper clones the audio around an edit before it is made, so it can be put back, for an engine that keeps no takes of its
// own. RestoreBackup is refused when the engine has no backup with that id.
type BackupKeeper interface {
	BackupAround(ctx context.Context, request BackupRequest) (Result, error)
	RestoreBackup(ctx context.Context, backupGUID string) (Result, error)
}
