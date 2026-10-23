package bridge

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestFXCompareIsExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.CompareFXRange(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("CompareFXRange: %v", err)
	}
	if _, err := actions.StopFXCompare(context.Background()); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("StopFXCompare: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	for _, command := range []string{"fx_range_compare", "stop_fx_compare"} {
		if !Experimental(command) {
			t.Errorf("%s must stay experimental until the verification pass", command)
		}
	}
}

func TestCompareFXRangeSendsThePieceTakeAndChainAndReadsRANGE_FX_COMPARE(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"RANGE_FX_COMPARE", run(command), fxRangePiece, fxRangeTake, fxRangeChain, "14", "16.5", "1"}}
	})
	got, err := actions.CompareFXRange(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain)
	want := RangeFXCompare{ItemGUID: fxRangePiece, TakeGUID: fxRangeTake, Chain: fxRangeChain, Start: 14, End: 16.5, WasBypassed: true}
	if err != nil || got != want {
		t.Fatalf("got %+v, %v; want %+v", got, err, want)
	}
	command := fake.commands()[0]
	sentFields(t, command, []string{"fx_range_compare", command[2], fxRangePiece, fxRangeTake, fxRangeChain})
}

func TestCompareFXRangeReportsAStaleEffectAnotherPieceAndBadArgumentsFirst(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var answer func([]string) [][]string
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string { return answer(command) })
	answer = func(command []string) [][]string { return [][]string{{"ITEM_STALE", run(command), fxRangePiece, "fx"}} }
	var stale *StaleError
	if _, err := actions.CompareFXRange(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain); !errors.As(err, &stale) || stale.Reason != "fx" {
		t.Fatalf("stale: %v", err)
	}
	answer = func(command []string) [][]string {
		return [][]string{{"RANGE_FX_COMPARE", run(command), fxRangeTake, fxRangeTake, fxRangeChain, "14", "16", "0"}}
	}
	if _, err := actions.CompareFXRange(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain); err == nil {
		t.Fatal("an answer for another piece was taken")
	}
	answer = func(command []string) [][]string {
		return [][]string{{"RANGE_FX_COMPARE", run(command), fxRangePiece, fxRangeTake, fxRangeChain, "16", "14", "0"}}
	}
	if _, err := actions.CompareFXRange(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain); err == nil {
		t.Fatal("a piece that ends before it starts was taken")
	}
	sent := len(fake.commands())
	if _, err := actions.CompareFXRange(context.Background(), "", "", fxRangeChain); !errors.Is(err, ErrBadFXRange) {
		t.Fatalf("no piece: %v", err)
	}
	if _, err := actions.CompareFXRange(context.Background(), fxRangePiece, "", "../x.RfxChain"); !errors.Is(err, ErrBadChainName) {
		t.Fatalf("a path: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != sent {
		t.Fatalf("a refused request was sent: %v", fake.commands()[sent:])
	}
}

func TestStopFXCompareReadsWhetherOneWasRunning(t *testing.T) {
	for _, stopped := range []string{"1", "0"} {
		actions, client, dir := newActionsSession(t, true)
		fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
			return [][]string{{"RANGE_FX_COMPARE_STOPPED", run(command), stopped}}
		})
		got, err := actions.StopFXCompare(context.Background())
		if err != nil || got != (stopped == "1") {
			t.Fatalf("got %v, %v; want %s", got, err, stopped)
		}
		command := fake.commands()[0]
		sentFields(t, command, []string{"stop_fx_compare", command[2]})
	}
}
