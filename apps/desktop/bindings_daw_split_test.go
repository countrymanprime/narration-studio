package main

import (
	"context"
	"errors"
	"maps"
	"reflect"
	"slices"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// DawSplitTake (SN-E94). What REAPER does with the cut is narration_takes.lua's (split_take_test.lua) and what the role answers
// is dawport/reaper's (reaper_test.go). These cover the host's wiring: the resolver first, the take looked up on the chapter's
// track as the DAW reports it now, the cut checked inside it, the item and take the host read sent, and the answer.

const (
	splitItem = "{C0000001-0000-4000-8000-000000000001}"
	splitTake = "{C0000002-0000-4000-8000-000000000002}"
)

type fakeSplitter struct {
	sent   []string
	answer dawport.Result
	err    error
}

func (f *fakeSplitter) SplitTake(_ context.Context, itemGUID, takeGUID string, at float64) (dawport.Result, error) {
	f.sent = append(f.sent, itemGUID, takeGUID)
	if at != 15.5 {
		f.sent = append(f.sent, "unexpected time")
	}
	return f.answer, f.err
}

// splitInREAPER is what dawport/reaper's takes role answers for a cut: one undo step.
func splitInREAPER() dawport.Result {
	return dawport.OK("Split the take into 2 takes in REAPER. Undo it there in one step.", true).WithUndoSteps(1)
}

// splitTrack is chapter c-0001's track now: the take that reads its line twice at 10 s for 10 s, and a later item.
func splitTrack(items *[]dawport.TrackItem, refused *dawport.Result, err error) splitLive {
	return func(context.Context, string) ([]dawport.TrackItem, *dawport.Result, error) {
		return *items, refused, err
	}
}

func splitItems() []dawport.TrackItem {
	return []dawport.TrackItem{
		{ItemGUID: splitItem, TakeGUID: splitTake, Position: 10, Length: 10},
		{ItemGUID: "{C0000003-0000-4000-8000-000000000003}", TakeGUID: "{C0000004-0000-4000-8000-000000000004}", Position: 24, Length: 6},
	}
}

func split(t *testing.T, splitter dawport.TakeSplitter, takeID string, at float64) dawport.Result {
	t.Helper()
	items := splitItems()
	got, err := dawSplitTakeIn(t.Context(), "REAPER", available(), splitter, splitTrack(&items, nil, nil), "c-0001", takeID, at)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

// The take id resolves on the host to the item and take the track reports now (braces and case aside), and the answer is the
// role's DawResult.
func TestDawSplitTakeSendsTheItemAndTakeTheHostReadAndAnswersADawResult(t *testing.T) {
	for _, id := range []string{splitTake, "c0000002-0000-4000-8000-000000000002"} {
		role := &fakeSplitter{answer: splitInREAPER()}
		if got := split(t, role, id, 15.5); !reflect.DeepEqual(got, splitInREAPER()) {
			t.Fatalf("%s: DawSplitTake = %+v", id, got)
		}
		if !reflect.DeepEqual(role.sent, []string{splitItem, splitTake}) {
			t.Fatalf("%s: sent %v, want the item and take the track reported", id, role.sent)
		}
	}
}

// A take the track no longer holds, an item GUID in place of a take id, or a cut outside the take is refused stale; a time that
// is not one is refused; nothing is sent for any of them.
func TestDawSplitTakeRefusesWhatTheTrackNoLongerHoldsAndSendsNothing(t *testing.T) {
	for name, c := range map[string]struct {
		id    string
		at    float64
		stale bool
	}{
		"gone":          {"{C0000009-0000-4000-8000-000000000009}", 15.5, true},
		"an item GUID":  {splitItem, 15.5, true},
		"empty":         {"", 15.5, true},
		"at its start":  {splitTake, 10, true},
		"at its end":    {splitTake, 20, true},
		"after it":      {splitTake, 21, true},
		"negative time": {splitTake, -1, false},
	} {
		role := &fakeSplitter{answer: splitInREAPER()}
		got := split(t, role, c.id, c.at)
		if got.OK || got.Refused == "" || (got.Code == dawport.CodeStale) != c.stale || len(role.sent) != 0 {
			t.Errorf("%s: %+v, sent %v; want a refusal (stale %v) and nothing sent", name, got, role.sent, c.stale)
		}
	}
}

// The role's own answers (a stale take REAPER found, a refusal in its words) pass through; an error it or the track read
// returned is a refusal in a sentence; no role is the connection refusal.
func TestDawSplitTakePassesOnTheRolesAnswers(t *testing.T) {
	stale := dawport.RefusedStale("That item no longer has the take to split. Read the project again.")
	if got := split(t, &fakeSplitter{answer: stale}, splitTake, 15.5); !reflect.DeepEqual(got, stale) {
		t.Fatalf("stale = %+v", got)
	}
	for _, err := range []error{bridge.ErrNoAnswer, bridge.ErrUnavailable, bridge.ErrExperimentalOff, context.DeadlineExceeded, &bridge.TrackStaleError{}, errors.New("boom")} {
		if got := split(t, &fakeSplitter{err: err}, splitTake, 15.5); got.OK || got.Refused == "" {
			t.Errorf("%v: %+v, want a refusal", err, got)
		}
		items := splitItems()
		got, _ := dawSplitTakeIn(t.Context(), "REAPER", available(), &fakeSplitter{}, splitTrack(&items, nil, err), "c-0001", splitTake, 15.5)
		if got.OK || got.Refused == "" {
			t.Errorf("track read %v: %+v, want a refusal", err, got)
		}
	}
	noLink := dawport.Refused("Link this chapter to a track first.")
	items := splitItems()
	role := &fakeSplitter{}
	if got, _ := dawSplitTakeIn(t.Context(), "REAPER", available(), role, splitTrack(&items, &noLink, nil), "c-0001", splitTake, 15.5); !reflect.DeepEqual(got, noLink) || len(role.sent) != 0 {
		t.Fatalf("a track refusal = %+v, sent %v", got, role.sent)
	}
	if got, err := dawSplitTakeIn(t.Context(), "REAPER", available(), nil, splitTrack(&items, nil, nil), "c-0001", splitTake, 15.5); err != nil || got.OK || got.Refused == "" {
		t.Fatalf("no role = %+v, %v", got, err)
	}
}

// The takes capability's own sentence for each launch the resolver refuses, checked first, and nothing sent.
func TestDawSplitTakeRefusesWithTheResolversSentenceAndSendsNothing(t *testing.T) {
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
			role := &splittingSelector{fakeSplitter: fakeSplitter{answer: splitInREAPER()}}
			host := splitHost(t, c.kind, c.reach, role, c.toggle)
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapTakes)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("takes support = %+v, want reason %s", support, c.reason)
			}
			got := decodeDawResult(t)(host.DawSplitTake("c-0001", splitTake, 15.5))
			if !reflect.DeepEqual(got, dawport.Refused(support.Message)) || len(role.sent) != 0 {
				t.Fatalf("DawSplitTake = %+v, sent %v; want Refused(%q)", got, role.sent, support.Message)
			}
		})
	}
}

// splittingSelector is a takes role that can split, as dawport/reaper's is.
type splittingSelector struct {
	fakeSplitter
}

func (*splittingSelector) SetActiveTake(context.Context, string, string) (dawport.ActiveTakeSet, error) {
	return dawport.ActiveTakeSet{}, errors.New("not asked")
}

func (*splittingSelector) HideTakes(context.Context, string, string) (dawport.Result, error) {
	return dawport.Result{}, errors.New("not asked")
}

// splitHost is deleteRangeHost with a takes role that splits and the takes toggle.
func splitHost(t *testing.T, kind string, reach *daw.Reachability, role dawport.TakeSelector, toggle string) *Host {
	t.Helper()
	host := deleteRangeHost(t, kind, reach, nil, "")
	if toggle != "" {
		if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapTakes): &toggle}); err != nil {
			t.Fatal(err)
		}
	}
	host.mu.Lock()
	host.takeSelector = role
	host.mu.Unlock()
	return host
}

// TestDawSplitTakeContractGoldenIsCurrent pins the binding's answers: a cut in REAPER (one undo step), REAPER's stale refusal and
// the takes capability's refusal. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-split-take-*.json.
func TestDawSplitTakeContractGoldenIsCurrent(t *testing.T) {
	refusedCapability := dawport.Support{Message: "Experimental REAPER actions are off. Turn them on in Settings to choose takes."}
	cases := map[string]struct {
		support dawport.Support
		answer  dawport.Result
	}{
		"daw-split-take-done":               {available(), splitInREAPER()},
		"daw-split-take-refused-stale":      {available(), dawport.RefusedStale("That item no longer has the take to split. Read the project again.")},
		"daw-split-take-refused-capability": {refusedCapability, splitInREAPER()},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		c := cases[name]
		t.Run(name, func(t *testing.T) {
			items := splitItems()
			got, err := dawSplitTakeIn(t.Context(), "REAPER", c.support, &fakeSplitter{answer: c.answer}, splitTrack(&items, nil, nil), "c-0001", splitTake, 15.5)
			if err != nil {
				t.Fatal(err)
			}
			contractfile.Check(t, name, got)
		})
	}
}
