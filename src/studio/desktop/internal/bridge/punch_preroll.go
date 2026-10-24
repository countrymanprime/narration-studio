package bridge

import (
	"context"
	"fmt"
)

// PunchPreroll is REAPER's own pre-roll (narration_preroll.lua): whether REAPER plays it before it records, its length in measures,
// and how long one measure lasts at the edit cursor. REAPER 7.82 starts playback at the bar line at or before the cursor minus
// that many measures (docs/research/reaper-preroll-2026-10-24.md).
type PunchPreroll struct {
	OnRecord       bool
	Measures       float64
	MeasureSeconds float64
}

// PunchPreroll reads REAPER's pre-roll. It changes nothing (REAPER's preferences are the narrator's to change) and works while REAPER
// records.
func (a *Actions) PunchPreroll(ctx context.Context) (PunchPreroll, error) {
	events, err := a.request(ctx, "punch_preroll", []string{"PUNCH_PREROLL"})
	if err != nil {
		return PunchPreroll{}, err
	}
	fields := events[len(events)-1].Fields
	on := fields[2]
	got := PunchPreroll{OnRecord: on == "1", Measures: numberAt(fields, 3), MeasureSeconds: numberAt(fields, 4)}
	switch {
	case on != "0" && on != "1":
		return PunchPreroll{}, fmt.Errorf("REAPER answered punch_preroll with pre-roll on record %q", on)
	case got.Measures < 0:
		return PunchPreroll{}, fmt.Errorf("REAPER answered punch_preroll with %v measures", got.Measures)
	case got.MeasureSeconds <= 0:
		return PunchPreroll{}, fmt.Errorf("REAPER answered punch_preroll with a measure of %v seconds", got.MeasureSeconds)
	}
	return got, nil
}
