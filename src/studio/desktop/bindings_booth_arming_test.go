package main

import (
	"context"
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
	result, err := dawArmBoothVoiceIn(context.Background(), host.services(), "REAPER", recorder, chapterID, true)
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
	on := &fakeLaneRecorder{}
	boothVoiceSet(t, host, on, ids[0], voiceQueenTrack)
	if len(on.laneMonitor) != 1 || !on.laneMonitor[0] {
		t.Fatalf("with Booth.follow_chapter_in_daw on (the default) the voice is monitored: %v", on.laneMonitor)
	}
	off := "false"
	if err := host.settings.Save("Booth", "global", map[string]*string{"follow_chapter_in_daw": &off}); err != nil {
		t.Fatal(err)
	}
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
	if refused.OK || !strings.Contains(refused.Refused, "did not") {
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
	off := "false"
	if err := host.settings.Save("Booth", "global", map[string]*string{"follow_chapter_in_daw": &off}); err != nil {
		t.Fatal(err)
	}
	fake := &fakeLaneRecorder{}
	// The binding reads the switch itself: a voice chosen during a take is armed after it, and the monitoring waits for the switch.
	if _, err := dawArmBoothVoiceIn(context.Background(), host.services(), "REAPER", fake, ids[0], followChapterSetting(host.services())); err != nil {
		t.Fatal(err)
	}
	if len(fake.laneArmed) != 1 || fake.laneMonitor[0] {
		t.Fatalf("armed %v monitor %v, want the voice armed and not monitored", fake.laneArmed, fake.laneMonitor)
	}
}
