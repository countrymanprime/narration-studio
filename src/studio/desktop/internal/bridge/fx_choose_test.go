package bridge

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"
)

// choose_range_fx and range_fx_chosen (narration_range.lua, docs/research/reaper-item-fx-dialog-2026-10-24.md): the answers as
// src/studio/integrations/reaper/tests/fx_choose_test.lua pins them.

func TestChooseRangeFXCommandsAreExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.ChooseRangeFX(context.Background(), fxRangeItem, 14, 16, 10); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("ChooseRangeFX: %v", err)
	}
	if _, err := actions.RangeFXChosen(context.Background(), fxRangePiece, fxRangeTake); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("RangeFXChosen: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	for _, command := range []string{"choose_range_fx", "range_fx_chosen"} {
		if !Experimental(command) {
			t.Errorf("%s must stay experimental until the verification pass", command)
		}
	}
}

func TestChooseRangeFXSendsTheItemRangeAndFadeAndReadsRANGE_FX_CHOOSING(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"RANGE_FX_CHOOSING", run(command), fxRangePiece, fxRangeTake, "1"}}
	})
	got, err := actions.ChooseRangeFX(context.Background(), fxRangeItem, 14, 16.5, 10)
	if err != nil {
		t.Fatal(err)
	}
	if want := (RangeFXChoosing{ItemGUID: fxRangePiece, TakeGUID: fxRangeTake, UndoPoints: 1}); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	command := fake.commands()[0]
	sentFields(t, command, []string{"choose_range_fx", command[2], fxRangeItem, "14.000000", "16.500000", "10"})
}

func TestChooseRangeFXRefusesABadRangeOrFadeWithoutSendingIt(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	for _, c := range []struct {
		item       string
		start, end float64
		fade       int
	}{{"", 14, 16, 10}, {fxRangeItem, 16, 14, 10}, {fxRangeItem, 14, 16, -1}, {fxRangeItem, 14, 16, MaxCutFadeMs + 1}} {
		if _, err := actions.ChooseRangeFX(context.Background(), c.item, c.start, c.end, c.fade); !errors.Is(err, ErrBadFXRange) {
			t.Errorf("%+v: %v", c, err)
		}
	}
	if _, err := actions.RangeFXChosen(context.Background(), "", ""); !errors.Is(err, ErrBadFXRange) {
		t.Errorf("RangeFXChosen with no item: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestRangeFXChosenReadsEveryChosenFXAndWhetherTheChainWindowIsOpen(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		r := run(command)
		return [][]string{
			{"RANGE_FX_CHOSEN_FX", r, "0", "VST: ReaComp (Cockos)", "1"},
			{"RANGE_FX_CHOSEN_FX", r, "1", "JS: Pipe|Name", "0"},
			{"RANGE_FX_CHOSEN", r, fxRangePiece, fxRangeTake, "2", "1", "0"},
		}
	})
	got, err := actions.RangeFXChosen(context.Background(), fxRangePiece, "")
	if err != nil {
		t.Fatal(err)
	}
	want := RangeFXChoice{ItemGUID: fxRangePiece, TakeGUID: fxRangeTake, ChainOpen: true,
		FX: []ChosenFX{{Name: "VST: ReaComp (Cockos)", Enabled: true}, {Name: "JS: Pipe|Name", Enabled: false}}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	command := fake.commands()[0]
	sentFields(t, command, []string{"range_fx_chosen", command[2], fxRangePiece, ""})
}

func TestRangeFXChosenRefusesACountThatDoesNotMatchAnotherPieceAndAStaleOne(t *testing.T) {
	for name, c := range map[string]struct {
		answer [][]string
		stale  bool
	}{
		"count":   {answer: [][]string{{"RANGE_FX_CHOSEN", "", fxRangePiece, fxRangeTake, "1", "0", "0"}}},
		"another": {answer: [][]string{{"RANGE_FX_CHOSEN", "", fxRangeItem, fxRangeTake, "0", "0", "0"}}},
		"stale":   {answer: [][]string{{"ITEM_STALE", "", fxRangePiece, "fx"}}, stale: true},
	} {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			for _, event := range c.answer {
				event[1] = run(command)
			}
			return c.answer
		})
		_, err := actions.RangeFXChosen(context.Background(), fxRangePiece, fxRangeTake)
		var stale *StaleError
		if c.stale != errors.As(err, &stale) || err == nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestTheChosenInREAPERNameIsTakenByTheRemovalAndTheEditsButNeverApplied(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		switch command[1] {
		case "remove_fx_range":
			return [][]string{{"RANGE_FX_REMOVED", run(command), fxRangeItem, ChosenInREAPER, "1"}}
		case "fx_range_bypass":
			return [][]string{{"RANGE_FX_BYPASSED", run(command), fxRangePiece, fxRangeTake, ChosenInREAPER, "1", "1"}}
		}
		return nil
	})
	if _, err := actions.ApplyFXRange(context.Background(), fxRangeItem, 14, 16, ChosenInREAPER, 10); !errors.Is(err, ErrBadChainName) {
		t.Fatalf("ApplyFXRange: %v", err)
	}
	if _, err := actions.RemoveFXRange(context.Background(), fxRangePiece, ChosenInREAPER); err != nil {
		t.Fatal(err)
	}
	if _, err := actions.BypassFXRange(context.Background(), fxRangePiece, fxRangeTake, ChosenInREAPER, true); err != nil {
		t.Fatal(err)
	}
	if got := len(fake.commands()); got != 2 {
		t.Fatalf("commands = %v", fake.commands())
	}
}
