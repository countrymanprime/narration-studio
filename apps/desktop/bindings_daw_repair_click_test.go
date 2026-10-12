package main

import (
	"context"
	"errors"
	"maps"
	"math"
	"reflect"
	"slices"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// DawRepairClick (SN-E101). What REAPER does with the clicks is narration_range.lua's (repair_click_test.lua) and what the role
// answers is dawport/reaper's (reaper_test.go). These cover the host's wiring: the resolver first, the bounds, the take looked up on
// the chapter's track as the DAW reports it now (gainItems: source 2..12), every click checked inside the part of its file the take
// plays, the item and take the host read sent, and the answer.

type fakeClickRepairer struct {
	sent   []dawport.ClickRepairRequest
	answer dawport.Result
	err    error
}

func (f *fakeClickRepairer) RepairClick(_ context.Context, request dawport.ClickRepairRequest) (dawport.Result, error) {
	f.sent = append(f.sent, request)
	return f.answer, f.err
}

// clicksInREAPER is what dawport/reaper's click_repair role answers for two clicks repaired: one undo step.
func clicksInREAPER() dawport.Result {
	return dawport.OK("Repaired 2 clicks in REAPER. Undo it there in one step.", true).WithUndoSteps(1)
}

var testDawClicks = []DawClick{{Start: 4, End: 4.003}, {Start: 8.5, End: 8.502}}

func repairClicks(t *testing.T, repairer dawport.ClickRepairer, takeID string, clicks []DawClick) dawport.Result {
	t.Helper()
	items := gainItems()
	got, err := dawRepairClickIn(t.Context(), "REAPER", available(), repairer, splitTrack(&items, nil, nil), "c-0001", takeID, clicks)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

// The take id resolves on the host to the item and take the track reports now (braces and case aside), the clicks pass as given,
// and the answer is the role's DawResult.
func TestDawRepairClickSendsTheItemAndTakeTheHostReadAndAnswersADawResult(t *testing.T) {
	for _, id := range []string{splitTake, "c0000002-0000-4000-8000-000000000002"} {
		role := &fakeClickRepairer{answer: clicksInREAPER()}
		if got := repairClicks(t, role, id, testDawClicks); !reflect.DeepEqual(got, clicksInREAPER()) {
			t.Fatalf("%s: DawRepairClick = %+v", id, got)
		}
		want := []dawport.ClickRepairRequest{{ChapterID: "c-0001", ItemGUID: splitItem, TakeGUID: splitTake,
			Clicks: []dawport.Click{{Start: 4, End: 4.003}, {Start: 8.5, End: 8.502}}}}
		if !reflect.DeepEqual(role.sent, want) {
			t.Fatalf("%s: sent %+v, want %+v", id, role.sent, want)
		}
	}
}

// A take the track no longer holds, an item GUID in place of a take id, or a click outside the part of the file the take plays is
// refused stale; clicks out of bounds are refused; nothing is sent for any of them.
func TestDawRepairClickRefusesWhatTheTrackNoLongerHoldsAndSendsNothing(t *testing.T) {
	many := make([]DawClick, dawport.MaxClicks+1)
	for i := range many {
		many[i] = DawClick{Start: 2 + float64(i)*0.01, End: 2 + float64(i)*0.01 + 0.002}
	}
	for name, c := range map[string]struct {
		id     string
		clicks []DawClick
		stale  bool
	}{
		"gone":             {"{C0000009-0000-4000-8000-000000000009}", testDawClicks, true},
		"an item GUID":     {splitItem, testDawClicks, true},
		"empty":            {"", testDawClicks, true},
		"before the take":  {splitTake, []DawClick{{Start: 1.999, End: 2.001}}, true},
		"after the take":   {splitTake, []DawClick{{Start: 11.999, End: 12.001}}, true},
		"no click":         {splitTake, nil, false},
		"too many clicks":  {splitTake, many, false},
		"a reversed click": {splitTake, []DawClick{{Start: 4.003, End: 4}}, false},
		"a negative click": {splitTake, []DawClick{{Start: -1, End: -0.998}}, false},
		"an empty click":   {splitTake, []DawClick{{Start: 4, End: 4}}, false},
		"an endless click": {splitTake, []DawClick{{Start: 4, End: math.Inf(1)}}, false},
		"a 60 ms click":    {splitTake, []DawClick{{Start: 4, End: 4.06}}, false},
	} {
		role := &fakeClickRepairer{answer: clicksInREAPER()}
		got := repairClicks(t, role, c.id, c.clicks)
		if got.OK || got.Refused == "" || (got.Code == dawport.CodeStale) != c.stale || len(role.sent) != 0 {
			t.Errorf("%s: %+v, sent %v; want a refusal (stale %v) and nothing sent", name, got, role.sent, c.stale)
		}
	}
}

// The role's own answers pass through; an error it or the track read returned is a refusal in a sentence; a track refusal is the
// answer; no role is the connection refusal.
func TestDawRepairClickPassesOnTheRolesAnswers(t *testing.T) {
	stale := dawport.RefusedStale("That item no longer has the take to repair. Read the project again.")
	if got := repairClicks(t, &fakeClickRepairer{answer: stale}, splitTake, testDawClicks); !reflect.DeepEqual(got, stale) {
		t.Fatalf("stale = %+v", got)
	}
	for _, err := range []error{bridge.ErrNoAnswer, bridge.ErrUnavailable, bridge.ErrExperimentalOff, context.DeadlineExceeded, &bridge.TrackStaleError{}, errors.New("boom")} {
		if got := repairClicks(t, &fakeClickRepairer{err: err}, splitTake, testDawClicks); got.OK || got.Refused == "" {
			t.Errorf("%v: %+v, want a refusal", err, got)
		}
		items := gainItems()
		got, _ := dawRepairClickIn(t.Context(), "REAPER", available(), &fakeClickRepairer{}, splitTrack(&items, nil, err), "c-0001", splitTake, testDawClicks)
		if got.OK || got.Refused == "" {
			t.Errorf("track read %v: %+v, want a refusal", err, got)
		}
	}
	noLink := dawport.Refused("Link this chapter to a track first.")
	items := gainItems()
	role := &fakeClickRepairer{}
	if got, _ := dawRepairClickIn(t.Context(), "REAPER", available(), role, splitTrack(&items, &noLink, nil), "c-0001", splitTake, testDawClicks); !reflect.DeepEqual(got, noLink) || len(role.sent) != 0 {
		t.Fatalf("a track refusal = %+v, sent %v", got, role.sent)
	}
	if got, err := dawRepairClickIn(t.Context(), "REAPER", available(), nil, splitTrack(&items, nil, nil), "c-0001", splitTake, testDawClicks); err != nil || got.OK || got.Refused == "" {
		t.Fatalf("no role = %+v, %v", got, err)
	}
}

// The click_repair capability's own sentence for each launch the resolver refuses, checked first, and nothing sent.
func TestDawRepairClickRefusesWithTheResolversSentenceAndSendsNothing(t *testing.T) {
	for name, c := range map[string]struct {
		kind   string
		reach  *daw.Reachability
		toggle string
		reason dawport.Reason
	}{
		"standalone":        {"", liveReachability(), "on", dawport.ReasonStandalone},
		"not answering":     {"REAPER", daw.NewReachability(nil), "on", dawport.ReasonNotRunning},
		"experimental off":  {"REAPER", liveReachability(), "", dawport.ReasonExperimentalOff},
		"toggle turned off": {"REAPER", liveReachability(), "off", dawport.ReasonTurnedOff},
	} {
		t.Run(name, func(t *testing.T) {
			role := &fakeClickRepairer{answer: clicksInREAPER()}
			host := deleteRangeHost(t, c.kind, c.reach, nil, "")
			if c.toggle != "" {
				if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapClickRepair): &c.toggle}); err != nil {
					t.Fatal(err)
				}
			}
			host.mu.Lock()
			host.clickRepairer = role
			host.mu.Unlock()
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapClickRepair)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("click_repair support = %+v, want reason %s", support, c.reason)
			}
			got := decodeDawResult(t)(host.DawRepairClick("c-0001", splitTake, testDawClicks))
			if !reflect.DeepEqual(got, dawport.Refused(support.Message)) || len(role.sent) != 0 {
				t.Fatalf("DawRepairClick = %+v, sent %v; want Refused(%q)", got, role.sent, support.Message)
			}
		})
	}
}

// TestDawRepairClickContractGoldenIsCurrent pins the binding's answers: clicks repaired in REAPER (one undo step), REAPER's stale
// refusal and the click_repair capability's refusal. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-repair-click-*.json.
func TestDawRepairClickContractGoldenIsCurrent(t *testing.T) {
	refusedCapability := dawport.Support{Message: "Experimental REAPER actions are off. Turn them on in Settings to repair clicks in a take."}
	cases := map[string]struct {
		support dawport.Support
		answer  dawport.Result
	}{
		"daw-repair-click-done":               {available(), clicksInREAPER()},
		"daw-repair-click-refused-stale":      {available(), dawport.RefusedStale("That item no longer has the take to repair. Read the project again.")},
		"daw-repair-click-refused-capability": {refusedCapability, clicksInREAPER()},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		c := cases[name]
		t.Run(name, func(t *testing.T) {
			items := gainItems()
			got, err := dawRepairClickIn(t.Context(), "REAPER", c.support, &fakeClickRepairer{answer: c.answer}, splitTrack(&items, nil, nil),
				"c-0001", splitTake, testDawClicks)
			if err != nil {
				t.Fatal(err)
			}
			contractfile.Check(t, name, got)
		})
	}
}
