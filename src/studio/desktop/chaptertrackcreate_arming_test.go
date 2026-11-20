package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/dawport/dawporttest"
)

// hostWithArmingDAW wires a DAW port whose creator and recorder are the given fakes, so ChapterTrackCreate (the binding every screen calls) finds both.
func hostWithArmingDAW(t *testing.T, host *Host, creator dawport.TrackCreator, recorder dawport.Recorder) {
	t.Helper()
	adapter := rolesAdapter{Fake: dawporttest.NewFake(dawport.KindREAPER, dawporttest.Levels(dawport.Supported)), creator: creator, recorder: recorder}
	host.dawPortResolver = dawport.NewResolver(dawport.ResolverConfig{
		Adapter: adapter,
		Runtime: func() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} },
	})
}

// #3670: a track made by ChapterTrackCreate is armed and monitored on every screen that creates one (the binding is the one place).
func TestChapterTrackCreateArmsTheNewTrackWithMonitoring(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	recorder := &fakeLaneRecorder{}
	hostWithArmingDAW(t, host, &fakeCreator{}, recorder)
	raw, err := host.ChapterTrackCreate(ids[0])
	if err != nil {
		t.Fatal(err)
	}
	got := decodeBinding(t, raw)
	if got["outcome"] != "created" || got["armMessage"] != nil {
		t.Fatalf("answer %v", got)
	}
	if len(recorder.laneArmed) != 1 || recorder.laneArmed[0] != createdTrackGUID || !recorder.laneMonitor[0] {
		t.Fatalf("armed %v monitor %v, want the new track armed once with monitoring", recorder.laneArmed, recorder.laneMonitor)
	}
}

// With the DAW refusing, the track is still added and linked, and the answer says the arm failed.
func TestChapterTrackCreateSaysWhenTheArmWasRefused(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	hostWithArmingDAW(t, host, &fakeCreator{}, &fakeLaneRecorder{laneErr: bridge.ErrRecording})
	raw, err := host.ChapterTrackCreate(ids[0])
	if err != nil {
		t.Fatal(err)
	}
	got := decodeBinding(t, raw)
	message, _ := got["armMessage"].(string)
	if got["outcome"] != "created" || !strings.Contains(message, "recording") {
		t.Fatalf("answer %v", got)
	}
}

// A refused create arms nothing, and a DAW with no armed tracks (no recorder) still answers created.
func TestChapterTrackCreateArmsNothingWhenNothingWasCreatedOrNothingCanArm(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	recorder := &fakeLaneRecorder{}
	hostWithArmingDAW(t, host, &fakeCreator{err: bridge.ErrNoAnswer}, recorder)
	if _, err := host.ChapterTrackCreate(ids[0]); err != nil {
		t.Fatal(err)
	}
	if len(recorder.laneArmed) != 0 {
		t.Fatalf("armed %v after a refused create", recorder.laneArmed)
	}
	host2, ids2 := newTestHostForChapterMatch(t)
	hostWithArmingDAW(t, host2, &fakeCreator{}, nil)
	raw, err := host2.ChapterTrackCreate(ids2[0])
	if err != nil || decodeBinding(t, raw)["outcome"] != "created" {
		t.Fatalf("answer %s err %v", raw, err)
	}
}

// A chapter folder with a Narrator child arms the Narrator voice (what the next take records on), never the folder itself.
func TestChapterTrackCreateInVoiceFoldersArmsTheNarratorNotTheFolder(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, "folders")
	recorder := &fakeLaneRecorder{}
	hostWithArmingDAW(t, host, &fakeFolderCreator{}, recorder)
	raw, err := host.ChapterTrackCreate(ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if decodeBinding(t, raw)["outcome"] != "created" {
		t.Fatalf("answer %s", raw)
	}
	if len(recorder.laneArmed) != 1 || recorder.laneArmed[0] != createdVoiceGUID || !recorder.laneMonitor[0] {
		t.Fatalf("armed %v monitor %v, want the Narrator child armed with monitoring", recorder.laneArmed, recorder.laneMonitor)
	}
}

// With "DAW follows your chapter" off the new track is still armed, without monitoring.
func TestChapterTrackCreateWithTheSwitchOffArmsWithoutMonitoring(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	switchFollow(t, host, "false")
	recorder := &fakeLaneRecorder{}
	hostWithArmingDAW(t, host, &fakeCreator{}, recorder)
	if _, err := host.ChapterTrackCreate(ids[0]); err != nil {
		t.Fatal(err)
	}
	if len(recorder.laneArmed) != 1 || recorder.laneMonitor[0] {
		t.Fatalf("armed %v monitor %v, want armed once without monitoring", recorder.laneArmed, recorder.laneMonitor)
	}
}

// A take of this app starting or running keeps its arm: the create does not move it.
func TestChapterTrackCreateDuringATakeArmsNothing(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	recorder := &fakeLaneRecorder{}
	hostWithArmingDAW(t, host, &fakeCreator{}, recorder)
	host.mu.Lock()
	host.readAloudStarting++
	host.mu.Unlock()
	raw, err := host.ChapterTrackCreate(ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if decodeBinding(t, raw)["outcome"] != "created" || len(recorder.laneArmed) != 0 {
		t.Fatalf("answer %s armed %v", raw, recorder.laneArmed)
	}
}

// The refusal sentences are the create's own: no record-start words, a clipped clean name, and the folder named as a folder.
func TestChapterTrackCreateArmRefusalSentences(t *testing.T) {
	cases := map[string]error{
		"recording": bridge.ErrRecording,
		"deadline":  context.DeadlineExceeded,
		"late":      bridge.ErrAnswerLate,
		"no answer": bridge.ErrNoAnswer,
		"stale":     &bridge.TrackStaleError{GUID: createdTrackGUID},
		"other":     errors.New("boom"),
	}
	for name, err := range cases {
		message := createArmFailure("REAPER", err)
		for _, bad := range []string{"Nothing started", "3 seconds", "then try again", "audio engine panel"} {
			if strings.Contains(message, bad) {
				t.Errorf("%s: %q says %q", name, message, bad)
			}
		}
		if message == "" {
			t.Errorf("%s: no sentence", name)
		}
	}
	for in, want := range map[string]string{
		"":                       "new track",
		"   \n\t ":               "new track",
		"A\u202eB\x00C":          "A B C",
		strings.Repeat("x", 500): strings.Repeat("x", 60) + "…",
	} {
		if got := clipTrackName(in); got != want {
			t.Errorf("clipTrackName(%q) = %q, want %q", in, got, want)
		}
	}
}

// A take running on another chapter leaves its arm alone too, and the answer says the new track was not armed.
func TestChapterTrackCreateWhileThisAppRecordsSaysItWasNotArmed(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	recorder := &fakeLaneRecorder{}
	hostWithArmingDAW(t, host, &fakeCreator{}, recorder)
	host.mu.Lock()
	host.readAloudStarting++
	host.mu.Unlock()
	raw, err := host.ChapterTrackCreate(ids[0])
	if err != nil {
		t.Fatal(err)
	}
	message, _ := decodeBinding(t, raw)["armMessage"].(string)
	if len(recorder.laneArmed) != 0 || !strings.Contains(message, "take") {
		t.Fatalf("armed %v message %q", recorder.laneArmed, message)
	}
}
