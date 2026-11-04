package bridge

import (
	"context"
	"errors"
	"testing"
	"time"
)

// The chapter folder's child as src/studio/integrations/reaper/tests/track_create_test.lua pins it.
const createdChild = "{00000004-0000-4000-8000-000000000004}"

func TestCreateFolderTrackSendsTheNameNoParentAndTheChildAndReadsBothBack(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_CREATED", run(command), createdTrack, "2", command[3], createdChild, "3", command[5]}}
	})
	name := "Chapter 7 \U0001F30A הים"
	got, err := actions.CreateFolderTrack(context.Background(), " "+name+" ", "Narrator")
	if err != nil {
		t.Fatal(err)
	}
	commands := fake.commands()
	if len(commands) != 1 || len(commands[0]) != 6 || commands[0][1] != "track_create" || commands[0][3] != name || commands[0][4] != "" || commands[0][5] != "Narrator" {
		t.Fatalf("commands = %v, want one track_create with the name, no parent and the child", commands)
	}
	want := CreatedFolder{Folder: CreatedTrack{GUID: createdTrack, Name: name, Index: 2}, Child: CreatedTrack{GUID: createdChild, Name: "Narrator", Index: 3}}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestCreateFolderTrackFromAnOlderScriptIsAPlainTrackWithNoChild(t *testing.T) {
	// A script older than the chapter folder ignores the child's name and appends a plain track: the answer says so, never a made-up child.
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_CREATED", run(command), createdTrack, "2", command[3]}}
	})
	got, err := actions.CreateFolderTrack(context.Background(), "Chapter 2", "Narrator")
	if err != nil {
		t.Fatal(err)
	}
	if got != (CreatedFolder{Folder: CreatedTrack{GUID: createdTrack, Name: "Chapter 2", Index: 2}}) {
		t.Fatalf("got %+v", got)
	}
}

func TestCreateFolderTrackRefusesABlankNameOrChildBeforeSending(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_CREATED", run(command), createdTrack, "2", command[3], createdChild, "3", command[5]}}
	})
	if _, err := actions.CreateFolderTrack(context.Background(), " ", "Narrator"); !errors.Is(err, ErrTrackNameEmpty) {
		t.Fatalf("blank name: err = %v, want ErrTrackNameEmpty", err)
	}
	if _, err := actions.CreateFolderTrack(context.Background(), "Chapter 2", "\t"); !errors.Is(err, ErrTrackNameEmpty) {
		t.Fatalf("blank child: err = %v, want ErrTrackNameEmpty", err)
	}
	time.Sleep(20 * time.Millisecond)
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a blank name was sent: %v", got)
	}
}

func TestCreateFolderTrackWhileREAPERRecordsIsErrRecording(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "REAPER is recording. Stop recording first."}}
	})
	if _, err := actions.CreateFolderTrack(context.Background(), "Chapter 2", "Narrator"); !errors.Is(err, ErrRecording) {
		t.Fatalf("err = %v, want ErrRecording", err)
	}
}
