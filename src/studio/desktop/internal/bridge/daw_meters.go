package bridge

import (
	"context"
	"fmt"
	"math"
	"strconv"
)

// MeterFloorDB is the level narration_meters.lua answers for silence, in dBFS.
const MeterFloorDB = -100

// meterCeilingDB bounds a level REAPER can answer: its meters run over full scale, never this far.
const meterCeilingDB = 60

// DawMeters is what REAPER's own meters show (narration_meters.lua): the master track's level and, when a track is record-armed,
// the first armed track's level and name. Levels are dBFS, MeterFloorDB for silence. REAPER 7.82 meters an armed track's input
// whether its monitoring is on or off (docs/research/reaper-meters-2026-10-24.md).
type DawMeters struct {
	OutputDB   float64
	Armed      bool
	InputDB    float64
	InputTrack string
}

// DawMeters reads REAPER's meters. It changes nothing and works while REAPER plays or records.
func (a *Actions) DawMeters(ctx context.Context) (DawMeters, error) {
	events, err := a.request(ctx, "daw_meters", []string{"METERS"})
	if err != nil {
		return DawMeters{}, err
	}
	fields := events[len(events)-1].Fields
	output, err := meterLevel(fields[2])
	if err != nil {
		return DawMeters{}, err
	}
	got := DawMeters{OutputDB: output}
	if len(fields) > 3 && fields[3] != "" {
		if got.InputDB, err = meterLevel(fields[3]); err != nil {
			return DawMeters{}, err
		}
		got.Armed = true
		if len(fields) > 4 {
			got.InputTrack = fields[4]
		}
	}
	return got, nil
}

func meterLevel(field string) (float64, error) {
	db, err := strconv.ParseFloat(field, 64)
	if err != nil || math.IsNaN(db) || db < MeterFloorDB || db > meterCeilingDB {
		return 0, fmt.Errorf("REAPER answered daw_meters with a level of %q", field)
	}
	return db, nil
}
