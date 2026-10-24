package reaper

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"unicode"

	"desktop/internal/dawport"
)

// The fx_range role's RangeFXChooser (#2251): any plug-in REAPER has, chosen by the narrator in REAPER's own FX dialog for a range
// of words, over bridge's choose_range_fx, range_fx_chosen and remove_fx_range under dawport.ChosenChain. The piece choose_range_fx
// answers is remembered for the launch as an apply's is, so the read, the edits and the removal name it.

var _ dawport.RangeFXChooser = rangeFXApplier{}

// ChooseFXForRange splits the request's item at both ends of the range in one undo step and has REAPER open its FX dialog on the
// middle piece (bridge's choose_range_fx). It asks allowed itself first, so a refusal is the capability's own sentence.
func (r rangeFXApplier) ChooseFXForRange(ctx context.Context, request dawport.FXRangeRequest) (dawport.Result, error) {
	if refused, ok := r.refused(); ok {
		return refused, nil
	}
	got, err := r.actions.ChooseRangeFX(ctx, request.ItemGUID, request.Start, request.End, request.FadeMs)
	if refused, ok, err := fxRangeRefused(err); ok || err != nil {
		return refused, err
	}
	r.pieces.put(keyOf(request.RangeRequest, dawport.ChosenChain), appliedPiece{item: got.ItemGUID, take: got.TakeGUID})
	message := fmt.Sprintf("REAPER's FX window is open for %s. Choose an effect there, then come back here.", wordsOf(request.Words))
	return dawport.OK(message, true).WithUndoSteps(got.UndoPoints), nil
}

// ChosenFXForRange reads the plug-ins the narrator chose on the target's piece (bridge's range_fx_chosen). It changes nothing.
func (r rangeFXApplier) ChosenFXForRange(ctx context.Context, target dawport.FXRangeTarget) (dawport.FXRangeChoice, error) {
	none := func(result dawport.Result, err error) (dawport.FXRangeChoice, error) {
		return dawport.FXRangeChoice{Result: result, FX: []dawport.ChosenFX{}}, err
	}
	if refused, ok := r.refused(); ok {
		return none(refused, nil)
	}
	target.ChainName = dawport.ChosenChain
	piece := r.pieces.find(target)
	got, err := r.actions.RangeFXChosen(ctx, piece.item, piece.take)
	if refused, ok, err := r.fxEditRefused(piece, dawport.ChosenChain, err); ok || err != nil {
		return none(refused, err)
	}
	choice := dawport.FXRangeChoice{FX: make([]dawport.ChosenFX, len(got.FX)), ChainOpen: got.ChainOpen, Truncated: got.Truncated}
	names := make([]string, len(got.FX))
	for i, fx := range got.FX {
		choice.FX[i] = dawport.ChosenFX{Name: fx.Name, Enabled: fx.Enabled}
		names[i] = plainFXName(fx.Name)
	}
	choice.Label = strings.Join(names, ", ")
	switch len(names) {
	case 0:
		choice.Result = dawport.OK("Nothing is chosen in REAPER for these words yet.", false)
	case 1:
		choice.Result = dawport.OK("REAPER has "+choice.Label+" on the words.", false)
	default:
		choice.Result = dawport.OK(fmt.Sprintf("REAPER has %d effects on the words: %s.", len(names), choice.Label), false)
	}
	return choice, nil
}

// RemoveChosenFX takes the chosen plug-ins off the target's piece and joins it back to its neighbours in one undo step, also when
// nothing was chosen (bridge's remove_fx_range under ChosenChain).
func (r rangeFXApplier) RemoveChosenFX(ctx context.Context, target dawport.FXRangeTarget) (dawport.Result, error) {
	if refused, ok := r.refused(); ok {
		return refused, nil
	}
	target.ChainName = dawport.ChosenChain
	piece := r.pieces.find(target)
	got, err := r.actions.RemoveFXRange(ctx, piece.item, dawport.ChosenChain)
	if refused, ok, err := fxRangeRefused(err); ok || err != nil {
		return refused, err
	}
	r.pieces.forget(piece.item, dawport.ChosenChain)
	if got.UndoPoints == 0 {
		return dawport.OK("Nothing chosen in REAPER is on those words, so nothing changed.", false), nil
	}
	return dawport.OK("The effect chosen in REAPER is off the words, and the audio is joined again.", true).WithUndoSteps(got.UndoPoints), nil
}

// fxTypePrefix is the plug-in type REAPER puts before a plug-in's name ("VST: ", "VST3i: ", "JS: ", "CLAP: ").
var fxTypePrefix = regexp.MustCompile(`^[A-Za-z0-9]{1,8}: `)

// plainFXName is a plug-in's name as the page shows and keeps it: without REAPER's type prefix, and with a colon, backslash, slash or
// control character made a space, so it can never read as a path (editlog's listName).
func plainFXName(name string) string {
	return strings.Map(func(r rune) rune {
		if r == ':' || r == '\\' || r == '/' || unicode.IsControl(r) {
			return ' '
		}
		return r
	}, fxTypePrefix.ReplaceAllString(name, ""))
}

// wordsOf words a count of words as chainAddedMessage does.
func wordsOf(words int) string {
	switch {
	case words <= 0:
		return "the words"
	case words == 1:
		return "1 word"
	default:
		return fmt.Sprintf("%d words", words)
	}
}
