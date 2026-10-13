package main

import (
	"context"
	"fmt"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

const (
	// fxRangeNoComparerSentence answers a Compare on an engine whose fx_range role cannot play an effect both ways.
	fxRangeNoComparerSentence = "%s cannot play an effect on words to compare it."
	// fxRangeNotComparingSentence answers a stop when the engine has no Compare to stop.
	fxRangeNotComparingSentence = "%s was not comparing an effect, so nothing changed."
)

// DawCompareFxRange plays the words firstToken..lastToken of chapterID's stored alignment in the DAW with the chain chainName on
// and then bypassed, and puts the chain back as it was: the effect inspector's Compare (SN-E113). The words and chain resolve as
// DawFxRangeParams resolves them, and the page sends no GUID or path. The answer is the DawFxRangeCompare payload: a DawResult
// (ADR 0810) with no undo step, since the DAW's history is left as it was, and Pass, how long each pass plays in seconds, so the
// page can say which one is playing. It answers once the first pass has started. The same refusals as DawBypassFxRange, then an
// engine that cannot compare, in a sentence.
func (h *Host) DawCompareFxRange(chapterID string, firstToken int, lastToken int, chainName string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fxRangeTimeout)
	defer cancel()
	run := h.runLog.Begin("fx_range_compare", "chapter_id", chapterID)
	compare, err := dawCompareFxRangeIn(ctx, svc, resolver.Support(dawport.CapFXRange), svc.rangeFX, chapterID, firstToken, lastToken, chainName)
	endFxRangeRun(run, compare.Result, err)
	return encodeBinding(compare, err)
}

// dawCompareFxRangeIn is DawCompareFxRange with the launch's fx_range support and role given.
func dawCompareFxRangeIn(ctx context.Context, svc hostServices, support dawport.Support, applier dawport.RangeFXApplier,
	chapterID string, firstToken, lastToken int, chainName string) (dawport.FXRangeCompare, error) {
	var compare dawport.FXRangeCompare
	result, err := dawFxRangeEditIn(ctx, svc, support, applier, chapterID, firstToken, lastToken, chainName,
		func(_ dawport.RangeFXEditor, target dawport.FXRangeTarget) (dawport.Result, error) {
			comparer, ok := applier.(dawport.RangeFXComparer)
			if !ok {
				return dawport.Refused(fmt.Sprintf(fxRangeNoComparerSentence, readAloudAdapterName(svc))), nil
			}
			var err error
			compare, err = comparer.CompareFXRange(ctx, target)
			return compare.Result, err
		})
	if err != nil || !result.OK {
		return dawport.FXRangeCompare{Result: result}, err
	}
	return compare, nil
}

// DawStopFxCompare ends a Compare the DAW is playing and puts the chain back as it was. It changes nothing when none is playing.
// Refused as the Compare is when the fx_range capability is off.
func (h *Host) DawStopFxCompare() (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fxRangeTimeout)
	defer cancel()
	run := h.runLog.Begin("stop_fx_compare")
	result := dawStopFxCompareIn(ctx, svc, resolver.Support(dawport.CapFXRange), svc.rangeFX)
	endFxRangeRun(run, result, nil)
	return encodeBinding(result, nil)
}

func dawStopFxCompareIn(ctx context.Context, svc hostServices, support dawport.Support, applier dawport.RangeFXApplier) dawport.Result {
	if !support.Available {
		return dawport.Refused(support.Message)
	}
	name := readAloudAdapterName(svc)
	if applier == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message)
	}
	comparer, ok := applier.(dawport.RangeFXComparer)
	if !ok {
		return dawport.OK(fmt.Sprintf(fxRangeNotComparingSentence, name), false)
	}
	result, err := comparer.StopFXCompare(ctx)
	if err != nil {
		return fxRangeRefusal(name, err)
	}
	return result
}
