package bridge

import (
	"context"
	"errors"
	"testing"
	"time"
)

// The answers as src/studio/integrations/reaper/tests/voice_sample_region_test.lua pins them.
const sampleName = VoiceSampleRegionPrefix + "Zoë | 100% - \"why?\" \U0001F30A"

func TestVoiceSampleRegionIsRefusedWhenTheGateRefuses(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"VOICE_SAMPLE_KEPT", run(command), "1", "created"}}
	})
	if _, err := actions.AddVoiceSampleRegion(context.Background(), 1, 2, sampleName); !errors.Is(err, errGateRefused) {
		t.Fatalf("err = %v, want errGateRefused", err)
	}
	time.Sleep(20 * time.Millisecond)
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a command was written while the gate refuses: %v", got)
	}
	if !Experimental("keep_voice_sample") || !Experimental("read_voice_samples") {
		t.Fatal("the voice sample commands stay experimental until the in-REAPER check has run")
	}
}

func TestAddVoiceSampleRegionSendsNoNumberTheRangeAndTheNameWhole(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"VOICE_SAMPLE_KEPT", run(command), "4", "created"}}
	})
	got, err := actions.AddVoiceSampleRegion(context.Background(), 12.5, 19.25, sampleName)
	if err != nil {
		t.Fatal(err)
	}
	commands := fake.commands()
	if len(commands) != 1 || commands[0][1] != "keep_voice_sample" || commands[0][3] != "" || commands[0][4] != "12.500000" || commands[0][5] != "19.250000" || commands[0][6] != sampleName {
		t.Fatalf("commands = %q", commands)
	}
	if got != (VoiceSampleRegionKept{Number: 4, Outcome: "created"}) {
		t.Fatalf("got %+v", got)
	}
}

func TestVoiceSampleRegionRefusesWhatREAPERWouldTakeWronglyBeforeSending(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"VOICE_SAMPLE_KEPT", run(command), "1", "created"}}
	})
	nan := 0.0
	nan = nan / nan
	for _, c := range []struct {
		start, end float64
		name       string
	}{
		{-1, 2, sampleName}, {5, 5, sampleName}, {6, 5, sampleName}, {nan, 5, sampleName}, {1, 2, ""}, {1, 2, "  "},
		{1, 2, "Chapter 1"}, // not a voice sample name: the script would never move it, and the app must not add it
	} {
		if _, err := actions.AddVoiceSampleRegion(context.Background(), c.start, c.end, c.name); !errors.Is(err, ErrBadVoiceSampleRegion) {
			t.Fatalf("Add(%v, %v, %q) err = %v", c.start, c.end, c.name, err)
		}
	}
	if _, err := actions.MoveVoiceSampleRegion(context.Background(), 0, 1, 2, sampleName); !errors.Is(err, ErrBadVoiceSampleRegion) {
		t.Fatalf("Move(0) err = %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a bad region was sent: %v", got)
	}
}

func TestMoveVoiceSampleRegionSendsTheNumberAndAStaleNumberIsErrStale(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		if command[3] == "9" {
			return [][]string{{"VOICE_SAMPLE_STALE", run(command), "9"}}
		}
		return [][]string{{"VOICE_SAMPLE_KEPT", run(command), command[3], "moved"}}
	})
	got, err := actions.MoveVoiceSampleRegion(context.Background(), 2, 41, 46.5, sampleName)
	if err != nil || got != (VoiceSampleRegionKept{Number: 2, Outcome: "moved"}) {
		t.Fatalf("got %+v, %v", got, err)
	}
	_, err = actions.MoveVoiceSampleRegion(context.Background(), 9, 41, 46.5, sampleName)
	var stale *VoiceSampleRegionStaleError
	if !errors.As(err, &stale) || stale.Number != 9 || !errors.Is(err, ErrStale) {
		t.Fatalf("err = %v, want a stale region 9", err)
	}
	if commands := fake.commands(); len(commands) != 2 || commands[0][3] != "2" {
		t.Fatalf("commands = %q", commands)
	}
}

func TestVoiceSampleRegionRefusalWhileRecordingIsErrRecording(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "REAPER is recording. Stop recording first."}}
	})
	if _, err := actions.AddVoiceSampleRegion(context.Background(), 1, 2, sampleName); !errors.Is(err, ErrRecording) {
		t.Fatalf("err = %v, want ErrRecording", err)
	}
}

func TestReadVoiceSampleRegionsSendsThePrefixAndReadsTheRegionsBack(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		id := run(command)
		return [][]string{
			{"VOICE_SAMPLE_REGION", id, "3", "40.000000", "45.000000", sampleName},
			{"VOICE_SAMPLE_REGION", id, "2", "50.000000", "55.500000", VoiceSampleRegionPrefix + "Alice - calm"},
			{"VOICE_SAMPLES_READ", id, "2", "7"},
		}
	})
	got, err := actions.ReadVoiceSampleRegions(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if commands := fake.commands(); len(commands) != 1 || commands[0][1] != "read_voice_samples" || commands[0][3] != VoiceSampleRegionPrefix {
		t.Fatalf("commands = %q", commands)
	}
	want := VoiceSampleRegions{ChangeCount: 7, Regions: []VoiceSampleRegion{
		{Number: 3, Start: 40, End: 45, Name: sampleName},
		{Number: 2, Start: 50, End: 55.5, Name: VoiceSampleRegionPrefix + "Alice - calm"},
	}}
	if got.ChangeCount != want.ChangeCount || len(got.Regions) != 2 || got.Regions[0] != want.Regions[0] || got.Regions[1] != want.Regions[1] {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestReadVoiceSampleRegionsWithNoneKeptIsEmpty(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"VOICE_SAMPLES_READ", run(command), "0", "0"}}
	})
	got, err := actions.ReadVoiceSampleRegions(context.Background())
	if err != nil || len(got.Regions) != 0 {
		t.Fatalf("got %+v, %v", got, err)
	}
}
