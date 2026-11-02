package main

import (
	"context"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/wordtimes"
)

// wordTimesTimeout bounds the chapter_track_state read behind one WorkspaceWordTimes.
const wordTimesTimeout = 5 * time.Second

// WorkspaceWordTimes answers where every word of chapterID's stored alignment plays in the DAW project now (docs/design/word-project-times.md):
// the alignment's source-file seconds for each word, pushed through the items the DAW has on the chapter's linked track (chapter_track_state),
// by source file and source range, so a move, a trim, a rate change, a split and a deleted section are all in it. A word whose audio no item plays
// is `not_in_project` and carries no time; a word the check never heard is `not_heard`. `version` and `changeCount` say which project state the table
// was made from: a page holding an older count than the one daw_project_edited last reported has a stale table and asks again.
//
// `available` is false, with no words, when the table cannot be made now (no stored alignment, no DAW answering, `track_state` off, no linked
// track, the track gone or longer than one read lists). That is an answer, not an error: the page then follows nothing in the DAW. Read-only.
func (h *Host) WorkspaceWordTimes(chapterID string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), wordTimesTimeout)
	defer cancel()
	if svc.coverage == nil {
		return encodeBinding(wordtimes.Unavailable(), nil)
	}
	view, err := svc.coverage.Alignment(chapterID, coverageSettings(svc.settings).Alignment)
	if err != nil || view.NeedsAlignAgain || len(view.Tokens) == 0 {
		return encodeBinding(wordtimes.Unavailable(), nil)
	}
	state, ok := h.liveTrackState(ctx, svc, resolver.Support(dawport.CapTrackState), chapterID)
	if !ok {
		return encodeBinding(wordtimes.Unavailable(), nil)
	}
	saved, _ := selectedProject(svc)
	return encodeBinding(wordtimes.Wire(view, saved, state), nil)
}

// liveTrackState reads chapterID's linked track now: false when it cannot be read or holds more items than one read lists.
func (h *Host) liveTrackState(ctx context.Context, svc hostServices, support dawport.Support, chapterID string) (bridge.TrackState, bool) {
	guid, refused, err := readAloudTrackGUID(svc, chapterID)
	if err != nil || refused != nil {
		return bridge.TrackState{}, false
	}
	reader := trackStateReaderFrom(svc)
	if reader == nil || !support.Available {
		return bridge.TrackState{}, false
	}
	state, err := reader.ChapterTrackState(ctx, guid)
	if err != nil || state.ItemsTotal > len(state.Items) {
		return bridge.TrackState{}, false
	}
	return state, true
}
