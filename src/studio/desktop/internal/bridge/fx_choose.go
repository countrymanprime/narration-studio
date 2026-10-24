package bridge

import (
	"context"
	"fmt"
	"strconv"
)

// Any plug-in REAPER has on a range of words, chosen by the narrator in REAPER's own FX dialog (#2251; choose_range_fx and
// range_fx_chosen in narration_range.lua, docs/research/reaper-item-fx-dialog-2026-10-24.md). Experimental (actions.go) until
// the verification pass has run them in a Windows REAPER.

// ChosenInREAPER is the chain name choose_range_fx records on the piece. RemoveFXRange, FXRangeParams, SetFXRangeParam,
// BypassFXRange and CompareFXRange take it as the chain and act on the FX the narrator chose; ApplyFXRange never does (it is
// no chain in FXChains: it does not end .RfxChain).
const ChosenInREAPER = "chosen in REAPER"

// MaxChosenFX is the most FX range_fx_chosen lists; RangeFXChoice.Truncated says it stopped there.
const MaxChosenFX = 64

// RangeFXChoosing is what choose_range_fx did: the piece it split off for the range (the item itself when the range began at
// its start), that piece's take, and the undo points it added (1). REAPER opens its dialog on the piece just after answering.
type RangeFXChoosing struct {
	ItemGUID   string
	TakeGUID   string
	UndoPoints int
}

// ChosenFX is one plug-in the narrator added in REAPER's dialog: its name as REAPER shows it ("VST: ReaEQ (Cockos)") and
// whether it is on.
type ChosenFX struct {
	Name    string
	Enabled bool
}

// RangeFXChoice is what range_fx_chosen read: the piece and its take, the FX added since the dialog opened in chain order,
// whether the take's chain window is still open, and whether the list stopped at MaxChosenFX.
type RangeFXChoice struct {
	ItemGUID  string
	TakeGUID  string
	FX        []ChosenFX
	ChainOpen bool
	Truncated bool
}

// ChooseRangeFX splits itemGUID at project seconds start and end in one undo block, with a fade of fadeMs at each new seam,
// and has REAPER open its FX dialog on the middle piece for the narrator to choose a plug-in. The same refusals as
// ApplyFXRange, without a chain name: a bad range or fade is ErrBadFXRange before anything is sent, a gone item a
// *StaleError, recording ErrRecording, and a range outside the item or a piece already carrying a chain a *RefusalError.
func (a *Actions) ChooseRangeFX(ctx context.Context, itemGUID string, start, end float64, fadeMs int) (RangeFXChoosing, error) {
	switch {
	case normalizeGUID(itemGUID) == "":
		return RangeFXChoosing{}, fmt.Errorf("%w: no item", ErrBadFXRange)
	case !finite(start) || !finite(end) || end <= start:
		return RangeFXChoosing{}, fmt.Errorf("%w: %v to %v", ErrBadFXRange, start, end)
	case fadeMs < 0 || fadeMs > MaxCutFadeMs:
		return RangeFXChoosing{}, fmt.Errorf("%w: fade %d ms", ErrBadFXRange, fadeMs)
	}
	events, err := a.request(ctx, "choose_range_fx", []string{"RANGE_FX_CHOOSING", "ITEM_STALE"},
		itemGUID, formatSeconds(start), formatSeconds(end), strconv.Itoa(fadeMs))
	if err = fxRangeRefusal(err); err != nil {
		return RangeFXChoosing{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return RangeFXChoosing{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	return RangeFXChoosing{ItemGUID: event.Fields[2], TakeGUID: event.Fields[3], UndoPoints: int(numberAt(event.Fields, 4))}, nil
}

// RangeFXChosen reads what the narrator chose on the piece itemGUID (takeGUID's take, or with "" the take ChooseRangeFX
// opened the dialog for). It changes nothing. A piece, take or record that is gone is a *StaleError (reason "item", "take"
// or "fx").
func (a *Actions) RangeFXChosen(ctx context.Context, itemGUID, takeGUID string) (RangeFXChoice, error) {
	if normalizeGUID(itemGUID) == "" {
		return RangeFXChoice{}, fmt.Errorf("%w: no item", ErrBadFXRange)
	}
	events, err := a.request(ctx, "range_fx_chosen", []string{"RANGE_FX_CHOSEN", "ITEM_STALE"}, itemGUID, takeGUID)
	if err != nil {
		return RangeFXChoice{}, err
	}
	last := events[len(events)-1]
	if last.Tag == "ITEM_STALE" {
		return RangeFXChoice{}, &StaleError{GUID: last.Fields[2], Reason: last.Fields[3]}
	}
	if !sameTake(last, itemGUID, takeGUID) {
		return RangeFXChoice{}, fmt.Errorf("REAPER answered for another piece than the one this app asked about")
	}
	got := RangeFXChoice{ItemGUID: last.Fields[2], TakeGUID: last.Fields[3], FX: []ChosenFX{}, ChainOpen: last.Fields[5] == "1", Truncated: last.Fields[6] == "1"}
	for _, event := range events {
		if event.Tag == "RANGE_FX_CHOSEN_FX" {
			got.FX = append(got.FX, ChosenFX{Name: event.Fields[3], Enabled: event.Fields[4] == "1"})
		}
	}
	if count := int(numberAt(last.Fields, 4)); count != len(got.FX) {
		return RangeFXChoice{}, fmt.Errorf("REAPER listed %d chosen FX but sent %d", count, len(got.FX))
	}
	return got, nil
}
