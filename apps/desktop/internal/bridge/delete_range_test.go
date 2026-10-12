package bridge

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"
)

// delete_range (ADR 0860 point 2, narration_range.lua): the answers as integrations/reaper/tests/range_test.lua pins them.

const cutItem = "{00000002-0000-4000-8000-000000000002}"

func TestDeleteRangeIsExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.DeleteRange(context.Background(), cutItem, 14, 16, CutClose, 10); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("DeleteRange: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	if !Experimental("delete_range") {
		t.Error("delete_range must stay experimental until the verification pass")
	}
}

func TestDeleteRangeSendsTheItemRangeModeAndFadeAndReadsRANGE_CUT(t *testing.T) {
	cut := "{00000009-0000-4000-8000-000000000009}"
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"RANGE_CUT", run(command), cutItem, cut, "1"}}
	})
	got, err := actions.DeleteRange(context.Background(), cutItem, 14, 16.5, CutGap, 10)
	if err != nil {
		t.Fatal(err)
	}
	if want := (RangeCut{LeftItemGUID: cutItem, CutItemGUID: cut, UndoPoints: 1}); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	command := fake.commands()[0]
	want := []string{"delete_range", command[2], cutItem, "14.000000", "16.500000", "gap", "10"}
	if len(command) != len(want)+1 {
		t.Fatalf("command = %v", command)
	}
	for i, field := range want {
		if command[i+1] != field {
			t.Fatalf("command = %v, want field %d %q", command, i+1, field)
		}
	}
}

func TestDeleteRangeAtTheItemStartAnswersTheItemAsTheCutPiece(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"RANGE_CUT", run(command), "", cutItem, "1"}}
	})
	got, err := actions.DeleteRange(context.Background(), cutItem, 10, 12, CutClose, 0)
	if err != nil || got != (RangeCut{CutItemGUID: cutItem, UndoPoints: 1}) {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestDeleteRangeRefusesWhatREAPERWouldRefuseWithoutSendingIt(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	cases := []struct {
		item       string
		start, end float64
		mode       CutMode
		fade       int
	}{
		{cutItem, 16, 14, CutClose, 0},
		{cutItem, 14, 14, CutClose, 0},
		{cutItem, math.NaN(), 16, CutClose, 0},
		{cutItem, 14, math.Inf(1), CutClose, 0},
		{cutItem, 14, 16, "delete", 0},
		{cutItem, 14, 16, CutClose, -1},
		{cutItem, 14, 16, CutClose, 501},
		{"", 14, 16, CutClose, 0},
	}
	for _, c := range cases {
		if _, err := actions.DeleteRange(context.Background(), c.item, c.start, c.end, c.mode, c.fade); !errors.Is(err, ErrBadRange) {
			t.Errorf("DeleteRange(%+v): %v, want ErrBadRange", c, err)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestDeleteRangeAnswers(t *testing.T) {
	overlap := "Another item on the track overlaps the range to cut, so nothing was cut."
	cases := []struct {
		name   string
		answer []string
		check  func(error) bool
	}{
		{"stale item", []string{"ITEM_STALE", cutItem, "item"}, func(err error) bool {
			var stale *StaleError
			return errors.As(err, &stale) && stale.GUID == cutItem && stale.Reason == "item"
		}},
		{"recording", []string{"ERROR", "REAPER is recording. Stop recording first."}, func(err error) bool { return errors.Is(err, ErrRecording) }},
		{"bad range from REAPER", []string{"ERROR", "The range to cut is not a usable pair of times."}, func(err error) bool { return errors.Is(err, ErrBadRange) }},
		{"bad fade from REAPER", []string{"ERROR", "The fade must be a whole number of milliseconds from 0 to 500."}, func(err error) bool { return errors.Is(err, ErrBadRange) }},
		{"bad mode from REAPER", []string{"ERROR", "The cut mode must be close or gap."}, func(err error) bool { return errors.Is(err, ErrBadRange) }},
		{"overlap", []string{"ERROR", overlap}, func(err error) bool {
			var refusal *RefusalError
			return errors.As(err, &refusal) && refusal.Sentence == overlap
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			actions, client, dir := newActionsSession(t, true)
			startFakeReaper(t, client, dir, func(command []string) [][]string {
				return [][]string{append([]string{c.answer[0], run(command)}, c.answer[1:]...)}
			})
			if _, err := actions.DeleteRange(context.Background(), cutItem, 14, 16, CutClose, 0); !c.check(err) {
				t.Fatalf("err = %v", err)
			}
		})
	}
}

func TestDeleteRangeAnsweredForAnotherItemIsAnError(t *testing.T) {
	for _, answer := range [][]string{
		{"{00000003-0000-4000-8000-000000000003}", "{00000009-0000-4000-8000-000000000009}"},
		{"", "{00000003-0000-4000-8000-000000000003}"},
	} {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			return [][]string{{"RANGE_CUT", run(command), answer[0], answer[1], "1"}}
		})
		if _, err := actions.DeleteRange(context.Background(), cutItem, 14, 16, CutClose, 0); err == nil {
			t.Errorf("a cut REAPER answered for another item (%v) was taken", answer)
		}
	}
}
