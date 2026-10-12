package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
	"github.com/countrymanprime/narration-utils/shell/internal/passagetakes"
)

// deleteRangeTimeout bounds one delete_range request: a single undo block in REAPER, like hide_takes.
const deleteRangeTimeout = takeReviewCreateTakeTimeout

const (
	// The mode, fade, pad and room-tone sentences are delete_range's own (bridge's badRange), so the page reads the same words whichever side refused.
	cutBadModeSentence    = "The cut mode must be close or gap."
	cutBadFadeSentence    = "The fade must be a whole number of milliseconds from 0 to 500."
	cutBadPadSentence     = "The pad must be from 0 to 500 milliseconds."
	cutRoomToneSentence   = "Room tone fills a gap that keeps its length, so it needs the gap mode."
	cutPadAllSentence     = "The pad leaves nothing to cut."
	cutAlreadyCutSentence = "These words are already cut, so nothing was changed."
)

// DawDeleteRange cuts the words firstToken..lastToken of chapterID's stored alignment together with their audio (SND-6b, ADR
// 0860 point 2; the Studio Next mock's deleteRange): the DAW splits the item at both ends of the range and moves the middle
// piece aside, and mode "close" moves the later audio up while "gap" leaves the length. fadeMs is the fade at each seam; padMs
// (0 to 500) cuts that much less at each end of the words' audio; roomTone (gap only) fills the gap with the chapter's room
// tone, which an engine with none refuses, cutting nothing (SN-E97). The page sends a chapter id, two token indices, and the
// mode, fade, pad and room-tone choice, never a GUID or a time: the item and its project seconds are resolved here from the
// stored alignment and the saved project (ADR 0242; threat model row 5f), and one request is one item (ADR 0705). The answer is
// a DawResult (ADR 0810): the cut_range capability's own sentence when the resolver refuses it (a standalone launch, a DAW not
// answering, Experimental actions off, the toggle off, an engine that cannot cut yet), checked first; then a mode, fade or pad
// delete_range does not take, or room tone with "close"; then the range's own refusals (passagetakes.ResolveRange: words not
// heard, two items, and a range or item that is stale with code stale); words every one of which the edit log already holds as
// cut are a no-op, changed false. Nothing is sent to the DAW on any of them. A chapter the manuscript does not have has no
// stored alignment, so it is the stale refusal too.
func (h *Host) DawDeleteRange(chapterID string, firstToken int, lastToken int, mode string, fadeMs int, padMs int, roomTone bool) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), deleteRangeTimeout)
	defer cancel()
	run := h.runLog.Begin("delete_range", "chapter_id", chapterID)
	result, err := dawDeleteRangeIn(ctx, svc, resolver.Support(dawport.CapCutRange), svc.rangeCutter, h.editLog(), chapterID, firstToken, lastToken, mode, fadeMs, padMs, roomTone)
	switch {
	case err != nil:
		run.End("error")
	case result.Refused != "":
		run.End("refused")
	default:
		run.End("ok")
	}
	return encodeBinding(result, err)
}

// dawDeleteRangeIn is DawDeleteRange with the launch's cut_range support, role and edit log given. cutter is nil with no
// live adapter.
func dawDeleteRangeIn(ctx context.Context, svc hostServices, support dawport.Support, cutter dawport.RangeCutter, cuts *editlog.Service,
	chapterID string, firstToken, lastToken int, mode string, fadeMs, padMs int, roomTone bool) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	cutMode := dawport.CutMode(mode)
	if cutMode != dawport.CutClose && cutMode != dawport.CutGap {
		return dawport.Refused(cutBadModeSentence), nil
	}
	if fadeMs < 0 || fadeMs > bridge.MaxCutFadeMs {
		return dawport.Refused(cutBadFadeSentence), nil
	}
	if padMs < 0 || padMs > dawport.MaxCutPadMs {
		return dawport.Refused(cutBadPadSentence), nil
	}
	if roomTone && cutMode != dawport.CutGap {
		return dawport.Refused(cutRoomToneSentence), nil
	}
	if svc.coverage == nil {
		return dawport.Result{}, errNoProject
	}
	view, err := svc.coverage.Alignment(chapterID, coverageSettings(svc.settings).Alignment)
	if err != nil {
		return dawport.Result{}, err
	}
	resolved, refused := passagetakes.ResolveRange(view, chapterID, firstToken, lastToken)
	if refused != nil {
		return *refused, nil
	}
	stored, err := cuts.CutsList(chapterID)
	if err != nil {
		return dawport.Result{}, err
	}
	if resolved.AllCut(cutHolds(stored)) {
		return dawport.OK(cutAlreadyCutSentence, false), nil
	}
	name := readAloudAdapterName(svc)
	if cutter == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	request := dawport.DeleteRangeRequest{RangeRequest: resolved.Request, Mode: cutMode, FadeMs: fadeMs, PadMs: padMs, RoomTone: roomTone}
	if _, ok := request.Padded(); !ok {
		return dawport.Refused(cutPadAllSentence), nil
	}
	result, err := cutter.DeleteRange(ctx, request)
	if err != nil {
		return cutRefusal(name, err), nil
	}
	return result, nil
}

const (
	trimBadRangeSentence  = "The gap to shorten is not a usable pair of times, so nothing was changed."
	trimItemStaleSentence = "That gap's item is no longer on this chapter's track in the %s project, so nothing was shortened. Read the project again."
	trimOutsideSentence   = "That gap is no longer inside its item in the %s project, so nothing was shortened. Read the project again."
	trimDoneSentence      = "Shortened the gap in %s."
)

// DawTrimRange shortens a gap between words: it hides start..end project seconds of itemID, an item of chapterID, with fadeMs (0 to
// 500) at the seam (SN-E112: Clean up's Gaps, "Shorten to N s"). It is the cut_range role's DeleteRange with no words, no pad and
// no room tone, in mode close: the piece goes to the muted Cuts track and the audio after it moves up; nothing is deleted. itemID
// is the item's id as the finding recorded it: the host looks it up on the chapter's one linked track as the DAW reports it now
// (chapter_track_state), checks the gap is inside it, and sends the item it read itself, so an id is never sent to the DAW as
// given (threat model row 5f). A trim splits its item, so the page sends a chapter's trims latest first. The answer is a DawResult
// (ADR 0810): the cut_range capability's own sentence when the resolver refuses it, checked first; no live adapter is refused in a
// sentence; times or a fade out of bounds are refused; an item the track no longer holds or a gap outside it is refused with code
// stale. Nothing is sent to the DAW on any of them.
func (h *Host) DawTrimRange(chapterID string, itemID string, start float64, end float64, fadeMs int) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), deleteRangeTimeout)
	defer cancel()
	run := h.runLog.Begin("trim_range", "chapter_id", chapterID)
	live := h.stackSourcesIn(svc, resolver.Support(dawport.CapTrackState)).live
	result, err := dawTrimRangeIn(ctx, readAloudAdapterName(svc), resolver.Support(dawport.CapCutRange), svc.rangeCutter, live,
		chapterID, itemID, start, end, fadeMs)
	endStackRun(run, result, err)
	return encodeBinding(result, err)
}

// dawTrimRangeIn is DawTrimRange with the launch's cut_range support, the engine's role (nil with no live adapter) and the track
// read given. name is the engine's name for the sentences.
func dawTrimRangeIn(ctx context.Context, name string, support dawport.Support, cutter dawport.RangeCutter, live splitLive,
	chapterID, itemID string, start, end float64, fadeMs int) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	if cutter == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	if !(start >= 0) || math.IsInf(end, 0) || !(end > start) {
		return dawport.Refused(trimBadRangeSentence), nil
	}
	if fadeMs < 0 || fadeMs > bridge.MaxCutFadeMs {
		return dawport.Refused(cutBadFadeSentence), nil
	}
	items, refused, err := live(ctx, chapterID)
	if err != nil {
		return splitRefusal(name, err), nil
	}
	if refused != nil {
		return *refused, nil
	}
	wanted := splitGUID(itemID)
	var item *dawport.TrackItem
	for i := range items {
		if wanted != "" && splitGUID(items[i].ItemGUID) == wanted {
			item = &items[i]
			break
		}
	}
	if item == nil {
		return dawport.RefusedStale(fmt.Sprintf(trimItemStaleSentence, name)), nil
	}
	if start < item.Position-gainTolerance || end > item.Position+item.Length+gainTolerance {
		return dawport.RefusedStale(fmt.Sprintf(trimOutsideSentence, name)), nil
	}
	request := dawport.DeleteRangeRequest{RangeRequest: dawport.RangeRequest{ChapterID: chapterID, ItemGUID: item.ItemGUID, Start: start, End: end},
		Mode: dawport.CutClose, FadeMs: fadeMs}
	result, err := cutter.DeleteRange(ctx, request)
	if err != nil {
		return cutRefusal(name, err), nil
	}
	if result.OK && result.Changed {
		result.Message = fmt.Sprintf(trimDoneSentence, name)
	}
	return result, nil
}

// cutHolds answers whether a word is in one of the chapter's stored cuts whose words still match the manuscript. A cut's
// keys are editlog's `paragraphId:ordinal`.
func cutHolds(stored editlog.Cuts) func(passagetakes.Word) bool {
	held := map[passagetakes.Word]bool{}
	for _, cut := range stored.Cuts {
		if cut.Stale {
			continue
		}
		for _, key := range cut.Keys {
			at := strings.LastIndexByte(key, ':')
			if at < 0 {
				continue
			}
			if ordinal, err := strconv.Atoi(key[at+1:]); err == nil {
				held[passagetakes.Word{ParagraphID: key[:at], Ordinal: ordinal}] = true
			}
		}
	}
	return func(word passagetakes.Word) bool { return held[word] }
}

// cutRefusal words an error the role returned rather than answered: the role answers its own refusals as a Result, so
// these are a capability refusal, the bridge not answering, or no answer in time.
func cutRefusal(name string, err error) dawport.Result {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused
	}
	switch {
	case errors.Is(err, bridge.ErrNoAnswer):
		return dawport.Refused(readAloudConnectionRefusal(name, reaperNotRunning).Message)
	case errors.Is(err, bridge.ErrUnavailable):
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message)
	case errors.Is(err, context.DeadlineExceeded):
		return dawport.Refused(fmt.Sprintf("%s did not answer the cut within %d seconds. Check the project before trying again.", name, int(deleteRangeTimeout.Seconds())))
	}
	return dawport.Refused(fmt.Sprintf("%s could not cut the words: %s.", name, err.Error()))
}
