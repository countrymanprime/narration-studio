package bridge

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

// Put one of the narrator's saved FX chains on a range of words and take it off again (ADR 0860 point 3; apply_fx_range
// and remove_fx_range in narration_range.lua). Experimental (actions.go) until the QA pass has run them in a real REAPER
// (#1495).

// ErrBadFXRange is the refusal when no item was named, the range is not a finite start before its end, or the fade is
// outside 0 to MaxCutFadeMs, so nothing was sent; the script answers it for the same reasons. The script also refuses a
// range outside the item, which only it can read, in its own sentence (a *RefusalError).
var ErrBadFXRange = errors.New("the range for the chain is not usable")

var badFXRange = map[string]bool{
	"The range for the chain is not a usable pair of times.":         true,
	"The fade must be a whole number of milliseconds from 0 to 500.": true,
}

// badChainSentence is the script's answer for a chain list_fx_chains would not list (narration_workspace.lua and
// narration_range.lua say it alike).
const badChainSentence = "That FX chain is not in the FXChains folder REAPER lists."

// RangeFXApplied is what apply_fx_range did: the piece the chain went on (the item itself when the range began at its
// start), that piece's take, the chain, and the undo points the command added (1).
type RangeFXApplied struct {
	ItemGUID   string
	TakeGUID   string
	Chain      string
	UndoPoints int
}

// RangeFXRemoved is what remove_fx_range did: the item the piece is part of afterwards (a neighbour it was joined to, or
// the piece itself), the chain, and the undo points it added (1, or 0 when the piece no longer carried the chain).
type RangeFXRemoved struct {
	ItemGUID   string
	Chain      string
	UndoPoints int
}

// rangeChainName is a chain name that could be one list_fx_chains lists: plainChainName's rule, and no control
// character.
func rangeChainName(chain string) bool {
	return plainChainName(chain) && !strings.ContainsFunc(chain, unicode.IsControl)
}

// ApplyFXRange puts the chain, named as ListFXChains names it, on project seconds start..end of itemGUID: the item is
// split at both ends and the chain goes on the middle piece's active take, in one undo block, with a fade of fadeMs at
// each new seam. The Lua resolves the name inside FXChains itself; this refuses a name that could not be one
// (ErrBadChainName) before anything is sent. An item that is gone is a *StaleError; nothing changes while REAPER records
// (ErrRecording); a chain that loads nothing, or a range outside the item, is a *RefusalError in the script's words.
func (a *Actions) ApplyFXRange(ctx context.Context, itemGUID string, start, end float64, chain string, fadeMs int) (RangeFXApplied, error) {
	switch {
	case normalizeGUID(itemGUID) == "":
		return RangeFXApplied{}, fmt.Errorf("%w: no item", ErrBadFXRange)
	case !finite(start) || !finite(end) || end <= start:
		return RangeFXApplied{}, fmt.Errorf("%w: %v to %v", ErrBadFXRange, start, end)
	case fadeMs < 0 || fadeMs > MaxCutFadeMs:
		return RangeFXApplied{}, fmt.Errorf("%w: fade %d ms", ErrBadFXRange, fadeMs)
	case !rangeChainName(chain):
		return RangeFXApplied{}, ErrBadChainName
	}
	events, err := a.request(ctx, "apply_fx_range", []string{"RANGE_FX_APPLIED", "ITEM_STALE"},
		itemGUID, formatSeconds(start), formatSeconds(end), chain, strconv.Itoa(fadeMs))
	if err = fxRangeRefusal(err); err != nil {
		return RangeFXApplied{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return RangeFXApplied{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	got := RangeFXApplied{ItemGUID: event.Fields[2], TakeGUID: event.Fields[3], Chain: event.Fields[4], UndoPoints: int(numberAt(event.Fields, 5))}
	if got.Chain != chain {
		return RangeFXApplied{}, fmt.Errorf("REAPER put another chain on the range than the one this app asked for")
	}
	return got, nil
}

// RemoveFXRange takes the chain's FX off the piece itemGUID (as ApplyFXRange answered it) and joins the piece to the
// neighbours that carry on its audio, in one undo block. A piece that no longer carries the chain changes nothing
// (UndoPoints 0). The same refusals as ApplyFXRange.
func (a *Actions) RemoveFXRange(ctx context.Context, itemGUID, chain string) (RangeFXRemoved, error) {
	if normalizeGUID(itemGUID) == "" {
		return RangeFXRemoved{}, fmt.Errorf("%w: no item", ErrBadFXRange)
	}
	if !rangeChainName(chain) {
		return RangeFXRemoved{}, ErrBadChainName
	}
	events, err := a.request(ctx, "remove_fx_range", []string{"RANGE_FX_REMOVED", "ITEM_STALE"}, itemGUID, chain)
	if err = fxRangeRefusal(err); err != nil {
		return RangeFXRemoved{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return RangeFXRemoved{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	got := RangeFXRemoved{ItemGUID: event.Fields[2], Chain: event.Fields[3], UndoPoints: int(numberAt(event.Fields, 4))}
	if got.Chain != chain {
		return RangeFXRemoved{}, fmt.Errorf("REAPER took another chain off than the one this app asked for")
	}
	return got, nil
}

// fxRangeRefusal turns the script's sentences for a bad range or fade and a chain it does not list into ErrBadFXRange
// and ErrBadChainName; any other error is passed on.
func fxRangeRefusal(err error) error {
	var refusal *RefusalError
	switch {
	case errors.As(err, &refusal) && badFXRange[refusal.Sentence]:
		return fmt.Errorf("%w: %s", ErrBadFXRange, refusal.Sentence)
	case errors.As(err, &refusal) && refusal.Sentence == badChainSentence:
		return ErrBadChainName
	}
	return err
}
