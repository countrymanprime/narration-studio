package bridge

import (
	"context"
	"errors"
	"testing"
	"time"
)

// The new track as src/studio/integrations/reaper/tests/track_create_test.lua pins its answer.
const createdTrack = "{00000003-0000-4000-8000-000000000003}"

func TestCreateTrackIsRefusedWhenTheGateRefuses(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_CREATED", run(command), createdTrack, "2", command[3]}}
	})
	if _, err := actions.CreateTrack(context.Background(), "Chapter 2"); !errors.Is(err, errGateRefused) {
		t.Fatalf("err = %v, want errGateRefused", err)
	}
	time.Sleep(20 * time.Millisecond)
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a command was written while the gate refuses: %v", got)
	}
	if !Experimental("track_create") {
		t.Fatal("track_create must stay experimental until the verification pass has confirmed it")
	}
}

func TestCreateTrackWithNoBridgeIsUnavailable(t *testing.T) {
	actions := NewActions(nil, switchGate(true))
	if _, err := actions.CreateTrack(context.Background(), "Chapter 2"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("err = %v, want ErrUnavailable", err)
	}
}

func TestCreateTrackSendsTheNameAndReadsTheNewTrackBack(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_CREATED", run(command), createdTrack, "2", command[3]}}
	})
	name := "Chapter 7 \U0001F30A \"The Sea\" הים | 100%"
	got, err := actions.CreateTrack(context.Background(), name)
	if err != nil {
		t.Fatal(err)
	}
	commands := fake.commands()
	if len(commands) != 1 || commands[0][1] != "track_create" || commands[0][3] != name {
		t.Fatalf("commands = %v, want one track_create naming the track", commands)
	}
	if got != (CreatedTrack{GUID: createdTrack, Name: name, Index: 2}) {
		t.Fatalf("got %+v", got)
	}
}

func TestCreateTrackTrimsTheNameAndRefusesABlankOneBeforeSending(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_CREATED", run(command), createdTrack, "2", command[3]}}
	})
	for _, name := range []string{"", "   ", "\n\t"} {
		if _, err := actions.CreateTrack(context.Background(), name); !errors.Is(err, ErrTrackNameEmpty) {
			t.Fatalf("CreateTrack(%q) err = %v, want ErrTrackNameEmpty", name, err)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a blank name was sent: %v", got)
	}
	if _, err := actions.CreateTrack(context.Background(), "  Chapter 2 "); err != nil {
		t.Fatal(err)
	}
	if got := fake.commands(); len(got) != 1 || got[0][3] != "Chapter 2" {
		t.Fatalf("commands = %v, want the trimmed name", got)
	}
}

func TestCreateTrackWhileREAPERRecordsIsErrRecording(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "REAPER is recording. Stop recording first."}}
	})
	if _, err := actions.CreateTrack(context.Background(), "Chapter 2"); !errors.Is(err, ErrRecording) {
		t.Fatalf("err = %v, want ErrRecording", err)
	}
}

func TestCreateTrackReadsTheScriptsEmptyNameRefusal(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "The new track needs a name."}}
	})
	if _, err := actions.CreateTrack(context.Background(), "Chapter 2"); !errors.Is(err, ErrTrackNameEmpty) {
		t.Fatalf("err = %v, want ErrTrackNameEmpty", err)
	}
}

func TestCreateTrackSaysWhenTheScriptIsOlderThanTheApp(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "Unsupported workspace command"}}
	})
	if _, err := actions.CreateTrack(context.Background(), "Chapter 2"); !errors.Is(err, ErrScriptOutdated) {
		t.Fatalf("err = %v, want ErrScriptOutdated", err)
	}
}
