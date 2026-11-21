package main

import (
	"context"
	"reflect"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/daw"
	"desktop/internal/dawport"
)

func TestDawTracksChangedGolden(t *testing.T) {
	contractfile.Check(t, "daw-tracks-changed", dawTracksChanged{Revision: "00c3a1f29b7d4e58"})
}

// tracksBeat is a heartbeat whose last field is the track-list revision; "" is a script from before the revision.
func tracksBeat(revision string) bridge.Event {
	fields := []string{"PROJECT_STATUS", "", "C:/Projects/Alice/Alice.rpp", "0", "7", "0", "0.000000", "0"}
	if revision != "" {
		fields = append(fields, revision)
	}
	return bridge.Event{Tag: "PROJECT_STATUS", Fields: fields}
}

// emitEventSink is a package global read without a lock, so this test must not run in parallel.
func TestDawTracksChangedIsSentOncePerRevision(t *testing.T) {
	host, reach := newTestHostWithHeartbeat(t)
	host.ctx = context.Background()
	var sent []string
	emitEventSink = func(name string, data any) {
		if name == "daw_tracks_changed" {
			sent = append(sent, data.(dawTracksChanged).Revision)
		}
	}
	t.Cleanup(func() { emitEventSink = nil })
	tick := func(revision string) {
		reach.Record(tracksBeat(revision))
		host.pollDawTracksChanged()
		host.pollDawTracksChanged()
	}

	host.pollDawTracksChanged() // no heartbeat yet: the page is told no revision is known, so it keeps its own timer
	tick("aaaaaaaaaaaaaaaa")
	tick("aaaaaaaaaaaaaaaa") // the same list again: nothing
	tick("bbbbbbbbbbbbbbbb") // a track added in REAPER
	tick("")                 // an older script took over: back to not known
	tick("bbbbbbbbbbbbbbbb")

	// Another project with the same list: the heartbeat names another file, the epoch moves, and the same revision is sent again.
	other := tracksBeat("bbbbbbbbbbbbbbbb")
	other.Fields[2] = "C:/Projects/Alice/Copy.rpp"
	reach.Record(other)
	host.pollDawTracksChanged()
	host.pollDawTracksChanged()
	// The DAW link goes away: a page that held a revision is told none is known.
	host.reachability = nil
	host.pollDawTracksChanged()
	host.pollDawTracksChanged()

	want := []string{"", "aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb", "", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb", ""}
	if !reflect.DeepEqual(sent, want) {
		t.Fatalf("daw_tracks_changed must be sent once per change of revision, got %q want %q", sent, want)
	}
}

func recordTracksChanged(t *testing.T) *[]string {
	t.Helper()
	var sent []string
	emitEventSink = func(name string, data any) {
		if name == "daw_tracks_changed" {
			sent = append(sent, data.(dawTracksChanged).Revision)
		}
	}
	t.Cleanup(func() { emitEventSink = nil })
	return &sent
}

// A script that writes a revision in another form must not reach the page: its schema would refuse the event and the whole track list.
func TestDawTracksChangedSendsNoneForARevisionThePageCannotRead(t *testing.T) {
	host, reach := newTestHostWithHeartbeat(t)
	host.ctx = context.Background()
	sent := recordTracksChanged(t)
	host.pollDawTracksChanged()
	reach.Record(tracksBeat("ABCDEF0123456789"))
	host.pollDawTracksChanged()
	reach.Record(tracksBeat("xyz"))
	host.pollDawTracksChanged()
	if want := []string{""}; !reflect.DeepEqual(*sent, want) {
		t.Fatalf("a revision the page cannot read is not known, so nothing changes after the first tick: got %q want %q", *sent, want)
	}
	for _, bad := range []string{"", "ABCDEF0123456789", "xyz", "00c3a1f29b7d4e5", "00c3a1f29b7d4e58a"} {
		if wireRevision(bad) != "" {
			t.Fatalf("wireRevision(%q) must be empty", bad)
		}
	}
	if wireRevision("00c3a1f29b7d4e58") != "00c3a1f29b7d4e58" {
		t.Fatal("a 16-digit lower-case hex revision passes")
	}
}

// A tick before the host has a context sends nothing and does not use the change up.
func TestDawTracksChangedIsNotUsedUpBeforeItCanBeSent(t *testing.T) {
	host, reach := newTestHostWithHeartbeat(t)
	sent := recordTracksChanged(t)
	reach.Record(tracksBeat("aaaaaaaaaaaaaaaa"))
	host.pollDawTracksChanged()
	host.ctx = context.Background()
	host.pollDawTracksChanged()
	if want := []string{"aaaaaaaaaaaaaaaa"}; !reflect.DeepEqual(*sent, want) {
		t.Fatalf("got %q want %q", *sent, want)
	}
}

// Another studio project makes a new tracker whose epoch starts again at 0: the same revision at the same epoch is still sent again.
func TestDawTracksChangedIsSentAgainForAnotherProjectsTracker(t *testing.T) {
	host, reach := newTestHostWithHeartbeat(t)
	host.ctx = context.Background()
	sent := recordTracksChanged(t)
	reach.Record(tracksBeat("aaaaaaaaaaaaaaaa"))
	host.pollDawTracksChanged()
	next := daw.NewReachability(nil)
	next.Record(tracksBeat("aaaaaaaaaaaaaaaa"))
	host.reachability = next
	host.pollDawTracksChanged()
	if want := []string{"aaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaa"}; !reflect.DeepEqual(*sent, want) {
		t.Fatalf("got %q want %q", *sent, want)
	}
}

// A heartbeat value type that cannot be compared (a slice field) and names a revision: the tick must not compare it with ==.
type sliceBeat struct{ notes []string }

func (sliceBeat) Reachable() bool                      { return true }
func (sliceBeat) CurrentProject() (string, bool)       { return "C:/Projects/Alice/Alice.rpp", false }
func (b sliceBeat) Matches(string) bool                { return len(b.notes) == 0 }
func (sliceBeat) ChangeCount() (int, bool)             { return 1, true }
func (sliceBeat) Transport() (dawport.Transport, bool) { return dawport.Transport{}, false }
func (sliceBeat) TracksRevision() (string, bool)       { return "aaaaaaaaaaaaaaaa", true }

func TestDawTracksChangedDoesNotCompareAHeartbeatThatCannotBeCompared(t *testing.T) {
	host, _ := newTestHostWithHeartbeat(t)
	host.ctx = context.Background()
	recordTracksChanged(t)
	host.reachability = sliceBeat{}
	host.pollDawTracksChanged()
	host.pollDawTracksChanged() // would panic on `==` of two sliceBeat values
}

// The tick and TracksLive share one test for a heartbeat that names a revision: with a DAW whose heartbeat the engine does not report
// (Audacity has none), a fresh revision is neither sent nor stamped, so the page keeps its timer.
func TestATracksRevisionThePageCannotRelyOnIsNeitherSentNorStamped(t *testing.T) {
	host, reach := newTestHostWithHeartbeat(t)
	host.ctx = context.Background()
	sent := recordTracksChanged(t)
	host.config.daw = "Audacity"
	reach.Record(tracksBeat("aaaaaaaaaaaaaaaa"))
	host.pollDawTracksChanged()
	host.pollDawTracksChanged()
	if want := []string{""}; !reflect.DeepEqual(*sent, want) {
		t.Fatalf("got %q want %q", *sent, want)
	}
	if revision, _ := host.heartbeatTracks(host.services()); revision != "" {
		t.Fatalf("heartbeatTracks = %q, want none", revision)
	}
}
