package main

import (
	"context"
	"errors"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"desktop/internal/daw"
	"desktop/internal/dawport"
)

// The live track list is asked for by several pages and bindings in one user action (the Booth's own poll, the voices, the record target, a
// lane switch: #3647 counted four reads of one list in a lane switch and three in one idle tick). REAPER's list changes only when its edit counter
// does, and the heartbeat (every 1.5 s, no request) carries that counter, so a read the counter still matches is not asked again.

// liveTracksMaxAge bounds how long an answer is reused when the counter has not moved: a change the counter misses (it restarts when a project
// is reopened, and not every REAPER edit raises it) is seen within this long, as the 5 s poll saw it before.
const liveTracksMaxAge = 10 * time.Second

// liveTracksStaleAge bounds how long an answer past liveTracksMaxAge is still handed out, to the host's own reads only (servingStale), while a fresh one is read behind it (#3752): on a
// slow DAW every caller used to wait a whole round trip for the list each time the age ran out, and a lane arm spent its own wait on it. The
// heartbeat must still vouch for the answer (the same counter, project and epoch); only its age is forgiven, and never beyond this.
const liveTracksStaleAge = 30 * time.Second

// liveTracksRefreshTimeout bounds the read made behind a stale answer as a caller's own read is bounded (tracksLiveTimeout): a caller that
// arrives past the stale age joins a read in flight, and must not be held by one that outlasts its own wait.
const liveTracksRefreshTimeout = tracksLiveTimeout

// liveTracksCache holds the last live track list and the one read in flight. It belongs to a project (a project switch makes a new one, as for
// boothVoices), so another project's list is never served.
type liveTracksCache struct {
	mu sync.Mutex
	// +checklocks:mu
	have bool
	// +checklocks:mu
	answer dawport.LiveTracks
	// +checklocks:mu
	at time.Time
	// +checklocks:mu
	flight *liveTracksFlight
	// +checklocks:mu
	epoch uint64
	// +checklocks:mu
	generation uint64
	// +checklocks:mu
	now func() time.Time
}

// liveTracksFlight is one read that callers arriving meanwhile wait on instead of sending their own.
type liveTracksFlight struct {
	// epoch is the heartbeat's epoch the read began in: a caller in a later epoch does not join it.
	epoch  uint64
	done   chan struct{}
	answer dawport.LiveTracks
	err    error
}

func newLiveTracksCache() *liveTracksCache { return &liveTracksCache{now: time.Now} }

// Invalidate forgets the answer, for a change this app made itself (a track it created): the counter will say so within a heartbeat, but the
// next read must not wait for it. A read in flight when this is called is neither kept nor shared with a caller that arrives afterwards: its
// answer may predate the change, so the next caller sends a request of its own (the callers already waiting on it still get it).
func (c *liveTracksCache) Invalidate() {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.have = false
	c.generation++
	c.flight = nil
}

// cachedTrackLister is lister, asked at most once for as long as heartbeat's change count equals the count its last answer carried.
type cachedTrackLister struct {
	inner     dawport.TrackLister
	cache     *liveTracksCache
	heartbeat dawport.Heartbeat
	// staleOK lets this lister hand out an answer between liveTracksMaxAge and liveTracksStaleAge while it is read again (servingStale). It is
	// off for a list a page shows or the narrator asked to refresh: that read waits for REAPER's own answer past liveTracksMaxAge, as before.
	staleOK bool
}

// servingStale is lister allowed to answer from a list up to liveTracksStaleAge old while REAPER is asked again behind it. It is for the
// host's own decisions in the path of an action (which track a take, an arm or a voice choice is for), where a round trip on a slow DAW is
// the narrator's wait and a track that has gone since is refused by its GUID. A lister with no cache is returned as it is.
func servingStale(lister dawport.TrackLister) dawport.TrackLister {
	if cached, ok := lister.(cachedTrackLister); ok {
		cached.staleOK = true
		return cached
	}
	return lister
}

var _ dawport.TrackLister = cachedTrackLister{}

// The production heartbeat keeps an epoch: without the method the cache would silently stop telling a restarted bridge from a running one.
var _ interface{ Epoch() uint64 } = (*daw.Reachability)(nil)

// withTracksCache is lister behind svc's cache, or lister itself when there is no cache or no heartbeat to judge it by.
func withTracksCache(svc hostServices, lister dawport.TrackLister) dawport.TrackLister {
	if lister == nil || svc.tracksCache == nil || svc.reachability == nil {
		return lister
	}
	return cachedTrackLister{inner: lister, cache: svc.tracksCache, heartbeat: svc.reachability}
}

func (l cachedTrackLister) ReadTracks(ctx context.Context) (dawport.LiveTracks, error) {
	c := l.cache
	for {
		c.mu.Lock()
		if age := c.now().Sub(c.at); c.have && l.vouched(c) && (age < liveTracksMaxAge || (l.staleOK && age < liveTracksStaleAge)) {
			answer := cloneTracks(c.answer)
			if age >= liveTracksMaxAge && c.flight == nil {
				// Stale while revalidate: this caller has the list now, and the next one has REAPER's answer to the read started here.
				l.refresh(c)
			}
			c.mu.Unlock()
			return answer, nil
		}
		if flight := c.flight; flight != nil && flight.epoch == l.epoch() {
			c.mu.Unlock()
			select {
			case <-flight.done:
				if flight.err == nil {
					return cloneTracks(flight.answer), nil
				}
				// The read this call waited on failed (its caller's deadline may have been the shorter one): this call reads for itself.
			case <-ctx.Done():
				return dawport.LiveTracks{}, ctx.Err()
			}
			continue
		}
		epoch := l.epoch() // before the request: a heartbeat that lands during it makes the answer older than the epoch it is stored in
		flight := &liveTracksFlight{done: make(chan struct{}), epoch: epoch}
		c.flight = flight
		generation := c.generation
		c.mu.Unlock()
		return l.lead(ctx, c, flight, generation, epoch)
	}
}

// refresh starts a read of its own behind a stale answer, shared with any caller that needs to wait meanwhile like any other read in flight.
//
// +checklocks:c.mu
func (l cachedTrackLister) refresh(c *liveTracksCache) {
	epoch := l.epoch()
	flight := &liveTracksFlight{done: make(chan struct{}), epoch: epoch}
	c.flight = flight
	generation := c.generation
	go func() {
		// lead wakes the waiters when a read panics and lets the panic go on to its caller; here that is this goroutine, and nobody is
		// owed the answer, so the panic ends here instead of ending the app.
		defer func() { _ = recover() }()
		ctx, cancel := context.WithTimeout(context.Background(), liveTracksRefreshTimeout)
		defer cancel()
		// A failed refresh leaves the stale answer to run out of age; the next caller past it reads for itself and gets the error.
		_, _ = l.lead(ctx, c, flight, generation, epoch)
	}()
}

// lead sends the one request of flight, stores its answer when nothing invalidated the list meanwhile, and wakes the callers waiting on it. It
// does so also when the read panics, so no caller waits for a read that will never end.
func (l cachedTrackLister) lead(ctx context.Context, c *liveTracksCache, flight *liveTracksFlight, generation, epoch uint64) (answer dawport.LiveTracks, err error) {
	finished := false
	defer func() {
		c.mu.Lock()
		if !finished {
			flight.err = errors.New("the track list read ended without an answer") // the read panicked: the waiters read for themselves
		}
		if c.flight == flight {
			c.flight = nil
		}
		c.mu.Unlock()
		close(flight.done)
	}()
	answer, err = l.inner.ReadTracks(ctx)
	c.mu.Lock()
	flight.answer, flight.err = answer, err
	if err == nil && generation == c.generation {
		c.have, c.answer, c.at, c.epoch = true, cloneTracks(answer), c.now(), epoch
	}
	finished = true
	c.mu.Unlock()
	return answer, err
}

// cloneTracks is answer with a copy of its rows of its own, so no caller can change what the next one is given.
func cloneTracks(answer dawport.LiveTracks) dawport.LiveTracks {
	answer.Tracks = slices.Clone(answer.Tracks)
	return answer
}

// vouched reports whether the heartbeat still vouches for the held answer as REAPER's list: it is fresh and carries a counter equal to the
// answer's, it names the project the answer is of, and the bridge has not started over since (the heartbeat's epoch: a gap, another project, a
// counter that went down). The answer's age is the caller's to judge: under liveTracksMaxAge it is served as it is, under liveTracksStaleAge it
// is served while a new read runs. A project reopened with an equal counter and no gap is served stale for at most liveTracksStaleAge, and
// corrected by the read the first call past liveTracksMaxAge starts.
//
// +checklocks:c.mu
func (l cachedTrackLister) vouched(c *liveTracksCache) bool {
	count, known := l.heartbeat.ChangeCount()
	if !known {
		return false
	}
	open, unsaved := l.heartbeat.CurrentProject()
	return count == c.answer.ChangeCount && !unsaved && sameLiveProject(open, c.answer.ProjectPath) && l.epoch() == c.epoch
}

// epoch is the heartbeat's count of times the bridge may have started over (a gap, another project, a counter that went down), or 0 for a
// heartbeat that does not keep one: an answer read in another epoch is not reused, whatever the counters say.
func (l cachedTrackLister) epoch() uint64 {
	if h, ok := l.heartbeat.(interface{ Epoch() uint64 }); ok {
		return h.Epoch()
	}
	return 0
}

// sameLiveProject reports whether two project paths name one file (Windows paths compare without case).
func sameLiveProject(a, b string) bool {
	return a != "" && strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}
