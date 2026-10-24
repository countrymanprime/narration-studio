package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"desktop/internal/contractfile"
	"desktop/internal/process"
	"desktop/internal/roomtone"
	"desktop/internal/teleprompter"
)

func roomToneHost(t *testing.T, kept map[string]roomtone.Reading) *Host {
	t.Helper()
	store := roomtone.Open(filepath.Join(t.TempDir(), "room-tone.json"), nil)
	for device, reading := range kept {
		if err := store.Put(device, reading); err != nil {
			t.Fatal(err)
		}
	}
	service := teleprompter.New(teleprompter.Config{Project: t.TempDir(), SessionDir: t.TempDir(), Python: os.Args[0]}, process.NewSupervisor(), nil, nil)
	service.SetRoomTone(roomtone.NewMeter(store))
	return &Host{teleprompter: service}
}

func decodeRoomTone(t *testing.T, raw string) map[string]any {
	t.Helper()
	var decoded map[string]any
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		t.Fatal(err)
	}
	return decoded
}

// The `TeleprompterRoomTone` payloads the UI receives, pinned for the TS contract test: a kept reading and none.
func TestContractTeleprompterRoomTone(t *testing.T) {
	host := roomToneHost(t, map[string]roomtone.Reading{"USB Mic": {DB: -58.6, MeasuredAt: time.Date(2026, 10, 24, 10, 0, 0, 0, time.UTC), Seconds: 12.5}})
	raw, err := host.TeleprompterRoomTone("USB Mic")
	if err != nil {
		t.Fatal(err)
	}
	measured := decodeRoomTone(t, raw)
	if measured["db"] != -58.6 || measured["measuredAt"] != "2026-10-24T10:00:00Z" || measured["seconds"] != 12.5 {
		t.Fatalf("measured = %v", measured)
	}
	contractfile.Check(t, "teleprompter-room-tone-measured", measured)

	raw, err = host.TeleprompterRoomTone("Desk Mic")
	if err != nil {
		t.Fatal(err)
	}
	none := decodeRoomTone(t, raw)
	if none["db"] != nil || none["measuredAt"] != nil || none["seconds"] != nil {
		t.Fatalf("unmeasured = %v", none)
	}
	contractfile.Check(t, "teleprompter-room-tone-none", none)
}

func TestTeleprompterRoomToneReportsAnUnavailableServiceLikeTeleprompterStart(t *testing.T) {
	if _, err := (&Host{}).TeleprompterRoomTone("USB Mic"); err == nil {
		t.Fatal("no error without a teleprompter service")
	}
}

func TestTheRoomToneFileLivesWithTheOtherPerUserFiles(t *testing.T) {
	t.Setenv("APPDATA", filepath.Join(t.TempDir(), "Roaming"))
	if got, want := filepath.Dir(roomTonePath()), filepath.Dir(seriesPath()); got != want {
		t.Fatalf("room-tone.json in %s; want beside series.json in %s", got, want)
	}
	if filepath.Base(roomTonePath()) != "room-tone.json" {
		t.Fatalf("roomTonePath = %s", roomTonePath())
	}
}
