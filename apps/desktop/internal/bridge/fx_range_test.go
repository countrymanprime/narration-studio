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

// fx_range_params, fx_range_set_param and fx_range_bypass (SN-E104): the lines fx_range_test.lua pins.

func TestFXRangeEditsAreExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.FXRangeParams(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("FXRangeParams: %v", err)
	}
	if _, err := actions.SetFXRangeParam(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain, 0, 0, 1); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("SetFXRangeParam: %v", err)
	}
	if _, err := actions.BypassFXRange(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain, true); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("BypassFXRange: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	for _, command := range []string{"fx_range_params", "fx_range_set_param", "fx_range_bypass"} {
		if !Experimental(command) {
			t.Errorf("%s must stay experimental until the verification pass", command)
		}
	}
}

func TestFXRangeParamsSendsThePieceTakeAndChainAndReadsEverySetting(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	path := "C:/REAPER/FXChains/Voice/Radio.RfxChain"
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{
			{"RANGE_FX_PARAM", run(command), "0", path, "0", "Gain", "-6.5", "-24", "24", "0", "-6.5 dB"},
			{"RANGE_FX_PARAM", run(command), "1", path, "2", "Mode", "1", "0", "3", "1", "Hard"},
			{"RANGE_FX_PARAMS", run(command), fxRangePiece, fxRangeTake, fxRangeChain, "2", "1", "1"},
		}
	})
	got, err := actions.FXRangeParams(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain)
	if err != nil {
		t.Fatal(err)
	}
	want := []FXParam{
		{FX: 0, FXName: path, Index: 0, Name: "Gain", Value: -6.5, Min: -24, Max: 24, Step: 0, Formatted: "-6.5 dB"},
		{FX: 1, FXName: path, Index: 2, Name: "Mode", Value: 1, Min: 0, Max: 3, Step: 1, Formatted: "Hard"},
	}
	if len(got.Params) != 2 || got.Params[0] != want[0] || got.Params[1] != want[1] || !got.Truncated || !got.Bypassed ||
		got.ItemGUID != fxRangePiece || got.TakeGUID != fxRangeTake || got.Chain != fxRangeChain {
		t.Fatalf("got %+v", got)
	}
	sentFields(t, fake.commands()[0], []string{"fx_range_params", fake.commands()[0][2], fxRangePiece, fxRangeTake, fxRangeChain})
}

func TestFXRangeParamsRefusesACountThatDoesNotMatchOrAnotherPiece(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var answer func([]string) [][]string
	startFakeReaper(t, client, dir, func(command []string) [][]string { return answer(command) })
	answer = func(command []string) [][]string {
		return [][]string{{"RANGE_FX_PARAMS", run(command), fxRangePiece, fxRangeTake, fxRangeChain, "3", "0", "0"}}
	}
	if _, err := actions.FXRangeParams(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain); err == nil {
		t.Fatal("a count the lines do not match must be an error")
	}
	answer = func(command []string) [][]string {
		return [][]string{{"RANGE_FX_PARAMS", run(command), fxRangeItem, fxRangeTake, fxRangeChain, "0", "0", "0"}}
	}
	if _, err := actions.FXRangeParams(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain); err == nil {
		t.Fatal("an answer for another piece must be an error")
	}
	// With no take named, any take of the piece is the one asked about.
	answer = func(command []string) [][]string {
		return [][]string{{"RANGE_FX_PARAMS", run(command), fxRangePiece, fxRangeTake, fxRangeChain, "0", "0", "0"}}
	}
	got, err := actions.FXRangeParams(context.Background(), fxRangePiece, "", fxRangeChain)
	if err != nil || got.TakeGUID != fxRangeTake || got.Params == nil {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestSetFXRangeParamSendsTheSettingAndReadsTheValueREAPERHolds(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"RANGE_FX_PARAM_SET", run(command), fxRangePiece, fxRangeTake, "1", "0", "-6.5", "-6.5 dB", "1"}}
	})
	got, err := actions.SetFXRangeParam(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain, 1, 0, -6.4999)
	want := RangeFXParamSet{ItemGUID: fxRangePiece, TakeGUID: fxRangeTake, FX: 1, Index: 0, Value: -6.5, Formatted: "-6.5 dB", UndoPoints: 1}
	if err != nil || got != want {
		t.Fatalf("got %+v, %v; want %+v", got, err, want)
	}
	command := fake.commands()[0]
	sentFields(t, command, []string{"fx_range_set_param", command[2], fxRangePiece, fxRangeTake, fxRangeChain, "1", "0", "-6.4999"})
}

func TestBypassFXRangeSendsTheSwitchAndReadsRANGE_FX_BYPASSED(t *testing.T) {
	for _, bypass := range []bool{true, false} {
		actions, client, dir := newActionsSession(t, true)
		on := map[bool]string{true: "1", false: "0"}[bypass]
		fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
			return [][]string{{"RANGE_FX_BYPASSED", run(command), fxRangePiece, fxRangeTake, fxRangeChain, on, "0"}}
		})
		got, err := actions.BypassFXRange(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain, bypass)
		want := RangeFXBypassed{ItemGUID: fxRangePiece, TakeGUID: fxRangeTake, Chain: fxRangeChain, Bypassed: bypass, UndoPoints: 0}
		if err != nil || got != want {
			t.Fatalf("got %+v, %v; want %+v", got, err, want)
		}
		command := fake.commands()[0]
		sentFields(t, command, []string{"fx_range_bypass", command[2], fxRangePiece, fxRangeTake, fxRangeChain, on})
	}
}

func TestFXRangeEditsReportAStaleEffectAndCheckTheirArgumentsFirst(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	var answer func([]string) [][]string
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string { return answer(command) })
	for _, reason := range []string{"item", "take", "fx"} {
		answer = func(command []string) [][]string {
			return [][]string{{"ITEM_STALE", run(command), fxRangePiece, reason}}
		}
		_, errParams := actions.FXRangeParams(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain)
		_, errSet := actions.SetFXRangeParam(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain, 0, 0, 1)
		_, errBypass := actions.BypassFXRange(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain, true)
		for _, err := range []error{errParams, errSet, errBypass} {
			var stale *StaleError
			if !errors.As(err, &stale) || stale.Reason != reason || !errors.Is(err, ErrStale) {
				t.Fatalf("err = %v, want a %s StaleError", err, reason)
			}
		}
	}
	sent := len(fake.commands())
	if _, err := actions.FXRangeParams(context.Background(), "", "", fxRangeChain); !errors.Is(err, ErrBadFXRange) {
		t.Fatalf("no piece: %v", err)
	}
	if _, err := actions.BypassFXRange(context.Background(), fxRangePiece, "", "../x.RfxChain", true); !errors.Is(err, ErrBadChainName) {
		t.Fatalf("a path: %v", err)
	}
	for _, bad := range [][3]float64{{-1, 0, 1}, {0, -1, 1}, {0, 0, math.NaN()}, {0, 0, math.Inf(1)}} {
		if _, err := actions.SetFXRangeParam(context.Background(), fxRangePiece, "", fxRangeChain, int(bad[0]), int(bad[1]), bad[2]); !errors.Is(err, ErrBadFXRange) {
			t.Fatalf("%v: %v", bad, err)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != sent {
		t.Fatalf("a refused request was sent: %v", fake.commands()[sent:])
	}
	answer = func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "That value is outside what the setting takes."}}
	}
	_, err := actions.SetFXRangeParam(context.Background(), fxRangePiece, fxRangeTake, fxRangeChain, 0, 0, 99)
	var refusal *RefusalError
	if !errors.As(err, &refusal) || refusal.Sentence != "That value is outside what the setting takes." {
		t.Fatalf("err = %v, want REAPER's own sentence", err)
	}
}
