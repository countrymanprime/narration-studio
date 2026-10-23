package bridge

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

var testClicks = []Click{{Start: 4, End: 4.003}, {Start: 8.5, End: 8.502}}

func TestRepairClickSendsTheTakeAndTheClicks(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"CLICKS_REPAIRED", run(command), testItem, testTake, "2", "1"}}
	})
	got, err := actions.RepairClick(context.Background(), testItem, testTake, testClicks)
	want := ClicksRepaired{ItemGUID: testItem, TakeGUID: testTake, Clicks: 2, UndoPoints: 1}
	if err != nil || got != want {
		t.Fatalf("RepairClick = %+v, %v; want %+v", got, err, want)
	}
	command := fake.commands()[0]
	if command[1] != "repair_click" || command[3] != testItem || command[4] != testTake || command[5] != "4.000000:4.003000,8.500000:8.502000" {
		t.Fatalf("command = %v", command)
	}
}

func TestRepairClickReportsAStaleItemOrTakeAndRefusesAnswersForOthers(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var answer func([]string) [][]string
	startFakeReaper(t, client, dir, func(command []string) [][]string { return answer(command) })

	for _, reason := range []string{"item", "take"} {
		answer = func(command []string) [][]string { return [][]string{{"ITEM_STALE", run(command), testItem, reason}} }
		_, err := actions.RepairClick(context.Background(), testItem, testTake, testClicks)
		var stale *StaleError
		if !errors.As(err, &stale) || stale.Reason != reason || !errors.Is(err, ErrStale) {
			t.Fatalf("err = %v, want a %s StaleError", err, reason)
		}
	}

	answer = func(command []string) [][]string {
		return [][]string{{"CLICKS_REPAIRED", run(command), testItem, "{00000009-0000-4000-8000-000000000009}", "2", "1"}}
	}
	if _, err := actions.RepairClick(context.Background(), testItem, testTake, testClicks); err == nil {
		t.Fatal("an answer for another take must be an error")
	}

	answer = func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "REAPER is recording. Stop recording first."}}
	}
	if _, err := actions.RepairClick(context.Background(), testItem, testTake, testClicks); !errors.Is(err, ErrRecording) {
		t.Fatalf("err = %v, want ErrRecording", err)
	}

	sentence := "That take already has volume changes where a click would be repaired, so no click was repaired."
	answer = func(command []string) [][]string { return [][]string{{"ERROR", run(command), sentence}} }
	_, err := actions.RepairClick(context.Background(), testItem, testTake, testClicks)
	var refusal *RefusalError
	if !errors.As(err, &refusal) || !strings.Contains(err.Error(), "already has volume changes") {
		t.Fatalf("err = %v, want REAPER's own sentence", err)
	}
}

func TestRepairClickChecksItsArgumentsBeforeAnythingIsSent(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.RepairClick(context.Background(), testItem, "", testClicks); !errors.Is(err, ErrNoItemIdentity) {
		t.Fatalf("err = %v, want ErrNoItemIdentity", err)
	}
	many := make([]Click, MaxClicks+1)
	for i := range many {
		many[i] = Click{Start: float64(i), End: float64(i) + 0.002}
	}
	for name, clicks := range map[string][]Click{
		"no click":         nil,
		"501 clicks":       many,
		"a negative time":  {{-1, -0.998}},
		"an empty click":   {{4, 4}},
		"a reversed click": {{4.003, 4}},
		"a 60 ms click":    {{4, 4.06}},
	} {
		if _, err := actions.RepairClick(context.Background(), testItem, testTake, clicks); err == nil {
			t.Errorf("%s must be refused", name)
		}
	}
	_, err := actions.RepairClick(context.Background(), testItem, testTake, []Click{{4, 4.0000001}})
	if err == nil || !strings.Contains(err.Error(), "rounds to zero length") {
		t.Errorf("a click that rounds to zero length: err = %v, want one naming that", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestRepairClickIsExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.RepairClick(context.Background(), testItem, testTake, testClicks); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("RepairClick: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	if !Experimental("repair_click") {
		t.Error("repair_click must stay experimental until the verification pass")
	}
}
