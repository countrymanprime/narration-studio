package bridge

import (
	"context"
	"errors"
	"fmt"
)

// Roll again while recording (ADR 0860 point 1; roll in narration_roll.lua). Experimental (actions.go) until the QA pass
// has run it in a real REAPER (#1495).

// ErrBadRoll: the roll time is not a finite, non-negative number of seconds, or no track was named, so nothing was sent.
// The script also refuses a time past where REAPER records now, which only it can read.
var ErrBadRoll = errors.New("the roll time is not a usable number of seconds")

// ErrRollStopped: the roll stopped the recording but REAPER did not record again (it did not report the stop at once, or
// did not start). The earlier audio is kept; the recording has ended, so this is not a refusal that changed nothing.
var ErrRollStopped = errors.New("REAPER stopped recording for the roll but did not record again; the earlier audio is kept")

var rollStopped = map[string]bool{
	"REAPER did not stop recording at once, so the roll did not record again. The earlier audio is kept.": true,
	"REAPER did not start recording again after the roll. The earlier audio is kept.":                     true,
}

// Rolled is what roll did: the track REAPER records on again, the project time it records from, and the undo points the
// command added (0: the points for the recorded media are REAPER's own).
type Rolled struct {
	TrackGUID  string
	At         float64
	UndoPoints int
}

// Roll stops the recording the app started on trackGUID, moves the edit cursor to at and records again from there, so
// REAPER keeps the earlier audio as a take. It returns once REAPER records again. A recording the app did not start, or
// one on another track, is ErrNotOurRecording; a track that is gone is a *TrackStaleError; REAPER's overlapping-recording
// option set to anything that does not keep the earlier audio is a *RefusalError naming the option, and the app never
// changes it. ErrRollStopped is the one answer after which the recording has ended.
func (a *Actions) Roll(ctx context.Context, trackGUID string, at float64) (Rolled, error) {
	if normalizeGUID(trackGUID) == "" || !finite(at) || at < 0 {
		return Rolled{}, fmt.Errorf("%w: %v", ErrBadRoll, at)
	}
	events, err := a.request(ctx, "roll", []string{"ROLLED", "TRACK_STALE", "RECORD_NOT_OURS"}, trackGUID, formatSeconds(at))
	if err != nil {
		return Rolled{}, err
	}
	event := events[len(events)-1]
	switch event.Tag {
	case "TRACK_STALE":
		return Rolled{}, &TrackStaleError{GUID: event.Fields[2]}
	case "RECORD_NOT_OURS":
		return Rolled{}, ErrNotOurRecording
	}
	if event.Fields[2] != normalizeGUID(trackGUID) {
		return Rolled{}, fmt.Errorf("REAPER rolled on another track than the one this app asked for")
	}
	return Rolled{TrackGUID: event.Fields[2], At: numberAt(event.Fields, 3), UndoPoints: int(numberAt(event.Fields, 4))}, nil
}
