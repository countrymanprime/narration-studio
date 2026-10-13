package bridge

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestLastActionSendsTheKindAndReadsThisOrOther(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	answer := "this"
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"LAST_ACTION", run(command), command[3], answer}}
	})
	got, err := actions.LastAction(context.Background(), "cut_range")
	if err != nil || got != (LastAction{Kind: "cut_range", This: true}) {
		t.Fatalf("LastAction = %+v, %v", got, err)
	}
	if command := fake.commands()[0]; command[1] != "last_action" || len(command) != 4 || command[3] != "cut_range" {
		t.Fatalf("command = %v", command)
	}
	answer = "other"
	if got, err := actions.LastAction(context.Background(), "cut_range"); err != nil || got.This {
		t.Fatalf("LastAction = %+v, %v; want other", got, err)
	}
	answer = "maybe"
	if _, err := actions.LastAction(context.Background(), "cut_range"); err == nil {
		t.Fatal("an answer that is neither this nor other must be an error")
	}
}

func TestLastActionRefusesAnAnswerForAnotherKind(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"LAST_ACTION", run(command), "fx_range", "this"}}
	})
	if _, err := actions.LastAction(context.Background(), "cut_range"); err == nil {
		t.Fatal("an answer for another kind must be an error")
	}
}

func TestUndoLastSendsTheKindAndStepsAndReadsHowManyWereUndone(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	undone := "2"
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"UNDONE_LAST", run(command), command[3], command[4], undone}}
	})
	got, err := actions.UndoLast(context.Background(), "cut_range", 4)
	if err != nil || got != (UndoneLast{Kind: "cut_range", Steps: 4, Undone: 2}) {
		t.Fatalf("UndoLast = %+v, %v", got, err)
	}
	if command := fake.commands()[0]; command[1] != "undo_last" || len(command) != 5 || command[3] != "cut_range" || command[4] != "4" {
		t.Fatalf("command = %v", command)
	}
	undone = "0"
	if got, err := actions.UndoLast(context.Background(), "cut_range", 1); err != nil || got.Undone != 0 {
		t.Fatalf("UndoLast = %+v, %v; want 0 undone", got, err)
	}
	for _, bad := range []string{"5", "-1"} {
		undone = bad
		if _, err := actions.UndoLast(context.Background(), "cut_range", 4); err == nil {
			t.Errorf("%s undone of 4 must be an error", bad)
		}
	}
}

func TestUndoLastRefusesWhileRecordingAndPassesOnTheScriptsSentence(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var message string
	startFakeReaper(t, client, dir, func(command []string) [][]string { return [][]string{{"ERROR", run(command), message}} })
	message = "REAPER is recording. Stop recording first."
	if _, err := actions.UndoLast(context.Background(), "cut_range", 1); !errors.Is(err, ErrRecording) {
		t.Fatalf("err = %v, want ErrRecording", err)
	}
	message = "That is not an action this app can undo."
	_, err := actions.UndoLast(context.Background(), "cut_range", 1)
	var refusal *RefusalError
	if !errors.As(err, &refusal) || !strings.Contains(err.Error(), "not an action") {
		t.Fatalf("err = %v, want the script's sentence", err)
	}
	message = "Unsupported workspace command"
	if _, err := actions.LastAction(context.Background(), "cut_range"); !errors.Is(err, ErrScriptOutdated) {
		t.Fatalf("err = %v, want ErrScriptOutdated", err)
	}
}

// Only a kind in UndoKinds is sent, never a label, and only 1 to 12 steps.
func TestUndoLastAndLastActionCheckTheirArgumentsBeforeAnythingIsSent(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	for _, kind := range []string{"", "fx_range", "Narration Utils: delete words", "CUT_RANGE"} {
		if _, err := actions.LastAction(context.Background(), kind); !errors.Is(err, ErrUndoKind) {
			t.Errorf("LastAction(%q) = %v, want ErrUndoKind", kind, err)
		}
		if _, err := actions.UndoLast(context.Background(), kind, 1); !errors.Is(err, ErrUndoKind) {
			t.Errorf("UndoLast(%q) = %v, want ErrUndoKind", kind, err)
		}
	}
	for _, steps := range []int{0, -1, MaxUndoLastSteps + 1} {
		if _, err := actions.UndoLast(context.Background(), "cut_range", steps); err == nil {
			t.Errorf("%d steps must be refused", steps)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestUndoLastAndLastActionAreExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.LastAction(context.Background(), "cut_range"); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("LastAction: %v", err)
	}
	if _, err := actions.UndoLast(context.Background(), "cut_range", 1); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("UndoLast: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	if !Experimental("last_action") || !Experimental("undo_last") {
		t.Error("last_action and undo_last must stay experimental until the verification pass")
	}
}
