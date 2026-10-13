package reaper

import (
	"reflect"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/audacity"
)

func fxComparerAnswering(t *testing.T, answer func(command []string) [][]string) dawport.RangeFXComparer {
	t.Helper()
	role, ok := rangeFXApplierAnswering(t, answer).(dawport.RangeFXComparer)
	if !ok {
		t.Fatal("REAPER's fx_range role must also be a RangeFXComparer")
	}
	return role
}

func TestFXCompareIsExperimentalAndAudacityRefuses(t *testing.T) {
	for _, command := range []string{"fx_range_compare", "stop_fx_compare"} {
		if !bridge.Experimental(command) || commandCapability[command] != dawport.CapFXRange {
			t.Errorf("%s must be an experimental fx_range command", command)
		}
	}
	steps, ok := audacity.New(nil).Role(dawport.CapFXRange).(dawport.RangeFXComparer)
	if !ok {
		t.Fatal("Audacity's fx_range role must be a RangeFXComparer that refuses")
	}
	got, err := steps.CompareFXRange(t.Context(), fxTarget())
	if err != nil || got.Result.OK || got.Result.Refused == "" || got.Pass != 0 {
		t.Errorf("Audacity CompareFXRange = %+v, %v", got, err)
	}
	if stop, err := steps.StopFXCompare(t.Context()); err != nil || stop.OK || stop.Refused != got.Result.Refused {
		t.Errorf("Audacity StopFXCompare = %+v, %v", stop, err)
	}
}

func TestCompareFXRangePlaysThePieceAndAddsNoUndoStep(t *testing.T) {
	var sent []string
	comparer := fxComparerAnswering(t, func(command []string) [][]string {
		sent = command
		if command[0] == "stop_fx_compare" {
			return [][]string{{"RANGE_FX_COMPARE_STOPPED", command[1], "1"}}
		}
		return [][]string{{"RANGE_FX_COMPARE", command[1], command[2], fxRangeTake, fxRangeChain, "14", "16.5", "0"}}
	})
	got, err := comparer.CompareFXRange(t.Context(), fxTarget())
	want := dawport.FXRangeCompare{
		Result: dawport.OK("Playing the words in REAPER with Voice/Radio.RfxChain on, then bypassed. It is put back as it was after.", false),
		Pass:   2.5,
	}
	if err != nil || !reflect.DeepEqual(got, want) || got.Result.UndoSteps != 0 {
		t.Fatalf("CompareFXRange = %+v, %v; want %+v", got, err, want)
	}
	if want := []string{"fx_range_compare", cutItem, "", fxRangeChain}; !reflect.DeepEqual(append([]string{sent[0]}, sent[2:]...), want) {
		t.Errorf("command = %v, want %v", sent, want)
	}
	stop, err := comparer.StopFXCompare(t.Context())
	if err != nil || !reflect.DeepEqual(stop, dawport.OK("Stopped comparing in REAPER. The effect is as it was.", true).WithUndoSteps(0)) {
		t.Errorf("StopFXCompare = %+v, %v", stop, err)
	}
}

func TestStopFXCompareWithNothingPlayingChangesNothing(t *testing.T) {
	comparer := fxComparerAnswering(t, func(command []string) [][]string {
		return [][]string{{"RANGE_FX_COMPARE_STOPPED", command[1], "0"}}
	})
	if got, err := comparer.StopFXCompare(t.Context()); err != nil || !reflect.DeepEqual(got, dawport.OK("REAPER was not comparing an effect, so nothing changed.", false)) {
		t.Errorf("StopFXCompare = %+v, %v", got, err)
	}
}

func TestCompareFXRangeRefusals(t *testing.T) {
	gone := dawport.RefusedStale("That effect is no longer on those words in REAPER. Check the chapter again so the app finds where it is.")
	for _, tc := range []struct {
		name   string
		answer []string
		want   dawport.Result
	}{
		{"stale fx", []string{"ITEM_STALE", cutItem, "fx"}, gone},
		{"recording", []string{"ERROR", "REAPER is recording. Stop recording first."}, dawport.Refused("REAPER is recording. Stop recording first.")},
		{"old REAPER", []string{"ERROR", "This REAPER version cannot play an effect on words to compare it."},
			dawport.Refused("This REAPER version cannot play an effect on words to compare it.")},
	} {
		comparer := fxComparerAnswering(t, func(command []string) [][]string {
			return [][]string{append([]string{tc.answer[0], command[1]}, tc.answer[1:]...)}
		})
		if got, err := comparer.CompareFXRange(t.Context(), fxTarget()); err != nil || !reflect.DeepEqual(got, dawport.FXRangeCompare{Result: tc.want}) {
			t.Errorf("%s: CompareFXRange = %+v, %v; want %+v", tc.name, got, err, tc.want)
		}
	}
}

func TestCompareFXRangeIsGatedByTheResolverAndSendsNothingWhenRefused(t *testing.T) {
	sentence := "Experimental REAPER actions are off. Turn them on in Settings to add an effect to words."
	adapter, dir := newAdapter(t, func(c dawport.Capability) error {
		return &dawport.NotSupportedError{Capability: c, Support: dawport.Support{Reason: dawport.ReasonExperimentalOff, Message: sentence}}
	})
	comparer := adapter.Role(dawport.CapFXRange).(dawport.RangeFXComparer)
	if got, err := comparer.CompareFXRange(t.Context(), fxTarget()); err != nil || !reflect.DeepEqual(got, dawport.FXRangeCompare{Result: dawport.Refused(sentence)}) {
		t.Errorf("CompareFXRange = %+v, %v", got, err)
	}
	if n := len(sentCommands(t, dir)); n != 0 {
		t.Errorf("a refused Compare wrote %d commands", n)
	}
}
