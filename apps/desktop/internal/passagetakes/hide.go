package passagetakes

import (
	"context"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// Hider is the DAW's hide_takes (dawport.TakeSelector.HideTakes): mute every take of itemGUID but keepTakeGUID, in one undo step.
type Hider func(ctx context.Context, itemGUID, keepTakeGUID string) (dawport.Result, error)

const (
	notOfferedSentence = "That take isn't one of this passage's takes any more, so nothing was changed. The list has been read again."
	notOnItemSentence  = "Only a take of this passage's own item can be kept while the others are muted. Use this take first, then hide the others."
)

// Hide mutes the other takes of the passage's item, keeping keepCandidateID, one of the candidates Resolve offered (SND-5b).
// The item and the kept take are the host's own, read from the saved project: an id Resolve did not offer is refused as
// stale, and so is a passage whose item the saved project no longer has, with nothing sent. Only a take of the passage's
// own item can be kept, and a nil hide (no takes role: no bridge) is refused. The answer is the DAW's own Result (ADR
// 0810); an error is worded as Use words it, as a refusal.
func Hide(ctx context.Context, hide Hider, resolved Resolved, keepCandidateID string) dawport.Result {
	if resolved.View.PassageID == "" {
		return dawport.RefusedStale(resolved.View.Message)
	}
	choice, offered := resolved.Choice(keepCandidateID)
	if !offered {
		return dawport.RefusedStale(notOfferedSentence)
	}
	keep := choice.Candidate
	if keep.Source != SourceItemTake {
		return dawport.Refused(notOnItemSentence)
	}
	if !keep.Usable {
		return dawport.Refused(keep.Reason)
	}
	if hide == nil {
		return refusedResult(bridge.ErrUnavailable)
	}
	result, err := hide(ctx, choice.TargetItemGUID, keep.TakeGUID)
	if err != nil {
		return refusedResult(err)
	}
	return result
}

// refusedResult is err worded as Use words it (refuse), as a refused Result: stale keeps its code.
func refusedResult(err error) dawport.Result {
	outcome := refuse(err)
	if outcome.Reason == ReasonStale {
		return dawport.RefusedStale(outcome.Message)
	}
	return dawport.Refused(outcome.Message)
}
