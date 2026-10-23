package main

import (
	"context"
	"encoding/json"
	"errors"
	"maps"
	"reflect"
	"slices"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// DawCompareFxRange and DawStopFxCompare (SN-E113) over the fx_range launch of bindings_daw_fx_range_test.go: the words resolve
// to "{ITEM-1}" from 1 to 1.5 s, and a fake comparer stands in for REAPER's fx_range role.

type fakeRangeFXComparer struct {
	fakeRangeFXEditor
	compared []dawport.FXRangeTarget
	stops    int
	compare  dawport.FXRangeCompare
}

func (f *fakeRangeFXComparer) CompareFXRange(_ context.Context, target dawport.FXRangeTarget) (dawport.FXRangeCompare, error) {
	f.compared = append(f.compared, target)
	return f.compare, f.err
}

func (f *fakeRangeFXComparer) StopFXCompare(context.Context) (dawport.Result, error) {
	f.stops++
	return f.answer, f.err
}

// comparing is what REAPER's fx_range role answers for a Compare of a 0.5 s piece.
func comparing() dawport.FXRangeCompare {
	return dawport.FXRangeCompare{
		Result: dawport.OK("Playing the words in REAPER with Podcast Voice.RfxChain on, then bypassed. It is put back as it was after.", false),
		Pass:   0.5,
	}
}

func decodeFxCompare(t *testing.T) func(string, error) dawport.FXRangeCompare {
	t.Helper()
	return func(payload string, err error) dawport.FXRangeCompare {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var got dawport.FXRangeCompare
		if err := json.Unmarshal([]byte(payload), &got); err != nil {
			t.Fatal(err)
		}
		return got
	}
}

func fxCompareHost(t *testing.T, comparer *fakeRangeFXComparer, toggle string) *Host {
	t.Helper()
	return fxRangeHost(t, "REAPER", liveReachability(), comparer, toggle)
}

func TestDawCompareFxRangeSendsTheResolvedRangeAndChainAndAnswersEachPassesLength(t *testing.T) {
	comparer := &fakeRangeFXComparer{compare: comparing()}
	host := fxCompareHost(t, comparer, "on")
	if got := decodeFxCompare(t)(host.DawCompareFxRange("c-0001", 0, 0, fxRangeChain)); !reflect.DeepEqual(got, comparing()) || got.Result.UndoSteps != 0 {
		t.Fatalf("DawCompareFxRange = %+v", got)
	}
	target := dawport.FXRangeTarget{RangeRequest: dawport.RangeRequest{ChapterID: "c-0001", ItemGUID: "{ITEM-1}", Start: 1, End: 1.5, Words: 1}, ChainName: fxRangeChain}
	if !reflect.DeepEqual(comparer.compared, []dawport.FXRangeTarget{target}) {
		t.Fatalf("targets = %+v", comparer.compared)
	}
	comparer.answer = dawport.OK("Stopped comparing in REAPER. The effect is as it was.", true).WithUndoSteps(0)
	if got := decodeDawResult(t)(host.DawStopFxCompare()); !reflect.DeepEqual(got, comparer.answer) || comparer.stops != 1 {
		t.Fatalf("DawStopFxCompare = %+v, stops %d", got, comparer.stops)
	}
}

func TestDawCompareFxRangeRefusesWhatTheOtherEditsRefuseAndSendsNothing(t *testing.T) {
	for _, toggle := range []string{"", "off"} {
		comparer := &fakeRangeFXComparer{compare: comparing()}
		host := fxCompareHost(t, comparer, toggle)
		want := dawport.Refused(fxRangeSupport(t, host).Message)
		if got := decodeFxCompare(t)(host.DawCompareFxRange("c-0001", 0, 0, fxRangeChain)); !reflect.DeepEqual(got, dawport.FXRangeCompare{Result: want}) {
			t.Errorf("toggle %q: %+v", toggle, got)
		}
		if got := decodeDawResult(t)(host.DawStopFxCompare()); !reflect.DeepEqual(got, want) || comparer.stops != 0 {
			t.Errorf("toggle %q: stop %+v", toggle, got)
		}
	}
	comparer := &fakeRangeFXComparer{compare: comparing()}
	host := fxCompareHost(t, comparer, "on")
	if got := decodeFxCompare(t)(host.DawCompareFxRange("c-0001", 0, 2, fxRangeChain)); got.Result.Code != dawport.CodeStale || got.Pass != 0 {
		t.Errorf("stale range: %+v", got)
	}
	if got := decodeFxCompare(t)(host.DawCompareFxRange("c-0001", 0, 0, "../reaper.ini")); !reflect.DeepEqual(got.Result, dawport.Refused(fxRangeBadChainSentence)) {
		t.Errorf("a path: %+v", got)
	}
	if len(comparer.compared) != 0 {
		t.Fatalf("sent %+v", comparer.compared)
	}
}

// An engine whose fx_range role cannot compare refuses in a sentence; a role's error is worded as a refusal; a stale answer
// passes on with its code.
func TestDawCompareFxRangePassesOnTheRolesAnswers(t *testing.T) {
	editOnly := fxRangeHost(t, "REAPER", liveReachability(), &fakeRangeFXEditor{}, "on")
	if got := decodeFxCompare(t)(editOnly.DawCompareFxRange("c-0001", 0, 0, fxRangeChain)); got.Result.OK || got.Result.Refused != "REAPER cannot play an effect on words to compare it." {
		t.Errorf("no comparer: %+v", got)
	}
	if got := decodeDawResult(t)(editOnly.DawStopFxCompare()); !got.OK || got.Changed {
		t.Errorf("no comparer, stop: %+v", got)
	}
	gone := dawport.RefusedStale("That effect is no longer on those words in REAPER. Check the chapter again so the app finds where it is.")
	stale := fxCompareHost(t, &fakeRangeFXComparer{compare: dawport.FXRangeCompare{Result: gone}}, "on")
	if got := decodeFxCompare(t)(stale.DawCompareFxRange("c-0001", 0, 0, fxRangeChain)); !reflect.DeepEqual(got.Result, gone) {
		t.Errorf("stale: %+v", got)
	}
	failing := fxCompareHost(t, &fakeRangeFXComparer{fakeRangeFXEditor: fakeRangeFXEditor{fakeRangeFX: fakeRangeFX{err: errors.New("boom")}}}, "on")
	if got := decodeFxCompare(t)(failing.DawCompareFxRange("c-0001", 0, 0, fxRangeChain)); got.Result.OK || got.Result.Refused == "" || got.Pass != 0 {
		t.Errorf("error: %+v", got)
	}
	if got := decodeDawResult(t)(failing.DawStopFxCompare()); got.OK || got.Refused == "" {
		t.Errorf("error, stop: %+v", got)
	}
}

// TestDawCompareFxRangeContractGoldenIsCurrent pins the Compare's answers: started (no undo step, each pass's length), refused
// as stale, and stopped. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-fx-range-compare-*.json.
func TestDawCompareFxRangeContractGoldenIsCurrent(t *testing.T) {
	gone := dawport.RefusedStale("That effect is no longer on those words in REAPER. Check the chapter again so the app finds where it is.")
	cases := map[string]func(t *testing.T) any{
		"daw-fx-range-compare-done": func(t *testing.T) any {
			return decodeFxCompare(t)(fxCompareHost(t, &fakeRangeFXComparer{compare: comparing()}, "on").DawCompareFxRange("c-0001", 0, 0, fxRangeChain))
		},
		"daw-fx-range-compare-refused-stale": func(t *testing.T) any {
			comparer := &fakeRangeFXComparer{compare: dawport.FXRangeCompare{Result: gone}}
			return decodeFxCompare(t)(fxCompareHost(t, comparer, "on").DawCompareFxRange("c-0001", 0, 0, fxRangeChain))
		},
		"daw-fx-range-compare-stopped": func(t *testing.T) any {
			comparer := &fakeRangeFXComparer{}
			comparer.answer = dawport.OK("Stopped comparing in REAPER. The effect is as it was.", true).WithUndoSteps(0)
			return decodeDawResult(t)(fxCompareHost(t, comparer, "on").DawStopFxCompare())
		},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		t.Run(name, func(t *testing.T) { contractfile.Check(t, name, cases[name](t)) })
	}
}
