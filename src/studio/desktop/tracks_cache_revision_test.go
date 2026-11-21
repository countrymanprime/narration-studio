package main

import (
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// #3859: a script that sends the track list's revision in its heartbeat tells the host when the list changed, so the cache is judged by the
// revision and never by its age.

// setRevision records a heartbeat with edit counter count and track list revision revision.
func (b *beat) setRevision(count int, revision string) {
	b.reach.Record(bridge.Event{Tag: "PROJECT_STATUS", Fields: []string{"PROJECT_STATUS", "", "C:/Projects/Alice/Alice.rpp", "0", itoa(count), "0", "0.000000", "", revision}})
}

// beatFor lets d pass with a heartbeat every second, each carrying count and revision.
func (b *beat) beatFor(d time.Duration, count int, revision string) {
	for ; d > 0; d -= time.Second {
		b.advance(time.Second)
		b.setRevision(count, revision)
	}
}

func revisedTracks(count int, revision string) dawport.LiveTracks {
	tracks := twoTracks(count)
	tracks.Revision = revision
	return tracks
}

func TestATrackListIsReusedForAsLongAsTheHeartbeatsRevisionIsItsOwn(t *testing.T) {
	for name, lane := range map[string]bool{"a page's read": false, "a lane's read": true} {
		t.Run(name, func(t *testing.T) {
			inner, b := &countedLister{answer: revisedTracks(9, "aaaa")}, newBeat(9)
			b.setRevision(9, "aaaa")
			strict, _ := cachedFor(inner, b)
			var cached dawport.TrackLister = strict
			if lane {
				cached = servingStale(strict)
			}
			read(t, cached)
			// Two minutes, far past both ages, with takes and cuts moving the edit counter all the while: the track list is the same list.
			for count := 10; count < 130; count++ {
				b.beatFor(time.Second, count, "aaaa")
				if got := read(t, cached); len(got.Tracks) != 2 {
					t.Fatalf("got %d tracks", len(got.Tracks))
				}
			}
			if calls := inner.calls.Load(); calls != 1 {
				t.Errorf("%d requests in two minutes of an unchanged track list, want 1 (no read by age, none behind a stale answer)", calls)
			}
		})
	}
}

func TestATrackListIsReadAgainAtOnceWhenTheHeartbeatsRevisionChanges(t *testing.T) {
	inner, b := &countedLister{answer: revisedTracks(9, "aaaa")}, newBeat(9)
	b.setRevision(9, "aaaa")
	cached, _ := cachedFor(inner, b)
	read(t, cached)
	// A track is added in REAPER: the script's next heartbeat, sent at once, carries another revision.
	changed := revisedTracks(10, "bbbb")
	changed.Total, changed.Tracks = 3, append(changed.Tracks, dawport.LiveTrack{Index: 2, GUID: "{33333333-3333-3333-3333-333333333333}", Name: "Chapter III"})
	inner.set(changed, nil)
	b.beatFor(time.Second, 10, "bbbb")
	if got := read(t, cached); len(got.Tracks) != 3 || inner.calls.Load() != 2 {
		t.Fatalf("after the revision changed: %d tracks after %d requests, want the 3 after a second request", len(got.Tracks), inner.calls.Load())
	}
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests, want the new list kept", calls)
	}
}

// A change the edit counter does not count (a script's edit outside an undo block) is still a change of the revision.
func TestARevisionChangeTheEditCounterMissedIsStillReadAgain(t *testing.T) {
	inner, b := &countedLister{answer: revisedTracks(9, "aaaa")}, newBeat(9)
	b.setRevision(9, "aaaa")
	cached, _ := cachedFor(inner, b)
	read(t, cached)
	inner.set(revisedTracks(9, "cccc"), nil)
	b.beatFor(time.Second, 9, "cccc")
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests, want 2", calls)
	}
}

// An equal revision is not enough across a bridge that started over or another project: two empty projects have the same revision.
func TestAnEqualRevisionDoesNotVouchAcrossAGapOrAnotherProject(t *testing.T) {
	inner, b := &countedLister{answer: revisedTracks(9, "aaaa")}, newBeat(9)
	b.setRevision(9, "aaaa")
	cached, _ := cachedFor(inner, b)
	read(t, cached)
	b.advance(time.Minute) // REAPER was closed and opened again
	b.setRevision(9, "aaaa")
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("after a heartbeat gap: %d requests, want 2", calls)
	}
	b.advance(time.Second)
	b.reach.Record(bridge.Event{Tag: "PROJECT_STATUS", Fields: []string{"PROJECT_STATUS", "", "C:/Projects/Other/Other.rpp", "0", "9", "0", "0.000000", "", "aaaa"}})
	if _, err := cached.ReadTracks(t.Context()); err != nil {
		t.Fatal(err)
	}
	if calls := inner.calls.Load(); calls != 3 {
		t.Fatalf("with another project open: %d requests, want 3", calls)
	}
}

// The host's own change is known before the next heartbeat says so.
func TestAnInvalidatedListIsReadAgainWhateverTheRevision(t *testing.T) {
	inner, b := &countedLister{answer: revisedTracks(9, "aaaa")}, newBeat(9)
	b.setRevision(9, "aaaa")
	cached, cache := cachedFor(inner, b)
	read(t, cached)
	cache.Invalidate()
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests, want 2", calls)
	}
}

// An older script (until REAPER is restarted) sends no revision: the list is judged by the edit counter and its age, as before.
func TestAScriptThatSendsNoRevisionKeepsTheAgeRules(t *testing.T) {
	inner, b := &countedLister{answer: twoTracks(9)}, newBeat(9)
	cached, _ := cachedFor(inner, b)
	read(t, cached)
	tickBeat(b, 9, liveTracksMaxAge+time.Second)
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests past the max age with no revision, want 2", calls)
	}
}

// A heartbeat that is lost changes nothing: the next one carries the same revision, and the list is kept.
func TestALostHeartbeatDoesNotCostARead(t *testing.T) {
	inner, b := &countedLister{answer: revisedTracks(9, "aaaa")}, newBeat(9)
	b.setRevision(9, "aaaa")
	cached, _ := cachedFor(inner, b)
	read(t, cached)
	b.advance(3 * time.Second) // two heartbeats never arrived; the last one is still fresh
	read(t, cached)
	b.setRevision(9, "aaaa")
	read(t, cached)
	if calls := inner.calls.Load(); calls != 1 {
		t.Fatalf("%d requests, want 1", calls)
	}
}

// The heartbeat and the read can be a tick apart: while one is newer than the other the list is not reused, and once they agree it is kept.
func TestAListWhoseRevisionTheHeartbeatDoesNotCarryYetIsReadAgainUntilTheyAgree(t *testing.T) {
	inner, b := &countedLister{answer: revisedTracks(10, "bbbb")}, newBeat(9)
	b.setRevision(9, "aaaa") // the heartbeat is older than the answer about to be read
	cached, _ := cachedFor(inner, b)
	read(t, cached)
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests while the heartbeat is behind the list, want 2", calls)
	}
	b.beatFor(time.Second, 10, "bbbb")
	read(t, cached)
	read(t, cached)
	if calls := inner.calls.Load(); calls != 2 {
		t.Fatalf("%d requests once they agree, want 2 (the list last read is the one the heartbeat now carries, and it is kept)", calls)
	}
}

// Only one side carrying a revision is not a match by revision: the list is judged by the edit counter and its age.
func TestARevisionOnOneSideOnlyFallsBackToTheCounterAndTheAge(t *testing.T) {
	for name, c := range map[string]struct {
		answer dawport.LiveTracks
		beat   func(b *beat, count int)
	}{
		"the heartbeat has one, the list none": {twoTracks(9), func(b *beat, count int) { b.setRevision(count, "aaaa") }},
		"the list has one, the heartbeat none": {revisedTracks(9, "aaaa"), func(b *beat, count int) { b.set(count) }},
	} {
		inner, b := &countedLister{answer: c.answer}, newBeat(9)
		c.beat(b, 9)
		cached, _ := cachedFor(inner, b)
		read(t, cached)
		read(t, cached)
		if calls := inner.calls.Load(); calls != 1 {
			t.Errorf("%s: %d requests inside the max age with an equal counter, want 1", name, calls)
		}
		for elapsed := time.Duration(0); elapsed <= liveTracksMaxAge; elapsed += time.Second {
			b.advance(time.Second)
			c.beat(b, 9)
		}
		read(t, cached)
		if calls := inner.calls.Load(); calls != 2 {
			t.Errorf("%s: %d requests past the max age, want 2", name, calls)
		}
	}
}
