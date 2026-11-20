package daw

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"desktop/internal/bridge"
)

func TestReachabilityWithNoHeartbeatIsUnreachable(t *testing.T) {
	reach := NewReachability(nil)
	if reach.Reachable() {
		t.Fatal("Reachable() = true, want false: no heartbeat ever arrived")
	}
	if reach.Matches("C:/p/Book.rpp") {
		t.Fatal("Matches() = true, want false: no heartbeat ever arrived")
	}
}

func TestReachabilityWithNilClientNeverBecomesReachable(t *testing.T) {
	reach := NewReachability(nil)
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0"}})
	if !reach.Reachable() {
		t.Fatal("a nil client still lets a manually delivered event record a heartbeat")
	}
}

func TestReachabilityBecomesUnreachableAfterTheHeartbeatTimeout(t *testing.T) {
	reach := NewReachability(nil)
	clock := time.Now()
	reach.now = func() time.Time { return clock }
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0"}})
	if !reach.Reachable() {
		t.Fatal("Reachable() = false right after a heartbeat, want true")
	}
	clock = clock.Add(heartbeatTimeout + time.Second)
	if reach.Reachable() {
		t.Fatal("Reachable() = true after the heartbeat timeout elapsed, want false")
	}
}

func TestReachabilityCurrentProjectReflectsTheLastHeartbeat(t *testing.T) {
	reach := NewReachability(nil)
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "", "1"}})
	rpp, unsaved := reach.CurrentProject()
	if rpp != "" || !unsaved {
		t.Fatalf("CurrentProject() = (%q, %v), want empty rpp and unsaved true", rpp, unsaved)
	}
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0"}})
	rpp, unsaved = reach.CurrentProject()
	if rpp != "C:/p/Book.rpp" || unsaved {
		t.Fatalf("CurrentProject() = (%q, %v), want the saved path and unsaved false", rpp, unsaved)
	}
}

func TestReachabilityMatchesIsCaseInsensitiveAndNormalizesSeparators(t *testing.T) {
	reach := NewReachability(nil)
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", `C:\Projects\Book\Book.rpp`, "0"}})
	if !reach.Matches(`c:\projects\book\book.rpp`) {
		t.Fatal("Matches() = false, want true: same file, different case")
	}
	if reach.Matches(`C:\Projects\Other\Other.rpp`) {
		t.Fatal("Matches() = true, want false: a different linked file")
	}
}

func TestReachabilityDoesNotMatchAnUnsavedOpenProject(t *testing.T) {
	reach := NewReachability(nil)
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "", "1"}})
	if reach.Matches("C:/p/Book.rpp") {
		t.Fatal("an unsaved open project must never match a linked file")
	}
}

func TestReachabilityMatchesIsFalseWithNoLinkedPath(t *testing.T) {
	reach := NewReachability(nil)
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0"}})
	if reach.Matches("") {
		t.Fatal("an empty linked path must never match")
	}
}

// TestReachabilitySubscribesToARealBridgeClient is the integration path: a real bridge.Client dispatching a real
// events.log, the same wiring src/studio/desktop/app.go's configureLocked uses.
func TestReachabilitySubscribesToARealBridgeClient(t *testing.T) {
	dir := t.TempDir()
	client, err := bridge.New(dir)
	if err != nil {
		t.Fatal(err)
	}
	reach := NewReachability(client)
	if reach.Reachable() {
		t.Fatal("Reachable() = true before any event was dispatched")
	}
	line := "PROJECT_STATUS||" + bridge.PercentEncode(filepath.Join(dir, "Book.rpp")) + "|0\n"
	if err := os.WriteFile(filepath.Join(dir, "events.log"), []byte(line), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := client.Dispatch(); err != nil {
		t.Fatal(err)
	}
	if !reach.Reachable() {
		t.Fatal("Reachable() = false after a real PROJECT_STATUS event was dispatched")
	}
	rpp, unsaved := reach.CurrentProject()
	if rpp != filepath.Join(dir, "Book.rpp") || unsaved {
		t.Fatalf("CurrentProject() = (%q, %v), want the dispatched path and unsaved false", rpp, unsaved)
	}
}

func TestReachabilityKeepsREAPERsEditCounterFromTheHeartbeat(t *testing.T) {
	reach := NewReachability(nil)
	if _, known := reach.ChangeCount(); known {
		t.Fatal("ChangeCount() is known before any heartbeat")
	}
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "41"}})
	if count, known := reach.ChangeCount(); !known || count != 41 {
		t.Fatalf("ChangeCount() = (%d, %v), want (41, true)", count, known)
	}
}

func TestReachabilityForgetsTheEditCounterWhenAHeartbeatDoesNotCarryOne(t *testing.T) {
	reach := NewReachability(nil)
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "41"}})
	// An older script (three fields) and a REAPER without GetProjectStateChangeCount (an empty fourth field).
	for _, fields := range [][]string{{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0"}, {"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", ""}} {
		reach.Record(bridge.Event{Fields: fields})
		if _, known := reach.ChangeCount(); known {
			t.Fatalf("ChangeCount() is still known after %v", fields)
		}
	}
}

func TestReachabilityChangeCountIsUnknownOnceTheHeartbeatIsStale(t *testing.T) {
	reach := NewReachability(nil)
	clock := time.Now()
	reach.now = func() time.Time { return clock }
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "3"}})
	clock = clock.Add(heartbeatTimeout + time.Second)
	if _, known := reach.ChangeCount(); known {
		t.Fatal("ChangeCount() is known from a stale heartbeat")
	}
}

// docs/architecture/reaper-bridge.md: the heartbeat's fifth and sixth fields are the transport, GetPlayState's bit field and
// GetPlayPosition, so the host knows REAPER is playing or recording without asking it.
func TestReachabilityTransportFollowsTheHeartbeat(t *testing.T) {
	cases := []struct {
		name      string
		playState string
		want      Transport
	}{
		{"stopped", "0", Transport{Position: 12.5}},
		{"playing", "1", Transport{Playing: true, Position: 12.5}},
		{"paused", "2", Transport{Position: 12.5}},
		{"recording", "5", Transport{Playing: true, Recording: true, Position: 12.5}},
		// A paused recording still has its take open: the booth keeps quiet until it is stopped.
		{"recording paused", "6", Transport{Recording: true, Position: 12.5}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			reach := NewReachability(nil)
			reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "3", c.playState, "12.500000"}})
			got, ok := reach.Transport()
			if !ok || got != c.want {
				t.Fatalf("Transport() = (%+v, %v), want (%+v, true)", got, ok, c.want)
			}
		})
	}
}

func TestReachabilityTransportIsUnknownWithoutTheFields(t *testing.T) {
	reach := NewReachability(nil)
	if _, ok := reach.Transport(); ok {
		t.Fatal("Transport() ok with no heartbeat at all")
	}
	// An older bridge script's heartbeat, with no transport fields.
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "3"}})
	if _, ok := reach.Transport(); ok {
		t.Fatal("Transport() ok from a heartbeat that carried no transport")
	}
	// A later heartbeat that carries one, then an older-shaped one again: the stale transport is not kept.
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "3", "5", "1.000000"}})
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "3"}})
	if _, ok := reach.Transport(); ok {
		t.Fatal("Transport() kept a transport the last heartbeat did not carry")
	}
}

func TestReachabilityTransportIsUnknownOnceTheHeartbeatIsStale(t *testing.T) {
	reach := NewReachability(nil)
	clock := time.Now()
	reach.now = func() time.Time { return clock }
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "3", "5", "1.000000"}})
	clock = clock.Add(heartbeatTimeout + time.Second)
	if got, ok := reach.Transport(); ok {
		t.Fatalf("Transport() = (%+v, true) after the heartbeat timed out: a closed REAPER is not still recording", got)
	}
}

func TestReachabilityLastSeenAgeAndTimeout(t *testing.T) {
	reach := NewReachability(nil)
	clock := time.Now()
	reach.now = func() time.Time { return clock }
	if _, heard := reach.LastSeenAge(); heard {
		t.Fatal("LastSeenAge() reports a heartbeat before any arrived")
	}
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0"}})
	clock = clock.Add(2 * time.Second)
	age, heard := reach.LastSeenAge()
	if !heard || age != 2*time.Second {
		t.Fatalf("LastSeenAge() = (%v, %v), want (2s, true)", age, heard)
	}
	if HeartbeatTimeout() != heartbeatTimeout {
		t.Fatalf("HeartbeatTimeout() = %v, want %v", HeartbeatTimeout(), heartbeatTimeout)
	}
}

func TestReachabilityMatchReasonNamesWhyAProjectDoesNotMatch(t *testing.T) {
	reach := NewReachability(nil)
	clock := time.Now()
	reach.now = func() time.Time { return clock }
	if got := reach.MatchReason("C:/p/Book.rpp"); got != "stale" {
		t.Errorf("no heartbeat: MatchReason = %q, want stale", got)
	}
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0"}})
	for linked, want := range map[string]string{"": "no_link", "c:/p/book.rpp": "ok", "C:/p/Other.rpp": "path_differs"} {
		if got := reach.MatchReason(linked); got != want {
			t.Errorf("linked %q: MatchReason = %q, want %s", linked, got, want)
		}
	}
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "1"}})
	if got := reach.MatchReason("C:/p/Book.rpp"); got != "unsaved" {
		t.Errorf("unsaved project: MatchReason = %q, want unsaved", got)
	}
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "", "0"}})
	if got := reach.MatchReason("C:/p/Book.rpp"); got != "no_project" {
		t.Errorf("no project open: MatchReason = %q, want no_project", got)
	}
	clock = clock.Add(heartbeatTimeout + time.Second)
	if got := reach.MatchReason("C:/p/Book.rpp"); got != "stale" {
		t.Errorf("old heartbeat: MatchReason = %q, want stale", got)
	}
}

func TestReachabilityKnowsTheTimingSwitchFromAFreshHeartbeat(t *testing.T) {
	reach := NewReachability(nil)
	clock := time.Now()
	reach.now = func() time.Time { return clock }
	if reach.TimingOn() {
		t.Fatal("TimingOn() before any heartbeat")
	}
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "3", "0", "0.000000", "1"}})
	if !reach.TimingOn() {
		t.Fatal("TimingOn() = false after a heartbeat carrying 1")
	}
	clock = clock.Add(heartbeatTimeout + time.Second)
	if reach.TimingOn() {
		t.Fatal("TimingOn() = true from a heartbeat older than the timeout")
	}
	reach.Record(bridge.Event{Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "3", "0", "0.000000"}})
	if reach.TimingOn() {
		t.Fatal("TimingOn() = true after a heartbeat without the field")
	}
}

// The epoch counts the times the bridge may have started over: a heartbeat after a gap, for another project, or with an edit counter that went
// down. A heartbeat that goes on as before does not move it (#3647: a consumer that holds something read from REAPER keeps the epoch it read in).
func TestReachabilityEpochMovesOnlyWhenTheBridgeMayHaveStartedOver(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	reach := NewReachabilityWithClock(nil, func() time.Time { return now })
	beat := func(rpp, count string) {
		reach.Record(bridge.Event{Tag: "PROJECT_STATUS", Fields: []string{"PROJECT_STATUS", "", rpp, "0", count}})
	}
	beat("C:/p/Book.rpp", "7")
	first := reach.Epoch()
	now = now.Add(1500 * time.Millisecond)
	beat("C:/p/Book.rpp", "7")
	now = now.Add(1500 * time.Millisecond)
	beat("C:/p/Book.rpp", "9") // an edit: the counter rises
	if got := reach.Epoch(); got != first {
		t.Fatalf("epoch %d after ordinary heartbeats, want %d", got, first)
	}
	now = now.Add(heartbeatTimeout + time.Second) // REAPER went quiet for longer than the timeout and came back
	beat("C:/p/Book.rpp", "9")
	gap := reach.Epoch()
	if gap <= first {
		t.Fatalf("epoch %d after a gap, want it moved past %d", gap, first)
	}
	now = now.Add(time.Second)
	beat("C:/p/Other.rpp", "9") // another project
	other := reach.Epoch()
	if other <= gap {
		t.Fatalf("epoch %d for another project, want it moved past %d", other, gap)
	}
	now = now.Add(time.Second)
	beat("C:/p/Other.rpp", "2") // the counter went down: the project was reopened
	if got := reach.Epoch(); got <= other {
		t.Fatalf("epoch %d after the counter went down, want it moved past %d", got, other)
	}
}

// The first heartbeat starts the first epoch: nothing was read before it, so it moves nothing.
func TestReachabilityEpochIsZeroUntilARealRestartAndTheFirstBeatDoesNotMoveIt(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	reach := NewReachabilityWithClock(nil, func() time.Time { return now })
	if got := reach.Epoch(); got != 0 {
		t.Fatalf("epoch %d before any heartbeat, want 0", got)
	}
	reach.Record(bridge.Event{Tag: "PROJECT_STATUS", Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "7"}})
	if got := reach.Epoch(); got != 0 {
		t.Fatalf("epoch %d after the first heartbeat, want 0", got)
	}
}

// The gap rule is "longer than the heartbeat timeout": a beat exactly that late is the same bridge, one a nanosecond later may not be.
func TestReachabilityEpochGapBoundaryIsTheHeartbeatTimeout(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	reach := NewReachabilityWithClock(nil, func() time.Time { return now })
	beat := func() {
		reach.Record(bridge.Event{Tag: "PROJECT_STATUS", Fields: []string{"PROJECT_STATUS", "", "C:/p/Book.rpp", "0", "7"}})
	}
	beat()
	now = now.Add(heartbeatTimeout)
	beat()
	if got := reach.Epoch(); got != 0 {
		t.Fatalf("epoch %d after a beat exactly %s late, want 0", got, heartbeatTimeout)
	}
	now = now.Add(heartbeatTimeout + time.Nanosecond)
	beat()
	if got := reach.Epoch(); got != 1 {
		t.Fatalf("epoch %d after a beat a nanosecond past the timeout, want 1", got)
	}
}

// Windows can spell the same project's path in another case: that is not another project, and must not drop what was read.
func TestReachabilityEpochIgnoresACaseOnlyPathChange(t *testing.T) {
	now := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	reach := NewReachabilityWithClock(nil, func() time.Time { return now })
	reach.Record(bridge.Event{Tag: "PROJECT_STATUS", Fields: []string{"PROJECT_STATUS", "", "C:/Projects/Alice/Alice.rpp", "0", "7"}})
	now = now.Add(time.Second)
	reach.Record(bridge.Event{Tag: "PROJECT_STATUS", Fields: []string{"PROJECT_STATUS", "", "c:/projects/alice/alice.rpp", "0", "7"}})
	if got := reach.Epoch(); got != 0 {
		t.Fatalf("epoch %d after the same path in another case, want 0", got)
	}
}
