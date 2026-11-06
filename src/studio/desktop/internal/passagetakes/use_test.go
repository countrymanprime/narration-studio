package passagetakes

import (
	"context"
	"errors"
	"strings"
	"testing"

	"desktop/internal/bridge"
)

type fakeActors struct {
	calls      []string
	setChanged bool
	setErr     error
	pickErr    error
}

func (f *fakeActors) actors() Actors {
	return Actors{
		SetActiveTake: func(_ context.Context, item, take string) (bool, error) {
			f.calls = append(f.calls, "set "+item+" "+take)
			return f.setChanged, f.setErr
		},
		PickLane: func(line, item string) error {
			f.calls = append(f.calls, "pick "+line+" "+item)
			return f.pickErr
		},
	}
}

func choiceFor(t *testing.T, source string, mutate func(*Input)) Choice {
	t.Helper()
	resolved := resolve(t, func(in *Input) {
		if source == SourceLaneRetake {
			in.View.Items[0].ItemGUID, in.View.Items[0].TakeGUID = guidB, take3
		}
		if mutate != nil {
			mutate(in)
		}
	})
	for _, c := range resolved.View.Candidates {
		if c.Source == source && !c.Active {
			choice, _ := resolved.Choice(c.ID)
			return choice
		}
	}
	t.Fatalf("no %s candidate", source)
	return Choice{}
}

func TestUsingAnotherTakeOfTheItemMakesItActiveInOneRequest(t *testing.T) {
	fake := &fakeActors{setChanged: true}
	got := Use(context.Background(), fake.actors(), choiceFor(t, SourceItemTake, nil))
	if got.Outcome != OutcomeDone || !got.Changed || !strings.Contains(got.Message, "Undo") || strings.Join(fake.calls, ";") != "set "+guidA+" "+take2 {
		t.Fatalf("got %+v, calls %v", got, fake.calls)
	}
}

func TestATakeThatWasAlreadyActiveChangesNothing(t *testing.T) {
	fake := &fakeActors{setChanged: false}
	got := Use(context.Background(), fake.actors(), choiceFor(t, SourceItemTake, nil))
	if got.Outcome != OutcomeDone || got.Changed || !strings.Contains(got.Message, "already") {
		t.Fatalf("got %+v", got)
	}
}

func TestTheTakeTheAppListsAsPlayingIsNotSentAtAll(t *testing.T) {
	resolved := resolve(t, nil)
	var active Candidate
	for _, c := range resolved.View.Candidates {
		if c.Active {
			active = c
		}
	}
	choice, _ := resolved.Choice(active.ID)
	fake := &fakeActors{}
	got := Use(context.Background(), fake.actors(), choice)
	if got.Outcome != OutcomeDone || got.Changed || len(fake.calls) != 0 {
		t.Fatalf("got %+v, calls %v", got, fake.calls)
	}
}

func TestUsingALaneRetakeAsksForTheLanePick(t *testing.T) {
	fake := &fakeActors{}
	got := Use(context.Background(), fake.actors(), choiceFor(t, SourceLaneRetake, nil))
	if got.Outcome != OutcomeStarted || strings.Join(fake.calls, ";") != "pick line-1 "+guidC {
		t.Fatalf("got %+v, calls %v", got, fake.calls)
	}
}

func TestATakeThatCannotBeHeardIsRefusedBeforeAnythingIsSent(t *testing.T) {
	fake := &fakeActors{}
	choice := choiceFor(t, SourceItemTake, func(in *Input) { in.Project.Tracks[0].Items[0].Takes[1].SourceAvailable = false })
	got := Use(context.Background(), fake.actors(), choice)
	if got.Outcome != OutcomeRefused || got.Reason != ReasonUnusable || len(fake.calls) != 0 {
		t.Fatalf("got %+v, calls %v", got, fake.calls)
	}
}

func TestREAPERsRefusalsAreWordedAndNothingIsClaimedChanged(t *testing.T) {
	cases := map[string]struct {
		err    error
		reason string
		words  string
	}{
		"recording":   {bridge.ErrRecording, ReasonRecording, "recording"},
		"stale item":  {&bridge.StaleError{GUID: guidA, Reason: "item"}, ReasonStale, "no longer"},
		"stale take":  {&bridge.StaleError{GUID: guidA, Reason: "take"}, ReasonStale, "no longer"},
		"standalone":  {bridge.ErrUnavailable, ReasonStandalone, "not connected"},
		"not running": {bridge.ErrNoAnswer, ReasonNotRunning, "not answering"},
		"old script":  {bridge.ErrScriptOutdated, ReasonScriptOutdated, "older"},
		"other":       {errors.New("boom"), ReasonFailed, "boom"},
	}
	for name, c := range cases {
		fake := &fakeActors{setErr: c.err}
		got := Use(context.Background(), fake.actors(), choiceFor(t, SourceItemTake, nil))
		if got.Outcome != OutcomeRefused || got.Reason != c.reason || got.Changed || !strings.Contains(got.Message, c.words) {
			t.Errorf("%s: got %+v", name, got)
		}
	}
}

func TestAMissingActorIsTheStandaloneRefusal(t *testing.T) {
	for _, source := range []string{SourceItemTake, SourceLaneRetake} {
		got := Use(context.Background(), Actors{}, choiceFor(t, source, nil))
		if got.Outcome != OutcomeRefused || got.Reason != ReasonStandalone {
			t.Errorf("%s: got %+v", source, got)
		}
	}
}

func errStale() error { return &bridge.StaleError{GUID: guidA, Reason: "item"} }
