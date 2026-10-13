package main

import "github.com/countrymanprime/narration-utils/shell/internal/editlog"

// The narrator's word effects (ADR 0856): the host's memory of the chains the DAW put on ranges of words (applyFxToRange),
// so an effect's underline survives a restart. An effect's times are in the chapter recording as it was before any cut, like
// a cut's, so a later cut moves where it is shown and not what is stored. The DAW owns the audio and the chain: an effect is
// recorded only after the DAW accepted it, and recording or removing one changes nothing in the DAW. The chain is named as
// the DAW lists it (WorkspaceListFXChains), never by a path, and the host never opens it. The bindings take a chapter id,
// word keys, numbers and plain text.

// EditingWordFxList returns a chapter's word effects in the original recording's time order, each checked against the
// current text.
func (h *Host) EditingWordFxList(chapterID string) (string, error) {
	return encodeBinding(h.editLog().WordFxList(chapterID))
}

// EditingWordFxRecord stores an effect after the DAW accepted applyFxToRange. It is refused, with nothing saved, when its
// words are not in one paragraph's current text, its range is not one the app sends, the DAW's result is missing, or its
// chain id or name could be a path (editlog.ErrBadChainName). An effect on words that already carry one is recorded, and the
// answer's over names the effects underneath.
func (h *Host) EditingWordFxRecord(chapterID string, fx editlog.WordFxRequest) (string, error) {
	return encodeBinding(h.editLog().WordFxRecord(chapterID, fx))
}

// EditingWordFxRemove forgets a chapter's effect: the inverse the journal calls when the DAW change is undone, or the record
// of the DAW taking the chain off.
func (h *Host) EditingWordFxRemove(chapterID, id string) (string, error) {
	return encodeBinding(h.editLog().WordFxRemove(chapterID, id))
}

// EditingWordFxBypass records that the narrator bypassed a chapter's effect in the DAW (bypassed true) or turned it back on, after
// the DAW accepted the switch, and is the inverse the journal calls when the switch is undone. The coverage figure counts only
// the effects that are on (SN-E113). An effect that is not recorded, or already as asked, changes nothing.
func (h *Host) EditingWordFxBypass(chapterID, id string, bypassed bool) (string, error) {
	return encodeBinding(h.editLog().WordFxBypass(chapterID, id, bypassed))
}
