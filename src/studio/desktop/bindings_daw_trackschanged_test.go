package main

import (
	"context"
	"reflect"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
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
