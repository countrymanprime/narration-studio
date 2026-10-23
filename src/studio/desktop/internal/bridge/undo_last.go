package bridge

import (
	"context"
	"errors"
	"fmt"
	"strconv"
)

// MaxUndoLastSteps is the most undo points one undo_last undoes (narration_undo.lua's MAX_STEPS).
const MaxUndoLastSteps = 12

// UndoKinds are the action kinds last_action and undo_last name, the keys of narration_bridge_core.lua's undo label table. The
// script maps a kind to the label its command closes its undo block with; the host never sends a label.
var UndoKinds = map[string]bool{"cut_range": true}

// ErrUndoKind is a kind not in UndoKinds: nothing was sent.
var ErrUndoKind = errors.New("that is not an action kind this app can read or undo in REAPER")

// LastAction is what last_action answered: whether REAPER's next undo point is the kind's (This) or anything else, no history
// included.
type LastAction struct {
	Kind string
	This bool
}

// UndoneLast is what undo_last answered: the steps asked for and the points it undid, 0 when the top point was not the kind's.
type UndoneLast struct {
	Kind          string
	Steps, Undone int
}

// LastAction reads whether REAPER's next undo point carries the undo label of kind (narration_undo.lua). It changes nothing.
func (a *Actions) LastAction(ctx context.Context, kind string) (LastAction, error) {
	if !UndoKinds[kind] {
		return LastAction{}, ErrUndoKind
	}
	events, err := a.request(ctx, "last_action", []string{"LAST_ACTION"}, kind)
	if err != nil {
		return LastAction{}, err
	}
	event := events[len(events)-1]
	if event.Fields[2] != kind {
		return LastAction{}, fmt.Errorf("REAPER answered for another kind of action than the one this app asked about")
	}
	switch event.Fields[3] {
	case "this":
		return LastAction{Kind: kind, This: true}, nil
	case "other":
		return LastAction{Kind: kind}, nil
	}
	return LastAction{}, fmt.Errorf("REAPER answered last_action with %q, neither this nor other", event.Fields[3])
}

// UndoLast undoes up to steps (1 to MaxUndoLastSteps) undo points carrying kind's undo label from the top of REAPER's history,
// one at a time, stopping at the first point that carries any other label (narration_undo.lua). Undone is 0 when the top point is
// not the kind's, and nothing changed. Nothing changes while REAPER records (ErrRecording).
func (a *Actions) UndoLast(ctx context.Context, kind string, steps int) (UndoneLast, error) {
	if !UndoKinds[kind] {
		return UndoneLast{}, ErrUndoKind
	}
	if steps < 1 || steps > MaxUndoLastSteps {
		return UndoneLast{}, fmt.Errorf("undo_last undoes 1 to %d steps, not %d", MaxUndoLastSteps, steps)
	}
	events, err := a.request(ctx, "undo_last", []string{"UNDONE_LAST"}, kind, strconv.Itoa(steps))
	if err != nil {
		return UndoneLast{}, err
	}
	event := events[len(events)-1]
	if event.Fields[2] != kind {
		return UndoneLast{}, fmt.Errorf("REAPER answered for another kind of action than the one this app asked about")
	}
	asked, err := strconv.Atoi(event.Fields[3])
	if err != nil {
		return UndoneLast{}, err
	}
	undone, err := strconv.Atoi(event.Fields[4])
	if err != nil {
		return UndoneLast{}, err
	}
	if asked != steps || undone < 0 || undone > steps {
		return UndoneLast{}, fmt.Errorf("REAPER answered undo_last with %d of %d steps undone, for %d asked", undone, asked, steps)
	}
	return UndoneLast{Kind: kind, Steps: asked, Undone: undone}, nil
}
