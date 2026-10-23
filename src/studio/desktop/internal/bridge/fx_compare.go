package bridge

import (
	"context"
	"fmt"
)

// The effect inspector's Compare in REAPER (SN-E113; fx_range_compare and stop_fx_compare in narration_range.lua): the piece a
// range chain is on played in the project with the chain on and then bypassed, and the chain put back as it was. Experimental
// (actions.go) until the QA pass has run it in a real REAPER (#1495).

// RangeFXCompare is what fx_range_compare started: the piece, its take, the chain, the piece's project seconds (each pass plays
// Start to End) and whether the chain was bypassed before. A Compare adds no undo point.
type RangeFXCompare struct {
	ItemGUID    string
	TakeGUID    string
	Chain       string
	Start       float64
	End         float64
	WasBypassed bool
}

// CompareFXRange plays the piece itemGUID (takeGUID's take, or with "" the take that carries the chain) with the chain on, then
// bypassed, and puts it back. It answers once the first pass has started; REAPER plays the rest on its own. The same refusals
// as BypassFXRange.
func (a *Actions) CompareFXRange(ctx context.Context, itemGUID, takeGUID, chain string) (RangeFXCompare, error) {
	if err := checkFXRangeTarget(itemGUID, chain); err != nil {
		return RangeFXCompare{}, err
	}
	events, err := a.request(ctx, "fx_range_compare", []string{"RANGE_FX_COMPARE", "ITEM_STALE"}, itemGUID, takeGUID, chain)
	if err = fxRangeRefusal(err); err != nil {
		return RangeFXCompare{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return RangeFXCompare{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	got := RangeFXCompare{ItemGUID: event.Fields[2], TakeGUID: event.Fields[3], Chain: event.Fields[4], Start: numberAt(event.Fields, 5),
		End: numberAt(event.Fields, 6), WasBypassed: event.Fields[7] == "1"}
	if !sameTake(event, itemGUID, takeGUID) || got.Chain != chain {
		return RangeFXCompare{}, fmt.Errorf("REAPER answered for another effect than the one this app asked about")
	}
	if !(got.End > got.Start) {
		return RangeFXCompare{}, fmt.Errorf("REAPER answered a piece from %v to %v seconds", got.Start, got.End)
	}
	return got, nil
}

// StopFXCompare ends a running Compare early and puts the chain back; it answers whether one was running.
func (a *Actions) StopFXCompare(ctx context.Context) (bool, error) {
	events, err := a.request(ctx, "stop_fx_compare", []string{"RANGE_FX_COMPARE_STOPPED"})
	if err != nil {
		return false, err
	}
	return events[len(events)-1].Fields[2] == "1", nil
}
