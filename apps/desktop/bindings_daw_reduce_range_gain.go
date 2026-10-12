package main

import (
	"context"
	"fmt"
	"math"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// reduceRangeGainTimeout bounds one reduce_range_gain request with the chapter_track_state read before it: a single undo block in
// REAPER, like split_take.
const reduceRangeGainTimeout = splitTakeTimeout

const (
	gainBadDBSentence        = "A stretch can only be lowered by 1 to 24 dB."
	gainBadStretchesSentence = "The stretches to lower must be 1 to 500 stretches of the take, each ending after it starts."
	gainTakeStaleSentence    = "That take is no longer on this chapter's track in the %s project, so nothing was lowered. Read the project again."
	gainOutsideSentence      = "A stretch to lower is no longer inside that take in the %s project, so nothing was lowered. Read the project again."
)

// DawGainStretch is a stretch of a take to lower: start to end seconds into the take's own audio file.
type DawGainStretch struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

// DawReduceRangeGain lowers stretches of takeID, a take of chapterID, by reduceDb (1 to 24) in one undo step of the DAW's own
// (SN-E100: Clean up's Breaths, Plosives and Noise, "Reduce by N dB"). Each stretch is in the take's own seconds, the time in its
// audio file. takeID is the take's id as the DAW reports it on the chapter's one linked track now (chapter_track_state): the host
// looks it up there, checks every stretch is inside the part of the file the take plays, and sends the item and take it read
// itself, so an id is never sent to the DAW as given (threat model row 5f). The answer is a DawResult (ADR 0810): the range_gain
// capability's own sentence when the resolver refuses it (a standalone launch, a DAW not answering, Experimental actions off, the
// toggle off), checked first; no live adapter is refused in a sentence; a reduction or stretches out of bounds are refused; a take
// the track no longer holds or a stretch outside it is refused with code stale. Nothing is sent to the DAW on any of them. A take
// that changed between the read and the DAW's own check is the DAW's stale refusal, and nothing changes.
func (h *Host) DawReduceRangeGain(chapterID string, takeID string, stretches []DawGainStretch, reduceDb float64) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), reduceRangeGainTimeout)
	defer cancel()
	run := h.runLog.Begin("reduce_range_gain", "chapter_id", chapterID)
	live := h.stackSourcesIn(svc, resolver.Support(dawport.CapTrackState)).live
	result, err := dawReduceRangeGainIn(ctx, readAloudAdapterName(svc), resolver.Support(dawport.CapRangeGain), svc.rangeGain, live,
		chapterID, takeID, stretches, reduceDb)
	endStackRun(run, result, err)
	return encodeBinding(result, err)
}

// dawReduceRangeGainIn is DawReduceRangeGain with the launch's range_gain support, the engine's role (nil with no live adapter)
// and the track read given. name is the engine's name for the sentences.
func dawReduceRangeGainIn(ctx context.Context, name string, support dawport.Support, reducer dawport.RangeGainReducer, live splitLive,
	chapterID, takeID string, stretches []DawGainStretch, reduceDB float64) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	if reducer == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	if math.IsNaN(reduceDB) || reduceDB < dawport.MinReduceDB || reduceDB > dawport.MaxReduceDB {
		return dawport.Refused(gainBadDBSentence), nil
	}
	if len(stretches) == 0 || len(stretches) > dawport.MaxGainStretches {
		return dawport.Refused(gainBadStretchesSentence), nil
	}
	request := dawport.RangeGainRequest{ChapterID: chapterID, ReduceDB: reduceDB, Stretches: make([]dawport.GainStretch, len(stretches))}
	for i, stretch := range stretches {
		if !(stretch.Start >= 0) || math.IsInf(stretch.End, 0) || !(stretch.End > stretch.Start) {
			return dawport.Refused(gainBadStretchesSentence), nil
		}
		request.Stretches[i] = dawport.GainStretch{Start: stretch.Start, End: stretch.End}
	}
	items, refused, err := live(ctx, chapterID)
	if err != nil {
		return splitRefusal(name, err), nil
	}
	if refused != nil {
		return *refused, nil
	}
	wanted := splitGUID(takeID)
	var take *dawport.TrackItem
	for i := range items {
		if wanted != "" && splitGUID(items[i].TakeGUID) == wanted {
			take = &items[i]
			break
		}
	}
	if take == nil {
		return dawport.RefusedStale(fmt.Sprintf(gainTakeStaleSentence, name)), nil
	}
	// The part of its file the take plays: from its offset for the item's length, at its rate (1 when the read did not report one).
	rate := take.PlayRate
	if rate <= 0 {
		rate = 1
	}
	first, last := take.SourceOffset, take.SourceOffset+take.Length*rate
	for _, stretch := range request.Stretches {
		if stretch.Start < first-gainTolerance || stretch.End > last+gainTolerance {
			return dawport.RefusedStale(fmt.Sprintf(gainOutsideSentence, name)), nil
		}
	}
	request.ItemGUID, request.TakeGUID = take.ItemGUID, take.TakeGUID
	result, err := reducer.ReduceRangeGain(ctx, request)
	if err != nil {
		return splitRefusal(name, err), nil
	}
	return result, nil
}

// gainTolerance is how far past the take's edges a stretch may reach and still be inside it: the track read's six decimals.
const gainTolerance = 0.000001
