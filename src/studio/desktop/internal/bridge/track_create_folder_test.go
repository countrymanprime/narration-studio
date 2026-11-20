package bridge

import (
	"context"
	"errors"
	"reflect"
	"strings"
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
	if !reflect.DeepEqual(got, want) {
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
	if !reflect.DeepEqual(got, CreatedFolder{Folder: CreatedTrack{GUID: createdTrack, Name: "Chapter 2", Index: 2}}) {
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

const (
	createdSecond = "{00000005-0000-4000-8000-000000000005}"
	createdThird  = "{00000006-0000-4000-8000-000000000006}"
)

func TestCreateFolderTrackSendsEveryChildInOrderAndReadsThemBack(t *testing.T) {
	// The folder, then the children in the order asked for (#3748): track_create|run|name||Narrator|Mara|Extras. The script answers every child
	// after the first as TRACK_CHILD before TRACK_CREATED, which carries the folder and the first child.
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{
			{"TRACK_CHILD", run(command), createdSecond, "4", strings.Split(command[6], "\n")[0]},
			{"TRACK_CHILD", run(command), createdThird, "5", strings.Split(command[6], "\n")[1]},
			{"TRACK_CREATED", run(command), createdTrack, "2", command[3], createdChild, "3", command[5]},
		}
	})
	got, err := actions.CreateFolderTrack(context.Background(), "Chapter 2", "Narrator", " Mara ", "Extras \U0001F409")
	if err != nil {
		t.Fatal(err)
	}
	commands := fake.commands()
	if len(commands) != 1 || !reflect.DeepEqual(commands[0][3:], []string{"Chapter 2", "", "Narrator", "Mara\nExtras \U0001F409"}) {
		t.Fatalf("commands = %v, want one track_create with the name, no parent and the three children in order", commands)
	}
	want := CreatedFolder{
		Folder: CreatedTrack{GUID: createdTrack, Name: "Chapter 2", Index: 2},
		Child:  CreatedTrack{GUID: createdChild, Name: "Narrator", Index: 3},
		More:   []CreatedTrack{{GUID: createdSecond, Name: "Mara", Index: 4}, {GUID: createdThird, Name: "Extras \U0001F409", Index: 5}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	if children := got.Children(); len(children) != 3 || children[0].Name != "Narrator" || children[2].Name != "Extras \U0001F409" {
		t.Fatalf("Children() = %+v, want the three in order", children)
	}
}

func TestCreateFolderTrackFromAScriptThatKnowsOnlyOneChildAnswersOneChild(t *testing.T) {
	// A script from before #3748 adds the first child and ignores the rest: the answer carries only the first, so the caller can say "1 of 3".
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_CREATED", run(command), createdTrack, "2", command[3], createdChild, "3", command[5]}}
	})
	got, err := actions.CreateFolderTrack(context.Background(), "Chapter 2", "Narrator", "Mara", "Extras")
	if err != nil {
		t.Fatal(err)
	}
	if children := got.Children(); len(children) != 1 || children[0].Name != "Narrator" {
		t.Fatalf("Children() = %+v, want only the Narrator", children)
	}
}

func TestCreateFolderTrackRefusesNoChildOrABlankOneBeforeSending(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_CREATED", run(command), createdTrack, "2", command[3]}}
	})
	if _, err := actions.CreateFolderTrack(context.Background(), "Chapter 2"); !errors.Is(err, ErrTrackNameEmpty) {
		t.Fatalf("no child: err = %v, want ErrTrackNameEmpty", err)
	}
	if _, err := actions.CreateFolderTrack(context.Background(), "Chapter 2", "Narrator", "  ", "Extras"); !errors.Is(err, ErrTrackNameEmpty) {
		t.Fatalf("blank second child: err = %v, want ErrTrackNameEmpty", err)
	}
	time.Sleep(20 * time.Millisecond)
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a blank child was sent: %v", got)
	}
}

func TestCreateFolderTrackRefusalFromTheScriptIsReportedAndAddsNothing(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "Two tracks in a new chapter would have the same name, so nothing was added."}}
	})
	_, err := actions.CreateFolderTrack(context.Background(), "Chapter 2", "Narrator", "Mara", "MARA")
	var refusal *RefusalError
	if !errors.As(err, &refusal) || refusal.Sentence != "Two tracks in a new chapter would have the same name, so nothing was added." {
		t.Fatalf("err = %v, want the script's refusal", err)
	}
}

func TestCreateFolderTrackSendsEveryChildAfterTheFirstInOneFieldWhateverTheirNumber(t *testing.T) {
	// The bridge reads at most eight fields (src/studio/integrations/reaper/narration_ui_bridge.lua), so six children are the first in one field
	// and the other five in one more, never one field each, and a line break inside a name cannot split it in two.
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_CREATED", run(command), createdTrack, "2", command[3], createdChild, "3", command[5]}}
	})
	if _, err := actions.CreateFolderTrack(context.Background(), "Chapter 2", "Narrator", "Mara", "Extras", "Dragon", "King\nGuard", "Page"); err != nil {
		t.Fatal(err)
	}
	commands := fake.commands()
	want := []string{"Chapter 2", "", "Narrator", "Mara\nExtras\nDragon\nKing Guard\nPage"}
	if len(commands) != 1 || !reflect.DeepEqual(commands[0][3:], want) {
		t.Fatalf("commands = %v, want one track_create ending %q", commands, want)
	}
}
