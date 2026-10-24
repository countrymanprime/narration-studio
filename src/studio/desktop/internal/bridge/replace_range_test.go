package bridge

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"
)

// replace_range and restore_replacement (docs/reference/daw/capabilities.md#replace_range, narration_replace.lua): the answers as
// src/studio/integrations/reaper/tests/replace_test.lua pins them.

const (
	replaceItem   = "{00000002-0000-4000-8000-000000000002}"
	replaceSource = "{00000004-0000-4000-8000-000000000004}"
	replaceNew    = "{00000011-0000-4000-8000-000000000011}"
	replaceCut    = "{00000009-0000-4000-8000-000000000009}"
)

func replaceRequest() ReplaceRangeRequest {
	return ReplaceRangeRequest{ItemGUID: replaceItem, Start: 14, End: 16, SourceGUID: replaceSource, SourceStart: 164.2, SourceEnd: 167.2,
		FadeMs: 10, GainDB: -3.5, ID: "r-0001"}
}

func TestReplaceRangeIsExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.ReplaceRange(context.Background(), replaceRequest()); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("ReplaceRange: %v", err)
	}
	if _, err := actions.RestoreReplacement(context.Background(), replaceNew, "r-0001"); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("RestoreReplacement: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	for _, name := range []string{"replace_range", "restore_replacement"} {
		if !Experimental(name) {
			t.Errorf("%s must stay experimental until the verification pass", name)
		}
	}
}

func TestReplaceRangeSendsBothRangesAndTheTailAndReadsRANGE_REPLACED(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"RANGE_REPLACED", run(command), replaceNew, replaceCut, replaceItem, "1.000000", "1"}}
	})
	got, err := actions.ReplaceRange(context.Background(), replaceRequest())
	if err != nil {
		t.Fatal(err)
	}
	want := RangeReplaced{NewItemGUID: replaceNew, CutItemGUID: replaceCut, LeftItemGUID: replaceItem, Shift: 1, UndoPoints: 1}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	command := fake.commands()[0]
	fields := []string{"replace_range", command[2], replaceItem, "14.000000", "16.000000", replaceSource, "164.200000|167.200000|10|-3.50|r-0001"}
	if len(command) != len(fields)+1 {
		t.Fatalf("command = %v", command)
	}
	for i, field := range fields {
		if command[i+1] != field {
			t.Fatalf("command = %v, want field %d %q", command, i+1, field)
		}
	}
}

func TestReplaceRangeAtTheItemStartAnswersNoLeftPiece(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"RANGE_REPLACED", run(command), replaceNew, replaceItem, "", "-0.500000", "1"}}
	})
	got, err := actions.ReplaceRange(context.Background(), replaceRequest())
	if err != nil {
		t.Fatal(err)
	}
	if got.LeftItemGUID != "" || got.CutItemGUID != replaceItem || got.Shift != -0.5 {
		t.Fatalf("got %+v", got)
	}
}

func TestReplaceRangeRefusesAnAnswerThatNamesAnotherItem(t *testing.T) {
	for name, answer := range map[string][]string{
		"another left piece":                      {replaceNew, replaceCut, "{00000077-0000-4000-8000-000000000077}"},
		"no left piece and another piece parked":  {replaceNew, replaceCut, ""},
		"no new item":                             {"", replaceCut, replaceItem},
		"the new item is the narrator's own item": {replaceItem, replaceCut, replaceItem},
	} {
		t.Run(name, func(t *testing.T) {
			actions, client, dir := newActionsSession(t, true)
			startFakeReaper(t, client, dir, func(command []string) [][]string {
				return [][]string{{"RANGE_REPLACED", run(command), answer[0], answer[1], answer[2], "0.000000", "1"}}
			})
			if _, err := actions.ReplaceRange(context.Background(), replaceRequest()); err == nil {
				t.Fatal("an answer about another item was accepted")
			}
		})
	}
}

func TestReplaceRangeRefusesABadRequestWithoutSendingIt(t *testing.T) {
	cases := map[string]func(*ReplaceRangeRequest){
		"no item":               func(r *ReplaceRangeRequest) { r.ItemGUID = " " },
		"no source":             func(r *ReplaceRangeRequest) { r.SourceGUID = "" },
		"the same item":         func(r *ReplaceRangeRequest) { r.SourceGUID = replaceItem },
		"words out of order":    func(r *ReplaceRangeRequest) { r.Start, r.End = 16, 14 },
		"words not finite":      func(r *ReplaceRangeRequest) { r.End = math.Inf(1) },
		"stretch out of order":  func(r *ReplaceRangeRequest) { r.SourceStart, r.SourceEnd = 2, 2 },
		"stretch not finite":    func(r *ReplaceRangeRequest) { r.SourceStart = math.NaN() },
		"a negative fade":       func(r *ReplaceRangeRequest) { r.FadeMs = -1 },
		"a fade over 500 ms":    func(r *ReplaceRangeRequest) { r.FadeMs = 501 },
		"a level over 24 dB":    func(r *ReplaceRangeRequest) { r.GainDB = 24.01 },
		"a level that is NaN":   func(r *ReplaceRangeRequest) { r.GainDB = math.NaN() },
		"no id":                 func(r *ReplaceRangeRequest) { r.ID = "" },
		"an id with a bar":      func(r *ReplaceRangeRequest) { r.ID = "r|1" },
		"an id with a space":    func(r *ReplaceRangeRequest) { r.ID = "r 1" },
		"an id of 65 letters":   func(r *ReplaceRangeRequest) { r.ID = string(make([]byte, 65)) },
		"an id with an accent":  func(r *ReplaceRangeRequest) { r.ID = "é" },
		"an id with a new line": func(r *ReplaceRangeRequest) { r.ID = "r\n1" },
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			actions, client, dir := newActionsSession(t, true)
			fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
			request := replaceRequest()
			change(&request)
			if _, err := actions.ReplaceRange(context.Background(), request); !errors.Is(err, ErrBadReplacement) {
				t.Fatalf("got %v, want ErrBadReplacement", err)
			}
			time.Sleep(20 * time.Millisecond)
			if len(fake.commands()) != 0 {
				t.Fatalf("commands were written: %v", fake.commands())
			}
		})
	}
}

func TestReplaceRangeAnswersStaleItemsAndRefusals(t *testing.T) {
	for _, c := range []struct {
		answer []string
		check  func(error) bool
	}{
		{[]string{"ITEM_STALE", "", replaceItem, "item"}, func(err error) bool {
			var stale *StaleError
			return errors.As(err, &stale) && stale.Reason == "item"
		}},
		{[]string{"ITEM_STALE", "", replaceSource, "source"}, func(err error) bool {
			var stale *StaleError
			return errors.As(err, &stale) && stale.Reason == "source" && stale.GUID == replaceSource
		}},
		{[]string{"ERROR", "", "REAPER is recording. Stop recording first."}, func(err error) bool { return errors.Is(err, ErrRecording) }},
		{[]string{"ERROR", "", "The level change must be from -24 to 24 dB."}, func(err error) bool { return errors.Is(err, ErrBadReplacement) }},
		{[]string{"ERROR", "", "Those words are already replaced. Put your audio back first."}, func(err error) bool {
			var refusal *RefusalError
			return errors.As(err, &refusal) && refusal.Sentence == "Those words are already replaced. Put your audio back first."
		}},
	} {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			answer := append([]string(nil), c.answer...)
			answer[1] = run(command)
			return [][]string{answer}
		})
		if _, err := actions.ReplaceRange(context.Background(), replaceRequest()); !c.check(err) {
			t.Errorf("%v: got %v", c.answer, err)
		}
	}
}

func TestRestoreReplacementSendsTheItemAndIDAndReadsREPLACEMENT_RESTORED(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"REPLACEMENT_RESTORED", run(command), replaceCut, "-1.000000", "1"}}
	})
	got, err := actions.RestoreReplacement(context.Background(), replaceNew, "r-0001")
	if err != nil {
		t.Fatal(err)
	}
	if want := (ReplacementRestored{ItemGUID: replaceCut, Shift: -1, UndoPoints: 1}); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	command := fake.commands()[0]
	if command[1] != "restore_replacement" || command[3] != replaceNew || command[4] != "r-0001" || len(command) != 5 {
		t.Fatalf("command = %v", command)
	}
}

func TestRestoreReplacementRefusesABadRequestAndAnswersStale(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ITEM_STALE", run(command), replaceNew, "replacement"}}
	})
	for _, args := range [][2]string{{"", "r-0001"}, {replaceNew, ""}, {replaceNew, "r|1"}} {
		if _, err := actions.RestoreReplacement(context.Background(), args[0], args[1]); !errors.Is(err, ErrBadReplacement) {
			t.Errorf("%q: got %v", args, err)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	_, err := actions.RestoreReplacement(context.Background(), replaceNew, "r-0001")
	var stale *StaleError
	if !errors.As(err, &stale) || stale.Reason != "replacement" {
		t.Fatalf("got %v", err)
	}
}
