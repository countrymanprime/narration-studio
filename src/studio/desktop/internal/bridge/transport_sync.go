package bridge

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"time"
)

// The Editing page's transport sync (narration_transport.lua; docs/design/editing-daw-transport-sync.md): the page puts REAPER's edit cursor on a
// clicked word, starts REAPER's transport from there and stops it, and follows REAPER's play position and cursor through the TRANSPORT stream a
// watch lease buys. All four commands are experimental (actions.go) until the verification pass has run them in a real REAPER, and none adds an undo
// point, selects a track or touches a recording (each is refused with the script's own sentence while REAPER records).

// maxRangeSeconds is the longest stretch play_range plays (narration_transport.lua's MAX_RANGE_SECONDS).
const maxRangeSeconds = 600

// secondsArgument writes a time the way narration_transport.lua reads it: plain decimal digits, never an exponent. A time that is not a
// usable number, or is past maxPlaceSeconds, is refused before anything is sent.
func secondsArgument(what string, seconds float64) (string, error) {
	if math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0 || seconds > maxPlaceSeconds {
		return "", fmt.Errorf("the place to %s is not a usable number of seconds", what)
	}
	return strconv.FormatFloat(seconds, 'f', -1, 64), nil
}

// seconds reads a number the script answered, failing on text rather than reading it as 0.
func secondsAt(fields []string, index int, command string) (float64, error) {
	value, err := strconv.ParseFloat(fields[index], 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, fmt.Errorf("REAPER answered %s with a time that is not a number", command)
	}
	return value, nil
}

// SetCursor puts REAPER's edit cursor at seconds and returns the cursor REAPER now holds. It scrolls the view and never seeks playback.
func (a *Actions) SetCursor(ctx context.Context, seconds float64) (float64, error) {
	arg, err := secondsArgument("put the cursor", seconds)
	if err != nil {
		return 0, err
	}
	events, err := a.request(ctx, "set_cursor", []string{"CURSOR_SET"}, arg)
	if err != nil {
		return 0, err
	}
	return secondsAt(events[len(events)-1].Fields, 2, "set_cursor")
}

// PlayFrom starts REAPER's transport at seconds: a stopped or paused REAPER plays from there, a playing one is seeked. It returns the time REAPER
// was told to play from. It does not wait for the first sound; the TRANSPORT stream says when REAPER is playing.
func (a *Actions) PlayFrom(ctx context.Context, seconds float64) (float64, error) {
	arg, err := secondsArgument("play from", seconds)
	if err != nil {
		return 0, err
	}
	events, err := a.request(ctx, "play_from", []string{"TRANSPORT_PLAYING"}, arg)
	if err != nil {
		return 0, err
	}
	return secondsAt(events[len(events)-1].Fields, 2, "play_from")
}

// PlayRange plays the project from `from` to `to` (seconds) on REAPER's own transport and has REAPER stop itself at `to`, so the sound is the
// project's with the narrator's FX chain and the end does not wait on this app. It returns the stretch REAPER took, which is what it was told.
// A stretch that is empty, backwards or longer than REAPER's ten minutes is refused with nothing sent. Like play_from it does not wait for the
// first sound; the TRANSPORT stream says when REAPER plays and when it stopped.
func (a *Actions) PlayRange(ctx context.Context, from, to float64) (float64, float64, error) {
	start, err := secondsArgument("play from", from)
	if err != nil {
		return 0, 0, err
	}
	end, err := secondsArgument("play to", to)
	if err != nil {
		return 0, 0, err
	}
	if !(to > from) || to-from > maxRangeSeconds {
		return 0, 0, fmt.Errorf("the stretch to play is not a usable pair of times")
	}
	events, err := a.request(ctx, "play_range", []string{"RANGE_PLAYING"}, start, end)
	if err != nil {
		return 0, 0, err
	}
	fields := events[len(events)-1].Fields
	played, err := secondsAt(fields, 2, "play_range")
	if err != nil {
		return 0, 0, err
	}
	until, err := secondsAt(fields, 3, "play_range")
	if err != nil {
		return 0, 0, err
	}
	return played, until, nil
}

// StopPlay stops REAPER's transport when it is playing or paused and returns the edit cursor afterwards. It never stops a recording.
func (a *Actions) StopPlay(ctx context.Context) (float64, error) {
	events, err := a.request(ctx, "stop_play", []string{"TRANSPORT_STOPPED"})
	if err != nil {
		return 0, err
	}
	return secondsAt(events[len(events)-1].Fields, 2, "stop_play")
}

// WatchTransport takes (or renews) a lease on the TRANSPORT stream and returns the lease REAPER granted, which the script clamps to ten
// seconds. The lease is sent in whole seconds, rounded up. The stream itself arrives as broadcast events, not as this answer; a caller that
// stops renewing stops the stream within the lease.
func (a *Actions) WatchTransport(ctx context.Context, lease time.Duration) (time.Duration, error) {
	if lease <= 0 {
		return 0, fmt.Errorf("the watch lease must be longer than zero")
	}
	whole := int64((lease + time.Second - 1) / time.Second)
	events, err := a.request(ctx, "watch_transport", []string{"TRANSPORT_WATCHING"}, strconv.FormatInt(whole, 10))
	if err != nil {
		return 0, err
	}
	granted, err := strconv.Atoi(events[len(events)-1].Fields[2])
	if err != nil || granted <= 0 {
		return 0, fmt.Errorf("REAPER answered watch_transport with a lease that is not a number of seconds")
	}
	return time.Duration(granted) * time.Second, nil
}
