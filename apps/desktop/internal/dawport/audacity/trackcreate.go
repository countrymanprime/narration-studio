package audacity

import (
	"context"
	"fmt"
	"strings"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

var _ dawport.TrackCreator = (*Session)(nil)

// CreateTrack adds one audio track named name after every other track and answers the id the other roles find it by (TrackIDs:
// audacity:<name>, with #n when the name repeats), its name and its index among all the project's tracks. It is NewMonoTrack, or
// NewStereoTrack when the project's last audio track is stereo, then SetTrackStatus with the name, which selects the new track
// alone: one undo step (NewMonoTrack adds one, SetTrackStatus none; docs/reference/daw/audacity-3.md). The name is checked before
// anything is sent: blank is bridge.ErrTrackNameEmpty, and one the pipe cannot carry (a double quote, a backslash, a control
// character) is audacitybridge.ErrInvalidValue, so no unnamed track is left behind. A recording this app started is refused with
// bridge.ErrRecording; one started in Audacity's own window cannot be seen, and the first command ends it (A3-T15), as for every
// other role. It is not idempotent: each call adds a track.
func (s *Session) CreateTrack(ctx context.Context, name string) (dawport.CreatedTrack, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return dawport.CreatedTrack{}, bridge.ErrTrackNameEmpty
	}
	if err := audacitybridge.NewCommand("SetTrackStatus").String("Name", name).Err(); err != nil {
		return dawport.CreatedTrack{}, err
	}
	if _, recording := s.transport.snapshot(); recording {
		return dawport.CreatedTrack{}, bridge.ErrRecording
	}
	before, err := s.client.Tracks(ctx)
	if err != nil {
		return dawport.CreatedTrack{}, err
	}
	newTrack := "NewMonoTrack"
	for i := len(before) - 1; i >= 0; i-- {
		if before[i].Kind == "wave" {
			if before[i].Channels == 2 {
				newTrack = "NewStereoTrack"
			}
			break
		}
	}
	if _, err := s.client.Do(ctx, audacitybridge.NewCommand(newTrack)); err != nil {
		return dawport.CreatedTrack{}, err
	}
	// Audacity adds the new track last.
	index := len(before)
	if err := s.client.SetTrackName(ctx, index, name); err != nil {
		return dawport.CreatedTrack{}, err
	}
	all, err := s.audioTracks(ctx)
	if err != nil {
		return dawport.CreatedTrack{}, err
	}
	for _, t := range all {
		if t.Index == index && t.Name == name {
			return dawport.CreatedTrack{GUID: t.id, Name: name, Index: index}, nil
		}
	}
	return dawport.CreatedTrack{}, fmt.Errorf("audacity added a track but it is not the last one named %q", name)
}
