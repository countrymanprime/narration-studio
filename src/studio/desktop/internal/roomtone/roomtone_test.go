package roomtone

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"desktop/internal/persist"
)

var start = time.Date(2026, 10, 24, 10, 0, 0, 0, time.UTC)

// feed adds a reading every 100 ms for seconds, the level pattern given by at (time into the run) a dBFS RMS.
func feed(e *Estimator, from time.Time, seconds float64, at func(t float64) float64) time.Time {
	steps := int(seconds * 10)
	for i := 0; i < steps; i++ {
		t := float64(i) / 10
		e.Add(from.Add(time.Duration(t*float64(time.Second))), at(t))
	}
	return from.Add(time.Duration(seconds * float64(time.Second)))
}

// speech is a narrator reading: -20 dBFS for 0.7 s, then a 0.3 s pause at the room's -58 dBFS.
func speech(t float64) float64 {
	if t-float64(int(t)) < 0.7 {
		return -20
	}
	return -58
}

func TestTheFloorNeedsFiveSecondsHeard(t *testing.T) {
	e := NewEstimator()
	feed(e, start, 4.5, speech)
	if _, _, ok := e.Floor(); ok {
		t.Fatal("a floor after 4.5 s; want none until 5 s are heard")
	}
	feed(e, start.Add(4500*time.Millisecond), 1, speech)
	if db, heard, ok := e.Floor(); !ok || db != -58 || heard < 5 {
		t.Fatalf("Floor = %v, %v, %v; want -58 after 5.5 s heard", db, heard, ok)
	}
}

func TestTheFloorIsTheQuietBetweenPhrasesNotTheSpeech(t *testing.T) {
	e := NewEstimator()
	feed(e, start, 10, speech)
	if db, _, ok := e.Floor(); !ok || db != -58 {
		t.Fatalf("Floor = %v, %v; want the pauses' -58", db, ok)
	}
}

func TestTheFloorFollowsTheLastTwentySeconds(t *testing.T) {
	e := NewEstimator()
	next := feed(e, start, 20, func(float64) float64 { return -70 })
	feed(e, next, 25, func(float64) float64 { return -50 }) // the heater came on
	if db, heard, ok := e.Floor(); !ok || db != -50 || heard > 20.5 {
		t.Fatalf("Floor = %v over %v s, %v; want -50 over at most 20 s", db, heard, ok)
	}
}

func TestDigitalSilenceIsNotRoomTone(t *testing.T) {
	e := NewEstimator()
	feed(e, start, 10, func(float64) float64 { return -120 }) // a muted or unplugged microphone
	if _, _, ok := e.Floor(); ok {
		t.Fatal("digital silence measured as room tone")
	}
	next := feed(e, start.Add(10*time.Second), 6, speech)
	if db, _, ok := e.Floor(); !ok || db != -58 {
		t.Fatalf("Floor = %v, %v after real input; want -58", db, ok)
	}
	_ = next
}

func TestAGapInTheReadingsStartsAgain(t *testing.T) {
	e := NewEstimator()
	feed(e, start, 3, speech)
	feed(e, start.Add(time.Minute), 3, speech) // the meter was closed for a minute: the first 3 s are not this capture
	if _, _, ok := e.Floor(); ok {
		t.Fatal("two 3 s captures a minute apart made 5 s heard")
	}
}

func TestTheStoreKeepsAReadingPerMicrophoneAcrossOpens(t *testing.T) {
	path := filepath.Join(t.TempDir(), "room-tone.json")
	store := Open(path, nil)
	if _, ok := store.Get("USB Mic"); ok {
		t.Fatal("a reading in an empty store")
	}
	reading := Reading{DB: -58.6, MeasuredAt: start, Seconds: 12}
	if err := store.Put("USB Mic", reading); err != nil {
		t.Fatal(err)
	}
	if err := store.Put("Микрофон «студия» 🎙", Reading{DB: -61, MeasuredAt: start, Seconds: 6}); err != nil {
		t.Fatal(err)
	}
	again := Open(path, nil)
	if got, ok := again.Get("USB Mic"); !ok || got != reading {
		t.Fatalf("Get = %+v, %v after reopening", got, ok)
	}
	if got, ok := again.Get("Микрофон «студия» 🎙"); !ok || got.DB != -61 {
		t.Fatalf("a Unicode name read back as %+v, %v", got, ok)
	}
	if _, ok := again.Get("usb mic"); ok {
		t.Fatal("names are the device's own, case and all")
	}
}

func TestAStoreFileThatCannotBeReadIsEmptyAndIsReplacedOnTheNextPut(t *testing.T) {
	path := filepath.Join(t.TempDir(), "room-tone.json")
	if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	store := Open(path, nil)
	if _, ok := store.Get("USB Mic"); ok {
		t.Fatal("a reading from a broken file")
	}
	if err := store.Put("USB Mic", Reading{DB: -50, MeasuredAt: start, Seconds: 5}); err != nil {
		t.Fatal(err)
	}
	if got, ok := Open(path, nil).Get("USB Mic"); !ok || got.DB != -50 {
		t.Fatalf("after the put: %+v, %v", got, ok)
	}
}

func TestTheMeterKeepsTheFloorWhileItListensAndAtTheStop(t *testing.T) {
	path := filepath.Join(t.TempDir(), "room-tone.json")
	m := NewMeter(Open(path, nil))
	at := start
	for i := 0; i < 70; i++ { // 7 s of reading
		m.Observe("USB Mic", at, speech(float64(i%10)/10))
		at = at.Add(100 * time.Millisecond)
	}
	if got, ok := Open(path, nil).Get("USB Mic"); !ok || got.DB != -58 {
		t.Fatalf("while listening: %+v, %v; want -58 kept once 5 s were heard", got, ok)
	}
	for i := 0; i < 30; i++ { // three more seconds, quieter
		m.Observe("USB Mic", at, -61)
		at = at.Add(100 * time.Millisecond)
	}
	m.Stop("USB Mic")
	got, ok := m.Reading("USB Mic")
	if !ok || got.DB != -61 || !got.MeasuredAt.Equal(at.Add(-100*time.Millisecond)) {
		t.Fatalf("after the stop: %+v, %v; want -61 at the last reading", got, ok)
	}
	if kept, _ := Open(path, nil).Get("USB Mic"); kept != got {
		t.Fatalf("kept %+v, read %+v", kept, got)
	}
}

func TestTheMeterNeverMixesMicrophonesAndKeepsAnOldReadingWhenTooLittleIsHeard(t *testing.T) {
	path := filepath.Join(t.TempDir(), "room-tone.json")
	store := Open(path, nil)
	old := Reading{DB: -64, MeasuredAt: start.Add(-time.Hour), Seconds: 9}
	if err := store.Put("Desk Mic", old); err != nil {
		t.Fatal(err)
	}
	m := NewMeter(store)
	at := start
	for i := 0; i < 30; i++ { // 3 s on Desk Mic: too little
		m.Observe("Desk Mic", at, -40)
		at = at.Add(100 * time.Millisecond)
	}
	m.Stop("Desk Mic")
	if got, _ := m.Reading("Desk Mic"); got != old {
		t.Fatalf("Desk Mic = %+v; want the older reading kept", got)
	}
	if _, ok := m.Reading("USB Mic"); ok {
		t.Fatal("a reading for a microphone never heard")
	}
}

func TestAStoreFileWithAReadingNoCaptureCouldMakeIsLoggedAndReadAsEmpty(t *testing.T) {
	for name, content := range map[string]string{
		"louder than full scale": `{"version":1,"devices":{"USB Mic":{"db":3,"measuredAt":"2026-10-24T10:00:00Z","seconds":6}}}`,
		"digital silence":        `{"version":1,"devices":{"USB Mic":{"db":-120,"measuredAt":"2026-10-24T10:00:00Z","seconds":6}}}`,
		"too short":              `{"version":1,"devices":{"USB Mic":{"db":-58,"measuredAt":"2026-10-24T10:00:00Z","seconds":1}}}`,
		"no time":                `{"version":1,"devices":{"USB Mic":{"db":-58,"seconds":6}}}`,
		"no microphone":          `{"version":1,"devices":{"":{"db":-58,"measuredAt":"2026-10-24T10:00:00Z","seconds":6}}}`,
		"a newer version":        `{"version":2,"devices":{"USB Mic":{"db":-58,"measuredAt":"2026-10-24T10:00:00Z","seconds":6}}}`,
		"not an object":          `[]`,
	} {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "room-tone.json")
			if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
				t.Fatal(err)
			}
			var logged []string
			store := Open(path, &persist.Reporter{Log: func(kind, message string) { logged = append(logged, kind) }})
			if _, ok := store.Get("USB Mic"); ok {
				t.Fatal("a reading from a file that cannot be one")
			}
			if len(logged) != 1 || logged[0] != "persisted_corrupt" {
				t.Fatalf("logged %v; want one persisted_corrupt line", logged)
			}
		})
	}
}

func TestAStoreFileWithNoDevicesReadsAsEmptyWithoutALogLine(t *testing.T) {
	path := filepath.Join(t.TempDir(), "room-tone.json")
	if err := os.WriteFile(path, []byte(`{"version":1}`), 0o600); err != nil {
		t.Fatal(err)
	}
	logged := 0
	store := Open(path, &persist.Reporter{Log: func(string, string) { logged++ }})
	if logged != 0 {
		t.Fatalf("logged %d lines for a valid empty file", logged)
	}
	if err := store.Put("USB Mic", Reading{DB: -50, MeasuredAt: start, Seconds: 5}); err != nil {
		t.Fatal(err)
	}
}
