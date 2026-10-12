package main

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/measure"
	"github.com/countrymanprime/narration-utils/shell/internal/zerocross"
)

// The alignment port's snap (ADR 0855): a cut point in an item's source moved to the nearest zero crossing within
// 2 ms, computed here from the item's audio (internal/zerocross). The page sends a chapter id, an item GUID and a
// time; the host resolves the GUID against the chapter's stored alignment and the saved project to the take's source
// file, and reads only the few milliseconds around the time. The page never sends a path (docs/architecture/reaper-navigation.md).

// workspaceSnapTimeout bounds one call: the read is a few kilobytes, so this only guards a stalled disk.
const workspaceSnapTimeout = 5 * time.Second

const (
	snapOutcomeSnapped = "snapped"
	snapOutcomeRefused = "refused"

	refusedSnapNoAudio    = "no_audio"
	refusedSnapSilent     = "silent"
	refusedSnapNoCrossing = "no_crossing"

	messageSnapNoTrack    = "This chapter has no checked track in REAPER to cut. Run the check first."
	messageSnapStale      = "This item is no longer in the REAPER project as it was checked, so the cut was not moved. Run the check again to find it where it is now."
	messageSnapNoSource   = "This item's source audio was not found, so the cut was not moved."
	messageSnapNotWAV     = "This item's source is not a WAV, so the cut was not moved."
	messageSnapUnreadable = "This item's source audio could not be read, so the cut was not moved."
	messageSnapNoAudio    = "There is no audio at this time in the item's source, so the cut was not moved."
	messageSnapSilent     = "The audio here is silent, so there is no zero crossing to move the cut to. It stays where it is."
	messageSnapNoCrossing = "The audio has no zero crossing within 2 ms of this cut, so it stays where it is."
)

// WorkspaceSnapResult is WorkspaceSnap's answer. Outcome "snapped": Time is the cut on the nearest zero crossing, in
// seconds of the item's source, and Moved is Time minus SourceTime (signed, within 2 ms; 0 on a crossing). Outcome
// "refused": Time is SourceTime, Moved 0, and Reason and Message say why the cut did not move.
type WorkspaceSnapResult struct {
	ChapterID  string  `json:"chapterId"`
	ItemGUID   string  `json:"itemGuid"`
	SourceTime float64 `json:"sourceTime"`
	Outcome    string  `json:"outcome"`
	Time       float64 `json:"time"`
	Moved      float64 `json:"moved"`
	Reason     string  `json:"reason,omitempty"`
	Message    string  `json:"message,omitempty"`
}

// WorkspaceSnap moves sourceTime, a cut point in seconds of itemGUID's source, to the nearest zero crossing of that
// source's audio within 2 ms. It refuses, reading nothing, a chapter with no checked track, an item GUID the chapter's
// alignment or the saved project no longer has, and an item whose source file is missing; and refuses, leaving the
// time, a source that is not a WAV, a time past its end, and a window that is silent or has no crossing. A negative or
// non-finite time is the caller's error, as is no project.
func (h *Host) WorkspaceSnap(chapterID string, itemGUID string, sourceTime float64) (string, error) {
	return h.workspaceSnap(zerocross.FileDecoder{}, chapterID, itemGUID, sourceTime)
}

func (h *Host) workspaceSnap(decoder zerocross.Decoder, chapterID, itemGUID string, sourceTime float64) (string, error) {
	svc := h.services()
	if svc.coverage == nil {
		return "", errNoProject
	}
	if math.IsNaN(sourceTime) || math.IsInf(sourceTime, 0) || sourceTime < 0 {
		return "", zerocross.ErrBadTime
	}
	refuse := func(reason, message string) (string, error) {
		return encodeBinding(WorkspaceSnapResult{
			ChapterID: chapterID, ItemGUID: itemGUID, SourceTime: sourceTime, Outcome: snapOutcomeRefused,
			Time: sourceTime, Reason: reason, Message: message,
		}, nil)
	}
	if svc.coverage.ChapterTrackGUID(chapterID) == "" {
		return refuse(refusedNoTrack, messageSnapNoTrack)
	}
	view, err := svc.coverage.Alignment(chapterID, coverageSettings(svc.settings).Alignment)
	if err != nil {
		return "", err
	}
	live := false
	for _, item := range view.Items {
		if item.ItemGUID == itemGUID && item.Live {
			live = true
			break
		}
	}
	if !live {
		return refuse(refusedStale, messageSnapStale)
	}
	project, err := h.tracksList()
	if err != nil {
		return "", err
	}
	_, projectItem, ok := project.ItemByGUID(itemGUID)
	if !ok {
		return refuse(refusedStale, messageSnapStale)
	}
	take := projectItem.Active()
	if take.SourceFile == "" || !take.SourceAvailable {
		return refuse(refusedSnapNoAudio, messageSnapNoSource)
	}

	ctx, cancel := context.WithTimeout(context.Background(), workspaceSnapTimeout)
	defer cancel()
	snapped, err := zerocross.Snap(ctx, decoder, take.SourceFile, sourceTime)
	switch {
	case errors.Is(err, measure.ErrNotWAV):
		return refuse(refusedSnapNoAudio, messageSnapNotWAV)
	case err != nil:
		return refuse(refusedSnapNoAudio, messageSnapUnreadable)
	}
	switch snapped.Reason {
	case zerocross.ReasonNoAudio:
		return refuse(refusedSnapNoAudio, messageSnapNoAudio)
	case zerocross.ReasonSilent:
		return refuse(refusedSnapSilent, messageSnapSilent)
	case zerocross.ReasonNoCrossing:
		return refuse(refusedSnapNoCrossing, messageSnapNoCrossing)
	}
	return encodeBinding(WorkspaceSnapResult{
		ChapterID: chapterID, ItemGUID: itemGUID, SourceTime: sourceTime, Outcome: snapOutcomeSnapped,
		Time: snapped.Time, Moved: snapped.Moved,
	}, nil)
}
