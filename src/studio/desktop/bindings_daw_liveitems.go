package main

import (
	"context"
	"time"

	"desktop/internal/dawport"
)

// liveItemsTimeout bounds one chapter_track_state read for DawLiveItems.
const liveItemsTimeout = 5 * time.Second

// DawLiveItems answers the media items on chapterID's linked track as the DAW has them now (chapter_track_state), for the Editing page's
// follow-along: where each plays in the project, from where in which source file, at what rate. The saved project the alignment was read
// against knows none of the narrator's edits since, and a split's right half has a GUID it never saw. Read-only; it adds no undo step.
// The answer is {available, items}: available is false, with no items, when the DAW cannot be read now (not running, track_state off, no
// linked track, the track gone or longer than one read lists), and the page then follows by the saved items. The read is never an error.
func (h *Host) DawLiveItems(chapterID string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), liveItemsTimeout)
	defer cancel()
	live := h.stackSourcesIn(svc, resolver.Support(dawport.CapTrackState)).live
	return encodeBinding(dawLiveItemsIn(ctx, live, chapterID), nil)
}

// dawLiveItemsView is DawLiveItems' answer.
type dawLiveItemsView struct {
	Available bool          `json:"available"`
	Items     []dawLiveItem `json:"items"`
}

// dawLiveItem is one item with its active take. SourceFile is "" for an item with no audio take.
type dawLiveItem struct {
	Guid        string  `json:"guid"`
	SourceFile  string  `json:"sourceFile"`
	Position    float64 `json:"position"`
	Length      float64 `json:"length"`
	SourceStart float64 `json:"sourceStart"`
	PlayRate    float64 `json:"playRate"`
	Muted       bool    `json:"muted"`
}

func dawLiveItemsIn(ctx context.Context, live splitLive, chapterID string) dawLiveItemsView {
	items, refused, err := live(ctx, chapterID)
	if err != nil || refused != nil {
		return dawLiveItemsView{Items: []dawLiveItem{}}
	}
	out := make([]dawLiveItem, 0, len(items))
	for _, item := range items {
		rate := item.PlayRate
		if rate <= 0 {
			rate = 1
		}
		out = append(out, dawLiveItem{
			Guid: item.ItemGUID, SourceFile: item.SourceFile, Position: item.Position, Length: item.Length,
			SourceStart: item.SourceOffset, PlayRate: rate, Muted: item.Muted != nil && *item.Muted,
		})
	}
	return dawLiveItemsView{Available: true, Items: out}
}
