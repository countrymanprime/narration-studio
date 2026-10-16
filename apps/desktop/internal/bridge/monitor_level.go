package bridge

import (
	"context"
	"fmt"
	"strconv"
)

// MaxMonitorLevel is the top of the monitor level scale (narration_levels.lua's MAX_LEVEL): 0 is silence, 70 is unity (0 dB).
const MaxMonitorLevel = 100

// MonitorLevel reads the monitor level, the volume of the REAPER master track's first hardware output, as a whole number from
// 0 to MaxMonitorLevel (narration_levels.lua). It changes nothing.
func (a *Actions) MonitorLevel(ctx context.Context) (int, error) {
	return a.monitorLevel(ctx, "")
}

// SetMonitorLevel sets the monitor level to level (0 to MaxMonitorLevel) and returns the level REAPER now holds, read back
// after the set. A level outside the scale is refused before anything is sent. The script owns the mapping, so the host sends
// and reads only the app's whole number.
func (a *Actions) SetMonitorLevel(ctx context.Context, level int) (int, error) {
	if level < 0 || level > MaxMonitorLevel {
		return 0, fmt.Errorf("the monitor level is 0 to %d, not %d", MaxMonitorLevel, level)
	}
	return a.monitorLevel(ctx, strconv.Itoa(level))
}

func (a *Actions) monitorLevel(ctx context.Context, level string) (int, error) {
	events, err := a.request(ctx, "monitor_level", []string{"MONITOR_LEVEL"}, level)
	if err != nil {
		return 0, err
	}
	held, err := strconv.Atoi(events[len(events)-1].Fields[2])
	if err != nil {
		return 0, err
	}
	if held < 0 || held > MaxMonitorLevel {
		return 0, fmt.Errorf("REAPER answered monitor_level with %d, outside 0 to %d", held, MaxMonitorLevel)
	}
	return held, nil
}
