package main

import (
	"context"
	"fmt"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// fxRangeNoChooserSentence answers Choose in the DAW on an engine whose fx_range role has no FX dialog of its own to open.
const fxRangeNoChooserSentence = "%s has no FX window of its own the app can open for words."

// DawChooseFxForRange has the DAW open its own FX window for the words firstToken..lastToken of chapterID's stored alignment, so the
// narrator can put any plug-in the DAW has on them (#2251, the Effects tab's Choose in REAPER): the DAW splits the item at both ends
// of the range, with fadeMs at each new seam, in one undo step, and opens the window on the middle piece. The page sends a chapter id,
// two token indices and the fade, never a GUID, a time, a path or a plug-in's name. The answer is a DawResult with the same refusals as
// DawApplyFxToRange (the capability, the fade, the range), then an engine with no such window. Nothing is recorded: the page reads the
// choice back with DawChosenFxForRange and records it once the narrator has chosen.
func (h *Host) DawChooseFxForRange(chapterID string, firstToken int, lastToken int, fadeMs int) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fxRangeTimeout)
	defer cancel()
	run := h.runLog.Begin("choose_range_fx", "chapter_id", chapterID)
	result, err := dawChooseFxForRangeIn(ctx, svc, resolver.Support(dawport.CapFXRange), svc.rangeFX, chapterID, firstToken, lastToken, fadeMs)
	endFxRangeRun(run, result, err)
	return encodeBinding(result, err)
}

// DawChosenFxForRange reads the plug-ins the narrator chose in the DAW's own FX window for the words (DawChooseFxForRange), with
// their names joined as the page shows and keeps them and whether the window is still open. It changes nothing. The same refusals
// as DawFxRangeParams; a refusal has no plug-ins.
func (h *Host) DawChosenFxForRange(chapterID string, firstToken int, lastToken int) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fxRangeTimeout)
	defer cancel()
	run := h.runLog.Begin("range_fx_chosen", "chapter_id", chapterID)
	choice, err := dawChosenFxForRangeIn(ctx, svc, resolver.Support(dawport.CapFXRange), svc.rangeFX, chapterID, firstToken, lastToken)
	endFxRangeRun(run, choice.Result, err)
	return encodeBinding(choice, err)
}

// dawChooseFxForRangeIn is DawChooseFxForRange with the launch's fx_range support and role given.
func dawChooseFxForRangeIn(ctx context.Context, svc hostServices, support dawport.Support, applier dawport.RangeFXApplier,
	chapterID string, firstToken, lastToken, fadeMs int) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	if fadeMs < 0 || fadeMs > bridge.MaxCutFadeMs {
		return dawport.Refused(cutBadFadeSentence), nil
	}
	resolved, refused, err := resolveFxRange(svc, chapterID, firstToken, lastToken)
	if err != nil || refused != nil {
		return refusedOr(refused), err
	}
	chooser, refusal := chooserOf(svc, applier)
	if chooser == nil {
		return refusal, nil
	}
	request := dawport.FXRangeRequest{RangeRequest: resolved.Request, ChainID: dawport.ChosenChain, ChainName: dawport.ChosenChain, FadeMs: fadeMs}
	result, err := chooser.ChooseFXForRange(ctx, request)
	if err != nil {
		return fxRangeRefusal(readAloudAdapterName(svc), err), nil
	}
	return result, nil
}

// dawChosenFxForRangeIn is DawChosenFxForRange with the launch's fx_range support and role given.
func dawChosenFxForRangeIn(ctx context.Context, svc hostServices, support dawport.Support, applier dawport.RangeFXApplier,
	chapterID string, firstToken, lastToken int) (dawport.FXRangeChoice, error) {
	none := func(result dawport.Result, err error) (dawport.FXRangeChoice, error) {
		return dawport.FXRangeChoice{Result: result, FX: []dawport.ChosenFX{}}, err
	}
	if !support.Available {
		return none(dawport.Refused(support.Message), nil)
	}
	resolved, refused, err := resolveFxRange(svc, chapterID, firstToken, lastToken)
	if err != nil || refused != nil {
		return none(refusedOr(refused), err)
	}
	chooser, refusal := chooserOf(svc, applier)
	if chooser == nil {
		return none(refusal, nil)
	}
	choice, err := chooser.ChosenFXForRange(ctx, dawport.FXRangeTarget{RangeRequest: resolved.Request, ChainName: dawport.ChosenChain})
	if err != nil {
		return none(fxRangeRefusal(readAloudAdapterName(svc), err), nil)
	}
	if choice.FX == nil {
		choice.FX = []dawport.ChosenFX{}
	}
	return choice, nil
}

// chooserOf is the fx_range role's RangeFXChooser, or nil and the refusal for no live role or a role with no FX window.
func chooserOf(svc hostServices, applier dawport.RangeFXApplier) (dawport.RangeFXChooser, dawport.Result) {
	name := readAloudAdapterName(svc)
	if applier == nil {
		return nil, dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message)
	}
	chooser, ok := applier.(dawport.RangeFXChooser)
	if !ok {
		return nil, dawport.Refused(fmt.Sprintf(fxRangeNoChooserSentence, name))
	}
	return chooser, dawport.Result{}
}
