package teleprompter

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"desktop/internal/contractfile"
	"desktop/internal/scripttrack"
)

// The `teleprompter:state` snapshot the host builds, pinned for the UI's contract tests. The running snapshot is
// built by relaying the events the Python sidecar's own test pins (teleprompter-events.json) through the real onLine, so
// the two halves of the stream are tied to the same file.
func TestContractIdleState(t *testing.T) {
	service := New(Config{}, nil, nil, nil)
	contractfile.Check(t, "teleprompter-state-idle", service.Snapshot())
}

func TestContractRunningStateFromTheSidecarsOwnEvents(t *testing.T) {
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	bytes, err := os.ReadFile(filepath.Join(dir, "teleprompter-events.json"))
	if err != nil {
		t.Fatalf("the sidecar's event file is missing (run the Python contract test with UPDATE_CONTRACTS=1): %v", err)
	}
	var events []json.RawMessage
	if err := json.Unmarshal(bytes, &events); err != nil {
		t.Fatal(err)
	}
	var relayed int
	service := New(Config{}, nil, func(json.RawMessage) { relayed++ }, nil)
	service.state = map[string]any{"phase": "running", "message": "Listening…", "engine": "whisper", "chapter": "c1", "paused": false, "coldRead": false}
	for _, event := range events {
		service.onLine(string(event))
	}
	if relayed != len(events) || service.Dropped() != 0 {
		t.Fatalf("relayed %d of %d events, dropped %d: the host must relay every event the sidecar produces", relayed, len(events), service.Dropped())
	}
	contractfile.Check(t, "teleprompter-state-running", service.Snapshot())
}

// The meter's stream: every `level` the Python sidecar's own test pins
// (teleprompter-level.json) passes the meter's filter unchanged, and the `meter_stopped` events the host adds when a meter
// ends by request and on a failure are pinned for the UI's schema.
func TestContractMeterRelaysTheSidecarsLevelsAndEndsWithMeterStopped(t *testing.T) {
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	bytes, err := os.ReadFile(filepath.Join(dir, "teleprompter-level.json"))
	if err != nil {
		t.Fatalf("the sidecar's level file is missing (run the Python contract test with UPDATE_CONTRACTS=1): %v", err)
	}
	var levels []json.RawMessage
	if err := json.Unmarshal(bytes, &levels); err != nil {
		t.Fatal(err)
	}
	var relayed []json.RawMessage
	service := New(Config{}, nil, func(raw json.RawMessage) { relayed = append(relayed, raw) }, nil)
	for _, level := range levels {
		service.onMeterLine("", string(level))
	}
	if len(relayed) != len(levels) {
		t.Fatalf("the meter relayed %d of %d levels", len(relayed), len(levels))
	}
	stopped := []map[string]any{
		{"type": meterStoppedType, "error": nil},
		{"type": meterStoppedType, "error": "Could not open the microphone: device not found"},
	}
	contractfile.Check(t, "teleprompter-meter-stopped", stopped)
}

// The host's follower makes the pinned stream from its engine events alone: the script event, then each engine event and
// the position and flag events it caused, as the Python test pinned them in teleprompter-events.json.
func TestContractTheHostFollowsThePinnedEventsIntoThePinnedStream(t *testing.T) {
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	bytes, err := os.ReadFile(filepath.Join(dir, "teleprompter-events.json"))
	if err != nil {
		t.Fatal(err)
	}
	var events []json.RawMessage
	if err := json.Unmarshal(bytes, &events); err != nil {
		t.Fatal(err)
	}
	// The manuscript test_contract_goldens.py reads.
	manuscript := filepath.Join(t.TempDir(), "manuscript.json")
	text := `{"schemaVersion": 1, "documentId": "lighthouse", "chapters": [{"id": "c1", "title": "Chapter One", "contentKind": "narration"}], "paragraphs": [` +
		`{"id": "p1", "chapterId": "c1", "index": 0, "text": "The old lighthouse keeper climbed the spiral stairs each evening. He lit the great lamp and watched the ships pass."}, ` +
		`{"id": "p2", "chapterId": "c1", "index": 1, "text": "Far out at sea a small boat rocked in the swell."}]}`
	if err := os.WriteFile(manuscript, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
	script, err := scripttrack.LoadChapterScript(manuscript, "c1")
	if err != nil {
		t.Fatal(err)
	}
	service, lines := recordingService()
	service.startFollowing(script, nil)
	service.onLine(`{"type": "clock", "t": 0.0}`)
	for _, event := range events {
		if kind, _ := isEvent(event); kind != "script" && kind != "position" && kind != "flag" {
			service.onLine(`{"type": "clock", "t": 0.0}`)
			service.onLine(string(event))
		}
	}
	if want, got := sent(t, events), sent(t, *lines); !reflect.DeepEqual(want, got) {
		t.Fatalf("the host's stream differs from teleprompter-events.json:\nwant %v\n got %v", want, got)
	}
}

// The credits script event the host sends is the one the Python test pinned in teleprompter-credits-script.json.
func TestContractTheCreditsScriptEventIsThePinnedOne(t *testing.T) {
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	pinned, err := os.ReadFile(filepath.Join(dir, "teleprompter-credits-script.json"))
	if err != nil {
		t.Fatal(err)
	}
	script, err := scripttrack.TextScript("You have been listening to Alice, written by Lewis Carroll,\nnarrated by Ada Finch.\n\nThe End.", "credits-closing", "Closing credits")
	if err != nil {
		t.Fatal(err)
	}
	if want, got := sent(t, []json.RawMessage{pinned}), sent(t, []json.RawMessage{compactLine(scripttrack.ScriptEvent(script))}); !reflect.DeepEqual(want, got) {
		t.Fatalf("want %v\n got %v", want, got)
	}
}
