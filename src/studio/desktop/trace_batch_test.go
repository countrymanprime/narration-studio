package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSystemTraceBatchWritesPageEventsAndRefusesTheRest(t *testing.T) {
	host := newTestHostForDawCapabilities(t, "")
	raw, err := host.SystemTraceBatch(`{"events":[
		{"event":"ui.nav","fields":{"page":"settings"}},
		{"event":"daw.reachable_changed","fields":{"kind":"reaper"}},
		{"event":"nonsense","fields":{}},
		{"event":"ui.error","fields":{"source":"boundary","message":"CANARY-TEXT C:\\Users\\zelda\\Book.docx"}}]}`)
	if err != nil {
		t.Fatal(err)
	}
	var result struct{ Accepted, Refused int }
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		t.Fatal(err)
	}
	if result.Accepted != 2 || result.Refused != 2 {
		t.Errorf("result = %+v, want two accepted and two refused", result)
	}
	if got := traceRecords(t, host, "ui.nav"); len(got) != 1 || got[0]["page"] != "settings" {
		t.Errorf("ui.nav = %v", got)
	}
	for _, line := range host.tracer.Snapshot() {
		if strings.Contains(string(line), "CANARY") || strings.Contains(string(line), "zelda") {
			t.Errorf("page text reached the trace: %s", line)
		}
	}
}

func TestSystemTraceBatchRefusesAnOversizedOrBrokenBatch(t *testing.T) {
	host := newTestHostForDawCapabilities(t, "")
	if _, err := host.SystemTraceBatch(strings.Repeat("x", maxTraceBatchBytes+1)); err == nil {
		t.Error("an oversized batch was accepted")
	}
	if _, err := host.SystemTraceBatch("not json"); err == nil {
		t.Error("a broken batch was accepted")
	}
	many := `{"events":[` + strings.Repeat(`{"event":"ui.nav","fields":{"page":"a"}},`, maxTraceBatchEvents) + `{"event":"ui.nav","fields":{"page":"a"}}]}`
	if _, err := host.SystemTraceBatch(many); err == nil {
		t.Error("a batch over the event cap was accepted")
	}
}
