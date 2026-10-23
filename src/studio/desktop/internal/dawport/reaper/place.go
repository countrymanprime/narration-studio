package reaper

import (
	"context"
	"fmt"

	"github.com/countrymanprime/narration-studio/shell/internal/bridge"
	"github.com/countrymanprime/narration-studio/shell/internal/dawport"
)

// placeFollower is the follow_position role over bridge's read_place and go_to (narration_track_select.lua). It only translates between
// the port's engine-neutral Place and the bridge's: the narrator's place is a track GUID and a cursor in REAPER, and another engine
// answers the same role with its own track id.
type placeFollower struct {
	actions *bridge.Actions
	allowed func(dawport.Capability) error
}

var _ dawport.PlaceFollower = placeFollower{}

func (p placeFollower) check() error {
	if p.allowed == nil {
		return nil
	}
	return p.allowed(dawport.CapFollowPosition)
}

// ReadPlace reads the selected track and the edit cursor. The capability's own refusal is returned first.
func (p placeFollower) ReadPlace(ctx context.Context) (dawport.Place, error) {
	if err := p.check(); err != nil {
		return dawport.Place{}, err
	}
	place, err := p.actions.ReadPlace(ctx)
	if err != nil {
		return dawport.Place{}, err
	}
	return dawport.Place{TrackID: place.TrackGUID, Selected: place.Selected, Cursor: place.Cursor}, nil
}

// GoTo selects the track and puts the cursor at target. A track that is gone is a *bridge.TrackStaleError.
func (p placeFollower) GoTo(ctx context.Context, trackID string, target dawport.PlaceTarget) error {
	if trackID == "" {
		return fmt.Errorf("choose a track to go to")
	}
	if err := p.check(); err != nil {
		return err
	}
	_, err := p.actions.GoTo(ctx, trackID, bridge.PlaceTarget{End: target.End, Seconds: target.Seconds})
	return err
}
