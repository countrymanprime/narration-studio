package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// savedRPP writes a .rpp whose modification time is 2026-09-26 08:40 local time, so savedAt reads the same in every
// time zone.
func savedRPP(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "Alice.rpp")
	if err := os.WriteFile(path, []byte("<REAPER_PROJECT\n>\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	saved := time.Date(2026, 9, 26, 8, 40, 0, 0, time.Local)
	if err := os.Chtimes(path, saved, saved); err != nil {
		t.Fatal(err)
	}
	return path
}

func heartbeat(rpp, changeCount, playState, position string) bridge.Event {
	unsaved := "0"
	if rpp == "" {
		unsaved = "1"
	}
	return bridge.Event{Tag: "PROJECT_STATUS", Fields: []string{"PROJECT_STATUS", "", rpp, unsaved, changeCount, playState, position}}
}

func decodeProjectState(t *testing.T, raw string, err error) map[string]any {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatal(err)
	}
	return decoded
}

var idleProjectState = map[string]any{"savedAt": nil, "unsavedChanges": false, "playState": "stopped", "playPosition": 0.0}

func sameProjectState(got, want map[string]any) bool {
	a, _ := json.Marshal(got)
	b, _ := json.Marshal(want)
	return string(a) == string(b)
}

// go-goldens: UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-project-state-*.json; without it the test compares
// and fails on drift. The second heartbeat in each case is the one the payload is read after (the first sets the
// edit-counter baseline).
func TestDawProjectStateContractGoldens(t *testing.T) {
	rpp := savedRPP(t)
	cases := []struct {
		name  string
		beats []bridge.Event
	}{
		{"daw-project-state-idle", nil},
		{"daw-project-state-saved", []bridge.Event{heartbeat(rpp, "7", "0", "3.000000"), heartbeat(rpp, "7", "0", "3.000000")}},
		{"daw-project-state-unsaved", []bridge.Event{heartbeat(rpp, "7", "1", "12.500000"), heartbeat(rpp, "8", "1", "12.500000")}},
		{"daw-project-state-recording", []bridge.Event{heartbeat(rpp, "7", "5", "40.250000"), heartbeat(rpp, "7", "5", "40.250000")}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			host, reach := newTestHostWithHeartbeat(t)
			var raw string
			var err error
			for _, beat := range c.beats {
				reach.Record(beat)
				raw, err = host.DawProjectState()
			}
			if c.beats == nil {
				raw, err = host.DawProjectState()
			}
			contractfile.Check(t, c.name, decodeProjectState(t, raw, err))
		})
	}
}

// binding-and-event: with no DAW, a DAW not answering, the built-in recorder or a REAPER project never saved, the payload
// is the idle one.
func TestDawProjectStateIsIdleWithoutAHeartbeat(t *testing.T) {
	neverSaved, reach := newTestHostWithHeartbeat(t)
	reach.Record(heartbeat("", "3", "0", "0.000000"))
	reach.Record(heartbeat("", "4", "0", "0.000000"))
	cases := map[string]*Host{
		"standalone":        newTestHostForDawCapabilities(t, ""),
		"audacity":          newTestHostForDawCapabilities(t, "Audacity"),
		"built-in recorder": builtinCapabilitiesHost(t),
		"reaper, no bridge": newTestHostForDawCapabilities(t, "REAPER"),
		"never saved":       neverSaved,
	}
	for name, host := range cases {
		raw, err := host.DawProjectState()
		got := decodeProjectState(t, raw, err)
		if !sameProjectState(got, idleProjectState) {
			t.Errorf("%s: DawProjectState() = %v, want the idle payload %v", name, got, idleProjectState)
		}
	}
}

// binding-and-event: the project state is read through the heartbeat capability, so a narrator who turned it off gets
// the idle payload. (Its own test: each test host points APPDATA somewhere new, which would hide this host's toggle.)
func TestDawProjectStateHeartbeatTurnedOffIsIdle(t *testing.T) {
	host, reach := newTestHostWithHeartbeat(t)
	reach.Record(heartbeat(savedRPP(t), "7", "5", "12.500000"))
	off := "off"
	if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapHeartbeat): &off}); err != nil {
		t.Fatal(err)
	}
	raw, err := host.DawProjectState()
	if got := decodeProjectState(t, raw, err); !sameProjectState(got, idleProjectState) {
		t.Fatalf("DawProjectState() = %v with the heartbeat capability turned off, want the idle payload", got)
	}
}

// binding-and-event: the event goes out on the first tick and then only when the payload changed.
func TestDawProjectStateChangedOnlyWhenThePayloadChanges(t *testing.T) {
	rpp := savedRPP(t)
	host, reach := newTestHostWithHeartbeat(t)
	reach.Record(heartbeat(rpp, "7", "0", "1.000000"))
	if _, changed := host.dawProjectStateChanged(); !changed {
		t.Fatal("the first read must count as a change, so the UI hears the project state once")
	}
	if _, changed := host.dawProjectStateChanged(); changed {
		t.Fatal("an unchanged project state must not be pushed again on the next tick")
	}
	reach.Record(heartbeat(rpp, "8", "0", "1.000000"))
	payload, changed := host.dawProjectStateChanged()
	if !changed || payload.UnsavedChanges != true {
		t.Fatalf("an edit in REAPER must be pushed as unsaved changes: changed = %v, payload = %+v", changed, payload)
	}
	// A save moves the file's modification time: the edits are saved now.
	saved := time.Date(2026, 9, 26, 9, 5, 0, 0, time.Local)
	if err := os.Chtimes(rpp, saved, saved); err != nil {
		t.Fatal(err)
	}
	payload, changed = host.dawProjectStateChanged()
	if !changed || payload.UnsavedChanges || payload.SavedAt == nil || *payload.SavedAt != "2026-09-26T09:05" {
		t.Fatalf("a save must be pushed with the new savedAt and no unsaved changes: changed = %v, payload = %+v", changed, payload)
	}
	// While stopped the position is not sent, so a heartbeat that only moved the edit cursor pushes nothing.
	reach.Record(heartbeat(rpp, "8", "0", "5.000000"))
	if _, changed := host.dawProjectStateChanged(); changed {
		t.Fatal("a stopped transport's position is not part of the payload")
	}
}
