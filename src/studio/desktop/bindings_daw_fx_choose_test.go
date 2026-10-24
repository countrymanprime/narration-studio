package main

import (
	"context"
	"maps"
	"reflect"
	"slices"
	"testing"

	"desktop/internal/contractfile"
	"desktop/internal/dawport"
)

// DawChooseFxForRange and DawChosenFxForRange (#2251) over fxRangeHost's launch: the words resolve on the host as for an apply, the
// fx_range role's RangeFXChooser is sent the range, and a removal, an edit or a Compare under dawport.ChosenChain reaches the chooser
// or the editor with that name.

type fakeRangeFXChooser struct {
	fakeRangeFXEditor
	chose   []dawport.FXRangeRequest
	read    []dawport.FXRangeTarget
	cleared []dawport.FXRangeTarget
	choice  dawport.FXRangeChoice
}

func (f *fakeRangeFXChooser) ChooseFXForRange(_ context.Context, request dawport.FXRangeRequest) (dawport.Result, error) {
	f.chose = append(f.chose, request)
	return f.answer, f.err
}

func (f *fakeRangeFXChooser) ChosenFXForRange(_ context.Context, target dawport.FXRangeTarget) (dawport.FXRangeChoice, error) {
	f.read = append(f.read, target)
	return f.choice, f.err
}

func (f *fakeRangeFXChooser) RemoveChosenFX(_ context.Context, target dawport.FXRangeTarget) (dawport.Result, error) {
	f.cleared = append(f.cleared, target)
	return f.answer, f.err
}

func dialogOpenInREAPER() dawport.Result {
	return dawport.OK("REAPER's FX window is open for 1 word. Choose an effect there, then come back here.", true).WithUndoSteps(1)
}

// reaCompChosen is what REAPER's fx_range role reads after the narrator chose ReaComp, its chain window still open: the choice
// src/studio/ui's mocks answer.
func reaCompChosen() dawport.FXRangeChoice {
	return dawport.FXRangeChoice{
		Result:    dawport.OK("REAPER has ReaComp (Cockos) on the words.", false),
		FX:        []dawport.ChosenFX{{Name: "VST: ReaComp (Cockos)", Enabled: true}},
		Label:     "ReaComp (Cockos)",
		ChainOpen: true,
	}
}

func decodeFxChoice(t *testing.T) func(string, error) dawport.FXRangeChoice {
	t.Helper()
	return bindingAnswer[dawport.FXRangeChoice](t)
}

var oneWord = dawport.RangeRequest{ChapterID: "c-0001", ItemGUID: "{ITEM-1}", Start: 1, End: 1.5, Words: 1}

func TestDawChooseFxForRangeSendsTheResolvedRangeAndFadeAndAnswersADawResult(t *testing.T) {
	chooser := &fakeRangeFXChooser{fakeRangeFXEditor: fakeRangeFXEditor{fakeRangeFX: fakeRangeFX{answer: dialogOpenInREAPER()}}}
	host := fxRangeHost(t, "REAPER", liveReachability(), chooser, "on")

	got := decodeDawResult(t)(host.DawChooseFxForRange("c-0001", 0, 0, 10))

	if !reflect.DeepEqual(got, dialogOpenInREAPER()) {
		t.Fatalf("DawChooseFxForRange = %+v", got)
	}
	want := []dawport.FXRangeRequest{{RangeRequest: oneWord, ChainID: dawport.ChosenChain, ChainName: dawport.ChosenChain, FadeMs: 10}}
	if !reflect.DeepEqual(chooser.chose, want) {
		t.Fatalf("sent %+v, want %+v", chooser.chose, want)
	}
}

func TestDawChosenFxForRangeReadsTheChoiceForTheWords(t *testing.T) {
	chooser := &fakeRangeFXChooser{choice: reaCompChosen()}
	host := fxRangeHost(t, "REAPER", liveReachability(), chooser, "on")

	got := decodeFxChoice(t)(host.DawChosenFxForRange("c-0001", 0, 0))

	if !reflect.DeepEqual(got, reaCompChosen()) {
		t.Fatalf("DawChosenFxForRange = %+v", got)
	}
	if want := []dawport.FXRangeTarget{{RangeRequest: oneWord, ChainName: dawport.ChosenChain}}; !reflect.DeepEqual(chooser.read, want) {
		t.Fatalf("read %+v, want %+v", chooser.read, want)
	}
}

func TestTheChosenChainIsRemovedThroughTheChooserAndEditedAndComparedByName(t *testing.T) {
	chooser := &fakeRangeFXChooser{fakeRangeFXEditor: fakeRangeFXEditor{fakeRangeFX: fakeRangeFX{answer: dawport.OK("off", true).WithUndoSteps(1)}, settings: gainSetting()}}
	host := fxRangeHost(t, "REAPER", liveReachability(), chooser, "on")

	if got := decodeDawResult(t)(host.DawRemoveFxFromRange("c-0001", 0, 0, dawport.ChosenChain)); !got.OK {
		t.Fatalf("DawRemoveFxFromRange = %+v", got)
	}
	target := dawport.FXRangeTarget{RangeRequest: oneWord, ChainName: dawport.ChosenChain}
	if !reflect.DeepEqual(chooser.cleared, []dawport.FXRangeTarget{target}) || len(chooser.removed) != 0 {
		t.Fatalf("cleared %+v, removed %+v: the chosen effect must come off through the chooser", chooser.cleared, chooser.removed)
	}
	if got := decodeDawResult(t)(host.DawBypassFxRange("c-0001", 0, 0, dawport.ChosenChain, true)); !got.OK {
		t.Fatalf("DawBypassFxRange = %+v", got)
	}
	if !reflect.DeepEqual(chooser.targets, []dawport.FXRangeTarget{target}) {
		t.Fatalf("edited %+v", chooser.targets)
	}
}

func TestDawChooseFxForRangeRefusesAsAnApplyDoesAndSendsNothing(t *testing.T) {
	for name, c := range map[string]struct {
		toggle      string
		role        dawport.RangeFXApplier
		first, fade int
	}{
		"capability off":         {toggle: "", role: &fakeRangeFXChooser{}, fade: 10},
		"fade over 500":          {toggle: "on", role: &fakeRangeFXChooser{}, fade: 501},
		"word not heard":         {toggle: "on", role: &fakeRangeFXChooser{}, first: 1, fade: 10},
		"a role with no chooser": {toggle: "on", role: &fakeRangeFXEditor{}, fade: 10},
	} {
		host := fxRangeHost(t, "REAPER", liveReachability(), c.role, c.toggle)
		got := decodeDawResult(t)(host.DawChooseFxForRange("c-0001", c.first, c.first, c.fade))
		if got.OK || got.Refused == "" {
			t.Errorf("%s: %+v", name, got)
		}
		read := decodeFxChoice(t)(host.DawChosenFxForRange("c-0001", c.first, c.first))
		if name != "fade over 500" && (read.Result.OK || read.FX == nil) {
			t.Errorf("%s: read %+v", name, read)
		}
		if chooser, ok := c.role.(*fakeRangeFXChooser); ok && (len(chooser.chose) != 0 || (name != "fade over 500" && len(chooser.read) != 0)) {
			t.Errorf("%s: sent %+v %+v", name, chooser.chose, chooser.read)
		}
	}
}

// TestDawFxChooseContractGoldenIsCurrent pins the answers: the dialog opened (one undo step), the choice read, nothing chosen yet,
// and the capability's refusal of a read. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-fx-choose-*.json.
func TestDawFxChooseContractGoldenIsCurrent(t *testing.T) {
	cases := map[string]func(t *testing.T) any{
		"daw-fx-choose-opened": func(t *testing.T) any {
			chooser := &fakeRangeFXChooser{fakeRangeFXEditor: fakeRangeFXEditor{fakeRangeFX: fakeRangeFX{answer: dialogOpenInREAPER()}}}
			return decodeDawResult(t)(fxRangeHost(t, "REAPER", liveReachability(), chooser, "on").DawChooseFxForRange("c-0001", 0, 0, 10))
		},
		"daw-fx-chosen-done": func(t *testing.T) any {
			return decodeFxChoice(t)(fxRangeHost(t, "REAPER", liveReachability(), &fakeRangeFXChooser{choice: reaCompChosen()}, "on").DawChosenFxForRange("c-0001", 0, 0))
		},
		"daw-fx-chosen-none": func(t *testing.T) any {
			none := dawport.FXRangeChoice{Result: dawport.OK("Nothing is chosen in REAPER for these words yet.", false), FX: []dawport.ChosenFX{}, ChainOpen: true}
			return decodeFxChoice(t)(fxRangeHost(t, "REAPER", liveReachability(), &fakeRangeFXChooser{choice: none}, "on").DawChosenFxForRange("c-0001", 0, 0))
		},
		"daw-fx-chosen-refused": func(t *testing.T) any {
			return decodeFxChoice(t)(fxRangeHost(t, "REAPER", liveReachability(), &fakeRangeFXChooser{choice: reaCompChosen()}, "").DawChosenFxForRange("c-0001", 0, 0))
		},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		t.Run(name, func(t *testing.T) { contractfile.Check(t, name, cases[name](t)) })
	}
}
