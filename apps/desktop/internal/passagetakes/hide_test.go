package passagetakes

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

type fakeHider struct {
	calls  [][2]string
	answer dawport.Result
	err    error
}

func (f *fakeHider) hide(_ context.Context, itemGUID, keepTakeGUID string) (dawport.Result, error) {
	f.calls = append(f.calls, [2]string{itemGUID, keepTakeGUID})
	return f.answer, f.err
}

func candidateOf(t *testing.T, resolved Resolved, source string, active bool) Candidate {
	t.Helper()
	for _, c := range resolved.View.Candidates {
		if c.Source == source && c.Active == active {
			return c
		}
	}
	t.Fatalf("no %s candidate (active %v)", source, active)
	return Candidate{}
}

// The kept candidate resolves, on the host, to the passage's item and that candidate's take: those two GUIDs are what is sent.
func TestHideSendsThePassagesItemAndTheKeptTake(t *testing.T) {
	resolved := resolve(t, nil)
	for _, active := range []bool{true, false} {
		keep := candidateOf(t, resolved, SourceItemTake, active)
		fake := &fakeHider{answer: dawport.OK("Muted 1 other take in REAPER. It is still in the project.", true)}
		got := Hide(t.Context(), fake.hide, resolved, keep.ID)
		if !reflect.DeepEqual(got, fake.answer) {
			t.Errorf("active %v: Hide = %+v, want the DAW's answer %+v", active, got, fake.answer)
		}
		if want := [][2]string{{guidA, keep.TakeGUID}}; !reflect.DeepEqual(fake.calls, want) {
			t.Errorf("active %v: sent %v, want %v", active, fake.calls, want)
		}
	}
}

// A GUID-shaped id the host did not offer is looked up, not trusted: it is refused as stale and nothing is sent.
func TestHideRefusesACandidateTheHostDidNotOfferAsStale(t *testing.T) {
	resolved := resolve(t, nil)
	for _, id := range []string{"take:" + guidA + ":" + take3, take2, guidA, ""} {
		fake := &fakeHider{}
		got := Hide(t.Context(), fake.hide, resolved, id)
		if got.OK || got.Changed || got.Code != dawport.CodeStale || got.Refused != notOfferedSentence || len(fake.calls) != 0 {
			t.Errorf("%q: Hide = %+v, sent %v; want a stale refusal and nothing sent", id, got, fake.calls)
		}
	}
}

// A passage whose item is no longer in the saved project refuses with the view's own sentence, as stale.
func TestHideRefusesAPassageTheAlignmentNoLongerHolds(t *testing.T) {
	resolved := resolve(t, func(in *Input) { in.View.Items[0].Live = false })
	fake := &fakeHider{}
	got := Hide(t.Context(), fake.hide, resolved, "take:"+guidA+":"+take1)
	if got.OK || got.Code != dawport.CodeStale || got.Refused != resolved.View.Message || got.Refused == "" || len(fake.calls) != 0 {
		t.Fatalf("Hide = %+v, sent %v", got, fake.calls)
	}
}

// Only a take of the passage's own item can be kept: a retake on another lane or a read from another item is refused, not stale.
func TestHideRefusesACandidateFromAnotherItem(t *testing.T) {
	lanes := resolve(t, func(in *Input) {
		in.View.Items[0].ItemGUID, in.View.Items[0].TakeGUID = guidB, take3
		in.Groups = nil
	})
	reads := resolve(t, nil)
	for name, keep := range map[string]struct {
		resolved Resolved
		id       string
	}{
		"lane retake": {lanes, candidateOf(t, lanes, SourceLaneRetake, false).ID},
		"other item":  {reads, candidateOf(t, reads, SourceTakeReview, false).ID},
	} {
		fake := &fakeHider{}
		got := Hide(t.Context(), fake.hide, keep.resolved, keep.id)
		if got.OK || got.Code != "" || got.Refused != notOnItemSentence || len(fake.calls) != 0 {
			t.Errorf("%s: Hide = %+v, sent %v", name, got, fake.calls)
		}
	}
}

func TestHideRefusesATakeThatCannotBeHeard(t *testing.T) {
	resolved := resolve(t, func(in *Input) { in.Project.Tracks[0].Items[0].Takes[1].SourceAvailable = false })
	keep := candidateOf(t, resolved, SourceItemTake, false)
	fake := &fakeHider{}
	got := Hide(t.Context(), fake.hide, resolved, keep.ID)
	if got.OK || got.Refused != keep.Reason || keep.Reason == "" || len(fake.calls) != 0 {
		t.Fatalf("Hide = %+v, sent %v", got, fake.calls)
	}
}

// What the DAW refuses is its own Result; an error it returns is worded as Use words it, and is never a change.
func TestHidePassesOnTheDAWsRefusalAndWordsAnError(t *testing.T) {
	resolved := resolve(t, nil)
	keep := candidateOf(t, resolved, SourceItemTake, false)
	stale := dawport.RefusedStale("That item no longer has the take you kept. Read the project again.")
	if got := Hide(t.Context(), (&fakeHider{answer: stale}).hide, resolved, keep.ID); !reflect.DeepEqual(got, stale) {
		t.Errorf("a stale answer: Hide = %+v", got)
	}
	for err, code := range map[error]string{
		bridge.ErrScriptOutdated:           "",
		bridge.ErrNoAnswer:                 "",
		&bridge.StaleError{Reason: "item"}: dawport.CodeStale,
		errors.New("the bridge went away"): "",
	} {
		got := Hide(t.Context(), (&fakeHider{err: err}).hide, resolved, keep.ID)
		if got.OK || got.Changed || got.UndoSteps != 0 || got.Refused == "" || got.Message != got.Refused || got.Code != code {
			t.Errorf("%v: Hide = %+v", err, got)
		}
	}
}

// With no takes role (no bridge), a take that could be kept is refused as Use refuses it, rather than sent nowhere.
func TestHideWithNoTakesRoleIsRefused(t *testing.T) {
	resolved := resolve(t, nil)
	got := Hide(t.Context(), nil, resolved, candidateOf(t, resolved, SourceItemTake, false).ID)
	if got.OK || got.Changed || got.Refused != refuse(bridge.ErrUnavailable).Message {
		t.Fatalf("Hide = %+v", got)
	}
}
