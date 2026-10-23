package bridge

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

var testStretches = []GainStretch{{Start: 4, End: 5}, {Start: 8, End: 8.5}}

func TestReduceRangeGainSendsTheTakeTheDBAndTheStretches(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"RANGE_GAIN_REDUCED", run(command), testItem, testTake, "2", "6.0", "1"}}
	})
	got, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 6, testStretches)
	want := RangeGainReduced{ItemGUID: testItem, TakeGUID: testTake, Stretches: 2, ReduceDB: 6, UndoPoints: 1}
	if err != nil || got != want {
		t.Fatalf("ReduceRangeGain = %+v, %v; want %+v", got, err, want)
	}
	command := fake.commands()[0]
	if command[1] != "reduce_range_gain" || command[3] != testItem || command[4] != testTake || command[5] != "6" ||
		command[6] != "4.000000:5.000000,8.000000:8.500000" {
		t.Fatalf("command = %v", command)
	}
}

func TestReduceRangeGainReportsAStaleItemOrTakeAndRefusesAnswersForOthers(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var answer func([]string) [][]string
	startFakeReaper(t, client, dir, func(command []string) [][]string { return answer(command) })

	for _, reason := range []string{"item", "take"} {
		answer = func(command []string) [][]string { return [][]string{{"ITEM_STALE", run(command), testItem, reason}} }
		_, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 6, testStretches)
		var stale *StaleError
		if !errors.As(err, &stale) || stale.Reason != reason || !errors.Is(err, ErrStale) {
			t.Fatalf("err = %v, want a %s StaleError", err, reason)
		}
	}

	answer = func(command []string) [][]string {
		return [][]string{{"RANGE_GAIN_REDUCED", run(command), testItem, "{00000009-0000-4000-8000-000000000009}", "2", "6.0", "1"}}
	}
	if _, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 6, testStretches); err == nil {
		t.Fatal("an answer for another take must be an error")
	}

	answer = func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "REAPER is recording. Stop recording first."}}
	}
	if _, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 6, testStretches); !errors.Is(err, ErrRecording) {
		t.Fatalf("err = %v, want ErrRecording", err)
	}

	sentence := "That take already has volume changes where a stretch would be lowered, so nothing was lowered."
	answer = func(command []string) [][]string { return [][]string{{"ERROR", run(command), sentence}} }
	_, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 6, testStretches)
	var refusal *RefusalError
	if !errors.As(err, &refusal) || !strings.Contains(err.Error(), "already has volume changes") {
		t.Fatalf("err = %v, want REAPER's own sentence", err)
	}
}

func TestReduceRangeGainChecksItsArgumentsBeforeAnythingIsSent(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.ReduceRangeGain(context.Background(), testItem, "", 6, testStretches); !errors.Is(err, ErrNoItemIdentity) {
		t.Fatalf("err = %v, want ErrNoItemIdentity", err)
	}
	many := make([]GainStretch, MaxGainStretches+1)
	for i := range many {
		many[i] = GainStretch{Start: float64(i), End: float64(i) + 0.5}
	}
	for name, call := range map[string]func() error{
		"0 dB": func() error {
			_, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 0, testStretches)
			return err
		},
		"25 dB": func() error {
			_, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 25, testStretches)
			return err
		},
		"no stretch": func() error {
			_, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 6, nil)
			return err
		},
		"501 stretches": func() error {
			_, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 6, many)
			return err
		},
		"a negative time": func() error {
			_, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 6, []GainStretch{{-1, 2}})
			return err
		},
		"an empty stretch": func() error {
			_, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 6, []GainStretch{{4, 4}})
			return err
		},
		"a reversed stretch": func() error {
			_, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 6, []GainStretch{{5, 4}})
			return err
		},
	} {
		if call() == nil {
			t.Errorf("%s must be refused", name)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestReduceRangeGainIsExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.ReduceRangeGain(context.Background(), testItem, testTake, 6, testStretches); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("ReduceRangeGain: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	if !Experimental("reduce_range_gain") {
		t.Error("reduce_range_gain must stay experimental until the verification pass")
	}
}
