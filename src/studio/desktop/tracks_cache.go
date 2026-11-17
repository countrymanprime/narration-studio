package main

import (
	"context"
	"sync"
	"time"

	"desktop/internal/dawport"
)

// The live track list is asked for by several pages and bindings in one user action (the Booth's own poll, the voices, the record target, a
// lane switch: #3647 counted four reads of one list in a lane switch and three in one idle tick). REAPER's list changes only when its edit counter
// does, and the heartbeat (every 1.5 s, no request) carries that counter, so a read the counter still matches is not asked again.

// liveTracksMaxAge bounds how long an answer is reused when the counter has not moved: a change the counter misses (it restarts when a project
// is reopened, and not every REAPER edit raises it) is seen within this long, as the 5 s poll saw it before.
const liveTracksMaxAge = 10 * time.Second

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
	generation uint64
	now        func() time.Time
}

// liveTracksFlight is one read that callers arriving meanwhile wait on instead of sending their own.
type liveTracksFlight struct {
	done   chan struct{}
	answer dawport.LiveTracks
	err    error
}

func newLiveTracksCache() *liveTracksCache { return &liveTracksCache{now: time.Now} }

// Invalidate forgets the answer, for a change this app made itself (a track it created): the counter will say so within a heartbeat, but the
// next read must not wait for it. A read in flight when this is called is not kept.
func (c *liveTracksCache) Invalidate() {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.have = false
	c.generation++
}

// cachedTrackLister is lister, asked at most once for as long as heartbeat's change count equals the count its last answer carried.
type cachedTrackLister struct {
	inner     dawport.TrackLister
	cache     *liveTracksCache
	heartbeat dawport.Heartbeat
}

var _ dawport.TrackLister = cachedTrackLister{}

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
		if c.have && l.fresh(c) {
			answer := c.answer
			c.mu.Unlock()
			return answer, nil
		}
		if flight := c.flight; flight != nil {
			c.mu.Unlock()
			select {
			case <-flight.done:
				if flight.err == nil {
					return flight.answer, nil
				}
				// The read this call waited on failed (its caller's deadline may have been the shorter one): this call reads for itself.
			case <-ctx.Done():
				return dawport.LiveTracks{}, ctx.Err()
			}
			c.mu.Lock()
			if c.flight == flight {
				c.flight = nil
			}
			c.mu.Unlock()
			continue
		}
		flight := &liveTracksFlight{done: make(chan struct{})}
		c.flight = flight
		generation := c.generation
		c.mu.Unlock()

		answer, err := l.inner.ReadTracks(ctx)

		c.mu.Lock()
		flight.answer, flight.err = answer, err
		if c.flight == flight {
			c.flight = nil
		}
		if err == nil && generation == c.generation {
			c.have, c.answer, c.at = true, answer, c.now()
		}
		c.mu.Unlock()
		close(flight.done)
		return answer, err
	}
}

// fresh reports whether the held answer is still REAPER's list: the heartbeat is fresh and carries a counter equal to the answer's, and the
// answer is not older than liveTracksMaxAge. Without a counter nothing is reused. Called with c.mu held.
func (l cachedTrackLister) fresh(c *liveTracksCache) bool {
	count, known := l.heartbeat.ChangeCount()
	return known && count == c.answer.ChangeCount && c.now().Sub(c.at) < liveTracksMaxAge
}
