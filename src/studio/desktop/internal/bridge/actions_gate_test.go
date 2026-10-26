package bridge

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

// errGateRefused is a test gate's refusal: the resolver's answer for a capability the engine does not declare, say.
var errGateRefused = errors.New("refused by the gate")

// switchGate is a Gate that allows every command while on is true and refuses every one with errGateRefused otherwise.
func switchGate(on bool) Gate {
	return func(string) error {
		if !on {
			return errGateRefused
		}
		return nil
	}
}

func newGatedSession(t *testing.T) (*Client, string) {
	t.Helper()
	dir := t.TempDir()
	client, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	return client, dir
}

// Actions asks its gate about every command, by name, before anything is written: the gate, which the host
// builds over the DAW port's resolver, is the only thing that decides whether a command may be sent.
func TestActionsAskTheGateAboutEachCommandByName(t *testing.T) {
	var asked []string
	actions := NewActions(nil, func(command string) error {
		asked = append(asked, command)
		return nil
	})
	ctx := context.Background()
	_, _ = actions.ChapterTrackState(ctx, testTrack)
	_, _ = actions.PlayPosition(ctx)
	_, _ = actions.ListFXChains(ctx)
	want := []string{"chapter_track_state", "play_position", "list_fx_chains"}
	if fmt.Sprint(asked) != fmt.Sprint(want) {
		t.Fatalf("the gate was asked about %v, want %v", asked, want)
	}
}

// A gate's refusal (a capability the engine does not declare, say) is passed on as it is, and nothing is written.
func TestAGateRefusalIsPassedOn(t *testing.T) {
	refusal := errors.New("Punch and roll is not something Audacity can do.")
	client, dir := newGatedSession(t)
	actions := NewActions(client, func(string) error { return refusal })
	fake := startFakeReaper(t, client, dir, trackStateAnswer)
	if _, err := actions.ChapterTrackState(context.Background(), testTrack); err != refusal { //nolint:errorlint // the value itself, not a match
		t.Fatalf("err = %v, want the gate's own refusal", err)
	}
	time.Sleep(20 * time.Millisecond)
	if got := fake.commands(); len(got) != 0 {
		t.Fatalf("a refused command was written: %v", got)
	}
}

// The gate is asked before the connection: with no bridge and the gate refusing, the refusal wins.
func TestTheGateIsAskedBeforeTheConnection(t *testing.T) {
	actions := NewActions(nil, switchGate(false))
	if _, err := actions.CreateRegions(context.Background(), []Region{{Start: 0, End: 1, Title: "A"}}, "", false); !errors.Is(err, errGateRefused) {
		t.Fatalf("err = %v, want the gate's refusal before ErrUnavailable", err)
	}
}
