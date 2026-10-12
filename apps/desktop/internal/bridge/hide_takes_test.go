package bridge

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestHideTakesSendsTheItemAndKeptTakeAndReturnsTheCountHidden(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TAKES_HIDDEN", run(command), testItem, "2", "1"}}
	})
	got, err := actions.HideTakes(context.Background(), testItem, testTake)
	if err != nil || got != (TakesHidden{ItemGUID: testItem, Hidden: 2, Changed: true}) {
		t.Fatalf("HideTakes = %+v, %v; want 2 hidden, changed", got, err)
	}
	if command := fake.commands()[0]; command[1] != "hide_takes" || command[3] != testItem || command[4] != testTake {
		t.Fatalf("command = %v", command)
	}
}

func TestHideTakesReportsAStaleItemOrTakeAndRefusesAnswersForOthers(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var answer func([]string) [][]string
	startFakeReaper(t, client, dir, func(command []string) [][]string { return answer(command) })

	answer = func(command []string) [][]string { return [][]string{{"ITEM_STALE", run(command), testItem, "item"}} }
	_, err := actions.HideTakes(context.Background(), testItem, testTake)
	var stale *StaleError
	if !errors.As(err, &stale) || stale.Reason != "item" || !errors.Is(err, ErrStale) {
		t.Fatalf("err = %v, want an item StaleError", err)
	}

	answer = func(command []string) [][]string {
		return [][]string{{"TAKES_HIDDEN", run(command), "{00000009-0000-4000-8000-000000000009}", "1", "1"}}
	}
	if _, err := actions.HideTakes(context.Background(), testItem, testTake); err == nil {
		t.Fatal("an answer for another item must be an error")
	}

	answer = func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "REAPER is recording. Stop recording first."}}
	}
	if _, err := actions.HideTakes(context.Background(), testItem, testTake); !errors.Is(err, ErrRecording) {
		t.Fatalf("err = %v, want ErrRecording", err)
	}

	if _, err := actions.HideTakes(context.Background(), testItem, ""); !errors.Is(err, ErrNoItemIdentity) {
		t.Fatalf("err = %v, want ErrNoItemIdentity before anything is sent", err)
	}
}

func TestHideTakesIsExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.HideTakes(context.Background(), testItem, testTake); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("HideTakes: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	if !Experimental("hide_takes") {
		t.Error("hide_takes must stay experimental until the verification pass")
	}
}
