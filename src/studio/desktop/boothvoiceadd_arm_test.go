package main

import (
	"context"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

func addWithRecorder(t *testing.T, host *Host, recorder dawport.Recorder, creator dawport.TrackCreator, chapterID, name string) BoothVoiceAdded {
	t.Helper()
	got, err := host.boothVoiceAddArming(context.Background(), host.services(), recorder, creator, createAvailable(), chapterID, name, nil)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

// #3670: a track the Booth just created is armed and monitored at once, as a voice chosen from the list is.
func TestANewVoiceIsArmedAndMonitoredAsPartOfTheAdd(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	fake := &fakeLaneRecorder{}
	got := addWithRecorder(t, host, fake, &fakeChildCreator{}, ids[0], "King")
	if got.Outcome != "added" || got.Reason != "" {
		t.Fatalf("got %+v", got)
	}
	if len(fake.laneArmed) != 1 || fake.laneArmed[0] != addedVoiceTrack || len(fake.laneMonitor) != 1 || !fake.laneMonitor[0] {
		t.Fatalf("armed %v with monitor %v, want the new voice armed once with monitoring", fake.laneArmed, fake.laneMonitor)
	}
}

// A lane adopted after a late create is armed too, once.
func TestAnAdoptedLateVoiceIsArmedAndMonitored(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	fake := &fakeLaneRecorder{}
	creator := &lateConfirmCreator{host: host, t: t}
	got := addWithRecorder(t, host, fake, creator, ids[0], "King")
	if got.Outcome != "added" || got.TrackGUID != lateVoiceTrack {
		t.Fatalf("got %+v", got)
	}
	if len(fake.laneArmed) != 1 || fake.laneArmed[0] != lateVoiceTrack || !fake.laneMonitor[0] {
		t.Fatalf("armed %v monitor %v", fake.laneArmed, fake.laneMonitor)
	}
}

// The DAW refusing the arm leaves the voice added and chosen, and says so: the narrator is never told it is armed when it is not.
func TestAnAddWhoseArmFailsKeepsTheVoiceAndSaysTheArmFailed(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	fake := &fakeLaneRecorder{laneErr: bridge.ErrRecording}
	got := addWithRecorder(t, host, fake, &fakeChildCreator{}, ids[0], "King")
	if got.Outcome != "added" || got.TrackGUID != addedVoiceTrack || got.Reason == "" || got.Message == "" {
		t.Fatalf("got %+v, want added with the arm's reason and message", got)
	}
	if host.boothVoices.For(ids[0]) != addedVoiceTrack {
		t.Fatal("the voice is not chosen")
	}
}

// A voice chosen meanwhile keeps the arm too: the late lane is listed, never armed over it.
func TestALateAddDoesNotArmOverAChoiceMadeMeanwhile(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	fake := &fakeLaneRecorder{}
	creator := &choosingCreator{during: func() { host.boothVoices.choose(ids[0], voiceNarratorTrack) }}
	addWithRecorder(t, host, fake, creator, ids[0], "King")
	if len(fake.laneArmed) != 0 {
		t.Fatalf("armed %v over a newer choice", fake.laneArmed)
	}
}

// No recorder (the DAW is not linked): the add still works and nothing is armed.
func TestAnAddWithNoRecorderArmsNothing(t *testing.T) {
	host, ids := newVoiceFolderHost(t, "folders")
	got := addWithRecorder(t, host, nil, &fakeChildCreator{}, ids[0], "King")
	if got.Outcome != "added" || got.Reason != "" {
		t.Fatalf("got %+v", got)
	}
}
