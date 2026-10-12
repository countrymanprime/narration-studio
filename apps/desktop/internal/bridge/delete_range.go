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
	// CutGap moves nothing, so the cut is silence, or room tone when DeleteRange is asked for it.
	CutGap CutMode = "gap"
)

// MaxCutFadeMs is the longest fade delete_range sets at a seam, and MaxCutPadMs the most it leaves uncut at each end.
const (
	MaxCutFadeMs = 500
	MaxCutPadMs  = 500
)

// ErrBadRange is the refusal when no item was named, the range is not a finite start before its end, the mode is not
// close or gap, the fade or the pad is outside 0 to 500 ms, the pad leaves nothing to cut, or room tone is asked for a
// cut that closes up, so nothing was sent; the script answers it for the same reasons. The script also refuses a range
// outside the item, and room tone it cannot find or lay, which only it can read, in its own sentence (a *RefusalError).
var ErrBadRange = errors.New("the range to cut is not usable")

const cutBadFade = "The fade must be a whole number of milliseconds from 0 to 500."

var badRange = map[string]bool{
	"The range to cut is not a usable pair of times.":                        true,
	"The cut mode must be close or gap.":                                     true,
	cutBadFade:                                                               true,
	"The pad must be from 0 to 500 milliseconds.":                            true,
	"The pad leaves nothing to cut.":                                         true,
	"The room tone choice must be 0 or 1.":                                   true,
	"Room tone fills a gap that keeps its length, so it needs the gap mode.": true,
}

// RangeCut is what delete_range did: the left piece (the item itself, or empty when the cut began at the item's start),
// the piece moved to the Cuts track (the item itself when the cut began at its start), and the undo points the command
// added (1).
type RangeCut struct {
	LeftItemGUID string
	CutItemGUID  string
	UndoPoints   int
}

// DeleteRange cuts project seconds start+pad..end-pad out of itemGUID: the item is split at both ends and the middle piece
// is moved to the project's muted Cuts track, in one undo block; CutClose also moves the later items on the track up, and
// roomTone (CutGap only) fills the gap with the room tone the chapter's track has marked. Nothing is deleted. An item that
// is gone is a *StaleError; nothing changes while REAPER records (ErrRecording); a range the script refuses (outside the
// item, overlapping a neighbour, no room tone marked) is a *RefusalError in its words.
//
// padMs and roomTone travel after the fade in delete_range's last field, and only when either is asked for. A script older
// than them reads that field as a fade that is not a number and refuses, cutting nothing: that refusal is ErrScriptOutdated.
func (a *Actions) DeleteRange(ctx context.Context, itemGUID string, start, end float64, mode CutMode, fadeMs, padMs int, roomTone bool) (RangeCut, error) {
	pad := float64(padMs) / 1000
	switch {
	case normalizeGUID(itemGUID) == "":
		return RangeCut{}, fmt.Errorf("%w: no item", ErrBadRange)
	case !finite(start) || !finite(end) || end <= start:
		return RangeCut{}, fmt.Errorf("%w: %v to %v", ErrBadRange, start, end)
	case mode != CutClose && mode != CutGap:
		return RangeCut{}, fmt.Errorf("%w: mode %q", ErrBadRange, mode)
	case fadeMs < 0 || fadeMs > MaxCutFadeMs:
		return RangeCut{}, fmt.Errorf("%w: fade %d ms", ErrBadRange, fadeMs)
	case padMs < 0 || padMs > MaxCutPadMs:
		return RangeCut{}, fmt.Errorf("%w: pad %d ms", ErrBadRange, padMs)
	case end-pad-(start+pad) <= 0:
		return RangeCut{}, fmt.Errorf("%w: a pad of %d ms leaves nothing of %v to %v", ErrBadRange, padMs, start, end)
	case roomTone && mode != CutGap:
		return RangeCut{}, fmt.Errorf("%w: room tone with mode %q", ErrBadRange, mode)
	}
	args := []string{itemGUID, formatSeconds(start), formatSeconds(end), string(mode), strconv.Itoa(fadeMs)}
	extended := padMs > 0 || roomTone
	if extended {
		tone := "0"
		if roomTone {
			tone = "1"
		}
		args = append(args, formatSeconds(pad), tone)
	}
	events, err := a.request(ctx, "delete_range", []string{"RANGE_CUT", "ITEM_STALE"}, args...)
	var refusal *RefusalError
	if extended && errors.As(err, &refusal) && refusal.Sentence == cutBadFade {
		return RangeCut{}, fmt.Errorf("%w: it cannot pad a cut or fill it with room tone, so nothing was cut", ErrScriptOutdated)
	}
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
