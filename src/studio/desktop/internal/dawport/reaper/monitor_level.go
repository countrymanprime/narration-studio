package reaper

import (
	"context"
	"fmt"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// monitorLeveler is the monitor_level role over bridge's monitor_level (narration_levels.lua): the volume of the master track's
// first hardware output send as a whole number from 0 to 100. The script owns the mapping from that number to a gain.
type monitorLeveler struct {
	actions *bridge.Actions
	allowed func(dawport.Capability) error
}

var _ dawport.MonitorLeveler = monitorLeveler{}

// MonitorLevel reads the level. The capability's own refusal is returned first, as the error dawport.RefusedFrom words; the
// script's sentence (no hardware output on the master, say) is a *bridge.RefusalError.
func (m monitorLeveler) MonitorLevel(ctx context.Context) (int, error) {
	if m.allowed != nil {
		if err := m.allowed(dawport.CapMonitorLevel); err != nil {
			return 0, err
		}
	}
	return m.actions.MonitorLevel(ctx)
}

// SetMonitorLevel sets the level and returns the one REAPER holds afterwards. A level outside 0 to dawport.MaxLevel is an error with
// nothing sent.
func (m monitorLeveler) SetMonitorLevel(ctx context.Context, level int) (int, error) {
	if level < 0 || level > dawport.MaxLevel {
		return 0, fmt.Errorf("the monitor level is 0 to %d, not %d", dawport.MaxLevel, level)
	}
	if m.allowed != nil {
		if err := m.allowed(dawport.CapMonitorLevel); err != nil {
			return 0, err
		}
	}
	return m.actions.SetMonitorLevel(ctx, level)
}
