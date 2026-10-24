package reaper

import (
	"context"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// prerollReader is the punch_preroll role over bridge's punch_preroll (narration_preroll.lua): REAPER's pre-roll length in measures and
// whether it plays before REAPER records, two REAPER preferences it only reads.
type prerollReader struct {
	actions *bridge.Actions
	allowed func(dawport.Capability) error
}

var _ dawport.PrerollReader = prerollReader{}

// PunchPreroll reads the pre-roll. The capability's own refusal is returned first, as the error dawport.RefusedFrom words; the
// script's sentence is a *bridge.RefusalError.
func (p prerollReader) PunchPreroll(ctx context.Context) (dawport.PunchPreroll, error) {
	if p.allowed != nil {
		if err := p.allowed(dawport.CapPunchPreroll); err != nil {
			return dawport.PunchPreroll{}, err
		}
	}
	return p.actions.PunchPreroll(ctx)
}
