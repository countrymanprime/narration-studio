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

// DawLastAction and DawUndoLast (#1711). What REAPER does is narration_undo.lua's (undo_test.lua) and what the role answers is
// dawport/reaper's (undo_last_test.go). These cover the host's wiring: the kind checked first, the resolver, the role's answers.

type fakeUndoer struct {
	kinds  []dawport.ActionKind
	steps  []int
	last   dawport.LastAction
	answer dawport.Result
	err    error
}

func (f *fakeUndoer) LastAction(_ context.Context, kind dawport.ActionKind) (dawport.LastAction, error) {
	f.kinds = append(f.kinds, kind)
	return f.last, f.err
}

func (f *fakeUndoer) UndoLast(_ context.Context, kind dawport.ActionKind, steps int) (dawport.Result, error) {
	f.kinds = append(f.kinds, kind)
	f.steps = append(f.steps, steps)
	return f.answer, f.err
}

// What dawport/reaper's undo_last role answers: one cut undone, two of three, and the top point not the cut.
func undoneInREAPER() dawport.Result {
	return dawport.OK("Undid the cut in REAPER.", true).WithUndoSteps(0)
}

func undonePartlyInREAPER() dawport.Result {
	return dawport.OK("Undid 2 of the 3 cuts in REAPER. Something else was done in REAPER since the rest, so they were left alone. Use Edit > Undo in REAPER for them.", true).WithUndoSteps(0)
}

func notLastInREAPER() dawport.Result {
	return dawport.Refused("REAPER's last action is not this one, so it was left alone. Use Edit > Undo in REAPER.")
}

// The kind passes to the role as given and its answer is the binding's; anything but this or other is unknown; a capability
// refusal or no role is unknown with nothing asked; a kind the build does not know is an error, with nothing asked.
func TestDawLastActionAsksTheRoleAndAnswersThisOtherOrUnknown(t *testing.T) {
	for _, last := range []dawport.LastAction{dawport.LastActionThis, dawport.LastActionOther, dawport.LastActionUnknown, "maybe"} {
		role := &fakeUndoer{last: last}
		got, err := dawLastActionIn(t.Context(), available(), role, "cut_range")
		want := last
		if last == "maybe" {
			want = dawport.LastActionUnknown
		}
		if err != nil || got != want || !reflect.DeepEqual(role.kinds, []dawport.ActionKind{dawport.ActionCutRange}) {
			t.Errorf("%q: DawLastAction = %q, %v (asked %v); want %q", last, got, err, role.kinds, want)
		}
	}
	role := &fakeUndoer{last: dawport.LastActionThis}
	if got, err := dawLastActionIn(t.Context(), dawport.Support{Message: "off"}, role, "cut_range"); err != nil || got != dawport.LastActionUnknown || len(role.kinds) != 0 {
		t.Errorf("refused: DawLastAction = %q, %v (asked %v); want unknown", got, err, role.kinds)
	}
	if got, err := dawLastActionIn(t.Context(), available(), nil, "cut_range"); err != nil || got != dawport.LastActionUnknown {
		t.Errorf("no role: DawLastAction = %q, %v; want unknown", got, err)
	}
	for _, kind := range []string{"", "fx_range", "Narration Utils: delete words"} {
		if _, err := dawLastActionIn(t.Context(), available(), role, kind); !errors.Is(err, dawport.ErrActionKind) || len(role.kinds) != 0 {
			t.Errorf("kind %q: err = %v (asked %v); want ErrActionKind", kind, err, role.kinds)
		}
	}
}

// The kind and steps pass to the role as given and its DawResult is the binding's; an error it returned is a refusal in a sentence;
// no role is the connection refusal; a kind the build does not know is an error, with nothing asked.
func TestDawUndoLastPassesOnTheRolesAnswers(t *testing.T) {
	for _, answer := range []dawport.Result{undoneInREAPER(), undonePartlyInREAPER(), notLastInREAPER()} {
		role := &fakeUndoer{answer: answer}
		got, err := dawUndoLastIn(t.Context(), "REAPER", available(), role, "cut_range", 3)
		if err != nil || !reflect.DeepEqual(got, answer) || !reflect.DeepEqual(role.steps, []int{3}) || role.kinds[0] != dawport.ActionCutRange {
			t.Errorf("DawUndoLast = %+v, %v (sent %v %v); want %+v", got, err, role.kinds, role.steps, answer)
		}
	}
	for _, err := range []error{bridge.ErrNoAnswer, bridge.ErrUnavailable, bridge.ErrExperimentalOff, context.DeadlineExceeded, errors.New("boom")} {
		if got, gotErr := dawUndoLastIn(t.Context(), "REAPER", available(), &fakeUndoer{err: err}, "cut_range", 1); gotErr != nil || got.OK || got.Refused == "" {
			t.Errorf("%v: %+v, %v; want a refusal", err, got, gotErr)
		}
	}
	if got, err := dawUndoLastIn(t.Context(), "REAPER", available(), nil, "cut_range", 1); err != nil || got.OK || got.Refused == "" {
		t.Errorf("no role = %+v, %v", got, err)
	}
	role := &fakeUndoer{answer: undoneInREAPER()}
	for _, kind := range []string{"", "fx_range", "Narration Utils: delete words"} {
		if _, err := dawUndoLastIn(t.Context(), "REAPER", available(), role, kind, 1); !errors.Is(err, dawport.ErrActionKind) || len(role.kinds) != 0 {
			t.Errorf("kind %q: err = %v (asked %v); want ErrActionKind", kind, err, role.kinds)
		}
	}
}

// The undo_last capability's own sentence for each launch the resolver refuses, checked first, and nothing asked; DawLastAction is
// unknown for each.
func TestDawUndoLastRefusesWithTheResolversSentenceAndAsksNothing(t *testing.T) {
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
			role := &fakeUndoer{answer: undoneInREAPER(), last: dawport.LastActionThis}
			host := deleteRangeHost(t, c.kind, c.reach, nil, "")
			if c.toggle != "" {
				if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapUndoLast): &c.toggle}); err != nil {
					t.Fatal(err)
				}
			}
			host.mu.Lock()
			host.lastActionUndoer = role
			host.mu.Unlock()
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapUndoLast)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("undo_last support = %+v, want reason %s", support, c.reason)
			}
			got := decodeDawResult(t)(host.DawUndoLast("cut_range", 1))
			if !reflect.DeepEqual(got, dawport.Refused(support.Message)) || len(role.kinds) != 0 {
				t.Fatalf("DawUndoLast = %+v, asked %v; want Refused(%q)", got, role.kinds, support.Message)
			}
			if last := bindingAnswer[dawport.LastAction](t)(host.DawLastAction("cut_range")); last != dawport.LastActionUnknown || len(role.kinds) != 0 {
				t.Fatalf("DawLastAction = %q, asked %v; want unknown", last, role.kinds)
			}
		})
	}
}

// TestDawUndoLastContractGoldenIsCurrent pins the bindings' answers: a cut undone in REAPER, two of three, REAPER's refusal when its
// last action is not the cut, the undo_last capability's refusal, and DawLastAction's this and unknown. UPDATE_CONTRACTS=1 rewrites
// tests/fixtures/contracts/daw-undo-last-*.json and daw-last-action-*.json.
func TestDawUndoLastContractGoldenIsCurrent(t *testing.T) {
	refusedCapability := dawport.Support{Message: "Experimental REAPER actions are off. Turn them on in Settings to undo the app's last action."}
	cases := map[string]struct {
		support dawport.Support
		answer  dawport.Result
	}{
		"daw-undo-last-done":               {available(), undoneInREAPER()},
		"daw-undo-last-partial":            {available(), undonePartlyInREAPER()},
		"daw-undo-last-refused-not-last":   {available(), notLastInREAPER()},
		"daw-undo-last-refused-capability": {refusedCapability, undoneInREAPER()},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		c := cases[name]
		t.Run(name, func(t *testing.T) {
			got, err := dawUndoLastIn(t.Context(), "REAPER", c.support, &fakeUndoer{answer: c.answer}, "cut_range", 3)
			if err != nil {
				t.Fatal(err)
			}
			contractfile.Check(t, name, got)
		})
	}
	for name, support := range map[string]dawport.Support{"daw-last-action-this": available(), "daw-last-action-unknown": refusedCapability} {
		t.Run(name, func(t *testing.T) {
			got, err := dawLastActionIn(t.Context(), support, &fakeUndoer{last: dawport.LastActionThis}, "cut_range")
			if err != nil {
				t.Fatal(err)
			}
			contractfile.Check(t, name, got)
		})
	}
}
