package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/runlog"
)

// A request's timing reaches run.jsonl as the command name, an outcome word and milliseconds, and nothing from the request's
// arguments or the script's answer.
func TestBridgeTimingRecordHoldsNoNarratorContent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "logs", "run.jsonl")
	host := &Host{runLog: runlog.New(path, 0)}
	host.recordBridgeTiming(bridge.RequestTiming{Command: "play_position", Outcome: "answered", Elapsed: 83 * time.Millisecond})

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var found map[string]any
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		var record map[string]any
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatalf("line %q is not JSON: %v", line, err)
		}
		if record["event"] == "bridge.timing" {
			found = record
		}
	}
	if found == nil {
		t.Fatalf("no bridge.timing record in %s", raw)
	}
	if found["command"] != "play_position" || found["outcome"] != "answered" || found["elapsed_ms"] != float64(83) {
		t.Errorf("record = %v", found)
	}
}

func runLogRecords(t *testing.T, path string) []map[string]any {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var records []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		var record map[string]any
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatalf("line %q is not JSON: %v", line, err)
		}
		records = append(records, record)
	}
	return records
}

// Every request leaves a bridge.timing record with its queue and REAPER split; one over a second, or with no answer, also leaves a
// bridge.slow warning with the same fields, and a quick answered one does not.
func TestASlowBridgeStepLeavesAWarningWithItsSplit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "logs", "run.jsonl")
	host := &Host{runLog: runlog.New(path, 0)}
	host.recordBridgeTiming(bridge.RequestTiming{Command: "arm_lane", Outcome: "answered", Elapsed: 120 * time.Millisecond, Queue: 40 * time.Millisecond, Taken: true})
	host.recordBridgeTiming(bridge.RequestTiming{Command: "chapter_track_state", Outcome: "answered", Elapsed: 1800 * time.Millisecond, Queue: 300 * time.Millisecond, Taken: true})
	host.recordBridgeTiming(bridge.RequestTiming{Command: "record_start", Outcome: "no_answer", Elapsed: 3 * time.Second, Queue: 3 * time.Second})

	var timing, slow []map[string]any
	for _, record := range runLogRecords(t, path) {
		switch record["event"] {
		case "bridge.timing":
			timing = append(timing, record)
		case "bridge.slow":
			slow = append(slow, record)
		}
	}
	if len(timing) != 3 || len(slow) != 2 {
		t.Fatalf("%d bridge.timing and %d bridge.slow records, want 3 and 2", len(timing), len(slow))
	}
	if slow[0]["command"] != "chapter_track_state" || slow[0]["elapsed_ms"] != float64(1800) || slow[0]["queue_ms"] != float64(300) || slow[0]["reaper_ms"] != float64(1500) || slow[0]["taken"] != true {
		t.Errorf("slow answered step = %v", slow[0])
	}
	if slow[1]["command"] != "record_start" || slow[1]["outcome"] != "no_answer" || slow[1]["taken"] != false || slow[1]["queue_ms"] != float64(3000) || slow[1]["reaper_ms"] != float64(0) {
		t.Errorf("unanswered step = %v", slow[1])
	}
	if slow[0]["level"] != "warn" {
		t.Errorf("bridge.slow level = %v, want warn", slow[0]["level"])
	}
}
