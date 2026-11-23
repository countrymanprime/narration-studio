package main

import (
	"context"
	"errors"
	"runtime"
	"sync"
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
var workspacePeaksTimeout = 30 * time.Second

// peaksReadLimit bounds how long one recording's peaks may be read in the background after the call that asked for them has gone: a read that
// outlives the call keeps going and fills the cache, so the next ask finds it (#4042). It is generous because a read is a whole file.
const peaksReadLimit = 10 * time.Minute

// stillReading is the Reason of an item whose recording was still being read when the call's time ran out. The read goes on in the background,
// so the strip shows what it has and the next ask has the rest.
const stillReading = "this recording is still being read, so its waveform is not drawn yet."

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

	h.mu.RLock()
	life := h.ctx
	h.mu.RUnlock()
	if life == nil {
		life = context.Background()
	}
	sources := newPeaksSources(ctx, life, store, svc.config.projectFolder)
	sources.spawn = h.goBackground
	sources.readAhead(project, view.Items)
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
	life          context.Context   // the host's: a read that outlives the call stops with it
	spawn         func(work func()) // starts a read that outlives the call: the host's goBackground, so a test can wait for it
	store         *evidence.CacheStore
	projectFolder string
	identities    map[string]*evidence.SourceIdentity // nil: the file could not be read
	peaks         map[string]sourcePeaks
	flights       *peaksFlights
}

func newPeaksSources(ctx, life context.Context, store *evidence.CacheStore, projectFolder string) *peaksSources {
	return &peaksSources{ctx: ctx, life: life, store: store, projectFolder: projectFolder, identities: map[string]*evidence.SourceIdentity{}, peaks: map[string]sourcePeaks{}, flights: sharedPeaksFlights, spawn: func(work func()) { go work() }}
}

// readAhead starts the reads of every live item's source at once, a few at a time, so a chapter cut from several recordings waits for the longest
// of them and not for all of them one after the other. Each read is joined by whole() when the item loop reaches it.
func (s *peaksSources) readAhead(project tracks.Project, items []coverage.AlignmentItem) {
	var files []string
	seen := map[string]bool{}
	for _, item := range items {
		if !item.Live || item.Length <= 0 {
			continue
		}
		if _, projectItem, ok := project.ItemByGUID(item.ItemGUID); ok {
			if take := projectItem.Active(); take.SourceFile != "" && take.SourceAvailable && !seen[take.SourceFile] {
				seen[take.SourceFile] = true
				files = append(files, take.SourceFile)
			}
		}
	}
	if len(files) < 2 {
		return
	}
	for _, file := range files {
		s.identify(file) // before any goroutine: readSource reads identities
	}
	answers := make([]sourcePeaks, len(files))
	var wg sync.WaitGroup
	for i, file := range files {
		wg.Add(1)
		go func() {
			defer wg.Done()
			answers[i] = s.readSource(file)
		}()
	}
	wg.Wait()
	// What each read answered is kept for the item loop: a recording read before the call's time ran out is not asked for again.
	for i, file := range files {
		s.peaks[file] = answers[i]
	}
}

// identify answers file's identity as it is on disk at the first ask of this call, nil when it cannot be read.
func (s *peaksSources) identify(file string) *evidence.SourceIdentity {
	identity, ok := s.identities[file]
	if !ok {
		if read, err := evidence.Identify(file, s.projectFolder); err == nil {
			identity = &read
		}
		s.identities[file] = identity
	}
	return identity
}

// whole answers file's whole peaks from the evidence cache (measure.CachedPeaksFile), or the reason an item over it
// has no waveform. A file the read-ahead already answered is not asked again.
func (s *peaksSources) whole(file string) sourcePeaks {
	if read, ok := s.peaks[file]; ok {
		return read
	}
	s.identify(file)
	read := s.readSource(file)
	s.peaks[file] = read
	return read
}

// readSource is one file's answer from its flight. It touches no map of s but identities, which the item loop and readAhead fill before any
// goroutine runs, so readAhead may call it from several goroutines.
func (s *peaksSources) readSource(file string) sourcePeaks {
	identity := s.identities[file]
	if identity == nil {
		return sourcePeaks{reason: "this item's source audio could not be read"}
	}
	whole, err := s.flights.read(s.ctx, s.life, s.spawn, s.store, *identity, file)
	switch {
	case errors.Is(err, errPeaksPending):
		return sourcePeaks{reason: stillReading}
	case errors.Is(err, measure.ErrNotWAV):
		return sourcePeaks{reason: "no waveform"}
	case err != nil:
		return sourcePeaks{reason: "this item's waveform could not be computed"}
	}
	return sourcePeaks{whole: whole}
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

// errPeaksPending answers a read whose call gave up waiting: the read itself goes on.
var errPeaksPending = errors.New("the recording is still being read")

// peaksFlight is one recording's read in progress, joined by every call that asks for the same file as it is on disk.
type peaksFlight struct {
	done  chan struct{}
	peaks measure.Peaks
	err   error
}

// peaksFlights are the reads in progress, by source identity. A read is not tied to the call that started it: when that call's time runs out
// it answers errPeaksPending, the read finishes in the background and writes the evidence cache, and the next call finds it done (or joins it
// while it runs) instead of starting the whole file again and timing out again (#4042).
type peaksFlights struct {
	mu sync.Mutex
	// +checklocks:mu
	running map[string]*peaksFlight
}

// finish takes a flight out of the running ones and wakes the calls waiting for it.
func (f *peaksFlights) finish(key string, flight *peaksFlight) {
	f.mu.Lock()
	delete(f.running, key)
	f.mu.Unlock()
	close(flight.done)
}

// peaksReadSlots bounds the whole-file reads at once, across calls and chapters, to the machine's cores: a chapter of many recordings, or the
// page reading its neighbours, queues behind it instead of decoding every file at the same moment.
var peaksReadSlots = newReadSlots(runtime.NumCPU())

type readSlots chan struct{}

func newReadSlots(n int) readSlots { return make(readSlots, max(1, n)) }

func (r readSlots) acquire(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	select {
	case r <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (r readSlots) release() { <-r }

var sharedPeaksFlights = &peaksFlights{running: map[string]*peaksFlight{}}

func (f *peaksFlights) read(ctx, life context.Context, spawn func(func()), store *evidence.CacheStore, identity evidence.SourceIdentity, file string) (measure.Peaks, error) {
	// A recording the cache already holds is answered at once, even to a call whose time has run out: the probe reads the cache with a context that
	// is already cancelled, so a miss costs nothing and starts no decode.
	probe, stop := context.WithCancel(ctx)
	stop()
	if peaks, err := measure.CachedPeaksFile(probe, store, identity, file, nil, measure.DefaultPeaksPerSecond); err == nil {
		return peaks, nil
	}
	key := file + "\x00" + identity.ModTime.String() + "\x00" + identity.PartialHash
	f.mu.Lock()
	flight, joined := f.running[key]
	if !joined {
		flight = &peaksFlight{done: make(chan struct{})}
		f.running[key] = flight
		spawn(func() {
			own, cancel := context.WithTimeout(life, peaksReadLimit) // the read outlives the call, not the host
			defer cancel()
			if err := peaksReadSlots.acquire(own); err != nil {
				flight.err = err
				f.finish(key, flight)
				return
			}
			defer peaksReadSlots.release()
			flight.peaks, flight.err = measure.CachedPeaksFile(own, store, identity, file, nil, measure.DefaultPeaksPerSecond)
			f.finish(key, flight)
		})
	}
	f.mu.Unlock()
	select {
	case <-flight.done:
		return flight.peaks, flight.err
	case <-ctx.Done():
		return measure.Peaks{}, errPeaksPending
	}
}
