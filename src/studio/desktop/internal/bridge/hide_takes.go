package bridge

import (
	"context"
	"fmt"
	"strconv"
)

// TakesHidden is how many takes of an item HideTakes muted, and whether it added an undo point: it can with none hidden, when
// the kept take was made active or given back the volume an earlier hide took.
type TakesHidden struct {
	ItemGUID string
	Hidden   int
	Changed  bool
}

// HideTakes mutes every take of itemGUID but keepTakeGUID (narration_takes.lua: volume 0, with the old volume saved on the take)
// and makes the kept take the active one, in one undo step. Nothing is deleted. An item or kept take that is gone is a
// *StaleError (reason "item" or "take"); nothing changes while REAPER records (ErrRecording).
func (a *Actions) HideTakes(ctx context.Context, itemGUID, keepTakeGUID string) (TakesHidden, error) {
	if itemGUID == "" || keepTakeGUID == "" {
		return TakesHidden{}, ErrNoItemIdentity
	}
	events, err := a.request(ctx, "hide_takes", []string{"TAKES_HIDDEN", "ITEM_STALE"}, itemGUID, keepTakeGUID)
	if err != nil {
		return TakesHidden{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return TakesHidden{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	if event.Fields[2] != normalizeGUID(itemGUID) {
		return TakesHidden{}, fmt.Errorf("REAPER answered for another item than the one this app asked about")
	}
	hidden, err := strconv.Atoi(event.Fields[3])
	if err != nil {
		return TakesHidden{}, err
	}
	return TakesHidden{ItemGUID: event.Fields[2], Hidden: hidden, Changed: event.Fields[4] == "1"}, nil
}
