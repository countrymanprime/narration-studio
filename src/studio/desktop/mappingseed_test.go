package main

import (
	"fmt"

	"desktop/internal/evidence"
)

// Test-only seam. The app has no "confirm one link" binding any more (#3396): ChapterTrackSet is the one writer.
// Tests that need a state Set cannot make, such as a chapter on two tracks, write the store row directly here.

// seedLink records trackGUID as the confirmed link for chapterID,
// refusing a chapterID that is not one of the current manuscript's chapters:
// the stored ChapterTitle must be the real title, never one the caller
// invents, because the re-suggestion after a re-import matches on it.
func (h *Host) seedLinkRow(trackGUID, chapterID string) (evidence.TrackMapping, error) {
	svc := h.services()
	documentID, store, err := mappingContext(svc)
	if err != nil {
		return evidence.TrackMapping{}, err
	}
	if trackGUID == "" {
		return evidence.TrackMapping{}, fmt.Errorf("choose a track before confirming a chapter link")
	}
	title, ok, err := chapterTitle(svc, chapterID)
	if err != nil {
		return evidence.TrackMapping{}, err
	}
	if !ok {
		return evidence.TrackMapping{}, fmt.Errorf("that chapter is not part of the current manuscript")
	}
	return store.Confirm(documentID, trackGUID, chapterID, title)
}

// seedLink is seedLinkRow with the binding's JSON result.
func (h *Host) seedLink(trackGUID, chapterID string) (string, error) {
	return encodeBinding(h.seedLinkRow(trackGUID, chapterID))
}
