package main

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/dawport"
	"desktop/internal/voicetracks"
)

func armBoothVoice(t *testing.T, host *Host, recorder dawport.Recorder, chapterID string) dawport.Result {
	t.Helper()
	result, err := armBoothVoiceLane(context.Background(), host.services(), "REAPER", recorder, chapterID, true, nil)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestEnteringTheBoothArmsAndMonitorsTheNarratorVoiceOfAFolderChapter(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	fake := &fakeLaneRecorder{}
	got := armBoothVoice(t, host, fake, ids[0])
	if !got.OK || !got.Changed || got.Message != "" || got.Refused != "" || got.UndoSteps != 0 {
		t.Fatalf("got %+v, want done, changed, no sentence and no undo step", got)
	}
	if len(fake.laneArmed) != 1 || fake.laneArmed[0] != voiceNarratorTrack || !fake.laneMonitor[0] {
		t.Fatalf("armed %v monitor %v, want the Narrator voice once, with monitoring", fake.laneArmed, fake.laneMonitor)
	}
}

func TestEnteringTheBoothArmsTheVoiceTheNarratorChoseBefore(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], voiceQueenTrack)
	fake := &fakeLaneRecorder{}
	armBoothVoice(t, host, fake, ids[0])
	if len(fake.laneArmed) != 1 || fake.laneArmed[0] != voiceQueenTrack {
		t.Fatalf("armed %v, want the chosen Queen voice", fake.laneArmed)
	}
}

func TestEnteringTheBoothDoesNothingForADAWWithNoArmedTracks(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	for name, recorder := range map[string]dawport.Recorder{"no recorder": nil, "a recorder with no lanes": &fakeVoiceRecorder{}} {
		got := armBoothVoice(t, host, recorder, ids[0])
		if !reflect.DeepEqual(got, dawport.Result{OK: true}) {
			t.Errorf("%s: got %+v, want done and unchanged with no sentence", name, got)
		}
	}
}

func TestEnteringTheBoothOnAChapterWithNoLinkedTrackArmsNothingAndSaysNothing(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	fake := &fakeLaneRecorder{}
	if got := armBoothVoice(t, host, fake, ids[1]); !reflect.DeepEqual(got, dawport.Result{OK: true}) || len(fake.calls) != 0 {
		t.Fatalf("an unlinked chapter: %+v, DAW asked %v", got, fake.calls)
	}
}

func TestEnteringTheBoothWordsARefusalAndChangesNothingElse(t *testing.T) {
	for name, err := range map[string]error{
		"recording": bridge.ErrRecording,
		"gone":      &bridge.TrackStaleError{GUID: voiceNarratorTrack},
		"timeout":   context.DeadlineExceeded,
	} {
		host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
		got := armBoothVoice(t, host, &fakeLaneRecorder{laneErr: err}, ids[0])
		if got.OK || got.Refused == "" || got.Message != got.Refused || got.Changed {
			t.Errorf("%s: got %+v, want a refusal with its sentence", name, got)
		}
	}
}

func TestEnteringTheBoothNeverArmsDuringATakeThisAppRunsOrStarts(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	fake := &fakeLaneRecorder{}
	host.setReadAloudRecording(ids[0], fake)
	if _, err := host.DawArmBoothVoice(ids[0]); err != nil {
		t.Fatal(err)
	}
	host.clearReadAloudRecording()
	defer host.startingRecording()()
	if _, err := host.DawArmBoothVoice(ids[0]); err != nil {
		t.Fatal(err)
	}
	if len(fake.calls) != 0 {
		t.Fatalf("the DAW was asked to arm during a take: %v", fake.calls)
	}
}

func TestChoosingAVoiceMonitorsItWhileTheSwitchIsOnAndNotWhenItIsOff(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	switchFollow(t, host, "true")
	on := &fakeLaneRecorder{}
	boothVoiceSet(t, host, on, ids[0], voiceQueenTrack)
	if len(on.laneMonitor) != 1 || !on.laneMonitor[0] {
		t.Fatalf("with Booth.follow_chapter_in_daw on (the default) the voice is monitored: %v", on.laneMonitor)
	}
	switchFollow(t, host, "false")
	quiet := &fakeLaneRecorder{}
	boothVoiceSet(t, host, quiet, ids[0], voiceNarratorTrack)
	if len(quiet.laneMonitor) != 1 || quiet.laneMonitor[0] {
		t.Fatalf("with the switch off the voice is armed as before and not monitored: %v", quiet.laneMonitor)
	}
}

func TestLeavingTheBoothPutsTheMonitoringBack(t *testing.T) {
	fake := &fakeLaneRecorder{}
	if got := dawReleaseBoothMonitorIn(context.Background(), "REAPER", fake); !reflect.DeepEqual(got, dawport.Result{OK: true, Changed: true}) || fake.monitorReleased != 1 {
		t.Fatalf("got %+v after %d releases", got, fake.monitorReleased)
	}
	if got := dawReleaseBoothMonitorIn(context.Background(), "REAPER", nil); !reflect.DeepEqual(got, dawport.Result{OK: true}) {
		t.Fatalf("no DAW: %+v", got)
	}
	if got := dawReleaseBoothMonitorIn(context.Background(), "REAPER", &fakeVoiceRecorder{}); !reflect.DeepEqual(got, dawport.Result{OK: true}) {
		t.Fatalf("a DAW with no monitoring to put back: %+v", got)
	}
	if got := dawReleaseBoothMonitorIn(context.Background(), "REAPER", &fakeLaneRecorder{laneErr: bridge.ErrScriptOutdated}); !reflect.DeepEqual(got, dawport.Result{OK: true}) {
		t.Fatalf("a script from before the command: %+v", got)
	}
	refused := dawReleaseBoothMonitorIn(context.Background(), "REAPER", &fakeLaneRecorder{laneErr: context.DeadlineExceeded})
	if refused.OK || !strings.Contains(refused.Refused, "may still be on") || !strings.Contains(refused.Refused, "Turn it off in REAPER") {
		t.Fatalf("a DAW that did not answer: %+v", refused)
	}
}

// TestBoothArmingContractGoldensAreCurrent pins the answers of the Booth's arm on entry (done, and refused with the DAW's sentence) and of the
// release on leaving. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-arm-booth-voice-*.json and daw-release-booth-monitor-done.json.
func TestBoothArmingContractGoldensAreCurrent(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	contractfile.Check(t, "daw-arm-booth-voice-done", armBoothVoice(t, host, &fakeLaneRecorder{}, ids[0]))
	contractfile.Check(t, "daw-arm-booth-voice-refused", armBoothVoice(t, host, &fakeLaneRecorder{laneErr: bridge.ErrRecording}, ids[0]))
	contractfile.Check(t, "daw-release-booth-monitor-done", dawReleaseBoothMonitorIn(context.Background(), "REAPER", &fakeLaneRecorder{}))
}

func TestEnteringTheBoothWhileTheDAWRecordsDropsAWaitingRelease(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	fake := &fakeLaneRecorder{laneErr: bridge.ErrRecording}
	got := armBoothVoice(t, host, fake, ids[0])
	if got.OK || got.Refused == "" {
		t.Fatalf("a DAW that records refuses the arm: %+v", got)
	}
	if !reflect.DeepEqual(fake.calls, []string{"ArmLane", "KeepMonitor"}) {
		t.Fatalf("calls %v, want the refused arm and then the dropped release", fake.calls)
	}
}

func TestArmingAfterATakeWithTheSwitchOffArmsWithoutMonitoring(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	switchFollow(t, host, "false")
	fake := &fakeLaneRecorder{}
	// The binding reads the switch itself: a voice chosen during a take is armed after it, and the monitoring waits for the switch.
	if _, err := armBoothVoiceLane(context.Background(), host.services(), "REAPER", fake, ids[0], followChapterSetting(host.services()), nil); err != nil {
		t.Fatal(err)
	}
	if len(fake.laneArmed) != 1 || fake.laneMonitor[0] {
		t.Fatalf("armed %v monitor %v, want the voice armed and not monitored", fake.laneArmed, fake.laneMonitor)
	}
}

func releaseJSON(t *testing.T, host *Host) dawport.Result {
	t.Helper()
	raw, err := host.DawReleaseBoothMonitor()
	if err != nil {
		t.Fatal(err)
	}
	var got dawport.Result
	if err := json.Unmarshal([]byte(raw), &got); err != nil {
		t.Fatal(err)
	}
	return got
}

func TestLeavingTheBoothWhileTheDAWCannotBeReachedSaysSoOnlyWhenAMonitoringMayBeOwed(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	switchFollow(t, host, "true")
	if got := releaseJSON(t, host); !got.OK || got.Refused != "" {
		t.Fatalf("the Booth never turned a monitoring on: %+v, want done and silent", got)
	}
	// A DAW that is not reachable at entry is asked nothing, so nothing is owed.
	if _, err := host.DawArmBoothVoice(ids[0]); err != nil {
		t.Fatal(err)
	}
	if got := releaseJSON(t, host); !got.OK {
		t.Fatalf("no recorder at entry: %+v, want done", got)
	}
	// A monitoring turned on by an entry arm, then a DAW that no longer answers when the Booth is left.
	if got, err := host.dawArmBoothVoiceIn(context.Background(), host.services(), &fakeLaneRecorder{}, ids[0]); err != nil || !got.OK {
		t.Fatalf("entry arm: %+v, %v", got, err)
	}
	got := releaseJSON(t, host)
	if got.OK || !strings.Contains(got.Refused, "could not be reached") || !strings.Contains(got.Refused, "goes off the next time") || got.Message != got.Refused {
		t.Fatalf("left with the DAW unreachable: %+v, want a refusal that says the monitoring may be on and when it is put back", got)
	}
}

func TestAReleaseWithNoDAWSaysTheOwedMonitoringOnceThenStops(t *testing.T) {
	host, _ := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	host.boothMonitorOwed.Store(true)
	if got := releaseJSON(t, host); got.OK || got.Refused == "" {
		t.Fatalf("first leave: %+v, want the refusal", got)
	}
	for leave := 0; leave < 3; leave++ {
		if got := releaseJSON(t, host); !got.OK || got.Refused != "" {
			t.Fatalf("a later leave: %+v, want silence", got)
		}
	}
}

func TestTheOwedMonitoringSentenceNamesTheLinkedDAWOrSaysTheDAW(t *testing.T) {
	host, _ := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	got := monitorUnreachableSentence(host.services())
	if !strings.HasPrefix(got, "The DAW could not be reached") || strings.Contains(got, "REAPER") {
		t.Fatalf("no DAW linked: %q, want neutral wording", got)
	}
}

// blockingReleaser is a recorder whose release waits for the test, so an arm can land while a release is in flight.
type blockingReleaser struct {
	fakeLaneRecorder
	entered chan struct{}
	proceed chan struct{}
	err     error
}

func (b *blockingReleaser) ReleaseMonitor(ctx context.Context) (dawport.MonitorReleased, error) {
	close(b.entered)
	<-b.proceed
	return dawport.MonitorReleased{}, b.err
}

func TestAReleaseThatLandsAfterANewArmDoesNotClearTheOwedFlag(t *testing.T) {
	host, _ := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	host.boothMonitorOwed.Store(true)
	rec := &blockingReleaser{entered: make(chan struct{}), proceed: make(chan struct{})}
	done := make(chan dawport.Result)
	go func() { done <- host.releaseBoothMonitor(context.Background(), host.services(), rec) }()
	<-rec.entered
	host.boothMonitorOwed.Store(true) // a quick re-entry arms and monitors while the release is in flight
	close(rec.proceed)
	if got := <-done; !got.OK {
		t.Fatalf("release: %+v", got)
	}
	if !host.boothMonitorOwed.Load() {
		t.Fatal("the release wiped the debt a new arm had just made")
	}
}

func TestAReleaseThatFailsKeepsTheMonitoringOwed(t *testing.T) {
	host, _ := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	host.boothMonitorOwed.Store(true)
	rec := &blockingReleaser{entered: make(chan struct{}), proceed: make(chan struct{}), err: context.DeadlineExceeded}
	close(rec.proceed)
	if got := host.releaseBoothMonitor(context.Background(), host.services(), rec); got.OK {
		t.Fatalf("release: %+v, want a refusal", got)
	}
	if !host.boothMonitorOwed.Load() {
		t.Fatal("a failed release must leave the monitoring owed")
	}
}

func TestEnteringTheBoothOnAChapterWithNoTrackOwesNothing(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	switchFollow(t, host, "true")
	// A chapter with no linked track, a refused arm and a lane that was monitored already turn nothing on.
	_, _ = host.dawArmBoothVoiceIn(context.Background(), host.services(), &fakeLaneRecorder{}, "no-such-chapter")
	if host.boothMonitorOwed.Load() {
		t.Fatal("a chapter with no track owes nothing")
	}
	for name, rec := range map[string]*fakeLaneRecorder{
		"recording":  {laneErr: bridge.ErrRecording},
		"gone":       {laneErr: &bridge.TrackStaleError{GUID: voiceNarratorTrack}},
		"on already": {alreadyOn: true},
	} {
		host.boothMonitorOwed.Store(false)
		_, _ = host.dawArmBoothVoiceIn(context.Background(), host.services(), rec, ids[0])
		if host.boothMonitorOwed.Load() {
			t.Errorf("%s: nothing was turned on, yet the flag is set", name)
		}
	}
	host.boothMonitorOwed.Store(false)
	_, _ = host.dawArmBoothVoiceIn(context.Background(), host.services(), &fakeLaneRecorder{laneErr: context.DeadlineExceeded}, ids[0])
	if !host.boothMonitorOwed.Load() {
		t.Error("a call that timed out may have turned a monitoring on, so it stays owed")
	}
	host.boothMonitorOwed.Store(false)
	_, _ = host.dawArmBoothVoiceIn(context.Background(), host.services(), &fakeLaneRecorder{}, ids[0])
	if !host.boothMonitorOwed.Load() {
		t.Error("a monitoring turned on is owed")
	}
}

func TestChoosingAVoiceWithTheSwitchOnOwesTheMonitoringAndWithItOffDoesNot(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	switchFollow(t, host, "true")
	boothVoiceSet(t, host, &fakeLaneRecorder{}, ids[0], voiceQueenTrack)
	if !host.boothMonitorOwed.Load() {
		t.Fatal("a voice chosen with the switch on is monitored, so the release is owed")
	}
	host, ids = newVoiceFolderHost(t, voicetracks.LayoutFolders)
	switchFollow(t, host, "false")
	boothVoiceSet(t, host, &fakeLaneRecorder{}, ids[0], voiceQueenTrack)
	if host.boothMonitorOwed.Load() {
		t.Fatal("with the switch off nothing is monitored, so nothing is owed")
	}
}

// switchFollow saves Booth.follow_chapter_in_daw: the settings store outlives a test host, so a test that depends on the switch sets it.
func switchFollow(t *testing.T, host *Host, value string) {
	t.Helper()
	save := func(v string) error {
		return host.settings.Save("Booth", "global", map[string]*string{"follow_chapter_in_daw": &v})
	}
	if err := save(value); err != nil {
		t.Fatal(err)
	}
	// The store outlives the host: leave the switch on, its default, for the next test and the next pass.
	t.Cleanup(func() { _ = save("true") })
}

// gatedArmer is a LaneArmer whose answer waits for the test: entered says the call is in flight, proceed lets it answer.
type gatedArmer struct {
	entered   chan struct{}
	proceed   chan struct{}
	monitored bool
	err       error
}

func newGatedArmer(monitored bool) *gatedArmer {
	return &gatedArmer{entered: make(chan struct{}), proceed: make(chan struct{}), monitored: monitored}
}

func (g *gatedArmer) ArmLane(_ context.Context, guid string, _ bool) (dawport.Armed, error) {
	close(g.entered)
	<-g.proceed
	if g.err != nil {
		return dawport.Armed{}, g.err
	}
	return dawport.Armed{TrackGUID: guid, Changed: true, Monitored: g.monitored}, nil
}

func TestAnArmInFlightDuringAReleaseStillOwesWhenItMonitors(t *testing.T) {
	var owed monitorDebt
	armer := newGatedArmer(true)
	done := make(chan struct{})
	go func() {
		defer close(done)
		if _, err := armLaneOwing(context.Background(), armer, voiceNarratorTrack, true, &owed); err != nil {
			t.Error(err)
		}
	}()
	<-armer.entered
	owed.Swap(false) // a release lands while the arm is in flight and takes the note
	close(armer.proceed)
	<-done
	if !owed.Load() {
		t.Fatal("the arm monitored after the release took the note, so the monitoring is owed")
	}
}

func TestOverlappingArmsKeepTheDebtOfTheOneThatMonitored(t *testing.T) {
	var owed monitorDebt
	first, second := newGatedArmer(false), newGatedArmer(true)
	run := func(armer *gatedArmer) chan struct{} {
		done := make(chan struct{})
		go func() {
			defer close(done)
			if _, err := armLaneOwing(context.Background(), armer, voiceNarratorTrack, true, &owed); err != nil {
				t.Error(err)
			}
		}()
		return done
	}
	firstDone := run(first)
	<-first.entered
	secondDone := run(second)
	<-second.entered
	close(second.proceed) // the second arm monitors a lane
	<-secondDone
	close(first.proceed) // the first answers "on already", a definite answer that must not take the second's debt
	<-firstDone
	if !owed.Load() {
		t.Fatal("the first arm's answer cleared the debt of the arm that monitored")
	}
}

func TestAnArmThatTimesOutAfterAReleaseTookTheNoteStaysOwed(t *testing.T) {
	var owed monitorDebt
	armer := newGatedArmer(false)
	armer.err = context.DeadlineExceeded
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _ = armLaneOwing(context.Background(), armer, voiceNarratorTrack, true, &owed)
	}()
	<-armer.entered
	owed.Swap(false) // the narrator left and the release succeeded: the lane was not on yet
	close(armer.proceed)
	<-done
	if !owed.Load() {
		t.Fatal("the arm timed out after the DAW may have acted, so the monitoring is owed")
	}
}

// Conservative by design: when two overlapping arms both turn nothing on, the note stays set until a release succeeds. A false "may still be on" reaches
// the narrator only when the DAW is also unreachable at leave, and any answered release clears it.
func TestTwoOverlappingArmsThatBothTurnedNothingOnStayOwedUntilARelease(t *testing.T) {
	var owed monitorDebt
	first, second := newGatedArmer(false), newGatedArmer(false)
	run := func(armer *gatedArmer) chan struct{} {
		done := make(chan struct{})
		go func() {
			defer close(done)
			_, _ = armLaneOwing(context.Background(), armer, voiceNarratorTrack, true, &owed)
		}()
		return done
	}
	firstDone := run(first)
	<-first.entered
	secondDone := run(second)
	<-second.entered
	close(first.proceed)
	close(second.proceed)
	<-firstDone
	<-secondDone
	if !owed.Load() {
		t.Fatal("two overlapping arms that turned nothing on leave the note set (conservative)")
	}
	host, _ := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	host.boothMonitorOwed.Store(true)
	if got := host.releaseBoothMonitor(context.Background(), host.services(), &fakeLaneRecorder{}); !got.OK || host.boothMonitorOwed.Load() {
		t.Fatalf("an answered release clears it: %+v", got)
	}
}

func TestAFailedReleaseOnLeavingSaysWhatFailedThatItMayBeOnAndWhatToDo(t *testing.T) {
	for name, err := range map[string]error{
		"timeout": context.DeadlineExceeded,
		"other":   errors.New("boom"),
	} {
		got := dawReleaseBoothMonitorIn(context.Background(), "REAPER", &fakeLaneRecorder{laneErr: err})
		if got.OK || got.Message != got.Refused || !strings.Contains(got.Refused, "monitoring") || strings.Contains(got.Refused, "armed") {
			t.Errorf("%s: %+v, want a refusal about the monitoring, not about arming", name, got)
		}
		if !strings.Contains(got.Refused, "may still be on") {
			t.Errorf("%s: %q does not say the monitoring may still be on", name, got.Refused)
		}
		if !strings.Contains(got.Refused, "in REAPER") {
			t.Errorf("%s: %q does not say what to do in the DAW", name, got.Refused)
		}
	}
}

func TestAFailedReleaseWithNothingOwedSaysNothing(t *testing.T) {
	host, _ := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	slow := &fakeLaneRecorder{laneErr: context.DeadlineExceeded}
	for leave := 0; leave < 2; leave++ {
		if got := host.releaseBoothMonitor(context.Background(), host.services(), slow); !got.OK || got.Refused != "" {
			t.Fatalf("leave %d: %+v, want done and silent", leave, got)
		}
		if host.boothMonitorOwed.Load() {
			t.Fatalf("leave %d: a failed release with nothing owed must not make anything owed", leave)
		}
	}
	// With a monitoring owed the same failure is said, and it stays owed, so the next leave says it again.
	host.boothMonitorOwed.Store(true)
	for leave := 0; leave < 2; leave++ {
		if got := host.releaseBoothMonitor(context.Background(), host.services(), slow); got.OK || got.Refused == "" {
			t.Fatalf("owed, leave %d: %+v, want the refusal", leave, got)
		}
		if !host.boothMonitorOwed.Load() {
			t.Fatalf("owed, leave %d: the monitoring is still owed after a failed release", leave)
		}
	}
}

func TestTheOwedMonitoringSentenceNamesTheLinkedDAW(t *testing.T) {
	host, _ := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	svc := host.services()
	resolver, _ := fakeResolver(dawport.Supported)
	svc.dawPortResolver = resolver
	got := monitorUnreachableSentence(svc)
	name := svc.dawPortResolver.Kind().String()
	if name == "none" || !strings.HasPrefix(got, name+" could not be reached") || !strings.Contains(got, "Turn it off in "+name) || strings.Contains(got, "The DAW") {
		t.Fatalf("a linked DAW: %q, want it named (%q)", got, name)
	}
}

func TestDuringAnAppTakeAnArmForAnotherChapterIsRefusedAndTheRecordingChapterIsSilent(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	fake := &fakeLaneRecorder{laneErr: bridge.ErrRecording}
	host.setReadAloudRecording(ids[0], fake)
	if got, err := host.dawArmBoothVoiceIn(context.Background(), host.services(), fake, ids[0]); err != nil || !got.OK || len(fake.laneArmed) != 0 {
		t.Fatalf("the recording chapter: %+v, %v, armed %v, want silent and the DAW not asked", got, err, fake.laneArmed)
	}
	host.setReadAloudRecording("a-chapter-the-app-is-recording", fake)
	got, err := host.dawArmBoothVoiceIn(context.Background(), host.services(), fake, ids[0])
	if err != nil || got.OK || got.Refused == "" || len(fake.laneArmed) != 1 {
		t.Fatalf("another chapter: %+v, %v, armed %v, want the DAW asked and a refusal", got, err, fake.laneArmed)
	}
}
