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

// DawReduceRangeGain (SN-E100). What REAPER does with the stretches is narration_range.lua's (reduce_range_gain_test.lua) and what
// the role answers is dawport/reaper's (reaper_test.go). These cover the host's wiring: the resolver first, the bounds, the take
// looked up on the chapter's track as the DAW reports it now, every stretch checked inside the part of its file the take plays, the
// item and take the host read sent, and the answer.

type fakeGainReducer struct {
	sent   []dawport.RangeGainRequest
	answer dawport.Result
	err    error
}

func (f *fakeGainReducer) ReduceRangeGain(_ context.Context, request dawport.RangeGainRequest) (dawport.Result, error) {
	f.sent = append(f.sent, request)
	return f.answer, f.err
}

// gainInREAPER is what dawport/reaper's range_gain role answers for two stretches lowered by 9 dB: one undo step.
func gainInREAPER() dawport.Result {
	return dawport.OK("Lowered 2 stretches by 9 dB in REAPER. Undo it there in one step.", true).WithUndoSteps(1)
}

// gainItems is chapter c-0001's track now: the take (10 s at 10 s, playing its file from 2 s, so source 2..12) and a later item.
func gainItems() []dawport.TrackItem {
	items := splitItems()
	items[0].SourceOffset, items[0].PlayRate = 2, 1
	return items
}

var gainStretches = []DawGainStretch{{Start: 4, End: 5}, {Start: 8, End: 8.5}}

func reduceGain(t *testing.T, reducer dawport.RangeGainReducer, takeID string, stretches []DawGainStretch, db float64) dawport.Result {
	t.Helper()
	items := gainItems()
	got, err := dawReduceRangeGainIn(t.Context(), "REAPER", available(), reducer, splitTrack(&items, nil, nil), "c-0001", takeID, stretches, db)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

// The take id resolves on the host to the item and take the track reports now (braces and case aside), the stretches and dB pass
// as given, and the answer is the role's DawResult.
func TestDawReduceRangeGainSendsTheItemAndTakeTheHostReadAndAnswersADawResult(t *testing.T) {
	for _, id := range []string{splitTake, "c0000002-0000-4000-8000-000000000002"} {
		role := &fakeGainReducer{answer: gainInREAPER()}
		if got := reduceGain(t, role, id, gainStretches, 9); !reflect.DeepEqual(got, gainInREAPER()) {
			t.Fatalf("%s: DawReduceRangeGain = %+v", id, got)
		}
		want := []dawport.RangeGainRequest{{ChapterID: "c-0001", ItemGUID: splitItem, TakeGUID: splitTake, ReduceDB: 9,
			Stretches: []dawport.GainStretch{{Start: 4, End: 5}, {Start: 8, End: 8.5}}}}
		if !reflect.DeepEqual(role.sent, want) {
			t.Fatalf("%s: sent %+v, want %+v", id, role.sent, want)
		}
	}
}

// A take the track no longer holds, an item GUID in place of a take id, or a stretch outside the part of the file the take plays
// is refused stale; a reduction or stretches out of bounds are refused; nothing is sent for any of them.
func TestDawReduceRangeGainRefusesWhatTheTrackNoLongerHoldsAndSendsNothing(t *testing.T) {
	many := make([]DawGainStretch, dawport.MaxGainStretches+1)
	for i := range many {
		many[i] = DawGainStretch{Start: 2 + float64(i)*0.01, End: 2 + float64(i)*0.01 + 0.005}
	}
	for name, c := range map[string]struct {
		id        string
		stretches []DawGainStretch
		db        float64
		stale     bool
	}{
		"gone":               {"{C0000009-0000-4000-8000-000000000009}", gainStretches, 9, true},
		"an item GUID":       {splitItem, gainStretches, 9, true},
		"empty":              {"", gainStretches, 9, true},
		"before the take":    {splitTake, []DawGainStretch{{Start: 1, End: 3}}, 9, true},
		"after the take":     {splitTake, []DawGainStretch{{Start: 11, End: 12.5}}, 9, true},
		"0 dB":               {splitTake, gainStretches, 0, false},
		"25 dB":              {splitTake, gainStretches, 25, false},
		"no stretch":         {splitTake, nil, 9, false},
		"too many stretches": {splitTake, many, 9, false},
		"a reversed stretch": {splitTake, []DawGainStretch{{Start: 5, End: 4}}, 9, false},
		"a negative stretch": {splitTake, []DawGainStretch{{Start: -1, End: 4}}, 9, false},
		"an empty stretch":   {splitTake, []DawGainStretch{{Start: 4, End: 4}}, 9, false},
		"an endless stretch": {splitTake, []DawGainStretch{{Start: 4, End: math.Inf(1)}}, 9, false},
	} {
		role := &fakeGainReducer{answer: gainInREAPER()}
		got := reduceGain(t, role, c.id, c.stretches, c.db)
		if got.OK || got.Refused == "" || (got.Code == dawport.CodeStale) != c.stale || len(role.sent) != 0 {
			t.Errorf("%s: %+v, sent %v; want a refusal (stale %v) and nothing sent", name, got, role.sent, c.stale)
		}
	}
}

// The role's own answers pass through; an error it or the track read returned is a refusal in a sentence; a track refusal is the
// answer; no role is the connection refusal.
func TestDawReduceRangeGainPassesOnTheRolesAnswers(t *testing.T) {
	stale := dawport.RefusedStale("That item no longer has the take to lower. Read the project again.")
	if got := reduceGain(t, &fakeGainReducer{answer: stale}, splitTake, gainStretches, 9); !reflect.DeepEqual(got, stale) {
		t.Fatalf("stale = %+v", got)
	}
	for _, err := range []error{bridge.ErrNoAnswer, bridge.ErrUnavailable, bridge.ErrExperimentalOff, context.DeadlineExceeded, &bridge.TrackStaleError{}, errors.New("boom")} {
		if got := reduceGain(t, &fakeGainReducer{err: err}, splitTake, gainStretches, 9); got.OK || got.Refused == "" {
			t.Errorf("%v: %+v, want a refusal", err, got)
		}
		items := gainItems()
		got, _ := dawReduceRangeGainIn(t.Context(), "REAPER", available(), &fakeGainReducer{}, splitTrack(&items, nil, err), "c-0001", splitTake, gainStretches, 9)
		if got.OK || got.Refused == "" {
			t.Errorf("track read %v: %+v, want a refusal", err, got)
		}
	}
	noLink := dawport.Refused("Link this chapter to a track first.")
	items := gainItems()
	role := &fakeGainReducer{}
	if got, _ := dawReduceRangeGainIn(t.Context(), "REAPER", available(), role, splitTrack(&items, &noLink, nil), "c-0001", splitTake, gainStretches, 9); !reflect.DeepEqual(got, noLink) || len(role.sent) != 0 {
		t.Fatalf("a track refusal = %+v, sent %v", got, role.sent)
	}
	if got, err := dawReduceRangeGainIn(t.Context(), "REAPER", available(), nil, splitTrack(&items, nil, nil), "c-0001", splitTake, gainStretches, 9); err != nil || got.OK || got.Refused == "" {
		t.Fatalf("no role = %+v, %v", got, err)
	}
}

// The range_gain capability's own sentence for each launch the resolver refuses, checked first, and nothing sent.
func TestDawReduceRangeGainRefusesWithTheResolversSentenceAndSendsNothing(t *testing.T) {
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
			role := &fakeGainReducer{answer: gainInREAPER()}
			host := deleteRangeHost(t, c.kind, c.reach, nil, "")
			if c.toggle != "" {
				if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapRangeGain): &c.toggle}); err != nil {
					t.Fatal(err)
				}
			}
			host.mu.Lock()
			host.rangeGain = role
			host.mu.Unlock()
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapRangeGain)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("range_gain support = %+v, want reason %s", support, c.reason)
			}
			got := decodeDawResult(t)(host.DawReduceRangeGain("c-0001", splitTake, gainStretches, 9))
			if !reflect.DeepEqual(got, dawport.Refused(support.Message)) || len(role.sent) != 0 {
				t.Fatalf("DawReduceRangeGain = %+v, sent %v; want Refused(%q)", got, role.sent, support.Message)
			}
		})
	}
}

// TestDawReduceRangeGainContractGoldenIsCurrent pins the binding's answers: stretches lowered in REAPER (one undo step), REAPER's
// stale refusal and the range_gain capability's refusal. UPDATE_CONTRACTS=1 rewrites
// tests/fixtures/contracts/daw-reduce-range-gain-*.json.
func TestDawReduceRangeGainContractGoldenIsCurrent(t *testing.T) {
	refusedCapability := dawport.Support{Message: "Experimental REAPER actions are off. Turn them on in Settings to lower stretches of a take."}
	cases := map[string]struct {
		support dawport.Support
		answer  dawport.Result
	}{
		"daw-reduce-range-gain-done":               {available(), gainInREAPER()},
		"daw-reduce-range-gain-refused-stale":      {available(), dawport.RefusedStale("That item no longer has the take to lower. Read the project again.")},
		"daw-reduce-range-gain-refused-capability": {refusedCapability, gainInREAPER()},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		c := cases[name]
		t.Run(name, func(t *testing.T) {
			items := gainItems()
			got, err := dawReduceRangeGainIn(t.Context(), "REAPER", c.support, &fakeGainReducer{answer: c.answer}, splitTrack(&items, nil, nil),
				"c-0001", splitTake, gainStretches, 9)
			if err != nil {
				t.Fatal(err)
			}
			contractfile.Check(t, name, got)
		})
	}
}
