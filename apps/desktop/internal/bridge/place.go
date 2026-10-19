package bridge

import (
	"context"
	"fmt"
	"strconv"
)

// Place is where the narrator is in the REAPER project: the one selected track (empty when none or several are selected, so a
// caller never guesses between them), how many are selected, and the edit cursor in project seconds.
type Place struct {
	TrackGUID string
	Selected  int
	Cursor    float64
}

// PlaceTarget is where GoTo puts the edit cursor on a track: the end of its last item, or a time in project seconds.
type PlaceTarget struct {
	End     bool
	Seconds float64
}

// maxPlaceSeconds bounds a cursor time to a project length no recording reaches (about 115 days).
const maxPlaceSeconds = 10_000_000

// ReadPlace reads the selected track and the edit cursor (read_place, narration_track_select.lua). It changes nothing.
func (a *Actions) ReadPlace(ctx context.Context) (Place, error) {
	events, err := a.request(ctx, "read_place", []string{"PLACE"})
	if err != nil {
		return Place{}, err
	}
	fields := events[len(events)-1].Fields
	selected, err := strconv.Atoi(fields[3])
	if err != nil {
		return Place{}, err
	}
	cursor, err := strconv.ParseFloat(fields[4], 64)
	if err != nil {
		return Place{}, err
	}
	return Place{TrackGUID: fields[2], Selected: selected, Cursor: cursor}, nil
}

// GoTo selects trackGUID (and only it) and puts the edit cursor at target, answering the cursor REAPER now holds. It never starts or
// seeks playback and opens no undo block. A track that is gone is a *TrackStaleError; a time that is not a usable number is refused
// before anything is sent.
func (a *Actions) GoTo(ctx context.Context, trackGUID string, target PlaceTarget) (float64, error) {
	where, seconds := "end", ""
	if !target.End {
		if target.Seconds != target.Seconds || target.Seconds < 0 || target.Seconds > maxPlaceSeconds {
			return 0, fmt.Errorf("the place to go to is not a usable number of seconds")
		}
		where, seconds = "at", strconv.FormatFloat(target.Seconds, 'f', -1, 64)
	}
	events, err := a.request(ctx, "go_to", []string{"PLACE_SET", "TRACK_STALE"}, trackGUID, where, seconds)
	if err != nil {
		return 0, err
	}
	for _, event := range events {
		switch event.Tag {
		case "TRACK_STALE":
			return 0, &TrackStaleError{GUID: event.Fields[2]}
		case "PLACE_SET":
			return strconv.ParseFloat(event.Fields[3], 64)
		}
	}
	return 0, fmt.Errorf("REAPER ended go_to without answering it")
}
