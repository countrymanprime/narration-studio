package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/bridge"
	"github.com/countrymanprime/narration-studio/shell/internal/runlog"
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
