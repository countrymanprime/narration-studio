package bridge

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"
)

// apply_fx_range and remove_fx_range (ADR 0860 point 3, narration_range.lua): the answers as
// integrations/reaper/tests/fx_range_test.lua pins them.

const (
	fxRangeItem  = "{00000002-0000-4000-8000-000000000002}"
	fxRangePiece = "{00000009-0000-4000-8000-000000000009}"
	fxRangeTake  = "{0000000A-0000-4000-8000-00000000000A}"
	fxRangeChain = "Voice/Radio.RfxChain"
)

func TestFXRangeCommandsAreExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.ApplyFXRange(context.Background(), fxRangeItem, 14, 16, fxRangeChain, 10); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("ApplyFXRange: %v", err)
	}
	if _, err := actions.RemoveFXRange(context.Background(), fxRangePiece, fxRangeChain); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("RemoveFXRange: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	for _, command := range []string{"apply_fx_range", "remove_fx_range"} {
		if !Experimental(command) {
			t.Errorf("%s must stay experimental until the verification pass", command)
		}
	}
}

func sentFields(t *testing.T, command []string, want []string) {
	t.Helper()
	if len(command) != len(want)+1 {
		t.Fatalf("command = %v", command)
	}
	for i, field := range want {
		if command[i+1] != field {
			t.Fatalf("command = %v, want field %d %q", command, i+1, field)
		}
	}
}

func TestApplyFXRangeSendsTheItemRangeChainAndFadeAndReadsRANGE_FX_APPLIED(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"RANGE_FX_APPLIED", run(command), fxRangePiece, fxRangeTake, fxRangeChain, "1"}}
	})
	got, err := actions.ApplyFXRange(context.Background(), fxRangeItem, 14, 16.5, fxRangeChain, 10)
	if err != nil {
		t.Fatal(err)
	}
	if want := (RangeFXApplied{ItemGUID: fxRangePiece, TakeGUID: fxRangeTake, Chain: fxRangeChain, UndoPoints: 1}); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	command := fake.commands()[0]
	sentFields(t, command, []string{"apply_fx_range", command[2], fxRangeItem, "14.000000", "16.500000", fxRangeChain, "10"})
}

func TestRemoveFXRangeSendsThePieceAndChainAndReadsRANGE_FX_REMOVED(t *testing.T) {
	for _, undo := range []string{"1", "0"} {
		actions, client, dir := newActionsSession(t, true)
		fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
			return [][]string{{"RANGE_FX_REMOVED", run(command), fxRangeItem, fxRangeChain, undo}}
		})
		got, err := actions.RemoveFXRange(context.Background(), fxRangePiece, fxRangeChain)
		if err != nil {
			t.Fatal(err)
		}
		want := RangeFXRemoved{ItemGUID: fxRangeItem, Chain: fxRangeChain, UndoPoints: int(undo[0] - '0')}
		if got != want {
			t.Fatalf("got %+v, want %+v", got, want)
		}
		command := fake.commands()[0]
		sentFields(t, command, []string{"remove_fx_range", command[2], fxRangePiece, fxRangeChain})
	}
}

func TestFXRangeRefusesWhatREAPERWouldRefuseWithoutSendingIt(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	ranges := []struct {
		item       string
		start, end float64
		fade       int
	}{
		{fxRangeItem, 16, 14, 0},
		{fxRangeItem, 14, 14, 0},
		{fxRangeItem, math.NaN(), 16, 0},
		{fxRangeItem, 14, math.Inf(1), 0},
		{fxRangeItem, 14, 16, -1},
		{fxRangeItem, 14, 16, 501},
		{"", 14, 16, 0},
	}
	for _, c := range ranges {
		if _, err := actions.ApplyFXRange(context.Background(), c.item, c.start, c.end, fxRangeChain, c.fade); !errors.Is(err, ErrBadFXRange) {
			t.Errorf("ApplyFXRange(%+v): %v, want ErrBadFXRange", c, err)
		}
	}
	if _, err := actions.RemoveFXRange(context.Background(), "", fxRangeChain); !errors.Is(err, ErrBadFXRange) {
		t.Errorf("RemoveFXRange with no item: %v, want ErrBadFXRange", err)
	}
	for _, chain := range []string{"../reaper.ini", `..\reaper.ini`, "/etc/passwd", `C:\x.RfxChain`, "C:x.RfxChain", "Voice//Radio.RfxChain", "Radio.txt", "Radio\n.RfxChain", "Ra\x00dio.RfxChain", ""} {
		if _, err := actions.ApplyFXRange(context.Background(), fxRangeItem, 14, 16, chain, 0); !errors.Is(err, ErrBadChainName) {
			t.Errorf("ApplyFXRange(%q): %v, want ErrBadChainName", chain, err)
		}
		if _, err := actions.RemoveFXRange(context.Background(), fxRangePiece, chain); !errors.Is(err, ErrBadChainName) {
			t.Errorf("RemoveFXRange(%q): %v, want ErrBadChainName", chain, err)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestFXRangeAnswers(t *testing.T) {
	outside := "The range for the chain is not inside that item."
	failed := "REAPER did not load the FX chain. The item was split: press Undo in REAPER to rejoin it."
	cases := []struct {
		name   string
		answer []string
		check  func(error) bool
	}{
		{"stale item", []string{"ITEM_STALE", fxRangeItem, "item"}, func(err error) bool {
			var stale *StaleError
			return errors.As(err, &stale) && stale.GUID == fxRangeItem && stale.Reason == "item"
		}},
		{"recording", []string{"ERROR", "REAPER is recording. Stop recording first."}, func(err error) bool { return errors.Is(err, ErrRecording) }},
		{"chain not listed", []string{"ERROR", "That FX chain is not in the FXChains folder REAPER lists."}, func(err error) bool { return errors.Is(err, ErrBadChainName) }},
		{"bad range from REAPER", []string{"ERROR", "The range for the chain is not a usable pair of times."}, func(err error) bool { return errors.Is(err, ErrBadFXRange) }},
		{"bad fade from REAPER", []string{"ERROR", "The fade must be a whole number of milliseconds from 0 to 500."}, func(err error) bool { return errors.Is(err, ErrBadFXRange) }},
		{"outside", []string{"ERROR", outside}, func(err error) bool {
			var refusal *RefusalError
			return errors.As(err, &refusal) && refusal.Sentence == outside
		}},
		{"chain loaded nothing", []string{"ERROR", failed}, func(err error) bool {
			var refusal *RefusalError
			return errors.As(err, &refusal) && refusal.Sentence == failed
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			actions, client, dir := newActionsSession(t, true)
			startFakeReaper(t, client, dir, func(command []string) [][]string {
				return [][]string{append([]string{c.answer[0], run(command)}, c.answer[1:]...)}
			})
			if _, err := actions.ApplyFXRange(context.Background(), fxRangeItem, 14, 16, fxRangeChain, 0); !c.check(err) {
				t.Fatalf("ApplyFXRange: err = %v", err)
			}
			if _, err := actions.RemoveFXRange(context.Background(), fxRangePiece, fxRangeChain); !c.check(err) {
				t.Fatalf("RemoveFXRange: err = %v", err)
			}
		})
	}
}

func TestFXRangeAnsweredForAnotherChainIsAnError(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		if command[1] == "apply_fx_range" {
			return [][]string{{"RANGE_FX_APPLIED", run(command), fxRangePiece, fxRangeTake, "Other.RfxChain", "1"}}
		}
		return [][]string{{"RANGE_FX_REMOVED", run(command), fxRangeItem, "Other.RfxChain", "1"}}
	})
	if _, err := actions.ApplyFXRange(context.Background(), fxRangeItem, 14, 16, fxRangeChain, 0); err == nil {
		t.Error("a chain REAPER answered for another chain was taken")
	}
	if _, err := actions.RemoveFXRange(context.Background(), fxRangePiece, fxRangeChain); err == nil {
		t.Error("a removal REAPER answered for another chain was taken")
	}
}
