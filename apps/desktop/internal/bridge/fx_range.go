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

// Read and change the chain apply_fx_range put on a piece (SN-E104; fx_range_params, fx_range_set_param and fx_range_bypass in
// narration_range.lua). Each names the piece and its take as ApplyFXRange answered them (an empty take: the piece's take that
// carries the chain) and the chain; REAPER finds the chain's FX by the GUIDs the take records and answers a *StaleError when the
// piece, the take or the chain's FX are gone (reason "item", "take" or "fx"). Experimental (actions.go) until the QA pass (#1495).

// MaxFXRangeParams is the most parameters fx_range_params lists over the chain's FX; RangeFXParams.Truncated says it stopped there.
const MaxFXRangeParams = 512

// FXParam is one setting of one FX of the chain: FX is the FX's place in the chain (0-based, in the order apply_fx_range added
// them) and Index the setting's place in that FX. Value lies in Min..Max; Step is REAPER's step for the setting, 0 when it is
// continuous; Formatted is the value as the FX shows it ("-6.0 dB").
type FXParam struct {
	FX        int
	FXName    string
	Index     int
	Name      string
	Value     float64
	Min       float64
	Max       float64
	Step      float64
	Formatted string
}

// RangeFXParams is what fx_range_params read: the piece, its take, the chain, its settings in order, whether the list stopped at
// MaxFXRangeParams, and whether every FX of the chain is bypassed.
type RangeFXParams struct {
	ItemGUID  string
	TakeGUID  string
	Chain     string
	Params    []FXParam
	Truncated bool
	Bypassed  bool
}

// RangeFXParamSet is what fx_range_set_param did: the setting's value as REAPER holds it afterwards (an FX can round it) and as
// the FX shows it, and the undo points it added (0 when the setting already had the value).
type RangeFXParamSet struct {
	ItemGUID   string
	TakeGUID   string
	FX         int
	Index      int
	Value      float64
	Formatted  string
	UndoPoints int
}

// RangeFXBypassed is what fx_range_bypass did: whether the chain is bypassed now, and the undo points it added (0 when it already
// was as asked).
type RangeFXBypassed struct {
	ItemGUID   string
	TakeGUID   string
	Chain      string
	Bypassed   bool
	UndoPoints int
}

// checkFXRangeTarget refuses, before anything is sent, a request with no piece or a chain name that could not be one.
func checkFXRangeTarget(itemGUID, chain string) error {
	if normalizeGUID(itemGUID) == "" {
		return fmt.Errorf("%w: no item", ErrBadFXRange)
	}
	if !rangeChainName(chain) {
		return ErrBadChainName
	}
	return nil
}

// sameTake is whether REAPER answered for the piece asked about, and for the take asked about when one was named.
func sameTake(event Event, itemGUID, takeGUID string) bool {
	return event.Fields[2] == normalizeGUID(itemGUID) && (takeGUID == "" || event.Fields[3] == normalizeGUID(takeGUID))
}

// FXRangeParams reads the settings of the chain on the piece itemGUID (takeGUID's take, or with "" the take that carries it). It
// changes nothing and adds no undo point.
func (a *Actions) FXRangeParams(ctx context.Context, itemGUID, takeGUID, chain string) (RangeFXParams, error) {
	if err := checkFXRangeTarget(itemGUID, chain); err != nil {
		return RangeFXParams{}, err
	}
	events, err := a.request(ctx, "fx_range_params", []string{"RANGE_FX_PARAMS", "ITEM_STALE"}, itemGUID, takeGUID, chain)
	if err = fxRangeRefusal(err); err != nil {
		return RangeFXParams{}, err
	}
	last := events[len(events)-1]
	if last.Tag == "ITEM_STALE" {
		return RangeFXParams{}, &StaleError{GUID: last.Fields[2], Reason: last.Fields[3]}
	}
	if !sameTake(last, itemGUID, takeGUID) || last.Fields[4] != chain {
		return RangeFXParams{}, fmt.Errorf("REAPER answered for another effect than the one this app asked about")
	}
	got := RangeFXParams{ItemGUID: last.Fields[2], TakeGUID: last.Fields[3], Chain: chain, Params: []FXParam{},
		Truncated: last.Fields[6] == "1", Bypassed: last.Fields[7] == "1"}
	for _, event := range events {
		if event.Tag != "RANGE_FX_PARAM" {
			continue
		}
		f := event.Fields
		got.Params = append(got.Params, FXParam{FX: int(numberAt(f, 2)), FXName: f[3], Index: int(numberAt(f, 4)), Name: f[5],
			Value: numberAt(f, 6), Min: numberAt(f, 7), Max: numberAt(f, 8), Step: numberAt(f, 9), Formatted: f[10]})
	}
	if count := int(numberAt(last.Fields, 5)); count != len(got.Params) {
		return RangeFXParams{}, fmt.Errorf("REAPER listed %d settings but sent %d", count, len(got.Params))
	}
	return got, nil
}

// SetFXRangeParam sets setting index of the chain's FX fx (as FXRangeParams numbers them) to value, in one undo block. A value
// outside the setting's range, or a setting the FX does not have, is a *RefusalError in REAPER's words; nothing changes while
// REAPER records (ErrRecording).
func (a *Actions) SetFXRangeParam(ctx context.Context, itemGUID, takeGUID, chain string, fx, index int, value float64) (RangeFXParamSet, error) {
	if err := checkFXRangeTarget(itemGUID, chain); err != nil {
		return RangeFXParamSet{}, err
	}
	if fx < 0 || index < 0 || !finite(value) {
		return RangeFXParamSet{}, fmt.Errorf("%w: setting %d of FX %d to %v", ErrBadFXRange, index, fx, value)
	}
	// The script reads param|value from its last field (the bridge keeps the rest of a line there).
	events, err := a.request(ctx, "fx_range_set_param", []string{"RANGE_FX_PARAM_SET", "ITEM_STALE"},
		itemGUID, takeGUID, chain, strconv.Itoa(fx), strconv.Itoa(index), strconv.FormatFloat(value, 'g', -1, 64))
	if err = fxRangeRefusal(err); err != nil {
		return RangeFXParamSet{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return RangeFXParamSet{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	got := RangeFXParamSet{ItemGUID: event.Fields[2], TakeGUID: event.Fields[3], FX: int(numberAt(event.Fields, 4)), Index: int(numberAt(event.Fields, 5)),
		Value: numberAt(event.Fields, 6), Formatted: event.Fields[7], UndoPoints: int(numberAt(event.Fields, 8))}
	if !sameTake(event, itemGUID, takeGUID) || got.FX != fx || got.Index != index {
		return RangeFXParamSet{}, fmt.Errorf("REAPER answered for another setting than the one this app asked about")
	}
	return got, nil
}

// BypassFXRange bypasses every FX of the chain (bypass true) or turns them back on, in one undo block. The same refusals as
// SetFXRangeParam.
func (a *Actions) BypassFXRange(ctx context.Context, itemGUID, takeGUID, chain string, bypass bool) (RangeFXBypassed, error) {
	if err := checkFXRangeTarget(itemGUID, chain); err != nil {
		return RangeFXBypassed{}, err
	}
	on := "0"
	if bypass {
		on = "1"
	}
	events, err := a.request(ctx, "fx_range_bypass", []string{"RANGE_FX_BYPASSED", "ITEM_STALE"}, itemGUID, takeGUID, chain, on)
	if err = fxRangeRefusal(err); err != nil {
		return RangeFXBypassed{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return RangeFXBypassed{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	got := RangeFXBypassed{ItemGUID: event.Fields[2], TakeGUID: event.Fields[3], Chain: event.Fields[4], Bypassed: event.Fields[5] == "1",
		UndoPoints: int(numberAt(event.Fields, 6))}
	if !sameTake(event, itemGUID, takeGUID) || got.Chain != chain || got.Bypassed != bypass {
		return RangeFXBypassed{}, fmt.Errorf("REAPER answered for another effect than the one this app asked about")
	}
	return got, nil
}
