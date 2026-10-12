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
	"github.com/countrymanprime/narration-utils/shell/internal/passagetakes"
	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

// DawStackTakes and DawUnstackTakes (SND-7b). What the plan is (which read stays, what moves, the shift) is
// internal/passagetakes' own (stack_test.go); what REAPER answers is dawport/reaper's (reaper_test.go). These cover the
// host's wiring: the resolver first, the ids checked before the DAW is read, the plan built from the host's own reads and
// never the page's, and the answer.

const (
	stackFirstItem = "{B0000001-0000-4000-8000-000000000001}"
	stackFirstTake = "{B0000002-0000-4000-8000-000000000002}"
	stackRetryItem = "{B0000003-0000-4000-8000-000000000003}"
	stackRetryTake = "{B0000004-0000-4000-8000-000000000004}"
	stackPassage   = "pm-c-0001-p-1"
)

// STACK_PLAN's steps in the Studio Next mock (fixtures/daw.ts): what a DAW with no native stack does, in order.
var stackSteps = []string{
	"Add a take track", "Paste each later read into it", "Split at the point where the reads line up",
	"Shift the audio that follows to close the gap", "Mute the reads that are not on top",
}

type fakeStacker struct {
	stacked, unstacked []dawport.StackRequest
	answer             dawport.Result
	err                error
}

func (f *fakeStacker) StackTakes(_ context.Context, request dawport.StackRequest) (dawport.Result, error) {
	f.stacked = append(f.stacked, request)
	return f.answer, f.err
}

func (f *fakeStacker) UnstackTakes(_ context.Context, request dawport.StackRequest) (dawport.Result, error) {
	f.unstacked = append(f.unstacked, request)
	return f.answer, f.err
}

func (f *fakeStacker) sent() int { return len(f.stacked) + len(f.unstacked) }

// stackedInREAPER and unstackedInREAPER are what dawport/reaper's takeStacker answers: one undo step each.
func stackedInREAPER() dawport.Result {
	return dawport.OK("Stacked 1 take in REAPER.", true).WithUndoSteps(1)
}
func unstackedInREAPER() dawport.Result {
	return dawport.OK("Moved back 1 take in REAPER.", true).WithUndoSteps(1)
}

// fakeStackSources is chapter c-0001 with one passage two items read: the first read at 10 s for 6 s, the retry at 16 s
// for 4 s on the chapter's track now; after a stack, the saved project has the retry as a take of the first read's item.
type fakeStackSources struct {
	live     []dawport.TrackItem
	liveErr  error
	refused  *dawport.Result
	saved    tracks.Project
	liveRead int
}

func newFakeStackSources() *fakeStackSources {
	return &fakeStackSources{live: []dawport.TrackItem{
		{ItemGUID: stackFirstItem, TakeGUID: stackFirstTake, Position: 10, Length: 6},
		{ItemGUID: stackRetryItem, TakeGUID: stackRetryTake, Position: 16, Length: 4},
	}}
}

func (f *fakeStackSources) sources() stackSources {
	return stackSources{
		passages: func(chapterID string) ([]passagetakes.StackPassage, error) {
			if chapterID != "c-0001" {
				return nil, nil
			}
			return []passagetakes.StackPassage{{ID: stackPassage, Items: []string{stackFirstItem, stackRetryItem}}}, nil
		},
		live: func(context.Context, string) ([]dawport.TrackItem, *dawport.Result, error) {
			f.liveRead++
			return f.live, f.refused, f.liveErr
		},
		saved: func() (tracks.Project, error) { return f.saved, nil },
	}
}

func available() dawport.Support { return dawport.Support{Available: true} }

func restack(t *testing.T, stacker dawport.TakeStacker, sources *fakeStackSources, ids []string, unstack bool) dawport.Result {
	t.Helper()
	got, err := dawRestackIn(t.Context(), hostServices{}, available(), stacker, sources.sources(), "c-0001", ids, unstack)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

// host-recomputes-the-plan and binding-answers-a-dawresult: the passage id resolves on the host to the items the passage
// map names and the times the track reports now, the role is sent that plan, and the answer is its DawResult.
func TestDawStackTakesSendsThePlanTheHostBuiltAndAnswersADawResult(t *testing.T) {
	stacker := &fakeStacker{answer: stackedInREAPER()}
	got := restack(t, stacker, newFakeStackSources(), []string{stackPassage}, false)
	if !reflect.DeepEqual(got, stackedInREAPER()) || got.UndoSteps != 1 {
		t.Fatalf("DawStackTakes = %+v, want %+v", got, stackedInREAPER())
	}
	want := []dawport.StackRequest{{
		ChapterID: "c-0001", Shift: -4,
		Groups: []dawport.StackGroup{{PassageID: stackPassage, ItemGUID: stackFirstItem, Base: stackFirstTake, Moves: []dawport.StackMove{{TakeID: stackRetryTake, From: 16, To: 10, Len: 4}}}},
	}}
	if !reflect.DeepEqual(stacker.stacked, want) || len(stacker.unstacked) != 0 {
		t.Fatalf("sent %+v, want %+v", stacker.stacked, want)
	}
}

func TestDawUnstackTakesReadsTheOffsetsFromTheSavedProject(t *testing.T) {
	stacker := &fakeStacker{answer: unstackedInREAPER()}
	sources := newFakeStackSources()
	sources.live = sources.live[:1]
	sources.saved = tracks.Project{Tracks: []tracks.Track{
		{Items: []tracks.Item{{GUID: stackFirstItem, Position: 10, Length: 6, Takes: []tracks.Take{
			{GUID: stackFirstTake},
			{GUID: "{B0000009-0000-4000-8000-000000000009}", Ext: map[string]string{passagetakes.StackedFromKey: stackRetryItem + "|" + stackRetryTake + "|{T}|16.000000|6.000000"}},
		}}}},
		{Name: "Cuts", Items: []tracks.Item{{GUID: stackRetryItem, Length: 4}}},
	}}
	got := restack(t, stacker, sources, []string{stackPassage}, true)
	if !reflect.DeepEqual(got, unstackedInREAPER()) {
		t.Fatalf("DawUnstackTakes = %+v", got)
	}
	want := []dawport.StackRequest{{
		ChapterID: "c-0001", Shift: 4,
		Groups: []dawport.StackGroup{{PassageID: stackPassage, ItemGUID: stackFirstItem, Base: stackFirstTake, Moves: []dawport.StackMove{{TakeID: stackRetryTake, From: 10, To: 16, Len: 4}}}},
	}}
	if !reflect.DeepEqual(stacker.unstacked, want) || len(stacker.stacked) != 0 {
		t.Fatalf("sent %+v, want %+v", stacker.unstacked, want)
	}
}

// A DAW that stacks in several edits answers its steps in order, as the role gives them.
func TestDawStackTakesPassesOnAStepsDAWsSteps(t *testing.T) {
	steps := dawport.OK("Stacked 1 take in Audacity. Done in 5 steps.", true).WithUndoSteps(len(stackSteps)).WithSteps(stackSteps)
	got := restack(t, &fakeStacker{answer: steps}, newFakeStackSources(), []string{stackPassage}, false)
	if !reflect.DeepEqual(got, steps) {
		t.Fatalf("steps = %+v", got)
	}
}

// page-sends-no-guid-time-or-path: an id is looked up among the chapter's passages, so an item GUID, a time or a path the
// page sends is refused with code stale before the DAW is read, and so is a chapter the manuscript does not have.
func TestDawStackTakesLooksUpEveryIdAndSendsNothingForOneTheChapterDoesNotList(t *testing.T) {
	stacker := &fakeStacker{answer: stackedInREAPER()}
	sources := newFakeStackSources()
	for _, ids := range [][]string{{stackFirstItem}, {stackPassage, "16.0"}, {"C:/Projects/Alice/Alice.rpp"}} {
		for _, unstack := range []bool{false, true} {
			if got := restack(t, stacker, sources, ids, unstack); got.OK || got.Code != dawport.CodeStale {
				t.Errorf("%v (unstack %v) = %+v, want a stale refusal", ids, unstack, got)
			}
		}
	}
	got, err := dawRestackIn(t.Context(), hostServices{}, available(), stacker, sources.sources(), "{B0000001-0000-4000-8000-000000000001}", []string{stackPassage}, false)
	if err != nil || got.Code != dawport.CodeStale {
		t.Fatalf("a GUID as the chapter = %+v, %v", got, err)
	}
	if got := restack(t, stacker, sources, nil, false); got.OK || got.Refused != "There are no retries to move in REAPER." {
		t.Fatalf("no ids = %+v", got)
	}
	if got := restack(t, stacker, sources, make([]string, bridge.MaxStackGroups+1), false); got.Refused != "Stack at most 200 passages at a time." {
		t.Fatalf("too many = %+v", got)
	}
	if stacker.sent() != 0 || sources.liveRead != 0 {
		t.Fatalf("sent %d, read the track %d times", stacker.sent(), sources.liveRead)
	}
}

// A kept take, nothing to move and the track's own refusals are refused with the reason, and nothing is sent.
func TestDawStackTakesRefusesWhatThePlanOrTheTrackRefuses(t *testing.T) {
	muted := true
	for name, c := range map[string]struct {
		change func(*fakeStackSources)
		want   dawport.Result
	}{
		"kept":            {func(s *fakeStackSources) { s.live[1].Muted = &muted }, dawport.Refused("A take of this passage has been kept, so its reads cannot be stacked or moved back.")},
		"nothing to move": {func(s *fakeStackSources) { s.live[1].Position = 10 }, dawport.Refused("There are no retries to move in REAPER.")},
		"no link": {func(s *fakeStackSources) {
			refused := dawport.Refused(`"Chapter 1" has no linked track. Link it to its REAPER track in the audio engine panel.`)
			s.refused = &refused
		}, dawport.Refused(`"Chapter 1" has no linked track. Link it to its REAPER track in the audio engine panel.`)},
		"track gone": {func(s *fakeStackSources) { s.liveErr = &bridge.TrackStaleError{GUID: "{T}"} },
			dawport.RefusedStale("This chapter's track is no longer in the REAPER project, so nothing was changed. Link the chapter to its track again.")},
	} {
		t.Run(name, func(t *testing.T) {
			stacker := &fakeStacker{answer: stackedInREAPER()}
			sources := newFakeStackSources()
			c.change(sources)
			if got := restack(t, stacker, sources, []string{stackPassage}, false); !reflect.DeepEqual(got, c.want) || stacker.sent() != 0 {
				t.Fatalf("got %+v, sent %d; want %+v", got, stacker.sent(), c.want)
			}
		})
	}
}

// The role's stale answer passes on with its code; an error it returns is worded as a refusal; no role refuses.
func TestDawStackTakesPassesOnTheRolesAnswers(t *testing.T) {
	stale := dawport.RefusedStale("That item changed in REAPER since the app read it. Nothing was changed.")
	if got := restack(t, &fakeStacker{answer: stale}, newFakeStackSources(), []string{stackPassage}, false); !reflect.DeepEqual(got, stale) {
		t.Fatalf("stale = %+v", got)
	}
	for _, err := range []error{bridge.ErrNoAnswer, bridge.ErrUnavailable, bridge.ErrExperimentalOff, context.DeadlineExceeded, errors.New("boom")} {
		if got := restack(t, &fakeStacker{err: err}, newFakeStackSources(), []string{stackPassage}, false); got.OK || got.Refused == "" {
			t.Errorf("%v: %+v, want a refusal", err, got)
		}
		sources := newFakeStackSources()
		sources.liveErr = err
		if got := restack(t, &fakeStacker{}, sources, []string{stackPassage}, false); got.OK || got.Refused == "" {
			t.Errorf("track read %v: %+v, want a refusal", err, got)
		}
	}
	got, err := dawRestackIn(t.Context(), hostServices{}, available(), nil, newFakeStackSources().sources(), "c-0001", []string{stackPassage}, false)
	if err != nil || got.OK || got.Refused == "" {
		t.Fatalf("no role = %+v, %v", got, err)
	}
}

// stackHost is deleteRangeHost with the stack_takes role and toggle.
func stackHost(t *testing.T, kind string, reach *daw.Reachability, role dawport.TakeStacker, toggle string) *Host {
	t.Helper()
	host := deleteRangeHost(t, kind, reach, nil, "")
	if toggle != "" {
		if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapStackTakes): &toggle}); err != nil {
			t.Fatal(err)
		}
	}
	host.mu.Lock()
	host.takeStacker = role
	host.mu.Unlock()
	return host
}

// refusals-come-from-the-capability-or-the-host: the resolver's own sentence for each launch it refuses, checked first, and
// nothing sent for any of them.
func TestDawStackTakesRefusesWithTheResolversSentenceAndSendsNothing(t *testing.T) {
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
			role := &fakeStacker{answer: stackedInREAPER()}
			host := stackHost(t, c.kind, c.reach, role, c.toggle)
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapStackTakes)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("stack_takes support = %+v, want reason %s", support, c.reason)
			}
			stacked := decodeDawResult(t)(host.DawStackTakes("c-0001", []string{stackPassage}))
			unstacked := decodeDawResult(t)(host.DawUnstackTakes("c-0001", []string{stackPassage}))
			want := dawport.Refused(support.Message)
			if !reflect.DeepEqual(stacked, want) || !reflect.DeepEqual(unstacked, want) || role.sent() != 0 {
				t.Fatalf("stack %+v, unstack %+v, sent %d; want Refused(%q)", stacked, unstacked, role.sent(), support.Message)
			}
		})
	}
}

// A DAW without stack_takes (Audacity before backups) answers its own sentence.
func TestDawStackTakesAnswersAnEnginesOwnReason(t *testing.T) {
	support := dawport.Support{Message: "Turn on backups to stack takes in Audacity."}
	stacker := &fakeStacker{answer: stackedInREAPER()}
	for _, unstack := range []bool{false, true} {
		got, err := dawRestackIn(t.Context(), hostServices{}, support, stacker, newFakeStackSources().sources(), "c-0001", []string{stackPassage}, unstack)
		if err != nil || !reflect.DeepEqual(got, dawport.Refused(support.Message)) {
			t.Fatalf("unstack %v: %+v, %v", unstack, got, err)
		}
	}
	if stacker.sent() != 0 {
		t.Fatalf("sent %d", stacker.sent())
	}
}

// With the capability on, a chapter whose passage map holds no passage refuses the id stale and asks REAPER nothing.
func TestDawStackTakesOnTheHostLooksTheIdUpInThePassageMap(t *testing.T) {
	role := &fakeStacker{answer: stackedInREAPER()}
	host := stackHost(t, "REAPER", liveReachability(), role, "on")
	if got := decodeDawResult(t)(host.DawStackTakes("c-0001", []string{stackPassage})); got.Code != dawport.CodeStale || role.sent() != 0 {
		t.Fatalf("DawStackTakes = %+v, sent %d", got, role.sent())
	}
}

// TestDawStackContractGoldenIsCurrent pins the two bindings' answers: a stack and an un-stack in REAPER (one undo step
// each), a stack in a DAW that makes it in steps, and REAPER's stale refusal. UPDATE_CONTRACTS=1 rewrites
// tests/fixtures/contracts/daw-stack-*.json and daw-unstack-done.json.
func TestDawStackContractGoldenIsCurrent(t *testing.T) {
	cases := map[string]struct {
		answer  dawport.Result
		unstack bool
	}{
		"daw-stack-done":          {stackedInREAPER(), false},
		"daw-stack-steps":         {dawport.OK("Stacked 1 take in Audacity. Done in 5 steps.", true).WithUndoSteps(len(stackSteps)).WithSteps(stackSteps), false},
		"daw-unstack-done":        {unstackedInREAPER(), true},
		"daw-stack-refused-stale": {dawport.RefusedStale("That item changed in REAPER since the app read it. Nothing was changed."), false},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		c := cases[name]
		t.Run(name, func(t *testing.T) {
			sources := newFakeStackSources()
			if c.unstack {
				sources.live = sources.live[:1]
				sources.saved = tracks.Project{Tracks: []tracks.Track{
					{Items: []tracks.Item{{GUID: stackFirstItem, Takes: []tracks.Take{
						{GUID: stackFirstTake},
						{GUID: "{B0000009-0000-4000-8000-000000000009}", Ext: map[string]string{passagetakes.StackedFromKey: stackRetryItem + "|" + stackRetryTake + "|{T}|16|6"}},
					}}}},
					{Items: []tracks.Item{{GUID: stackRetryItem, Length: 4}}},
				}}
			}
			contractfile.Check(t, name, restack(t, &fakeStacker{answer: c.answer}, sources, []string{stackPassage}, c.unstack))
		})
	}
}
