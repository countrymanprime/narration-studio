package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// undoLastTimeout bounds one last_action or undo_last request: a read, or up to 12 of REAPER's own Undo, no track read before it.
const undoLastTimeout = splitTakeTimeout

const (
	undoLastNoAnswerSentence = "%s did not answer the undo within %d seconds. Check the project before trying again."
	undoLastNotDoneSentence  = "%s could not undo the app's last action: %s."
)

// DawLastAction answers whether the DAW's next undo point is the app's own action of kind (#1711, ADR 0771 rule 4): "this", "other"
// (another action, or none), or "unknown" when the DAW cannot tell: the undo_last capability refused (a standalone launch, a DAW not
// answering, Experimental actions off, the toggle off, an engine that has not built it), no live adapter, or no answer. It never
// changes the project. kind is a dawport.ActionKind ("cut_range"); any other is an error, and nothing is sent.
func (h *Host) DawLastAction(kind string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), undoLastTimeout)
	defer cancel()
	got, err := dawLastActionIn(ctx, resolver.Support(dawport.CapUndoLast), svc.lastActionUndoer, kind)
	return encodeBinding(got, err)
}

// dawLastActionIn is DawLastAction with the launch's undo_last support and the engine's role (nil with no live adapter) given.
func dawLastActionIn(ctx context.Context, support dawport.Support, undoer dawport.LastActionUndoer, kind string) (dawport.LastAction, error) {
	if !dawport.ActionKind(kind).Valid() {
		return "", dawport.ErrActionKind
	}
	if !support.Available || undoer == nil {
		return dawport.LastActionUnknown, nil
	}
	got, err := undoer.LastAction(ctx, dawport.ActionKind(kind))
	if err != nil {
		return "", err
	}
	if got != dawport.LastActionThis && got != dawport.LastActionOther {
		return dawport.LastActionUnknown, nil
	}
	return got, nil
}

// DawUndoLast undoes steps (1 to 12) consecutive undo points of the app's own action of kind from the top of the DAW's own undo
// history, one at a time, and never one of any other action (#1711). The answer is a DawResult (ADR 0810): the undo_last
// capability's own sentence when the resolver refuses it, checked first; no live adapter is refused in a sentence; the top point not
// being kind's is refused in the DAW's sentence with nothing changed; stopping at another point part way is changed, and its
// sentence says how many were undone. UndoSteps is 0: an undo adds no undo point. kind is a dawport.ActionKind ("cut_range"); any
// other is an error, and nothing is sent.
func (h *Host) DawUndoLast(kind string, steps int) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), undoLastTimeout)
	defer cancel()
	run := h.runLog.Begin("undo_last", "kind", kind)
	result, err := dawUndoLastIn(ctx, readAloudAdapterName(svc), resolver.Support(dawport.CapUndoLast), svc.lastActionUndoer, kind, steps)
	endStackRun(run, result, err)
	return encodeBinding(result, err)
}

// dawUndoLastIn is DawUndoLast with the launch's undo_last support and the engine's role (nil with no live adapter) given. name is
// the engine's name for the sentences.
func dawUndoLastIn(ctx context.Context, name string, support dawport.Support, undoer dawport.LastActionUndoer, kind string, steps int) (dawport.Result, error) {
	if !dawport.ActionKind(kind).Valid() {
		return dawport.Result{}, dawport.ErrActionKind
	}
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	if undoer == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	result, err := undoer.UndoLast(ctx, dawport.ActionKind(kind), steps)
	if err != nil {
		return undoLastRefusal(name, err), nil
	}
	return result, nil
}

// undoLastRefusal words an error the role returned rather than answered: a capability refusal, the bridge not answering, or no
// answer in time.
func undoLastRefusal(name string, err error) dawport.Result {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused
	}
	switch {
	case errors.Is(err, bridge.ErrNoAnswer):
		return dawport.Refused(readAloudConnectionRefusal(name, reaperNotRunning).Message)
	case errors.Is(err, bridge.ErrUnavailable):
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message)
	case errors.Is(err, bridge.ErrExperimentalOff):
		return dawport.Refused(err.Error())
	case errors.Is(err, context.DeadlineExceeded):
		return dawport.Refused(fmt.Sprintf(undoLastNoAnswerSentence, name, int(undoLastTimeout.Seconds())))
	}
	return dawport.Refused(fmt.Sprintf(undoLastNotDoneSentence, name, err.Error()))
}
