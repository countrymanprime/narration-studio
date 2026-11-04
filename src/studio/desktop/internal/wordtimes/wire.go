package wordtimes

import (
	"desktop/internal/bridge"
	"desktop/internal/coverage"
	"desktop/internal/tracks"
)

// The wire half of the word-times table: WorkspaceWordTimes (src/studio/desktop/bindings_workspace_wordtimes.go) reads the stored alignment,
// the saved project and the live track, and this file turns them into Compute's input and Compute's table into the answer the UI parses.

// WireRow is one word on the wire. Item indexes the answer's items list (-1 when no item plays the word).
type WireRow struct {
	Index   int     `json:"i"`
	State   string  `json:"state"`
	Start   float64 `json:"start"`
	End     float64 `json:"end"`
	Item    int     `json:"item"`
	Clipped bool    `json:"clipped"`
	Misread bool    `json:"misread"`
}

// WireView is WorkspaceWordTimes' answer.
type WireView struct {
	Available   bool      `json:"available"`
	Version     string    `json:"version"`
	ChangeCount int       `json:"changeCount"`
	Items       []string  `json:"items"`
	Words       []WireRow `json:"words"`
}

// Unavailable is the answer when the table cannot be made now.
func Unavailable() WireView {
	return WireView{Items: []string{}, Words: []WireRow{}}
}

// Wire makes the table from the stored alignment, the saved project (where an alignment item's source file is read) and the live track.
func Wire(view coverage.AlignmentView, saved tracks.Project, state bridge.TrackState) WireView {
	items := make([]Item, 0, len(view.Items))
	for _, it := range view.Items {
		item := Item{Index: it.Index, GUID: it.ItemGUID}
		if _, found, ok := saved.ItemByGUID(it.ItemGUID); ok {
			item.SourceFile = found.SourceFile
		}
		items = append(items, item)
	}
	words := make([]Word, 0, len(view.Tokens))
	for _, t := range view.Tokens {
		w := Word{Index: t.Index, ItemIndex: -1, Misread: t.Status == "misread"}
		if t.Item != nil && t.Start != nil && t.End != nil {
			w.ItemIndex, w.Start, w.End = *t.Item, *t.Start, *t.End
		}
		words = append(words, w)
	}
	live := make([]Live, 0, len(state.Items))
	for _, it := range state.Items {
		live = append(live, Live{
			GUID: it.ItemGUID, SourceFile: it.SourceFile, Position: it.Position, Length: it.Length,
			SourceStart: it.SourceOffset, PlayRate: it.PlayRate, Muted: it.Muted != nil && *it.Muted,
		})
	}
	table := Compute(Input{Words: words, Items: items, Live: live, ChangeCount: state.ChangeCount, RecordID: view.RecordID})
	out := WireView{Available: true, Version: table.Version, ChangeCount: table.ChangeCount, Items: []string{}, Words: make([]WireRow, 0, len(table.Rows))}
	index := map[string]int{}
	for _, r := range table.Rows {
		row := WireRow{Index: r.Index, State: string(r.State), Start: r.Start, End: r.End, Item: -1, Clipped: r.Clipped, Misread: r.Misread}
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
