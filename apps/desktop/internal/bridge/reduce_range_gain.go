package bridge

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// The bounds reduce_range_gain holds a request to (narration_range.lua's MIN_REDUCE_DB, MAX_REDUCE_DB and MAX_GAIN_STRETCHES).
const (
	MinReduceDB      = 1
	MaxReduceDB      = 24
	MaxGainStretches = 500
)

// GainStretch is Start to End seconds into a take's own source file.
type GainStretch struct{ Start, End float64 }

// RangeGainReduced is what reduce_range_gain answered: the item and take it lowered, how many stretches (stretches whose ramps
// met count as one), the dB they were lowered by, and the undo points it added (one).
type RangeGainReduced struct {
	ItemGUID, TakeGUID string
	Stretches          int
	ReduceDB           float64
	UndoPoints         int
}

// ReduceRangeGain lowers each stretch of takeGUID, the active take of itemGUID, by reduceDB (1 to 24) with points on the take's
// volume envelope and a short ramp at each edge, in one undo step (narration_range.lua). The audio file is not touched. An item
// or take that is gone, or a stretch the item no longer plays, is a *StaleError (reason "item" or "take"); nothing changes while
// REAPER records (ErrRecording). Every other refusal is REAPER's own sentence (a *RefusalError).
func (a *Actions) ReduceRangeGain(ctx context.Context, itemGUID, takeGUID string, reduceDB float64, stretches []GainStretch) (RangeGainReduced, error) {
	if itemGUID == "" || takeGUID == "" {
		return RangeGainReduced{}, ErrNoItemIdentity
	}
	if math.IsNaN(reduceDB) || reduceDB < MinReduceDB || reduceDB > MaxReduceDB {
		return RangeGainReduced{}, fmt.Errorf("a stretch can only be lowered by %d to %d dB", MinReduceDB, MaxReduceDB)
	}
	if len(stretches) == 0 || len(stretches) > MaxGainStretches {
		return RangeGainReduced{}, fmt.Errorf("lowering needs 1 to %d stretches", MaxGainStretches)
	}
	parts := make([]string, len(stretches))
	for i, stretch := range stretches {
		start, end := strconv.FormatFloat(stretch.Start, 'f', 6, 64), strconv.FormatFloat(stretch.End, 'f', 6, 64)
		if !(stretch.Start >= 0) || math.IsInf(stretch.End, 0) || !(stretch.End > stretch.Start) || start == end {
			return RangeGainReduced{}, fmt.Errorf("a stretch must start at or after 0 seconds and end after it starts")
		}
		parts[i] = start + ":" + end
	}
	events, err := a.request(ctx, "reduce_range_gain", []string{"RANGE_GAIN_REDUCED", "ITEM_STALE"},
		itemGUID, takeGUID, strconv.FormatFloat(reduceDB, 'f', -1, 64), strings.Join(parts, ","))
	if err != nil {
		return RangeGainReduced{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return RangeGainReduced{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	if event.Fields[2] != normalizeGUID(itemGUID) || event.Fields[3] != normalizeGUID(takeGUID) {
		return RangeGainReduced{}, fmt.Errorf("REAPER answered for another take than the one this app asked about")
	}
	count, err := strconv.Atoi(event.Fields[4])
	if err != nil {
		return RangeGainReduced{}, err
	}
	db, err := strconv.ParseFloat(event.Fields[5], 64)
	if err != nil {
		return RangeGainReduced{}, err
	}
	undo, err := strconv.Atoi(event.Fields[6])
	if err != nil {
		return RangeGainReduced{}, err
	}
	return RangeGainReduced{ItemGUID: event.Fields[2], TakeGUID: event.Fields[3], Stretches: count, ReduceDB: db, UndoPoints: undo}, nil
}
