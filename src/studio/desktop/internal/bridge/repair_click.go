package bridge

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// The bounds repair_click holds a request to (narration_range.lua's MAX_CLICKS and MAX_CLICK_LENGTH).
const (
	MaxClicks      = 500
	MaxClickLength = 0.05
)

// Click is a click Start to End seconds into a take's own source file, at most MaxClickLength long.
type Click struct{ Start, End float64 }

// ClicksRepaired is what repair_click answered: the item and take it repaired, how many clicks (clicks whose ramps met count as
// one) and the undo points it added (one).
type ClicksRepaired struct {
	ItemGUID, TakeGUID string
	Clicks             int
	UndoPoints         int
}

// RepairClick smooths each click of takeGUID, the active take of itemGUID, with a short dip on the take's volume envelope and a
// ramp either side, in one undo step (narration_range.lua). The audio file is not touched. An item or take that is gone, or a
// click the item no longer plays, is a *StaleError (reason "item" or "take"); nothing changes while REAPER records
// (ErrRecording). Every other refusal is REAPER's own sentence (a *RefusalError).
func (a *Actions) RepairClick(ctx context.Context, itemGUID, takeGUID string, clicks []Click) (ClicksRepaired, error) {
	if itemGUID == "" || takeGUID == "" {
		return ClicksRepaired{}, ErrNoItemIdentity
	}
	if len(clicks) == 0 || len(clicks) > MaxClicks {
		return ClicksRepaired{}, fmt.Errorf("a repair needs 1 to %d clicks", MaxClicks)
	}
	parts := make([]string, len(clicks))
	for i, click := range clicks {
		start, end := strconv.FormatFloat(click.Start, 'f', 6, 64), strconv.FormatFloat(click.End, 'f', 6, 64)
		if ClickInShape(click) && start == end {
			return ClicksRepaired{}, fmt.Errorf("a click must last at least 0.000001 s: this one rounds to zero length at six decimals")
		}
		if !ClickInShape(click) {
			return ClicksRepaired{}, fmt.Errorf("a click must start at or after 0 seconds and end after it starts, at most %g s later", MaxClickLength)
		}
		parts[i] = start + ":" + end
	}
	events, err := a.request(ctx, "repair_click", []string{"CLICKS_REPAIRED", "ITEM_STALE"}, itemGUID, takeGUID, strings.Join(parts, ","))
	if err != nil {
		return ClicksRepaired{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return ClicksRepaired{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	if event.Fields[2] != normalizeGUID(itemGUID) || event.Fields[3] != normalizeGUID(takeGUID) {
		return ClicksRepaired{}, fmt.Errorf("REAPER answered for another take than the one this app asked about")
	}
	count, err := strconv.Atoi(event.Fields[4])
	if err != nil {
		return ClicksRepaired{}, err
	}
	undo, err := strconv.Atoi(event.Fields[5])
	if err != nil {
		return ClicksRepaired{}, err
	}
	return ClicksRepaired{ItemGUID: event.Fields[2], TakeGUID: event.Fields[3], Clicks: count, UndoPoints: undo}, nil
}

// ClickInShape is whether a click starts at or after 0, ends after it starts and lasts at most MaxClickLength (with the six
// decimals the command sends).
func ClickInShape(click Click) bool {
	return click.Start >= 0 && !math.IsInf(click.End, 0) && click.End > click.Start && click.End-click.Start <= MaxClickLength+0.000001
}
