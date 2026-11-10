package bridge

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestSaveProjectSendsTheLinkedFileAndReadsWhatWasSaved(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"SAVED", run(command), "3", "12"}}
	})
	file := `C:\Books\My Book|v2.rpp`
	got, err := actions.SaveProject(context.Background(), file)
	if err != nil || got != (ProjectSaved{Tracks: 3, Items: 12}) {
		t.Fatalf("SaveProject = %+v, %v", got, err)
	}
	if command := fake.commands()[0]; command[1] != "save_project" || len(command) != 4 || command[3] != file {
		t.Fatalf("command = %v", command)
	}
}

func TestSaveProjectSendsNothingWithoutAFile(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.SaveProject(context.Background(), ""); err == nil {
		t.Fatal("no project file must be refused")
	}
	if n := len(fake.commands()); n != 0 {
		t.Fatalf("%d commands sent", n)
	}
}

func TestSaveProjectPassesOnTheScriptsRefusals(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var message string
	startFakeReaper(t, client, dir, func(command []string) [][]string { return [][]string{{"ERROR", run(command), message}} })
	message = "REAPER is recording. Stop recording first."
	if _, err := actions.SaveProject(context.Background(), "Book.rpp"); !errors.Is(err, ErrRecording) {
		t.Fatalf("err = %v, want ErrRecording", err)
	}
	message = "This REAPER project has never been saved, and saving it would open a file dialog in REAPER. Save it once in REAPER (File > Save project), then read again."
	_, err := actions.SaveProject(context.Background(), "Book.rpp")
	var refusal *RefusalError
	if !errors.As(err, &refusal) || !strings.Contains(err.Error(), "never been saved") {
		t.Fatalf("err = %v, want the script's sentence", err)
	}
	message = "Unsupported workspace command"
	if _, err := actions.SaveProject(context.Background(), "Book.rpp"); !errors.Is(err, ErrScriptOutdated) {
		t.Fatalf("err = %v, want ErrScriptOutdated", err)
	}
}

func TestSaveProjectRefusesAnAnswerItCannotRead(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"SAVED", run(command), "many", "1"}}
	})
	if _, err := actions.SaveProject(context.Background(), "Book.rpp"); err == nil {
		t.Fatal("a count that is not a number must be an error")
	}
}
