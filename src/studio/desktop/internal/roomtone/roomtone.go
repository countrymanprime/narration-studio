// Package roomtone measures and keeps the room tone of each microphone: the level of the room when nobody speaks.
//
// What measures it is any capture of the microphone the app already runs: the listening session during a take and the
// level meter while the Booth's Levels menu is open (#2251 item 10). Each of their `level` readings (RMS in dBFS, about ten
// a second) goes to an Estimator, and the room tone is the quiet floor of the last WindowSeconds: the FloorPercentile of
// the readings, which is the pauses between phrases while someone reads and the room itself while nobody does. A floor
// needs MinSeconds heard in one unbroken capture. Readings at or below SilenceDB are a muted or unplugged input, not a room,
// and are left out.
//
// The Store keeps the last floor of each microphone, by the device name the capture opened, in room-tone.json, so the
// Booth shows it after the capture ends and after the app restarts. A capture too short to measure leaves the older
// reading as it was.
package roomtone

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"desktop/internal/persist"
)

const (
	// WindowSeconds is how far back a floor looks: long enough to hold several pauses, short enough to follow a room
	// that changes (a heater coming on).
	WindowSeconds = 20
	// MinSeconds is how much of one capture must be heard before it measures anything.
	MinSeconds = 5
	// FloorPercentile is the share of readings at or below the floor.
	FloorPercentile = 0.10
	// SilenceDB is the level at or below which a reading is digital silence, not a room (a 16-bit input's floor).
	SilenceDB = -96
	// gapSeconds is the longest pause between readings that is still the same capture.
	gapSeconds = 2
	// saveEvery is how often a measuring capture keeps its floor, so a crash loses little.
	saveEvery = 5 * time.Second
)

type sample struct {
	at time.Time
	db float64
}

// Estimator holds one microphone's recent readings. It is not safe for concurrent use; Meter guards it.
type Estimator struct {
	samples []sample
	last    time.Time
}

// NewEstimator returns an Estimator with nothing heard.
func NewEstimator() *Estimator { return &Estimator{} }

// Add takes one RMS reading in dBFS heard at at. A reading more than gapSeconds after the one before starts a new
// capture, and readings older than WindowSeconds are dropped.
func (e *Estimator) Add(at time.Time, db float64) {
	if !e.last.IsZero() && at.Sub(e.last) > gapSeconds*time.Second {
		e.samples = e.samples[:0]
	}
	e.last = at
	if math.IsNaN(db) || db <= SilenceDB {
		return
	}
	e.samples = append(e.samples, sample{at, db})
	cut := 0
	for cut < len(e.samples) && at.Sub(e.samples[cut].at) > WindowSeconds*time.Second {
		cut++
	}
	e.samples = e.samples[cut:]
}

// Floor answers the room tone in dBFS (rounded to 0.1 dB) and how many seconds of this capture it is taken from, or
// ok false until MinSeconds are heard.
func (e *Estimator) Floor() (db, heard float64, ok bool) {
	if len(e.samples) < 2 {
		return 0, 0, false
	}
	heard = e.samples[len(e.samples)-1].at.Sub(e.samples[0].at).Seconds()
	if heard < MinSeconds {
		return 0, heard, false
	}
	levels := make([]float64, len(e.samples))
	for i, s := range e.samples {
		levels[i] = s.db
	}
	sort.Float64s(levels)
	floor := levels[int(FloorPercentile*float64(len(levels)-1))]
	return math.Round(floor*10) / 10, heard, true
}

// Reading is one microphone's room tone: the level, when it was last heard, and how many seconds it was taken from.
type Reading struct {
	DB         float64   `json:"db"`
	MeasuredAt time.Time `json:"measuredAt"`
	Seconds    float64   `json:"seconds"`
}

// fileVersion is room-tone.json's shape: {"version": 1, "devices": {"<device name>": Reading}}.
const fileVersion = 1

type file struct {
	Version int                `json:"version"`
	Devices map[string]Reading `json:"devices"`
}

// Store is room-tone.json: the last reading of each microphone. A room tone is measured again by the next capture, so
// the file is persist.Disposable: one that cannot be decoded, is of another version or holds a reading outside
// validReading is logged and read as empty, and the next Put replaces it.
type Store struct {
	mu sync.Mutex
	// +checklocks:mu
	path string
	// +checklocks:mu
	devices map[string]Reading
}

// Open reads the store at path, reporting a file it cannot use through reporter (nil reports nothing).
func Open(path string, reporter *persist.Reporter) *Store {
	devices := map[string]Reading{}
	reporter.ReadJSON(path, "room tone", persist.Disposable, func(data []byte) error {
		var read file
		if err := json.Unmarshal(data, &read); err != nil {
			return err
		}
		if read.Version != fileVersion {
			return fmt.Errorf("room tone version %d, want %d", read.Version, fileVersion)
		}
		for device, reading := range read.Devices {
			if device == "" || !validReading(reading) {
				return fmt.Errorf("room tone for %q is not a reading", device)
			}
		}
		if read.Devices != nil {
			devices = read.Devices
		}
		return nil
	})
	return &Store{path: path, devices: devices}
}

// validReading is a reading a capture could have made: a level above SilenceDB and at most 0 dBFS, at least MinSeconds
// heard, and a time.
func validReading(r Reading) bool {
	return r.DB > SilenceDB && r.DB <= 0 && r.Seconds >= MinSeconds && !r.MeasuredAt.IsZero()
}

// Get answers device's reading, if it has one.
func (s *Store) Get(device string) (Reading, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	reading, ok := s.devices[device]
	return reading, ok
}

// Put keeps reading as device's and writes the file (a temporary file renamed over it).
func (s *Store) Put(device string, reading Reading) error {
	if device == "" {
		return errors.New("a room tone needs a microphone")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.devices[device] = reading
	data, err := json.MarshalIndent(file{Version: fileVersion, Devices: s.devices}, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	temp := s.path + ".tmp"
	if err := os.WriteFile(temp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(temp, s.path)
}

// Meter measures every microphone a capture reports and keeps what it measures in its Store. It is safe for
// concurrent use.
type Meter struct {
	mu    sync.Mutex
	store *Store
	// +checklocks:mu
	estimators map[string]*Estimator
	// +checklocks:mu
	saved map[string]time.Time
}

// NewMeter measures into store.
func NewMeter(store *Store) *Meter {
	return &Meter{store: store, estimators: map[string]*Estimator{}, saved: map[string]time.Time{}}
}

// Observe takes one reading of device heard at at, and keeps the floor every saveEvery once there is one. A write that
// fails is tried again on the next reading after saveEvery.
func (m *Meter) Observe(device string, at time.Time, db float64) {
	if device == "" {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	e := m.estimators[device]
	if e == nil {
		e = NewEstimator()
		m.estimators[device] = e
	}
	e.Add(at, db)
	if last, ok := m.saved[device]; ok && at.Sub(last) < saveEvery {
		return
	}
	if m.keepLocked(device, e) {
		m.saved[device] = at
	}
}

// Stop ends device's capture: its floor, when it has one, is kept, and the next reading starts a new capture.
func (m *Meter) Stop(device string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e := m.estimators[device]; e != nil {
		m.keepLocked(device, e)
	}
	delete(m.estimators, device)
	delete(m.saved, device)
}

// Reading answers device's kept room tone, if it has one.
func (m *Meter) Reading(device string) (Reading, bool) {
	return m.store.Get(device)
}

// +checklocks:m.mu
func (m *Meter) keepLocked(device string, e *Estimator) bool {
	db, heard, ok := e.Floor()
	if !ok {
		return false
	}
	return m.store.Put(device, Reading{DB: db, MeasuredAt: e.last, Seconds: math.Round(heard*10) / 10}) == nil
}
