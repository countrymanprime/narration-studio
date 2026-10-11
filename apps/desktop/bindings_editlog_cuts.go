package main

import "github.com/countrymanprime/narration-utils/shell/internal/editlog"

// The narrator's cuts (ADR 0856): the host's memory of the words a deleteRange hid in the DAW, so struck words survive a
// restart. A cut's times are in the chapter recording as it was before any cut; the app converts them and the host stores
// the numbers. The DAW owns the audio, so a cut is recorded only after the DAW accepted it and never deletes anything. The
// bindings take a chapter id, word keys, numbers and plain text, never a path.

// EditingCutsList returns a chapter's cuts in the original recording's time order, each checked against the current text.
func (h *Host) EditingCutsList(chapterID string) (string, error) {
	return encodeBinding(h.editLog().CutsList(chapterID))
}

// EditingCutRecord stores a cut after the DAW accepted the deleteRange: it carries the DAW's guid and undo steps, and is
// refused, with nothing saved, when its words are not in the paragraph's current text, its range or options are not ones the
// app sends, or it overlaps a cut already stored on the same take.
func (h *Host) EditingCutRecord(chapterID string, cut editlog.CutRequest) (string, error) {
	return encodeBinding(h.editLog().CutRecord(chapterID, cut))
}

// EditingCutRemove forgets a chapter's cut: the inverse the journal calls when the DAW change is undone in the session.
func (h *Host) EditingCutRemove(chapterID, id string) (string, error) {
	return encodeBinding(h.editLog().CutRemove(chapterID, id))
}
