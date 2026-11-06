package bridge

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"
)

// tracksReadAnswer is what tracks_read_test.lua pins for a chapter folder with one voice and a track after it, the voice's name
// carrying a bar, a line break, emoji and right-to-left text.
func tracksReadAnswer(command []string) [][]string {
	return [][]string{
		{"TRACKS_READ", run(command), "C:/p/Book.rpp", "0", "12"},
		{"TRACKS_ROW", run(command), "0", "{00000001-0000-4000-8000-000000000001}", "Chapter 1", "1"},
		{"TRACKS_ROW", run(command), "1", "{00000002-0000-4000-8000-000000000002}", "Ch 3 | \"The Sea\"\nהים 🌊", "-1"},
		{"TRACKS_ROW", run(command), "2", "{00000003-0000-4000-8000-000000000003}", "", "0"},
		{"TRACKS_READ_END", run(command), "3", "3"},
	}
}

func TestReadTracksIsRefusedWhenTheGateRefuses(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, tracksReadAnswer)
	if _, err := actions.ReadTracks(context.Background()); !errors.Is(err, errGateRefused) {
		t.Fatalf("err = %v, want errGateRefused", err)
	}
	time.Sleep(20 * time.Millisecond)
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a command was written while the gate refuses: %v", got)
	}
	if !Experimental("tracks_read") {
		t.Fatal("tracks_read must stay experimental until the verification pass has confirmed it")
	}
}

func TestReadTracksWithNoBridgeIsUnavailable(t *testing.T) {
	actions := NewActions(nil, switchGate(true))
	if _, err := actions.ReadTracks(context.Background()); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("err = %v, want ErrUnavailable", err)
	}
}

func TestReadTracksSendsTheCommandAndReadsEveryTrackInOrder(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, tracksReadAnswer)
	got, err := actions.ReadTracks(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if commands := fake.commands(); len(commands) != 1 || commands[0][1] != "tracks_read" {
		t.Fatalf("commands = %v, want one tracks_read", commands)
	}
	want := LiveTracks{
		ProjectPath: "C:/p/Book.rpp", ChangeCount: 12, Total: 3,
		Tracks: []LiveTrack{
			{Index: 0, GUID: "{00000001-0000-4000-8000-000000000001}", Name: "Chapter 1", FolderDelta: 1},
			{Index: 1, GUID: "{00000002-0000-4000-8000-000000000002}", Name: "Ch 3 | \"The Sea\" הים 🌊", FolderDelta: -1},
			{Index: 2, GUID: "{00000003-0000-4000-8000-000000000003}", Name: "", FolderDelta: 0},
		},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v\nwant %+v", got, want)
	}
}

func TestReadTracksReadsAnUnsavedProject(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACKS_READ", run(command), "", "1", "0"}, {"TRACKS_READ_END", run(command), "0", "0"}}
	})
	got, err := actions.ReadTracks(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !got.Unsaved || got.ProjectPath != "" || len(got.Tracks) != 0 || got.Tracks == nil {
		t.Fatalf("got %+v, want an unsaved project with an empty, non-nil track list", got)
	}
}

func TestReadTracksSaysWhenTheListWasCut(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{
			{"TRACKS_READ", run(command), "C:/p/Book.rpp", "0", "1"},
			{"TRACKS_ROW", run(command), "0", "{00000001-0000-4000-8000-000000000001}", "One", "0"},
			{"TRACKS_READ_END", run(command), "1", "2003"},
		}
	})
	got, err := actions.ReadTracks(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got.Total != 2003 || len(got.Tracks) != 1 {
		t.Fatalf("got %+v, want one listed of 2003", got)
	}
}

func TestReadTracksWithNoHeaderIsAnError(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACKS_READ_END", run(command), "0", "0"}}
	})
	if _, err := actions.ReadTracks(context.Background()); err == nil {
		t.Fatal("an answer with no TRACKS_READ must be an error, never an empty project")
	}
}

func TestReadTracksSaysWhenTheScriptIsOlderThanTheApp(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "Unsupported workspace command"}}
	})
	if _, err := actions.ReadTracks(context.Background()); !errors.Is(err, ErrScriptOutdated) {
		t.Fatalf("err = %v, want ErrScriptOutdated", err)
	}
}

func TestReadTracksPassesOnREAPERsOwnRefusal(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "This REAPER version cannot list its tracks."}}
	})
	_, err := actions.ReadTracks(context.Background())
	var refusal *RefusalError
	if !errors.As(err, &refusal) || refusal.Sentence != "This REAPER version cannot list its tracks." {
		t.Fatalf("err = %v, want REAPER's refusal", err)
	}
}

func TestReadTracksThatNeverAnswersIsErrNoAnswer(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.ReadTracks(context.Background()); !errors.Is(err, ErrNoAnswer) {
		t.Fatalf("err = %v, want ErrNoAnswer", err)
	}
}
