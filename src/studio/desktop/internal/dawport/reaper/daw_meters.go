package reaper

import (
	"context"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// meterReader is the daw_meters role over bridge's daw_meters (narration_meters.lua): REAPER's master meter and the first
// record-armed track's meter, read only.
type meterReader struct {
	actions *bridge.Actions
	allowed func(dawport.Capability) error
}

var _ dawport.MeterReader = meterReader{}

// DawMeters reads the meters. The capability's own refusal is returned first, as the error dawport.RefusedFrom words; the script's
// sentence is a *bridge.RefusalError.
func (m meterReader) DawMeters(ctx context.Context) (dawport.DawMeters, error) {
	if m.allowed != nil {
		if err := m.allowed(dawport.CapDawMeters); err != nil {
			return dawport.DawMeters{}, err
		}
	}
	return m.actions.DawMeters(ctx)
}
