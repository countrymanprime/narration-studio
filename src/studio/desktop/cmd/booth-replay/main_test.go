package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAPrintedSessionIsReplayedIntoTheReportAndItsTimeline(t *testing.T) {
	dir := t.TempDir()
	script, session := filepath.Join(dir, "script.txt"), filepath.Join(dir, "session.ndjson")
	_ = os.WriteFile(script, []byte("The old lighthouse keeper climbed the stairs."), 0o600)
	_ = os.WriteFile(session, []byte(`{"type": "script"}
{"type": "word", "segment": 0, "word": "the", "start": 0.0, "end": 0.2}
{"type": "word", "segment": 0, "word": "old", "start": 0.3, "end": 0.5}
{"type": "position", "read": 9}
{"type": "segment_end", "segment": 0}
`), 0o600)
	var out bytes.Buffer
	if err := run([]string{"--stream", session, "--script", script, "--timeline"}, nil, &out); err != nil {
		t.Fatal(err)
	}
	if text := out.String(); !strings.HasPrefix(text, "[   0.20s] read=   1") || !strings.Contains(text, `"final_read": 2,`) {
		t.Fatalf("printed %s", text)
	}
}

func TestCallsCarryTheirTokensAndTheMockIsWritten(t *testing.T) {
	out := filepath.Join(t.TempDir(), "recording.json")
	calls := `{"tokens": ["one", "two"]}
{"tick": 0.5}
{"feed": {"type": "word", "segment": 0, "word": "one", "start": 0.0, "end": 0.3}, "t": 0.5}
{"feed": {"type": "word", "segment": 0, "word": "two", "start": 0.4, "end": 0.7}, "t": 1.0}
`
	var printed bytes.Buffer
	if err := run([]string{"--mock", out}, strings.NewReader(calls), &printed); err != nil {
		t.Fatal(err)
	}
	written, _ := os.ReadFile(out)
	if !strings.HasPrefix(string(written), `{"tokens":2,"events":[{"t":0.5,"event":{"type":"position","read":1,`) || !strings.Contains(printed.String(), `"final_status": "done"`) {
		t.Fatalf("wrote %s, printed %s", written, printed.String())
	}
}

func TestAReplayWithoutAScriptIsRefused(t *testing.T) {
	if err := run([]string{}, strings.NewReader(`{"tick": 0.5}`), &bytes.Buffer{}); err == nil || !strings.Contains(err.Error(), "--script") {
		t.Fatalf("err %v", err)
	}
}
