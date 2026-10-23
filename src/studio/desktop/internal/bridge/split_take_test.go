package bridge

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

const testNewTake = "{00000001-0000-4000-8000-000000000001}"

func TestSplitTakeSendsTheItemTakeAndTimeAndReturnsTheNewTake(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TAKE_SPLIT", run(command), testItem, testTake, testNewTake, "15.500", "1"}}
	})
	got, err := actions.SplitTake(context.Background(), testItem, testTake, 15.5)
	want := TakeSplit{ItemGUID: testItem, TakeGUID: testTake, NewTakeGUID: testNewTake, At: 15.5, UndoPoints: 1}
	if err != nil || got != want {
		t.Fatalf("SplitTake = %+v, %v; want %+v", got, err, want)
	}
	command := fake.commands()[0]
	if command[1] != "split_take" || command[3] != testItem || command[4] != testTake || command[5] != "15.500" {
		t.Fatalf("command = %v", command)
	}
}

func TestSplitTakeReportsAStaleItemOrTakeAndRefusesAnswersForOthers(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var answer func([]string) [][]string
	startFakeReaper(t, client, dir, func(command []string) [][]string { return answer(command) })

	for _, reason := range []string{"item", "take"} {
		answer = func(command []string) [][]string { return [][]string{{"ITEM_STALE", run(command), testItem, reason}} }
		_, err := actions.SplitTake(context.Background(), testItem, testTake, 15.5)
		var stale *StaleError
		if !errors.As(err, &stale) || stale.Reason != reason || !errors.Is(err, ErrStale) {
			t.Fatalf("err = %v, want a %s StaleError", err, reason)
		}
	}

	answer = func(command []string) [][]string {
		return [][]string{{"TAKE_SPLIT", run(command), testItem, "{00000009-0000-4000-8000-000000000009}", testNewTake, "15.500", "1"}}
	}
	if _, err := actions.SplitTake(context.Background(), testItem, testTake, 15.5); err == nil {
		t.Fatal("an answer for another take must be an error")
	}

	answer = func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "REAPER is recording. Stop recording first."}}
	}
	if _, err := actions.SplitTake(context.Background(), testItem, testTake, 15.5); !errors.Is(err, ErrRecording) {
		t.Fatalf("err = %v, want ErrRecording", err)
	}

	sentence := "The second read is longer than the first, so it cannot be one of its takes. Nothing was split."
	answer = func(command []string) [][]string { return [][]string{{"ERROR", run(command), sentence}} }
	if _, err := actions.SplitTake(context.Background(), testItem, testTake, 15.5); err == nil || !strings.Contains(err.Error(), "longer than the first") {
		t.Fatalf("err = %v, want REAPER's own sentence", err)
	}
}

func TestSplitTakeChecksItsArgumentsBeforeAnythingIsSent(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.SplitTake(context.Background(), testItem, "", 15.5); !errors.Is(err, ErrNoItemIdentity) {
		t.Fatalf("err = %v, want ErrNoItemIdentity", err)
	}
	if _, err := actions.SplitTake(context.Background(), testItem, testTake, -1); err == nil {
		t.Fatal("a negative time must be refused")
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestSplitTakeIsExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.SplitTake(context.Background(), testItem, testTake, 15.5); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("SplitTake: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	if !Experimental("split_take") {
		t.Error("split_take must stay experimental until the verification pass")
	}
}
