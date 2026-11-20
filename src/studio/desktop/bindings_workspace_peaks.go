package main

import (
	"context"
	"errors"
	"time"

	"desktop/internal/coverage"
	"desktop/internal/evidence"
	"desktop/internal/measure"
	"desktop/internal/tracks"
)

// The chapter workspace's waveform strip: host-computed peaks (measure.ComputePeaks/PeaksFile) for every
// analyzed item of a chapter's stored alignment, in one call so the canvas can draw the whole chapter's strip without a
// round trip per item. The peaks themselves are cached by source identity in the evidence cache
// (measure.CachedPeaksFile): a chapter whose items share retakes of the same source file, or a chapter reopened later,
// is answered from disk rather than re-decoded.

// workspacePeaksTimeout bounds one WorkspacePeaks call so a very large or unreadable source cannot hang the binding:
// the spike measured 3.4 s for a whole hour of audio (docs/research/edit-and-proof-spike-ep0.md), so this leaves ample
// room for a chapter's several items plus a cold cache.
const workspacePeaksTimeout = 30 * time.Second

// WorkspacePeaksItem is one analyzed item's waveform, or why it has none: Index matches
// WorkspaceAlignment's own AlignmentItem.Index, so the UI zips the two answers together without a second
// lookup by GUID. Peaks is nil, and Reason set, for an item that is not live in the saved project, whose
// source audio is missing, or whose source is not a WAV (measure.ErrNotWAV: "no waveform" per EP12 A) -
// never an error, since one bad item must not blank the rest of the strip.
type WorkspacePeaksItem struct {
	Index  int            `json:"index"`
	Peaks  *measure.Peaks `json:"peaks,omitempty"`
	Reason string         `json:"reason,omitempty"`
}

// WorkspacePeaksView is WorkspacePeaks' answer: chapterID echoed back and one entry per item of the
// chapter's current alignment, in Index order.
type WorkspacePeaksView struct {
	ChapterID string               `json:"chapterId"`
	Items     []WorkspacePeaksItem `json:"items"`
}

// WorkspacePeaks answers the waveform strip's peaks for every analyzed item of chapterID's stored alignment:
// each item's played range, over its active take's source file, at measure.DefaultPeaksPerSecond, from the
// evidence cache. It refuses only when there is no project or the chapter's alignment itself cannot be read
// (the same errors WorkspaceAlignment already answers) - a single item with no usable source answers a
// Reason instead of failing the whole call.
func (h *Host) WorkspacePeaks(chapterID string) (string, error) {
	svc := h.services()
	if svc.coverage == nil {
		return "", errNoProject
	}
	view, err := svc.coverage.Alignment(chapterID, coverageSettings(svc.settings).Alignment)
	if err != nil {
		return "", err
	}
	project, err := h.tracksList()
	if err != nil {
		return "", err
	}
	store := evidence.NewCacheStore(svc.config.projectFolder)
	ctx, cancel := context.WithTimeout(context.Background(), workspacePeaksTimeout)
	defer cancel()

	whole := sourcePeaksReader(ctx, store, svc.config.projectFolder)
	items := make([]WorkspacePeaksItem, 0, len(view.Items))
	for _, alignmentItem := range view.Items {
		items = append(items, itemPeaks(whole, project, alignmentItem))
	}
	return encodeBinding(WorkspacePeaksView{ChapterID: chapterID, Items: items}, nil)
}

// sourcePeaks is one source file's whole peaks, or why it has none.
type sourcePeaks struct {
	whole  measure.Peaks
	reason string
}

// sourcePeaksReader answers a reader that identifies each source file and reads its cached peaks once, however many
// items ask: a chapter cut into many items is mostly one recording, and reading it once an item took 1.7 s a call for
// 300 items of an hour's recording (#3767). One reader serves one WorkspacePeaks call, so the next call sees the file
// as it is then.
func sourcePeaksReader(ctx context.Context, store *evidence.CacheStore, projectFolder string) func(file string) sourcePeaks {
	sources := map[string]sourcePeaks{}
	return func(file string) sourcePeaks {
		read, ok := sources[file]
		if !ok {
			read = readSourcePeaks(ctx, store, projectFolder, file)
			sources[file] = read
		}
		return read
	}
}

// readSourcePeaks identifies file as it is on disk now and answers its whole peaks from the evidence cache
// (measure.CachedPeaksFile), or the reason an item over it has no waveform.
func readSourcePeaks(ctx context.Context, store *evidence.CacheStore, projectFolder, file string) sourcePeaks {
	identity, err := evidence.Identify(file, projectFolder)
	if err != nil {
		return sourcePeaks{reason: "this item's source audio could not be read"}
	}
	whole, err := measure.CachedPeaksFile(ctx, store, identity, file, nil, measure.DefaultPeaksPerSecond)
	if err != nil {
		if errors.Is(err, measure.ErrNotWAV) {
			return sourcePeaks{reason: "no waveform"}
		}
		return sourcePeaks{reason: "this item's waveform could not be computed"}
	}
	return sourcePeaks{whole: whole}
}

// itemPeaks answers one alignment item's peaks, cut from its source's whole peaks (whole reads a source once a
// call). Every way it can fail to have any - not live, the item no longer in the saved project, no source file, an
// unreadable source, or a source that is not a WAV - answers its own Reason rather than an error, so the rest of
// the chapter's strip still draws.
func itemPeaks(whole func(file string) sourcePeaks, project tracks.Project, item coverage.AlignmentItem) WorkspacePeaksItem {
	if !item.Live {
		return WorkspacePeaksItem{Index: item.Index, Reason: "this item is no longer in the REAPER project"}
	}
	_, projectItem, ok := project.ItemByGUID(item.ItemGUID)
	if !ok {
		return WorkspacePeaksItem{Index: item.Index, Reason: "this item is no longer in the REAPER project"}
	}
	take := projectItem.Active()
	if take.SourceFile == "" || !take.SourceAvailable {
		return WorkspacePeaksItem{Index: item.Index, Reason: "this item's source audio was not found"}
	}
	if item.Length <= 0 {
		return WorkspacePeaksItem{Index: item.Index, Reason: "this item has no played range"}
	}
	// The range is refused before the source is read, so a bad range answers the same reason whatever the source is.
	rng := measure.Range{StartSeconds: item.SourceStart, LengthSeconds: item.Length * item.PlayRate}
	if rng.Validate() != nil {
		return WorkspacePeaksItem{Index: item.Index, Reason: "this item's waveform could not be computed"}
	}
	source := whole(take.SourceFile)
	if source.reason != "" {
		return WorkspacePeaksItem{Index: item.Index, Reason: source.reason}
	}
	peaks, err := measure.SlicePeaks(source.whole, rng)
	if err != nil {
		return WorkspacePeaksItem{Index: item.Index, Reason: "this item's waveform could not be computed"}
	}
	return WorkspacePeaksItem{Index: item.Index, Peaks: &peaks}
}
