package dawporttest

import (
	"context"
	"errors"
	"maps"
	"sync"
	"time"

	"desktop/internal/dawport"
)

// ErrClosed is every fake role call's answer once the fake is closed: the transport is gone, and the call must fail rather than
// hang or panic.
var ErrClosed = errors.New("dawporttest: the fake's transport is closed") // +checklocksignore: an error value, returned under the lock by chance

// Fake is an in-memory adapter with a role for every capability. It declares what its caller says, hands out a role for each
// capability declared Experimental or Supported, records every role call as "<capability>.<Method>", and fails every call with
// ErrClosed once closed. Tests of the resolver and of consumers use it in place of an engine, and the suite runs against it so it
// is exercised before any real adapter exists.
type Fake struct {
	kind   dawport.Kind
	levels map[dawport.Capability]dawport.Level
	roles  map[dawport.Capability]any

	mu sync.Mutex // guards everything below
	// +checklocks:mu
	closed bool
	// +checklocks:mu
	calls []string
}

var _ dawport.Adapter = (*Fake)(nil)

// Levels declares every capability at level, for a fake that has (or lacks) everything.
func Levels(level dawport.Level) map[dawport.Capability]dawport.Level {
	all := map[dawport.Capability]dawport.Level{}
	for _, spec := range dawport.Capabilities() {
		all[spec.Capability] = level
	}
	return all
}

// NewFake is a fake of kind declaring levels (copied; a capability left out is Unsupported).
func NewFake(kind dawport.Kind, levels map[dawport.Capability]dawport.Level) *Fake {
	f := &Fake{kind: kind, levels: maps.Clone(levels)}
	if f.levels == nil {
		f.levels = map[dawport.Capability]dawport.Level{}
	}
	r := func(c dawport.Capability) role { return role{f: f, c: c} }
	f.roles = map[dawport.Capability]any{
		dawport.CapReview:          reviewRole{r(dawport.CapReview)},
		dawport.CapNavigate:        navigateRole{r(dawport.CapNavigate)},
		dawport.CapMarkers:         markersRole{r(dawport.CapMarkers)},
		dawport.CapPickups:         pickupsRole{r(dawport.CapPickups)},
		dawport.CapLineIdentity:    lineIdentityRole{r(dawport.CapLineIdentity)},
		dawport.CapRenderConfig:    renderConfigRole{r(dawport.CapRenderConfig)},
		dawport.CapCleanupTools:    cleanupToolsRole{r(dawport.CapCleanupTools)},
		dawport.CapRetakeLanes:     retakeLanesRole{r(dawport.CapRetakeLanes)},
		dawport.CapProjectState:    projectStateRole{r(dawport.CapProjectState)},
		dawport.CapTakeCreate:      takeCreateRole{r(dawport.CapTakeCreate)},
		dawport.CapHeartbeat:       heartbeatRole{r(dawport.CapHeartbeat)},
		dawport.CapProjectRead:     projectReadRole{r(dawport.CapProjectRead)},
		dawport.CapTrackState:      trackStateRole{r(dawport.CapTrackState)},
		dawport.CapTrackSelect:     trackSelectRole{r(dawport.CapTrackSelect)},
		dawport.CapTrackCreate:     trackCreateRole{r(dawport.CapTrackCreate)},
		dawport.CapRecord:          recordRole{r(dawport.CapRecord)},
		dawport.CapPunch:           punchRole{r(dawport.CapPunch)},
		dawport.CapRegions:         regionsRole{r(dawport.CapRegions)},
		dawport.CapTakes:           takesRole{r(dawport.CapTakes)},
		dawport.CapFXChains:        fxChainsRole{r(dawport.CapFXChains)},
		dawport.CapItemGain:        itemGainRole{r(dawport.CapItemGain)},
		dawport.CapRenderWithFX:    renderWithFXRole{r(dawport.CapRenderWithFX)},
		dawport.CapMasterChainRead: masterChainReadRole{r(dawport.CapMasterChainRead)},
		dawport.CapMacroRender:     macroRenderRole{r(dawport.CapMacroRender)},
		dawport.CapCutRange:        cutRangeRole{r(dawport.CapCutRange)},
		dawport.CapFXRange:         fxRangeRole{r(dawport.CapFXRange)},
		dawport.CapStackTakes:      stackTakesRole{r(dawport.CapStackTakes)},
		dawport.CapBackups:         backupsRole{r(dawport.CapBackups)},
		dawport.CapFilePreview:     filePreviewRole{r(dawport.CapFilePreview)},
		dawport.CapFileReveal:      fileRevealRole{r(dawport.CapFileReveal)},
		dawport.CapRangeGain:       rangeGainRole{r(dawport.CapRangeGain)},
		dawport.CapClickRepair:     clickRepairRole{r(dawport.CapClickRepair)},
		dawport.CapUndoLast:        undoLastRole{r(dawport.CapUndoLast)},
		dawport.CapMonitorLevel:    monitorLevelRole{r(dawport.CapMonitorLevel)},
		dawport.CapFollowPosition:  placeRole{r(dawport.CapFollowPosition)},
		dawport.CapTransportSync:   transportSyncRole{r(dawport.CapTransportSync)},
		dawport.CapInputLevel:      inputLevelRole{r(dawport.CapInputLevel)},
		dawport.CapPunchPreroll:    prerollRole{r(dawport.CapPunchPreroll)},
		dawport.CapDawMeters:       meterRole{r(dawport.CapDawMeters)},
		dawport.CapReplaceRange:    replaceRangeRole{r(dawport.CapReplaceRange)},
	}
	return f
}

func (f *Fake) Kind() dawport.Kind { return f.kind }

// Declares returns a copy of the fake's declaration, the same on every call.
func (f *Fake) Declares() map[dawport.Capability]dawport.Level { return maps.Clone(f.levels) }

func (f *Fake) Role(c dawport.Capability) any {
	if f.levels[c] < dawport.Experimental {
		return nil
	}
	return f.roles[c]
}

// Close closes the fake's transport: every role call from now on fails with ErrClosed.
func (f *Fake) Close() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.closed = true
}

// Calls is every role call so far, in order, as "<capability>.<Method>".
func (f *Fake) Calls() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.calls...)
}

func (f *Fake) call(c dawport.Capability, method string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, string(c)+"."+method)
	if f.closed {
		return ErrClosed
	}
	return nil
}

// role is what every fake role shares: the fake it records on, its capability, and the Events half the asynchronous roles embed.
// A fake never has an event to deliver.
type role struct {
	f *Fake
	c dawport.Capability
}

func (r role) do(method string) error { return r.f.call(r.c, method) }

func (r role) Subscribe(dawport.Subscription) (unsubscribe func()) {
	_ = r.do("Subscribe")
	return func() {}
}

func (r role) Dispatch() error { return r.do("Dispatch") }

type reviewRole struct{ role }

func (r reviewRole) PrepareReview(string, string) error   { return r.do("PrepareReview") }
func (r reviewRole) InspectFindings(string, string) error { return r.do("InspectFindings") }
func (r reviewRole) NavigateToFinding(string, string) error {
	return r.do("NavigateToFinding")
}
func (r reviewRole) ExportFindings(string, string, dawport.MarkerColors) error {
	return r.do("ExportFindings")
}

type navigateRole struct{ role }

func (r navigateRole) Navigate(context.Context, dawport.Target) (dawport.Navigated, error) {
	return dawport.Navigated{}, r.do("Navigate")
}
func (r navigateRole) Loop(context.Context, dawport.Target) (dawport.LoopStarted, error) {
	return dawport.LoopStarted{}, r.do("Loop")
}
func (r navigateRole) StopLoop(context.Context) (dawport.LoopStopped, error) {
	return dawport.LoopStopped{}, r.do("StopLoop")
}

type markersRole struct{ role }

func (r markersRole) AddMarker(context.Context, dawport.Target, dawport.Marker) (dawport.MarkerResult, error) {
	return dawport.MarkerResult{}, r.do("AddMarker")
}

type pickupsRole struct{ role }

func (r pickupsRole) ImportPickups(string, string) error     { return r.do("ImportPickups") }
func (r pickupsRole) ExportPickups(string, string) error     { return r.do("ExportPickups") }
func (r pickupsRole) NextPickup(string) error                { return r.do("NextPickup") }
func (r pickupsRole) ResolvePickup(string, float64) error    { return r.do("ResolvePickup") }
func (r pickupsRole) ReopenPickup(string, float64) error     { return r.do("ReopenPickup") }
func (r pickupsRole) ListPickupMarkers(string, string) error { return r.do("ListPickupMarkers") }
func (r pickupsRole) CountPickups(string) error              { return r.do("CountPickups") }

type lineIdentityRole struct{ role }

func (r lineIdentityRole) StampLines(string, string, bool) error { return r.do("StampLines") }
func (r lineIdentityRole) ReadLineIDs(string, string) error      { return r.do("ReadLineIDs") }

type renderConfigRole struct{ role }

func (r renderConfigRole) ConfigureChapterRender(string, string) error {
	return r.do("ConfigureChapterRender")
}

type cleanupToolsRole struct{ role }

func (r cleanupToolsRole) LaunchCleanupTool(string, string, dawport.Trace) error {
	return r.do("LaunchCleanupTool")
}

type retakeLanesRole struct{ role }

func (r retakeLanesRole) PickRetakeLane(string, string, string, dawport.Trace) error {
	return r.do("PickRetakeLane")
}

type projectStateRole struct{ role }

func (r projectStateRole) RequestProjectState(string) error { return r.do("RequestProjectState") }

type takeCreateRole struct{ role }

func (r takeCreateRole) CreateTake(string, string) error { return r.do("CreateTake") }

// heartbeatRole reports a quiet engine with no project: the heartbeat reads, so it has no error to return.
type heartbeatRole struct{ role }

func (r heartbeatRole) Reachable() bool {
	_ = r.do("Reachable")
	return false
}
func (r heartbeatRole) CurrentProject() (string, bool) {
	_ = r.do("CurrentProject")
	return "", false
}
func (r heartbeatRole) Matches(string) bool {
	_ = r.do("Matches")
	return false
}
func (r heartbeatRole) ChangeCount() (int, bool) {
	_ = r.do("ChangeCount")
	return 0, false
}
func (r heartbeatRole) Transport() (dawport.Transport, bool) {
	_ = r.do("Transport")
	return dawport.Transport{}, false
}

type projectReadRole struct{ role }

func (r projectReadRole) ReadProject(string) (dawport.Project, error) {
	return dawport.Project{}, r.do("ReadProject")
}

type trackStateRole struct{ role }

func (r trackStateRole) ChapterTrackState(context.Context, string) (dawport.TrackState, error) {
	return dawport.TrackState{}, r.do("ChapterTrackState")
}

type trackSelectRole struct{ role }

func (r trackSelectRole) SelectTrack(context.Context, string) (dawport.SelectedTrack, error) {
	return dawport.SelectedTrack{}, r.do("SelectTrack")
}

type trackCreateRole struct{ role }

func (r trackCreateRole) CreateTrack(context.Context, string) (dawport.CreatedTrack, error) {
	return dawport.CreatedTrack{}, r.do("CreateTrack")
}

type filePreviewRole struct{ role }

func (r filePreviewRole) PreviewFileRange(context.Context, dawport.FilePreview) (dawport.FilePreviewStarted, error) {
	return dawport.FilePreviewStarted{}, r.do("PreviewFileRange")
}
func (r filePreviewRole) StopFilePreview(context.Context) (dawport.FilePreviewStopped, error) {
	return dawport.FilePreviewStopped{}, r.do("StopFilePreview")
}

type fileRevealRole struct{ role }

func (r fileRevealRole) RevealFile(context.Context, string) (dawport.FileRevealed, error) {
	return dawport.FileRevealed{}, r.do("RevealFile")
}

type rangeGainRole struct{ role }

func (r rangeGainRole) ReduceRangeGain(context.Context, dawport.RangeGainRequest) (dawport.Result, error) {
	return dawport.Result{}, r.do("ReduceRangeGain")
}

type clickRepairRole struct{ role }

func (r clickRepairRole) RepairClick(context.Context, dawport.ClickRepairRequest) (dawport.Result, error) {
	return dawport.Result{}, r.do("RepairClick")
}

type recordRole struct{ role }

func (r recordRole) ArmOnly(context.Context, string) (dawport.Armed, error) {
	return dawport.Armed{}, r.do("ArmOnly")
}
func (r recordRole) RecordStart(context.Context, string, dawport.RecordOptions) (dawport.RecordStarted, error) {
	return dawport.RecordStarted{}, r.do("RecordStart")
}
func (r recordRole) RecordStop(context.Context) (dawport.RecordStopped, error) {
	return dawport.RecordStopped{}, r.do("RecordStop")
}
func (r recordRole) OnRecordEnded(func(dawport.RecordEnded)) { _ = r.do("OnRecordEnded") }

type punchRole struct{ role }

func (r punchRole) PunchTo(context.Context, float64, float64) (float64, error) {
	return 0, r.do("PunchTo")
}
func (r punchRole) Roll(context.Context, string, float64) (dawport.Result, error) {
	return r.result("Roll", "Rolled again. The earlier audio is kept.")
}
func (r punchRole) PlayPosition(context.Context) (dawport.PlayPosition, error) {
	return dawport.PlayPosition{}, r.do("PlayPosition")
}

type regionsRole struct{ role }

func (r regionsRole) CreateRegions(context.Context, []dawport.Region, string, bool) (dawport.RegionsCreated, error) {
	return dawport.RegionsCreated{}, r.do("CreateRegions")
}

type takesRole struct{ role }

func (r takesRole) SetActiveTake(context.Context, string, string) (dawport.ActiveTakeSet, error) {
	return dawport.ActiveTakeSet{}, r.do("SetActiveTake")
}
func (r takesRole) HideTakes(context.Context, string, string) (dawport.Result, error) {
	return r.result("HideTakes", "Other takes hidden.")
}

type fxChainsRole struct{ role }

func (r fxChainsRole) ListFXChains(context.Context) (dawport.FXChains, error) {
	return dawport.FXChains{}, r.do("ListFXChains")
}
func (r fxChainsRole) ApplyFXChain(context.Context, string, string) (dawport.FXChainApplied, error) {
	return dawport.FXChainApplied{}, r.do("ApplyFXChain")
}

type itemGainRole struct{ role }

func (r itemGainRole) Apply(context.Context, []dawport.GainCandidate) (dawport.ApplyGainResult, error) {
	return dawport.ApplyGainResult{}, r.do("Apply")
}

type renderWithFXRole struct{ role }

func (r renderWithFXRole) RenderWithFX(string, dawport.FXRender) error { return r.do("RenderWithFX") }

type masterChainReadRole struct{ role }

func (r masterChainReadRole) ReadMasterChain(context.Context) (dawport.MasterChain, error) {
	return dawport.MasterChain{}, r.do("ReadMasterChain")
}

type macroRenderRole struct{ role }

func (r macroRenderRole) RenderWithMacro(context.Context, dawport.MacroRender) (dawport.MacroRendered, error) {
	return dawport.MacroRendered{}, r.do("RenderWithMacro")
}

// The edit roles answer the Result a conforming engine gives a change it made: ok, changed, one undo step. A closed fake answers the
// transport error and no Result.

func (r role) result(method, message string) (dawport.Result, error) {
	if err := r.do(method); err != nil {
		return dawport.Result{}, err
	}
	return dawport.OK(message, true), nil
}

type undoLastRole struct{ role }

// LastAction and UndoLast answer as REAPER's last_action and undo_last do when the app's own action is on top: this, and the steps
// undone with no undo step added. An unknown kind is ErrActionKind.
func (r undoLastRole) LastAction(_ context.Context, kind dawport.ActionKind) (dawport.LastAction, error) {
	if err := r.do("LastAction"); err != nil {
		return dawport.LastActionUnknown, err
	}
	if !kind.Valid() {
		return dawport.LastActionUnknown, dawport.ErrActionKind
	}
	return dawport.LastActionThis, nil
}
func (r undoLastRole) UndoLast(_ context.Context, kind dawport.ActionKind, _ int) (dawport.Result, error) {
	got, err := r.result("UndoLast", "Undid the last action.")
	if err != nil {
		return got, err
	}
	if !kind.Valid() {
		return dawport.Result{}, dawport.ErrActionKind
	}
	return got.WithUndoSteps(0), nil
}

type placeRole struct{ role }

// ReadPlace answers a project with nothing selected and the cursor at the start; GoTo accepts a named track and a time that is a number
// of seconds from zero, and refuses the rest with nothing moved.
func (r placeRole) ReadPlace(context.Context) (dawport.Place, error) {
	if err := r.do("ReadPlace"); err != nil {
		return dawport.Place{}, err
	}
	return dawport.Place{}, nil
}
func (r placeRole) GoTo(_ context.Context, trackID string, target dawport.PlaceTarget) error {
	if err := r.do("GoTo"); err != nil {
		return err
	}
	if trackID == "" {
		return errors.New("choose a track to go to")
	}
	if !target.End && (target.Seconds != target.Seconds || target.Seconds < 0) {
		return errors.New("the place to go to is not a usable number of seconds")
	}
	return nil
}

type transportSyncRole struct{ role }

// SetCursor, PlayFrom, Stop and Watch answer as REAPER's set_cursor, play_from, stop_play and watch_transport do: the time given back, a time that is
// not usable an error with nothing sent, and a lease of at most ten seconds.
func (r transportSyncRole) OnPosition(func(dawport.TransportPosition)) {}
func (r transportSyncRole) SetCursor(_ context.Context, seconds float64) (float64, error) {
	if err := r.do("SetCursor"); err != nil {
		return 0, err
	}
	if seconds != seconds || seconds < 0 {
		return 0, errTime
	}
	return seconds, nil
}
func (r transportSyncRole) PlayFrom(_ context.Context, seconds float64) (float64, error) {
	if err := r.do("PlayFrom"); err != nil {
		return 0, err
	}
	if seconds != seconds || seconds < 0 {
		return 0, errTime
	}
	return seconds, nil
}
func (r transportSyncRole) Stop(context.Context) (float64, error) {
	if err := r.do("Stop"); err != nil {
		return 0, err
	}
	return 0, nil
}
func (r transportSyncRole) Watch(_ context.Context, lease time.Duration) (time.Duration, error) {
	if err := r.do("Watch"); err != nil {
		return 0, err
	}
	if lease <= 0 {
		return 0, errTime
	}
	return min(lease, 10*time.Second), nil
}

var errTime = errors.New("the time is not a usable number of seconds")

type monitorLevelRole struct{ role }

// MonitorLevel answers unity and SetMonitorLevel the level it was given, as REAPER's monitor_level does when the send holds it; a level
// outside 0 to dawport.MaxLevel is an error with nothing set.
func (r monitorLevelRole) MonitorLevel(context.Context) (int, error) {
	if err := r.do("MonitorLevel"); err != nil {
		return 0, err
	}
	return dawport.UnityLevel, nil
}
func (r monitorLevelRole) SetMonitorLevel(_ context.Context, level int) (int, error) {
	if err := r.do("SetMonitorLevel"); err != nil {
		return 0, err
	}
	if level < 0 || level > dawport.MaxLevel {
		return 0, errLevel
	}
	return level, nil
}

type inputLevelRole struct{ role }

func (r inputLevelRole) SetInputLevel(_ context.Context, level int) (int, error) {
	if err := r.do("SetInputLevel"); err != nil {
		return 0, err
	}
	if level < 0 || level > dawport.MaxLevel {
		return 0, errLevel
	}
	return level, nil
}

var errLevel = errors.New("the level is 0 to 100")

type prerollRole struct{ role }

// PunchPreroll answers REAPER 7.82's own default: two measures, pre-roll on record off, at 4/4 and 120 BPM.
func (r prerollRole) PunchPreroll(context.Context) (dawport.PunchPreroll, error) {
	if err := r.do("PunchPreroll"); err != nil {
		return dawport.PunchPreroll{}, err
	}
	return dawport.PunchPreroll{Measures: 2, MeasureSeconds: 2}, nil
}

type meterRole struct{ role }

// DawMeters answers a quiet room through an armed track and nothing playing out.
func (r meterRole) DawMeters(context.Context) (dawport.DawMeters, error) {
	if err := r.do("DawMeters"); err != nil {
		return dawport.DawMeters{}, err
	}
	return dawport.DawMeters{OutputDB: dawport.MeterFloorDB, Armed: true, InputDB: -58, InputTrack: "Chapter 1"}, nil
}

type cutRangeRole struct{ role }

// DeleteRange answers as REAPER's delete_range does: one undo step.
func (r cutRangeRole) DeleteRange(context.Context, dawport.DeleteRangeRequest) (dawport.Result, error) {
	got, err := r.result("DeleteRange", "Deleted the words and their audio.")
	if err != nil {
		return got, err
	}
	return got.WithUndoSteps(1), nil
}

type replaceRangeRole struct{ role }

// ReplaceRange and RestoreReplacement answer as REAPER's replace_range and restore_replacement do: one undo step each, the new item
// named and the later audio moved by their read's length less the words'.
func (r replaceRangeRole) ReplaceRange(_ context.Context, request dawport.ReplaceRangeRequest) (dawport.RangeReplaced, error) {
	got, err := r.result("ReplaceRange", "Replaced the words with their audio.")
	if err != nil {
		return dawport.RangeReplaced{}, err
	}
	shift := (request.SourceEnd - request.SourceStart) - (request.End - request.Start)
	return dawport.RangeReplaced{Result: got.WithUndoSteps(1), ReplacementItem: "{FA4E0000-0000-4000-8000-000000000001}",
		CutItem: request.ItemGUID, Shift: shift}, nil
}
func (r replaceRangeRole) RestoreReplacement(context.Context, dawport.RestoreRequest) (dawport.Result, error) {
	got, err := r.result("RestoreReplacement", "Put your audio back.")
	if err != nil {
		return got, err
	}
	return got.WithUndoSteps(1), nil
}

type fxRangeRole struct{ role }

// ApplyFXToRange and RemoveFXFromRange answer as REAPER's apply_fx_range and remove_fx_range do: one undo step each.
func (r fxRangeRole) ApplyFXToRange(context.Context, dawport.FXRangeRequest) (dawport.Result, error) {
	got, err := r.result("ApplyFXToRange", "Effect added.")
	if err != nil {
		return got, err
	}
	return got.WithUndoSteps(1), nil
}
func (r fxRangeRole) RemoveFXFromRange(context.Context, string, string) (dawport.Result, error) {
	got, err := r.result("RemoveFXFromRange", "Effect removed.")
	if err != nil {
		return got, err
	}
	return got.WithUndoSteps(1), nil
}

// FXRangeParams, SetFXRangeParam and BypassFXRange answer as REAPER's fx_range_params, fx_range_set_param and fx_range_bypass do:
// a read with one setting and no undo step, and one undo step for each change (SN-E104).
func (r fxRangeRole) FXRangeParams(context.Context, dawport.FXRangeTarget) (dawport.FXRangeSettings, error) {
	got, err := r.result("FXRangeParams", "Read 1 setting.")
	if err != nil {
		return dawport.FXRangeSettings{Result: got, Settings: []dawport.FXSetting{}}, err
	}
	got.Changed = false
	setting := dawport.FXSetting{Name: "Gain", Value: 0, Min: -24, Max: 24, Formatted: "0 dB"}
	return dawport.FXRangeSettings{Result: got.WithUndoSteps(0), Settings: []dawport.FXSetting{setting}}, nil
}
func (r fxRangeRole) SetFXRangeParam(context.Context, dawport.FXRangeTarget, int, int, float64) (dawport.Result, error) {
	got, err := r.result("SetFXRangeParam", "Setting changed.")
	if err != nil {
		return got, err
	}
	return got.WithUndoSteps(1), nil
}
func (r fxRangeRole) BypassFXRange(context.Context, dawport.FXRangeTarget, bool) (dawport.Result, error) {
	got, err := r.result("BypassFXRange", "Effect bypassed.")
	if err != nil {
		return got, err
	}
	return got.WithUndoSteps(1), nil
}

// CompareFXRange and StopFXCompare answer as REAPER's fx_range_compare and stop_fx_compare do: no undo step, and each pass of a
// Compare plays 2 seconds (SN-E113).
func (r fxRangeRole) CompareFXRange(context.Context, dawport.FXRangeTarget) (dawport.FXRangeCompare, error) {
	got, err := r.result("CompareFXRange", "Comparing.")
	if err != nil || !got.OK {
		return dawport.FXRangeCompare{Result: got}, err
	}
	got.Changed = false
	return dawport.FXRangeCompare{Result: got.WithUndoSteps(0), Pass: 2}, nil
}
func (r fxRangeRole) StopFXCompare(context.Context) (dawport.Result, error) {
	got, err := r.result("StopFXCompare", "Stopped comparing.")
	if err != nil {
		return got, err
	}
	return got.WithUndoSteps(0), nil
}

type stackTakesRole struct{ role }

// StackTakes and UnstackTakes answer as REAPER's stack_takes and unstack_takes do: one undo step each.
func (r stackTakesRole) StackTakes(context.Context, dawport.StackRequest) (dawport.Result, error) {
	got, err := r.result("StackTakes", "Takes stacked.")
	if err != nil {
		return got, err
	}
	return got.WithUndoSteps(1), nil
}
func (r stackTakesRole) UnstackTakes(context.Context, dawport.StackRequest) (dawport.Result, error) {
	got, err := r.result("UnstackTakes", "Takes unstacked.")
	if err != nil {
		return got, err
	}
	return got.WithUndoSteps(1), nil
}

type backupsRole struct{ role }

func (r backupsRole) BackupAround(context.Context, dawport.BackupRequest) (dawport.Result, error) {
	return r.result("BackupAround", "Backup made.")
}
func (r backupsRole) RestoreBackup(context.Context, string) (dawport.Result, error) {
	return r.result("RestoreBackup", "Backup restored.")
}
