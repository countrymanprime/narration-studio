package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// splitTakeTimeout bounds one split_take request with the chapter_track_state read before it: a single undo block in REAPER,
// like stack_takes.
const splitTakeTimeout = stackTakesTimeout

const (
	splitNoTimeSentence     = "A take can only be split at a time in the chapter."
	splitTakeStaleSentence  = "That take is no longer on this chapter's track in the %s project, so nothing was split. Read the project again."
	splitOutsideSentence    = "The cut is no longer inside that take in the %s project, so nothing was split. Read the project again."
	splitNoAnswerSentence   = "%s did not answer the split within %d seconds. Check the project before trying again."
	splitTakeNotDoneMessage = "%s could not split the take: %s."
)

// DawSplitTake cuts takeID, a take of chapterID that reads its line twice, into two takes of one item at at seconds into the
// chapter, in one undo step of the DAW's own (SN-E94; the Studio Next mock's splitTake, the page's splitCommand). takeID is the
// take's id as the DAW reports it on the chapter's one linked track now (chapter_track_state): the host looks it up there,
// checks the cut is inside that take, and sends the item and take it read itself, so an id is never sent to the DAW as given
// (threat model row 5f). The answer is a DawResult (ADR 0810): the takes capability's own sentence when the resolver refuses it
// (a standalone launch, a DAW not answering, Experimental actions off, the toggle off), checked first; an engine whose takes role
// cannot split, or no live adapter, is refused in a sentence; a time that is not one, a take the track no longer holds or a cut
// outside it is refused (code stale for the last two). Nothing is sent to the DAW on any of them. A take that changed between the
// read and the DAW's own check is the DAW's stale refusal, and nothing changes.
func (h *Host) DawSplitTake(chapterID string, takeID string, at float64) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), splitTakeTimeout)
	defer cancel()
	run := h.runLog.Begin("split_take", "chapter_id", chapterID)
	var splitter dawport.TakeSplitter
	if svc.takeSelector != nil {
		splitter, _ = svc.takeSelector.(dawport.TakeSplitter)
	}
	live := h.stackSourcesIn(svc, resolver.Support(dawport.CapTrackState)).live
	result, err := dawSplitTakeIn(ctx, readAloudAdapterName(svc), resolver.Support(dawport.CapTakes), splitter, live, chapterID, takeID, at)
	endStackRun(run, result, err)
	return encodeBinding(result, err)
}

// splitLive reads chapterID's track as the DAW reports it now, or answers the refusal for a chapter whose track cannot be read.
type splitLive func(ctx context.Context, chapterID string) ([]dawport.TrackItem, *dawport.Result, error)

// dawSplitTakeIn is DawSplitTake with the launch's takes support, the engine's split role (nil with no live adapter or an
// engine that cannot split) and the track read given. name is the engine's name for the sentences.
func dawSplitTakeIn(ctx context.Context, name string, support dawport.Support, splitter dawport.TakeSplitter, live splitLive,
	chapterID, takeID string, at float64) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	if splitter == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	if math.IsNaN(at) || math.IsInf(at, 0) || at < 0 {
		return dawport.Refused(splitNoTimeSentence), nil
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
		return dawport.RefusedStale(fmt.Sprintf(splitTakeStaleSentence, name)), nil
	}
	if at <= take.Position || at >= take.Position+take.Length {
		return dawport.RefusedStale(fmt.Sprintf(splitOutsideSentence, name)), nil
	}
	result, err := splitter.SplitTake(ctx, take.ItemGUID, take.TakeGUID, at)
	if err != nil {
		return splitRefusal(name, err), nil
	}
	return result, nil
}

// splitGUID compares take ids as the DAW writes GUIDs: braces and case aside.
func splitGUID(id string) string { return strings.ToUpper(strings.Trim(strings.TrimSpace(id), "{}")) }

// splitRefusal words an error the track read or the role returned rather than answered, as stackRefusal does: a capability
// refusal, a track that is gone, the bridge not answering, or no answer in time.
func splitRefusal(name string, err error) dawport.Result {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused
	}
	var trackStale *bridge.TrackStaleError
	switch {
	case errors.As(err, &trackStale):
		return dawport.RefusedStale(fmt.Sprintf(stackTrackStaleSentence, name))
	case errors.Is(err, bridge.ErrNoAnswer):
		return dawport.Refused(readAloudConnectionRefusal(name, reaperNotRunning).Message)
	case errors.Is(err, bridge.ErrUnavailable):
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message)
	case errors.Is(err, bridge.ErrExperimentalOff):
		return dawport.Refused(err.Error())
	case errors.Is(err, context.DeadlineExceeded):
		return dawport.Refused(fmt.Sprintf(splitNoAnswerSentence, name, int(splitTakeTimeout.Seconds())))
	}
	return dawport.Refused(fmt.Sprintf(splitTakeNotDoneMessage, name, err.Error()))
}
