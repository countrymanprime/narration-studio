package passagetakes

import (
	"context"
	"errors"
	"fmt"

	"desktop/internal/bridge"
)

// What Use answers.
const (
	OutcomeDone    = "done"
	OutcomeStarted = "started"
	OutcomeRefused = "refused"

	ReasonNotOffered     = "not_offered"
	ReasonUnusable       = "unusable"
	ReasonStale          = "stale"
	ReasonRecording      = "recording"
	ReasonScriptOutdated = "script_outdated"
	ReasonStandalone     = "standalone"
	ReasonNotRunning     = "not_running"
	ReasonFailed         = "failed"
)

// Actors are the REAPER requests Use may make, each nil when the DAW cannot do it (standalone, or no such role).
type Actors struct {
	// SetActiveTake is set_active_take: one undo step, reporting whether the active take changed.
	SetActiveTake func(ctx context.Context, itemGUID, takeGUID string) (changed bool, err error)
	// PickLane is pick_retake_lane: it starts the pick, whose end REAPER reports on its own event.
	PickLane func(lineID, itemGUID string) error
}

// Outcome is what choosing a take did, in the narrator's words.
type Outcome struct {
	Outcome string `json:"outcome"`
	Reason  string `json:"reason,omitempty"`
	Message string `json:"message"`
	Changed bool   `json:"changed"`
}

const saveNote = " Save the project in REAPER to bring the check up to date."

func refused(reason, message string) Outcome {
	return Outcome{Outcome: OutcomeRefused, Reason: reason, Message: message}
}

// Use carries out choice, one of the candidates Resolve offered, and never anything else: the item, take, line and
// line it acts on are the choice's own, read from the saved project (EP7). A take that cannot
// be heard is refused before anything is sent; REAPER's own refusals are worded and never reported as a change.
func Use(ctx context.Context, actors Actors, choice Choice) Outcome {
	candidate := choice.Candidate
	if !candidate.Usable {
		return refused(ReasonUnusable, candidate.Reason)
	}
	if candidate.Active {
		return Outcome{Outcome: OutcomeDone, Message: "That take is already the one playing, so nothing changed."}
	}
	switch candidate.Action {
	case ActionMakeActive:
		return makeActive(ctx, actors, choice.TargetItemGUID, candidate.TakeGUID, "Made that take active in REAPER, in one undo step: Undo in REAPER puts the previous take back.")
	case ActionPickLane:
		if actors.PickLane == nil {
			return refuse(bridge.ErrUnavailable)
		}
		if err := actors.PickLane(choice.LineID, candidate.ItemGUID); err != nil {
			return refuse(err)
		}
		return Outcome{Outcome: OutcomeStarted, Message: "Asking REAPER to play this retake…"}
	}
	return refused(ReasonFailed, "That take can't be chosen from here.")
}

func makeActive(ctx context.Context, actors Actors, itemGUID, takeGUID, done string) Outcome {
	if actors.SetActiveTake == nil {
		return refuse(bridge.ErrUnavailable)
	}
	changed, err := actors.SetActiveTake(ctx, itemGUID, takeGUID)
	if err != nil {
		return refuse(err)
	}
	if !changed {
		return Outcome{Outcome: OutcomeDone, Message: "That take was already active in REAPER, so nothing changed."}
	}
	return Outcome{Outcome: OutcomeDone, Changed: true, Message: done + saveNote}
}

// refuse words what REAPER (or the DAW port) answered. Nothing in REAPER changed for a refusal.
func refuse(err error) Outcome {
	var stale *bridge.StaleError
	switch {
	case errors.As(err, &stale):
		what := "the item or take"
		switch stale.Reason {
		case "item":
			what = "this take's item"
		case "take":
			what = "this take"
		}
		return refused(ReasonStale, fmt.Sprintf("%s is no longer in the REAPER project, so nothing was changed. Run the check again to find the takes where they are now.", capitalize(what)))
	case errors.Is(err, bridge.ErrRecording):
		return refused(ReasonRecording, "REAPER is recording, so nothing was changed. Stop recording first.")
	case errors.Is(err, bridge.ErrScriptOutdated):
		return refused(ReasonScriptOutdated, "The app's script in REAPER is older than this app. Restart REAPER so it loads the bridge this app installed, then try again.")
	case errors.Is(err, bridge.ErrNoAnswer):
		return refused(ReasonNotRunning, "REAPER is not answering. Check that REAPER is open, then try again; the app reconnects by itself.")
	case errors.Is(err, bridge.ErrUnavailable):
		return refused(ReasonStandalone, "REAPER is not connected to this app. To choose a take, open REAPER; the app connects to it by itself.")
	}
	return refused(ReasonFailed, "REAPER could not do that: "+err.Error()+".")
}

func capitalize(text string) string {
	if text == "" || text[0] < 'a' || text[0] > 'z' {
		return text
	}
	return string(text[0]-'a'+'A') + text[1:]
}
