package main

import (
	"context"
	"fmt"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// repairClickTimeout bounds one repair_click request with the chapter_track_state read before it: a single undo block in REAPER,
// like reduce_range_gain.
const repairClickTimeout = reduceRangeGainTimeout

const (
	clickBadSentence       = "The clicks to repair must be 1 to 500 clicks of the take, each ending after it starts and at most 50 ms long."
	clickTakeStaleSentence = "That take is no longer on this chapter's track in the %s project, so no click was repaired. Read the project again."
	clickOutsideSentence   = "A click to repair is no longer inside that take in the %s project, so no click was repaired. Read the project again."
)

// DawClick is a click in a take to repair: start to end seconds into the take's own audio file, at most 50 ms long.
type DawClick struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

// DawRepairClick smooths clicks, each a few milliseconds of takeID, a take of chapterID, in one undo step of the DAW's own
// (SN-E101: Clean up's Clicks, "Repair the click"). Each click is in the take's own seconds, the time in its audio file. takeID is
// the take's id as the DAW reports it on the chapter's one linked track now (chapter_track_state): the host looks it up there,
// checks every click is inside the part of the file the take plays, and sends the item and take it read itself, so an id is never
// sent to the DAW as given (threat model row 5f). The answer is a DawResult (ADR 0810): the click_repair capability's own sentence
// when the resolver refuses it (a standalone launch, a DAW not answering, Experimental actions off, the toggle off), checked first;
// no live adapter is refused in a sentence; clicks out of bounds are refused; a take the track no longer holds or a click outside
// it is refused with code stale. Nothing is sent to the DAW on any of them. A take that changed between the read and the DAW's own
// check is the DAW's stale refusal, and nothing changes.
func (h *Host) DawRepairClick(chapterID string, takeID string, clicks []DawClick) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), repairClickTimeout)
	defer cancel()
	run := h.runLog.Begin("repair_click", "chapter_id", chapterID)
	live := h.stackSourcesIn(svc, resolver.Support(dawport.CapTrackState)).live
	result, err := dawRepairClickIn(ctx, readAloudAdapterName(svc), resolver.Support(dawport.CapClickRepair), svc.clickRepairer, live,
		chapterID, takeID, clicks)
	endStackRun(run, result, err)
	return encodeBinding(result, err)
}

// dawRepairClickIn is DawRepairClick with the launch's click_repair support, the engine's role (nil with no live adapter) and the
// track read given. name is the engine's name for the sentences.
func dawRepairClickIn(ctx context.Context, name string, support dawport.Support, repairer dawport.ClickRepairer, live splitLive,
	chapterID, takeID string, clicks []DawClick) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	if repairer == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	if len(clicks) == 0 || len(clicks) > dawport.MaxClicks {
		return dawport.Refused(clickBadSentence), nil
	}
	request := dawport.ClickRepairRequest{ChapterID: chapterID, Clicks: make([]dawport.Click, len(clicks))}
	for i, click := range clicks {
		request.Clicks[i] = dawport.Click{Start: click.Start, End: click.End}
		if !bridge.ClickInShape(request.Clicks[i]) {
			return dawport.Refused(clickBadSentence), nil
		}
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
		return dawport.RefusedStale(fmt.Sprintf(clickTakeStaleSentence, name)), nil
	}
	// The part of its file the take plays: from its offset for the item's length, at its rate (1 when the read did not report one).
	rate := take.PlayRate
	if rate <= 0 {
		rate = 1
	}
	first, last := take.SourceOffset, take.SourceOffset+take.Length*rate
	for _, click := range request.Clicks {
		if click.Start < first-gainTolerance || click.End > last+gainTolerance {
			return dawport.RefusedStale(fmt.Sprintf(clickOutsideSentence, name)), nil
		}
	}
	request.ItemGUID, request.TakeGUID = take.ItemGUID, take.TakeGUID
	result, err := repairer.RepairClick(ctx, request)
	if err != nil {
		return splitRefusal(name, err), nil
	}
	return result, nil
}
