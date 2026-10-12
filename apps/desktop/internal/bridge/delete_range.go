package bridge

import (
	"context"
	"errors"
	"fmt"
	"strconv"
)

// Cut words and their audio (ADR 0860 point 2; delete_range in narration_range.lua). Experimental (actions.go) until the
// QA pass has run it in a real REAPER (#1495).

// CutMode is what happens to the time a cut leaves behind, as delete_range takes it.
type CutMode string

const (
	// CutClose moves the later items on the item's track up by the cut's length.
	CutClose CutMode = "close"
	// CutGap moves nothing, so the cut is silence.
	CutGap CutMode = "gap"
)

// MaxCutFadeMs is the longest fade delete_range sets at a seam.
const MaxCutFadeMs = 500

// ErrBadRange is the refusal when no item was named, the range is not a finite start before its end, the mode is not
// close or gap, or the fade is outside 0 to MaxCutFadeMs, so nothing was sent; the script answers it for the same reasons.
// The script also refuses a range outside the item, which only it can read, in its own sentence (a *RefusalError).
var ErrBadRange = errors.New("the range to cut is not usable")

var badRange = map[string]bool{
	"The range to cut is not a usable pair of times.":                true,
	"The cut mode must be close or gap.":                             true,
	"The fade must be a whole number of milliseconds from 0 to 500.": true,
}

// RangeCut is what delete_range did: the left piece (the item itself, or empty when the cut began at the item's start),
// the piece moved to the Cuts track (the item itself when the cut began at its start), and the undo points the command
// added (1).
type RangeCut struct {
	LeftItemGUID string
	CutItemGUID  string
	UndoPoints   int
}

// DeleteRange cuts project seconds start..end out of itemGUID: the item is split at both ends and the middle piece is
// moved to the project's muted Cuts track, in one undo block; CutClose also moves the later items on the track up.
// Nothing is deleted. An item that is gone is a *StaleError; nothing changes while REAPER records (ErrRecording); a
// range the script refuses (outside the item, overlapping a neighbour) is a *RefusalError in its words.
func (a *Actions) DeleteRange(ctx context.Context, itemGUID string, start, end float64, mode CutMode, fadeMs int) (RangeCut, error) {
	switch {
	case normalizeGUID(itemGUID) == "":
		return RangeCut{}, fmt.Errorf("%w: no item", ErrBadRange)
	case !finite(start) || !finite(end) || end <= start:
		return RangeCut{}, fmt.Errorf("%w: %v to %v", ErrBadRange, start, end)
	case mode != CutClose && mode != CutGap:
		return RangeCut{}, fmt.Errorf("%w: mode %q", ErrBadRange, mode)
	case fadeMs < 0 || fadeMs > MaxCutFadeMs:
		return RangeCut{}, fmt.Errorf("%w: fade %d ms", ErrBadRange, fadeMs)
	}
	events, err := a.request(ctx, "delete_range", []string{"RANGE_CUT", "ITEM_STALE"},
		itemGUID, formatSeconds(start), formatSeconds(end), string(mode), strconv.Itoa(fadeMs))
	var refusal *RefusalError
	if errors.As(err, &refusal) && badRange[refusal.Sentence] {
		return RangeCut{}, fmt.Errorf("%w: %s", ErrBadRange, refusal.Sentence)
	}
	if err != nil {
		return RangeCut{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return RangeCut{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	got := RangeCut{LeftItemGUID: event.Fields[2], CutItemGUID: event.Fields[3], UndoPoints: int(numberAt(event.Fields, 4))}
	asked := normalizeGUID(itemGUID)
	if (got.LeftItemGUID != "" && got.LeftItemGUID != asked) || (got.LeftItemGUID == "" && got.CutItemGUID != asked) {
		return RangeCut{}, fmt.Errorf("REAPER cut another item than the one this app asked for")
	}
	return got, nil
}
