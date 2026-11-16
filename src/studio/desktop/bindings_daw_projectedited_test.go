package main

import (
	"context"
	"strconv"
	"sync"
	"testing"

	"desktop/internal/bridge"
)

// fakeHeartbeatDAW is REAPER's side of the change counter: every heartbeat carries it, an edit raises it, and a chapter move (go_to) leaves it
// alone because narration_track_select.lua selects with I_SELECTED, which REAPER does not count. This fake only states that behaviour; the Lua
// harness test "go_to leaves the project change count alone" (src/studio/integrations/reaper/tests/track_select_test.lua) and the real-REAPER row
// in scripts/ci/real-reaper/scenarios_select_count.py are what prove the command does it.
type fakeHeartbeatDAW struct{ count int }

func (f *fakeHeartbeatDAW) goTo() {}
func (f *fakeHeartbeatDAW) edit() { f.count++ }
func (f *fakeHeartbeatDAW) beat() bridge.Event {
	return heartbeat("", strconv.Itoa(f.count), "0", "0.000000")
}

func TestAChapterMoveThatLeavesTheChangeCountSendsNoEditEvent(t *testing.T) {
	host, reach := newTestHostWithHeartbeat(t)
	host.ctx = context.Background()
	var mu sync.Mutex
	var sent []int
	emitEventSink = func(name string, data any) {
		if name != "daw_project_edited" {
			return
		}
		mu.Lock()
		sent = append(sent, data.(dawProjectEdited).ChangeCount)
		mu.Unlock()
	}
	t.Cleanup(func() { emitEventSink = nil })
	emissions := func() []int {
		mu.Lock()
		defer mu.Unlock()
		return append([]int(nil), sent...)
	}

	daw := &fakeHeartbeatDAW{count: 41}
	reach.Record(daw.beat())
	host.pollDawProjectEdited()
	if got := emissions(); len(got) != 1 || got[0] != 41 {
		t.Fatalf("the first tick must report the count once, got %v", got)
	}

	for range 3 { // open a chapter, again to the same one, then another and back
		daw.goTo()
		reach.Record(daw.beat())
		host.pollDawProjectEdited()
	}
	if got := emissions(); len(got) != 1 {
		t.Fatalf("a chapter move that leaves the change count must send no daw_project_edited, got %v", got)
	}

	daw.edit()
	reach.Record(daw.beat())
	host.pollDawProjectEdited()
	host.pollDawProjectEdited()
	if got := emissions(); len(got) != 2 || got[1] != 42 {
		t.Fatalf("a real edit must send exactly one daw_project_edited with the new count, got %v", got)
	}
}
