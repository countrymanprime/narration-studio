package reaper

import (
	"reflect"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// The fx_range role's RangeFXChooser over bridge's choose_range_fx, range_fx_chosen and remove_fx_range under ChosenChain (#2251).

func fxChooserAnswering(t *testing.T, answer func(command []string) [][]string) dawport.RangeFXChooser {
	t.Helper()
	role, ok := rangeFXApplierAnswering(t, answer).(dawport.RangeFXChooser)
	if !ok {
		t.Fatal("REAPER's fx_range role must also be a RangeFXChooser")
	}
	return role
}

func chosenTarget() dawport.FXRangeTarget {
	target := fxTarget()
	target.ChainName = dawport.ChosenChain
	return target
}

func TestChooseCommandsAreExperimentalFxRangeCommands(t *testing.T) {
	for _, command := range []string{"choose_range_fx", "range_fx_chosen"} {
		if !bridge.Experimental(command) || commandCapability[command] != dawport.CapFXRange {
			t.Errorf("%s must be an experimental fx_range command", command)
		}
	}
}

func TestChooseFXForRangeOpensTheDialogAndTheReadAndRemovalNameThePieceItAnswered(t *testing.T) {
	var sent [][]string
	chooser := fxChooserAnswering(t, func(command []string) [][]string {
		sent = append(sent, command)
		switch command[0] {
		case "choose_range_fx":
			return [][]string{{"RANGE_FX_CHOOSING", command[1], fxRangePiece, fxRangeTake, "1"}}
		case "range_fx_chosen":
			return [][]string{
				{"RANGE_FX_CHOSEN_FX", command[1], "0", "VST: ReaComp (Cockos)", "1"},
				{"RANGE_FX_CHOSEN_FX", command[1], "1", "JS: utility/volume: C:\\x", "0"},
				{"RANGE_FX_CHOSEN", command[1], command[2], fxRangeTake, "2", "1", "0"},
			}
		case "remove_fx_range":
			return [][]string{{"RANGE_FX_REMOVED", command[1], cutItem, dawport.ChosenChain, "1"}}
		}
		return nil
	})
	got, err := chooser.ChooseFXForRange(t.Context(), fxRangeRequest(2))
	want := dawport.OK("REAPER's FX window is open for 2 words. Choose an effect there, then come back here.", true).WithUndoSteps(1)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("ChooseFXForRange = %+v, %v; want %+v", got, err, want)
	}
	if !reflect.DeepEqual(sent[0][2:], []string{cutItem, "14.000000", "16.000000", "10"}) {
		t.Errorf("command = %v", sent[0])
	}
	choice, err := chooser.ChosenFXForRange(t.Context(), chosenTarget())
	wantChoice := dawport.FXRangeChoice{
		Result:    dawport.OK("REAPER has 2 effects on the words: ReaComp (Cockos), utility volume  C  x.", false),
		FX:        []dawport.ChosenFX{{Name: "VST: ReaComp (Cockos)", Enabled: true}, {Name: "JS: utility/volume: C:\\x", Enabled: false}},
		Label:     "ReaComp (Cockos), utility volume  C  x",
		ChainOpen: true,
	}
	if err != nil || !reflect.DeepEqual(choice, wantChoice) {
		t.Fatalf("ChosenFXForRange = %+v, %v; want %+v", choice, err, wantChoice)
	}
	if last := sent[len(sent)-1]; !reflect.DeepEqual(last[2:], []string{fxRangePiece, fxRangeTake}) {
		t.Errorf("the read named %v, not the piece the choose answered", last)
	}
	removed, err := chooser.RemoveChosenFX(t.Context(), chosenTarget())
	if err != nil || !removed.OK || !removed.Changed || removed.UndoSteps != 1 {
		t.Fatalf("RemoveChosenFX = %+v, %v", removed, err)
	}
	if last := sent[len(sent)-1]; !reflect.DeepEqual(last[2:], []string{fxRangePiece, dawport.ChosenChain}) {
		t.Errorf("the removal named %v, not the piece", last)
	}
	// Once removed, the piece is forgotten: a read names the item the words resolve to again.
	if _, err := chooser.ChosenFXForRange(t.Context(), chosenTarget()); err != nil {
		t.Fatal(err)
	}
	if last := sent[len(sent)-1]; last[2] != cutItem || last[3] != "" {
		t.Errorf("after the removal the read named %v", last)
	}
}

func TestChosenFXForRangeWithNothingChosenAndAStalePiece(t *testing.T) {
	stale := false
	chooser := fxChooserAnswering(t, func(command []string) [][]string {
		if stale {
			return [][]string{{"ITEM_STALE", command[1], command[2], "fx"}}
		}
		return [][]string{{"RANGE_FX_CHOSEN", command[1], command[2], fxRangeTake, "0", "0", "0"}}
	})
	got, err := chooser.ChosenFXForRange(t.Context(), chosenTarget())
	if err != nil || !got.Result.OK || got.Result.Changed || len(got.FX) != 0 || got.FX == nil || got.Label != "" ||
		got.Result.Message != "Nothing is chosen in REAPER for these words yet." {
		t.Fatalf("nothing chosen = %+v, %v", got, err)
	}
	stale = true
	got, err = chooser.ChosenFXForRange(t.Context(), chosenTarget())
	if err != nil || got.Result.Code != dawport.CodeStale || got.FX == nil {
		t.Fatalf("stale = %+v, %v", got, err)
	}
}

func TestChooseFXForRangeRefusals(t *testing.T) {
	chooser := fxChooserAnswering(t, func(command []string) [][]string {
		return [][]string{{"ERROR", command[1], "Those words already have a chain on them. Take it off first."}}
	})
	got, err := chooser.ChooseFXForRange(t.Context(), fxRangeRequest(1))
	if err != nil || got.OK || got.Refused != "Those words already have a chain on them. Take it off first." {
		t.Fatalf("ChooseFXForRange = %+v, %v", got, err)
	}
}
