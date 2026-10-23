package bridge

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// CreatedTrack is what track_create answers: the new track's GUID, the name REAPER gave it (the name asked for, trimmed,
// with any line break or tab inside it turned into a space) and its 0-based index in the project's track list.
type CreatedTrack struct {
	GUID  string
	Name  string
	Index int
}

// ErrTrackNameEmpty: the name for a new track is empty once trimmed, so nothing was sent (or the script refused it).
var ErrTrackNameEmpty = errors.New("the new track needs a name")

// trackNameEmptySentence is the script's own ERROR for an empty name (narration_track_create.lua).
const trackNameEmptySentence = "The new track needs a name."

// CreateTrack adds one track named name at the end of REAPER's track list, in one undo point, and answers it. It never saves
// the project, refuses while REAPER records (ErrRecording) and is not idempotent: each call adds a track. A blank name is
// ErrTrackNameEmpty before anything is sent.
func (a *Actions) CreateTrack(ctx context.Context, name string) (CreatedTrack, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return CreatedTrack{}, ErrTrackNameEmpty
	}
	events, err := a.request(ctx, "track_create", []string{"TRACK_CREATED"}, name)
	if err != nil {
		var refusal *RefusalError
		if errors.As(err, &refusal) && refusal.Sentence == trackNameEmptySentence {
			return CreatedTrack{}, ErrTrackNameEmpty
		}
		return CreatedTrack{}, err
	}
	for _, event := range events {
		if event.Tag == "TRACK_CREATED" {
			index, err := strconv.Atoi(event.Fields[3])
			if err != nil {
				return CreatedTrack{}, fmt.Errorf("REAPER answered track_create with an index that is not a number: %w", err)
			}
			return CreatedTrack{GUID: normalizeGUID(event.Fields[2]), Index: index, Name: event.Fields[4]}, nil
		}
	}
	return CreatedTrack{}, fmt.Errorf("REAPER ended track_create without answering it")
}
