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

	sources := newPeaksSources(ctx, store, svc.identities, svc.config.projectFolder)
	items := make([]WorkspacePeaksItem, 0, len(view.Items))
	for _, alignmentItem := range view.Items {
		items = append(items, itemPeaks(sources, project, alignmentItem))
	}
	return encodeBinding(WorkspacePeaksView{ChapterID: chapterID, Items: items}, nil)
}

// sourcePeaks is one source file's whole peaks, or why it has none.
type sourcePeaks struct {
	whole  measure.Peaks
	reason string
}

// peaksSources identifies each source file and reads its cached peaks once, however many items ask: a chapter cut
// into many items is mostly one recording, and reading it once an item took 1.7 s a call for 300 items of an hour's
// recording (#3767). One peaksSources serves one WorkspacePeaks call, so the next call sees the files as they are
// then. The two steps are apart because an item's range is checked between them, as it was when each item did both.
type peaksSources struct {
	ctx           context.Context
	store         *evidence.CacheStore
	cache         *evidence.IdentityCache
	projectFolder string
	identities    map[string]*evidence.SourceIdentity // nil: the file could not be read
	peaks         map[string]sourcePeaks
}

func newPeaksSources(ctx context.Context, store *evidence.CacheStore, cache *evidence.IdentityCache, projectFolder string) *peaksSources {
	return &peaksSources{ctx: ctx, store: store, cache: cache, projectFolder: projectFolder, identities: map[string]*evidence.SourceIdentity{}, peaks: map[string]sourcePeaks{}}
}

// identify answers file's identity as it is on disk at the first ask of this call, nil when it cannot be read.
func (s *peaksSources) identify(file string) *evidence.SourceIdentity {
	identity, ok := s.identities[file]
	if !ok {
		if read, err := s.cache.Identify(file, s.projectFolder); err == nil {
			identity = &read
		}
		s.identities[file] = identity
	}
	return identity
}

// whole answers file's whole peaks from the evidence cache (measure.CachedPeaksFile), or the reason an item over it
// has no waveform.
func (s *peaksSources) whole(file string) sourcePeaks {
	if read, ok := s.peaks[file]; ok {
		return read
	}
	read := sourcePeaks{reason: "this item's source audio could not be read"}
	if identity := s.identify(file); identity != nil {
		whole, err := measure.CachedPeaksFile(s.ctx, s.store, *identity, file, nil, measure.DefaultPeaksPerSecond)
		switch {
		case errors.Is(err, measure.ErrNotWAV):
			read = sourcePeaks{reason: "no waveform"}
		case err != nil:
			read = sourcePeaks{reason: "this item's waveform could not be computed"}
		default:
			read = sourcePeaks{whole: whole}
		}
	}
	s.peaks[file] = read
	return read
}

// itemPeaks answers one alignment item's peaks, cut from its source's whole peaks (sources reads a source once a
// call). Every way it can fail to have any - not live, the item no longer in the saved project, no source file, an
// unreadable source, or a source that is not a WAV - answers its own Reason rather than an error, so the rest of
// the chapter's strip still draws.
func itemPeaks(sources *peaksSources, project tracks.Project, item coverage.AlignmentItem) WorkspacePeaksItem {
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
	// In the order each item took these when it read its own source: a file that cannot be read, then a bad range,
	// then what the file's peaks answer.
	if sources.identify(take.SourceFile) == nil {
		return WorkspacePeaksItem{Index: item.Index, Reason: "this item's source audio could not be read"}
	}
	rng := measure.Range{StartSeconds: item.SourceStart, LengthSeconds: item.Length * item.PlayRate}
	if rng.Validate() != nil {
		return WorkspacePeaksItem{Index: item.Index, Reason: "this item's waveform could not be computed"}
	}
	source := sources.whole(take.SourceFile)
	if source.reason != "" {
		return WorkspacePeaksItem{Index: item.Index, Reason: source.reason}
	}
	peaks, err := measure.SlicePeaks(source.whole, rng)
	if err != nil {
		return WorkspacePeaksItem{Index: item.Index, Reason: "this item's waveform could not be computed"}
	}
	return WorkspacePeaksItem{Index: item.Index, Peaks: &peaks}
}
