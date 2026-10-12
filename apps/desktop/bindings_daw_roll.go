package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// rollTimeout bounds one roll: the stop, the cursor move and REAPER reporting that it records again (narration_roll.lua
// waits about a second for that), plus the play-position read before it.
const rollTimeout = 5 * time.Second

const (
	// rollConfirmSentence is the one refusal of an unconfirmed roll where the punch capability is destructive (SND-6a).
	rollConfirmSentence    = "This will replace the audio from here on. Confirm to continue."
	rollBadTimeSentence    = "The roll time is not a usable number of seconds."
	rollPastTheEndSentence = "The roll time is past the end of the recording."
)

// DawRoll stops the recording this app started on chapterID's linked track and records again from at (project seconds),
// keeping the earlier audio as a take (SND-6a, ADR 0860 point 1; the Studio Next mock's roll). The page sends the chapter
// id, a time and whether the narrator confirmed, never a GUID: the track is the chapter's link, read here
// (docs/architecture/threat-model.md, row 5f). The answer is a DawResult (ADR 0810): the punch capability's own sentence
// when the resolver refuses it (a standalone launch, a DAW not answering, Experimental actions off, the toggle off),
// checked first; a time that is not a number of seconds or is past where the DAW records now; the confirmation sentence
// when the capability is destructive and confirmed is false; and a gone track as the role's stale refusal. Nothing is sent
// to the DAW on any refusal. A chapter the manuscript does not have is an error.
func (h *Host) DawRoll(chapterID string, at float64, confirmed bool) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), rollTimeout)
	defer cancel()
	run := h.runLog.Begin("roll", "chapter_id", chapterID)
	result, err := dawRollIn(ctx, svc, resolver.Support(dawport.CapPunch), svc.puncher, chapterID, at, confirmed)
	switch {
	case err != nil:
		run.End("error")
	case result.Refused != "":
		run.End("refused")
	default:
		run.End("ok")
	}
	return encodeBinding(result, err)
}

// dawRollIn is DawRoll with the launch's punch support and role given. Whether to ask first is support.Destructive, the
// adapter's declaration through the resolver, never the DAW's name. puncher is nil with no live adapter.
func dawRollIn(ctx context.Context, svc hostServices, support dawport.Support, puncher dawport.Puncher, chapterID string, at float64, confirmed bool) (dawport.Result, error) {
	if !support.Available {
		return dawport.Refused(support.Message), nil
	}
	if math.IsNaN(at) || math.IsInf(at, 0) || at < 0 {
		return dawport.Refused(rollBadTimeSentence), nil
	}
	track, unlinked, err := readAloudTrackGUID(svc, chapterID)
	if err != nil {
		return dawport.Result{}, err
	}
	if unlinked != nil {
		return dawport.Refused(unlinked.Message), nil
	}
	if support.Destructive && !confirmed {
		return dawport.Refused(rollConfirmSentence), nil
	}
	name := readAloudAdapterName(svc)
	if puncher == nil {
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message), nil
	}
	// The recording is not an item until it stops, so where it ends is where the DAW records now. The script checks this
	// again; a read that fails leaves the roll to answer for itself.
	if position, err := puncher.PlayPosition(ctx); err == nil && position.Recording && at > max(position.Heard, position.Processed) {
		return dawport.Refused(rollPastTheEndSentence), nil
	}
	result, err := puncher.Roll(ctx, track, at)
	if err != nil {
		return rollRefusal(name, err), nil
	}
	return result, nil
}

// rollRefusal words an error the role returned rather than answered: the role answers its own refusals as a Result, so
// these are a capability refusal, the bridge not answering, or the roll not confirmed in time.
func rollRefusal(name string, err error) dawport.Result {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused
	}
	switch {
	case errors.Is(err, bridge.ErrNoAnswer):
		return dawport.Refused(readAloudConnectionRefusal(name, reaperNotRunning).Message)
	case errors.Is(err, bridge.ErrUnavailable):
		return dawport.Refused(readAloudConnectionRefusal(name, reaperStandalone).Message)
	case errors.Is(err, context.DeadlineExceeded):
		return dawport.Refused(fmt.Sprintf("%s did not confirm the roll within %d seconds. Check whether it is still recording.", name, int(rollTimeout.Seconds())))
	}
	return dawport.Refused(fmt.Sprintf("%s could not roll: %s.", name, err.Error()))
}
