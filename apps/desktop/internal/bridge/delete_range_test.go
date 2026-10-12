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
	if _, err := actions.DeleteRange(context.Background(), cutItem, 14, 16, CutClose, 10, 0, false); !errors.Is(err, ErrExperimentalOff) {
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
	got, err := actions.DeleteRange(context.Background(), cutItem, 14, 16.5, CutGap, 10, 0, false)
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
	got, err := actions.DeleteRange(context.Background(), cutItem, 10, 12, CutClose, 0, 0, false)
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
		pad        int
		roomTone   bool
	}{
		{cutItem, 16, 14, CutClose, 0, 0, false},
		{cutItem, 14, 14, CutClose, 0, 0, false},
		{cutItem, math.NaN(), 16, CutClose, 0, 0, false},
		{cutItem, 14, math.Inf(1), CutClose, 0, 0, false},
		{cutItem, 14, 16, "delete", 0, 0, false},
		{cutItem, 14, 16, CutClose, -1, 0, false},
		{cutItem, 14, 16, CutClose, 501, 0, false},
		{"", 14, 16, CutClose, 0, 0, false},
		{cutItem, 14, 16, CutGap, 0, -1, false},
		{cutItem, 14, 16, CutGap, 0, 501, false},
		{cutItem, 14, 15, CutGap, 0, 500, false},
		{cutItem, 14, 16, CutClose, 0, 0, true},
	}
	for _, c := range cases {
		if _, err := actions.DeleteRange(context.Background(), c.item, c.start, c.end, c.mode, c.fade, c.pad, c.roomTone); !errors.Is(err, ErrBadRange) {
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
			if _, err := actions.DeleteRange(context.Background(), cutItem, 14, 16, CutClose, 0, 0, false); !c.check(err) {
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
		if _, err := actions.DeleteRange(context.Background(), cutItem, 14, 16, CutClose, 0, 0, false); err == nil {
			t.Errorf("a cut REAPER answered for another item (%v) was taken", answer)
		}
	}
}

// SN-E97: the pad and the room tone ride in delete_range's last field (fade|pad|room_tone), sent only when either is asked
// for, so the line an older script reads is unchanged without them.
func TestDeleteRangeSendsThePadAndRoomToneInTheFadeField(t *testing.T) {
	cut := "{00000009-0000-4000-8000-000000000009}"
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"RANGE_CUT", run(command), cutItem, cut, "1"}}
	})
	for _, c := range []struct {
		pad      int
		roomTone bool
		tail     []string
	}{
		{100, false, []string{"10", "0.100000", "0"}},
		{0, true, []string{"10", "0.000000", "1"}},
		{50, true, []string{"10", "0.050000", "1"}},
	} {
		if _, err := actions.DeleteRange(context.Background(), cutItem, 14, 16.5, CutGap, 10, c.pad, c.roomTone); err != nil {
			t.Fatal(err)
		}
		commands := fake.commands()
		command := commands[len(commands)-1]
		want := append([]string{"delete_range", command[2], cutItem, "14.000000", "16.500000", "gap"}, c.tail...)
		if len(command) != len(want)+1 {
			t.Fatalf("command = %v, want %v", command, want)
		}
		for i, field := range want {
			if command[i+1] != field {
				t.Fatalf("command = %v, want field %d %q", command, i+1, field)
			}
		}
	}
}

func TestDeleteRangeWithAPadAnsweredByAnOlderScriptIsErrScriptOutdated(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "The fade must be a whole number of milliseconds from 0 to 500."}}
	})
	if _, err := actions.DeleteRange(context.Background(), cutItem, 14, 16, CutGap, 10, 0, true); !errors.Is(err, ErrScriptOutdated) {
		t.Fatalf("err = %v, want ErrScriptOutdated", err)
	}
	if _, err := actions.DeleteRange(context.Background(), cutItem, 14, 16, CutGap, 10, 0, false); !errors.Is(err, ErrBadRange) {
		t.Fatalf("without a pad or room tone: err = %v, want ErrBadRange", err)
	}
}

func TestDeleteRangeRoomToneRefusalsAreTheScriptsSentences(t *testing.T) {
	for _, sentence := range []string{
		"This chapter has no room tone marked in REAPER. Mark a stretch of room tone on its track with a region named Room tone.",
		"The marked room tone is too short to fill that gap.",
	} {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			return [][]string{{"ERROR", run(command), sentence}}
		})
		_, err := actions.DeleteRange(context.Background(), cutItem, 14, 16, CutGap, 0, 0, true)
		var refusal *RefusalError
		if !errors.As(err, &refusal) || refusal.Sentence != sentence {
			t.Errorf("err = %v, want the refusal %q", err, sentence)
		}
	}
}
