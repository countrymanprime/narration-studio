// Package zerocross moves a cut point to the nearest zero crossing of the audio (ADR 0855's snap rule): the nearest
// sign change of the mono mix within MaxShift either side of the asked time, answered to the sample in source seconds.
// It decodes only that window of the source, never the whole file, and never guesses: a silent window, or one with no
// sign change, answers the asked time with a Reason.
package zerocross

import (
	"context"
	"errors"
	"fmt"
	"math"
)

// MaxShift is how far a cut may move, in seconds, either way (ADR 0855).
const MaxShift = 0.002

// Reason says why a time was not moved. Empty when it snapped.
type Reason string

const (
	// ReasonSilent is a window of digital silence: every sample is zero.
	ReasonSilent Reason = "silent"
	// ReasonNoCrossing is a window with audio but no sign change within MaxShift.
	ReasonNoCrossing Reason = "no_crossing"
	// ReasonNoAudio is a time the source has no samples at (past its end).
	ReasonNoAudio Reason = "no_audio"
)

// Window is a stretch of a source decoded as its mono mix: Mono[i] is source frame First+i at SampleRate.
type Window struct {
	SampleRate int
	First      int64
	Mono       []float64
}

// Decoder decodes the frames of the source at path that cover [startSeconds, startSeconds+lengthSeconds], as a mono
// mix at the file's own rate. A window past the end of the audio answers no frames, not an error.
type Decoder interface {
	Window(ctx context.Context, path string, startSeconds, lengthSeconds float64) (Window, error)
}

// Result is a snap's answer: Time the snapped source time (the asked one when Reason is set), Moved how far it moved
// (Time minus the asked time, so signed; 0 with a Reason).
type Result struct {
	Time   float64
	Moved  float64
	Reason Reason
}

// ErrBadTime is the answer for a negative or non-finite time.
var ErrBadTime = errors.New("a cut point is a finite time of at least 0 seconds")

// Snap answers sourceTime moved to the nearest zero crossing of path's audio within MaxShift, asking decoder for
// only that window. A crossing is a sign change between two adjacent nonzero frames; the cut lands
// on whichever of the two is nearer zero. A sample that is exactly zero is a crossing of its own. Of two crossings
// equally near, the earlier wins.
func Snap(ctx context.Context, decoder Decoder, path string, sourceTime float64) (Result, error) {
	if math.IsNaN(sourceTime) || math.IsInf(sourceTime, 0) || sourceTime < 0 {
		return Result{}, ErrBadTime
	}
	start := math.Max(0, sourceTime-MaxShift)
	window, err := decoder.Window(ctx, path, start, sourceTime+MaxShift-start)
	if err != nil {
		return Result{}, err
	}
	unmoved := func(reason Reason) Result { return Result{Time: sourceTime, Reason: reason} }
	if len(window.Mono) == 0 {
		return unmoved(ReasonNoAudio), nil
	}
	if window.SampleRate <= 0 {
		return Result{}, fmt.Errorf("a window at %d Hz", window.SampleRate)
	}
	silent := true
	for _, v := range window.Mono {
		if v != 0 {
			silent = false
			break
		}
	}
	if silent {
		return unmoved(ReasonSilent), nil
	}

	rate := float64(window.SampleRate)
	target := sourceTime * rate
	// A frame counts as within reach when its time is within MaxShift, allowing for the rounding of seconds to frames.
	reach := MaxShift*rate + 1e-6
	best, bestDistance := int64(-1), math.Inf(1)
	for i := range window.Mono {
		frame := window.First + int64(i)
		if a := window.Mono[i]; a != 0 {
			if i+1 == len(window.Mono) {
				continue
			}
			b := window.Mono[i+1]
			if b == 0 || (a < 0) == (b < 0) {
				continue
			}
			if math.Abs(b) < math.Abs(a) {
				frame++
			}
		}
		distance := math.Abs(float64(frame) - target)
		if distance <= reach && distance < bestDistance {
			best, bestDistance = frame, distance
		}
	}
	if best < 0 {
		return unmoved(ReasonNoCrossing), nil
	}
	snapped := float64(best) / rate
	return Result{Time: snapped, Moved: snapped - sourceTime}, nil
}
