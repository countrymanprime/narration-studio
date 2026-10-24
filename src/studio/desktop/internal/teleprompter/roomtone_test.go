package teleprompter

import (
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"desktop/internal/roomtone"
)

// roomLevels is how many level readings mode "room" prints: six seconds at the ten a second the sidecar sends, a reading
// at -20 dBFS (speech) for every two at the room's -58.
const roomLevels = 60

func printRoomLevels() {
	for i := 0; i < roomLevels; i++ {
		rms := -58
		if i%3 == 0 {
			rms = -20
		}
		fmt.Printf("{\"type\":\"level\",\"peak\":%d,\"rms\":%d}\n", rms+6, rms)
	}
}

// steppingClock answers a time 100 ms later at each call, so readings the sidecar prints at once are heard as ten a second.
func steppingClock() func() time.Time {
	var mu sync.Mutex
	at := time.Date(2026, 10, 24, 10, 0, 0, 0, time.UTC)
	return func() time.Time {
		mu.Lock()
		defer mu.Unlock()
		at = at.Add(100 * time.Millisecond)
		return at
	}
}

func roomToneFixture(t *testing.T) (*fixture, string) {
	t.Helper()
	f := newFixture(t, "room")
	path := filepath.Join(t.TempDir(), "room-tone.json")
	f.service.traceNow = steppingClock()
	f.service.SetRoomTone(roomtone.NewMeter(roomtone.Open(path, nil)))
	return f, path
}

func TestTheLevelMeterMeasuresTheRoomToneAndKeepsItWhenItStops(t *testing.T) {
	f, path := roomToneFixture(t)
	if _, ok := f.service.RoomTone("Microphone Array"); ok {
		t.Fatal("a room tone before anything was heard")
	}
	if err := f.service.MeterStart("Microphone Array"); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the readings", func() bool { return f.recorder.count("level") == roomLevels })
	f.service.MeterStop()
	waitFor(t, "the meter to stop", func() bool { return f.recorder.count(meterStoppedType) == 1 })
	got, ok := f.service.RoomTone("Microphone Array")
	if !ok || got.DB != -58 {
		t.Fatalf("RoomTone = %+v, %v; want the pauses' -58", got, ok)
	}
	if kept, ok := roomtone.Open(path, nil).Get("Microphone Array"); !ok || kept != got {
		t.Fatalf("kept %+v, %v; want it on disk too", kept, ok)
	}
	if _, ok := f.service.RoomTone("Another Mic"); ok {
		t.Fatal("a room tone for a microphone that was never heard")
	}
}

func TestAReadingSessionMeasuresTheRoomToneOfItsMicrophone(t *testing.T) {
	f, _ := roomToneFixture(t)
	if err := f.service.Start(validOptions()); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the readings", func() bool { return f.recorder.count("level") == roomLevels })
	f.service.Stop()
	waitFor(t, "the session to stop", func() bool { phase, _ := f.service.Snapshot()["phase"].(string); return phase == "stopped" })
	if got, ok := f.service.RoomTone("Microphone Array"); !ok || got.DB != -58 {
		t.Fatalf("RoomTone = %+v, %v; want -58", got, ok)
	}
}

func TestWithNoRoomToneMeterTheLevelsStillFlow(t *testing.T) {
	f := newFixture(t, "room")
	if err := f.service.MeterStart("Microphone Array"); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the readings", func() bool { return f.recorder.count("level") == roomLevels })
	if _, ok := f.service.RoomTone("Microphone Array"); ok {
		t.Fatal("a room tone with no meter")
	}
}
