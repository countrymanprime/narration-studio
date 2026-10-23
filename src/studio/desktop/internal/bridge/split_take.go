package bridge

import (
	"context"
	"fmt"
	"math"
	"strconv"
)

// TakeSplit is what split_take answered: the item and take it cut, the new take that plays the second read, the cut's time
// in the project, and the undo points it added (one).
type TakeSplit struct {
	ItemGUID, TakeGUID, NewTakeGUID string
	At                              float64
	UndoPoints                      int
}

// SplitTake makes takeGUID of itemGUID, a take that reads its line twice, into two takes of one item at at seconds into the
// project (narration_takes.lua): the item ends at the cut and a new take plays the same file from it, in one undo step.
// Nothing is deleted and no other item moves. An item or take that is gone, or a cut no longer inside the item, is a
// *StaleError (reason "item" or "take"); nothing changes while REAPER records (ErrRecording). Every other refusal is
// REAPER's own sentence (a *RefusalError).
func (a *Actions) SplitTake(ctx context.Context, itemGUID, takeGUID string, at float64) (TakeSplit, error) {
	if itemGUID == "" || takeGUID == "" {
		return TakeSplit{}, ErrNoItemIdentity
	}
	if at < 0 || math.IsNaN(at) || math.IsInf(at, 0) {
		return TakeSplit{}, fmt.Errorf("a take can only be split at a time in the project")
	}
	events, err := a.request(ctx, "split_take", []string{"TAKE_SPLIT", "ITEM_STALE"}, itemGUID, takeGUID, strconv.FormatFloat(at, 'f', 3, 64))
	if err != nil {
		return TakeSplit{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return TakeSplit{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	if event.Fields[2] != normalizeGUID(itemGUID) || event.Fields[3] != normalizeGUID(takeGUID) {
		return TakeSplit{}, fmt.Errorf("REAPER answered for another take than the one this app asked about")
	}
	answeredAt, err := strconv.ParseFloat(event.Fields[5], 64)
	if err != nil {
		return TakeSplit{}, err
	}
	undo, err := strconv.Atoi(event.Fields[6])
	if err != nil {
		return TakeSplit{}, err
	}
	return TakeSplit{ItemGUID: event.Fields[2], TakeGUID: event.Fields[3], NewTakeGUID: event.Fields[4], At: answeredAt, UndoPoints: undo}, nil
}
