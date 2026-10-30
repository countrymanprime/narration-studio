package main

import (
	"context"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/coverage"
	"desktop/internal/dawport"
	"desktop/internal/tracks"
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
		return encodeBinding(unavailableWordTimes(), nil)
	}
	view, err := svc.coverage.Alignment(chapterID, coverageSettings(svc.settings).Alignment)
	if err != nil || view.NeedsAlignAgain || len(view.Tokens) == 0 {
		return encodeBinding(unavailableWordTimes(), nil)
	}
	state, ok := h.liveTrackState(ctx, svc, resolver.Support(dawport.CapTrackState), chapterID)
	if !ok {
		return encodeBinding(unavailableWordTimes(), nil)
	}
	saved, _ := selectedProject(svc)
	return encodeBinding(wordTimesIn(view, saved, state), nil)
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

// wordTimeRow is one word on the wire. Item indexes the answer's items list (-1 when no item plays the word).
type wordTimeRow struct {
	Index   int     `json:"i"`
	State   string  `json:"state"`
	Start   float64 `json:"start"`
	End     float64 `json:"end"`
	Item    int     `json:"item"`
	Clipped bool    `json:"clipped"`
	Misread bool    `json:"misread"`
}

// wordTimesView is WorkspaceWordTimes' answer.
type wordTimesView struct {
	Available   bool          `json:"available"`
	Version     string        `json:"version"`
	ChangeCount int           `json:"changeCount"`
	Items       []string      `json:"items"`
	Words       []wordTimeRow `json:"words"`
}

func unavailableWordTimes() wordTimesView {
	return wordTimesView{Items: []string{}, Words: []wordTimeRow{}}
}

// wordTimesIn makes the table from the stored alignment, the saved project (where an alignment item's source file is read) and the live track.
func wordTimesIn(view coverage.AlignmentView, saved tracks.Project, state bridge.TrackState) wordTimesView {
	items := make([]wordtimes.Item, 0, len(view.Items))
	for _, it := range view.Items {
		item := wordtimes.Item{Index: it.Index, GUID: it.ItemGUID}
		if _, found, ok := saved.ItemByGUID(it.ItemGUID); ok {
			item.SourceFile = found.SourceFile
		}
		items = append(items, item)
	}
	words := make([]wordtimes.Word, 0, len(view.Tokens))
	for _, t := range view.Tokens {
		w := wordtimes.Word{Index: t.Index, ItemIndex: -1, Misread: t.Status == "misread"}
		if t.Item != nil && t.Start != nil && t.End != nil {
			w.ItemIndex, w.Start, w.End = *t.Item, *t.Start, *t.End
		}
		words = append(words, w)
	}
	live := make([]wordtimes.Live, 0, len(state.Items))
	for _, it := range state.Items {
		live = append(live, wordtimes.Live{
			GUID: it.ItemGUID, SourceFile: it.SourceFile, Position: it.Position, Length: it.Length,
			SourceStart: it.SourceOffset, PlayRate: it.PlayRate, Muted: it.Muted != nil && *it.Muted,
		})
	}
	table := wordtimes.Compute(wordtimes.Input{Words: words, Items: items, Live: live, ChangeCount: state.ChangeCount, RecordID: view.RecordID})
	out := wordTimesView{Available: true, Version: table.Version, ChangeCount: table.ChangeCount, Items: []string{}, Words: make([]wordTimeRow, 0, len(table.Rows))}
	index := map[string]int{}
	for _, r := range table.Rows {
		row := wordTimeRow{Index: r.Index, State: string(r.State), Start: r.Start, End: r.End, Item: -1, Clipped: r.Clipped, Misread: r.Misread}
		if r.ItemGUID != "" {
			at, seen := index[r.ItemGUID]
			if !seen {
				at = len(out.Items)
				index[r.ItemGUID] = at
				out.Items = append(out.Items, r.ItemGUID)
			}
			row.Item = at
		}
		out.Words = append(out.Words, row)
	}
	return out
}
