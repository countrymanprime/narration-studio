package reaper

import (
	"context"
	"errors"
	"fmt"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// lastActionUndoer is the undo_last role over bridge's last_action and undo_last (narration_undo.lua), answering a LastAction and a
// dawport.Result (ADR 0810). The script maps a kind to the undo label its command writes; this role sends only the kind.
type lastActionUndoer struct {
	actions *bridge.Actions
	allowed func(dawport.Capability) error
}

var _ dawport.LastActionUndoer = lastActionUndoer{}

const (
	// messageNotLast is the refusal when REAPER's next undo point is not the app's action of that kind.
	messageNotLast             = "REAPER's last action is not this one, so it was left alone. Use Edit > Undo in REAPER."
	messageUndoSteps           = "The number of steps to undo must be 1 to 12, so nothing was undone."
	messageUndoScriptOutdated  = "The Narration Utils script in REAPER is older than this app and cannot undo the app's actions, so nothing was undone. Import the script again from this app's REAPER folder."
	messageUndoRecordingInDAW  = "REAPER is recording. Stop recording first."
	messageUndoPartialTemplate = "Undid %d of the %d %s in REAPER. The rest are no longer REAPER's last actions, so they were left alone. Use Edit > Undo in REAPER for them."
)

// actionNouns words each kind for the sentences: one, and several.
var actionNouns = map[dawport.ActionKind][2]string{dawport.ActionCutRange: {"cut", "cuts"}}

// LastAction reads whether REAPER's next undo point is kind's. Anything that keeps it from telling (the capability refused, REAPER
// not answering, an older script, a refusal) is LastActionUnknown, not an error; a kind this build does not know is ErrActionKind.
func (u lastActionUndoer) LastAction(ctx context.Context, kind dawport.ActionKind) (dawport.LastAction, error) {
	if !kind.Valid() {
		return dawport.LastActionUnknown, dawport.ErrActionKind
	}
	if u.allowed != nil && u.allowed(dawport.CapUndoLast) != nil {
		return dawport.LastActionUnknown, nil
	}
	got, err := u.actions.LastAction(ctx, string(kind))
	switch {
	case errors.Is(err, bridge.ErrUndoKind):
		return dawport.LastActionUnknown, dawport.ErrActionKind
	case err != nil:
		return dawport.LastActionUnknown, nil
	case got.This:
		return dawport.LastActionThis, nil
	default:
		return dawport.LastActionOther, nil
	}
}

// UndoLast undoes up to steps of kind's undo points from the top of REAPER's history. The top point not being kind's is refused
// with messageNotLast and nothing undone; stopping at another point part way is ok, changed, and says how many were undone. It
// asks allowed itself first, so a refusal is the capability's own sentence. An undo adds no undo point, so UndoSteps is 0.
func (u lastActionUndoer) UndoLast(ctx context.Context, kind dawport.ActionKind, steps int) (dawport.Result, error) {
	if !kind.Valid() {
		return dawport.Result{}, dawport.ErrActionKind
	}
	if u.allowed != nil {
		if refused, ok := dawport.RefusedFrom(u.allowed(dawport.CapUndoLast)); ok {
			return refused, nil
		}
	}
	if steps < 1 || steps > dawport.MaxUndoLastSteps {
		return dawport.Refused(messageUndoSteps), nil
	}
	got, err := u.actions.UndoLast(ctx, string(kind), steps)
	var refusal *bridge.RefusalError
	switch {
	case errors.Is(err, bridge.ErrUndoKind):
		return dawport.Result{}, dawport.ErrActionKind
	case errors.Is(err, bridge.ErrRecording):
		return dawport.Refused(messageUndoRecordingInDAW), nil
	case errors.Is(err, bridge.ErrScriptOutdated):
		return dawport.Refused(messageUndoScriptOutdated), nil
	case errors.As(err, &refusal):
		return dawport.Refused(refusal.Sentence), nil
	case errors.Is(err, bridge.ErrExperimentalOff):
		return dawport.Refused(err.Error()), nil
	case err != nil:
		return dawport.Result{}, err
	}
	if got.Undone == 0 {
		return dawport.Refused(messageNotLast), nil
	}
	return dawport.OK(undoneMessage(kind, got.Undone, steps), true).WithUndoSteps(0), nil
}

// undoneMessage words undone of steps points of kind undone.
func undoneMessage(kind dawport.ActionKind, undone, steps int) string {
	noun := actionNouns[kind]
	switch {
	case undone < steps:
		return fmt.Sprintf(messageUndoPartialTemplate, undone, steps, noun[1])
	case undone == 1:
		return "Undid the " + noun[0] + " in REAPER."
	default:
		return fmt.Sprintf("Undid the last %d %s in REAPER.", undone, noun[1])
	}
}
