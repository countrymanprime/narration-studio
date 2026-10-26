package main

import (
	"context"
	"errors"
	"fmt"

	"desktop/internal/bridge"
	"desktop/internal/daw"
	"desktop/internal/teleprompter"
)

// Which microphone the linked DAW records from, so the Booth listens on the same device: REAPER's open input device, from
// chapter_track_state's device read, matched against the names the teleprompter's capture opens. The Booth listens on
// Device when Status is matched, unless the narrator chose a different one (Teleprompter.input_source); uncertain offers
// the Candidates as a one-click pick; every other answer leaves the narrator's own choice as it is.

// The reasons that go with unavailable, beside the connection ones (reaperStandalone, reaperNotRunning, refusedFailed).
const (
	inputReaperNoDevice = "reaper_no_device"
	inputDevicesFailed  = "devices_failed"
	// inputDawCannotReport is a DAW that has no way to say which input it records from (Audacity: mod-script-pipe has no
	// device read, docs/reference/daw/matrix.md). It depends only on which DAW is linked, never on a setting.
	inputDawCannotReport = "daw_cannot_report"
)

// teleprompterReaperInput is the answer: Status is daw.InputMatched, daw.InputUncertain, daw.InputNoMatch or
// "unavailable" (with a Reason). ReaperDevice is what REAPER named, Device the microphone to listen on (matched only),
// Candidates the microphones that fit equally well (uncertain only). InputChannel is REAPER's name for the chapter
// track's input channel(s) and OutputDevice the device REAPER plays on, both only to show; every name REAPER sent is
// bounded by bridge.DeviceName.
type teleprompterReaperInput struct {
	Status       string   `json:"status"`
	Reason       string   `json:"reason,omitempty"`
	Message      string   `json:"message"`
	ReaperDevice string   `json:"reaperDevice,omitempty"`
	InputChannel string   `json:"inputChannel,omitempty"`
	OutputDevice string   `json:"outputDevice,omitempty"`
	Device       string   `json:"device,omitempty"`
	Candidates   []string `json:"candidates"`
}

// deviceLister is the teleprompter service's microphone listing (a fake in tests).
type deviceLister interface {
	Devices(ctx context.Context) ([]teleprompter.Device, string, error)
}

// TeleprompterReaperInput answers which of the teleprompter's microphones REAPER records from, so the Booth listens on
// the device REAPER records with. chapterID names the Booth's chapter: when it is linked to one track, REAPER also names
// that track's input channel; "" or an unlinked chapter reads the device alone. It asks REAPER once, read-only, and never
// on a timer; a DAW that is not there or cannot say is an answer, and the Booth then uses the narrator's choice.
func (h *Host) TeleprompterReaperInput(chapterID string) (string, error) {
	svc := h.services()
	var lister deviceLister
	if svc.teleprompter != nil {
		lister = svc.teleprompter
	}
	return encodeBinding(teleprompterReaperInputIn(context.Background(), svc, trackStateReaderFrom(svc), lister, chapterID), nil)
}

// inputTrackFor is the one track chapterID is linked to, or "" when it names no chapter, an unknown one, or one with no
// track or several.
func inputTrackFor(svc hostServices, chapterID string) string {
	if chapterID == "" || svc.manuscript == nil {
		return ""
	}
	if _, links, err := chapterLinksFor(svc, chapterID); err == nil && len(links) == 1 {
		return links[0]
	}
	return ""
}

func teleprompterReaperInputIn(ctx context.Context, svc hostServices, reader trackStateReader, lister deviceLister, chapterID string) teleprompterReaperInput {
	if svc.audacity != nil {
		return inputUnavailable(inputDawCannotReport, "Audacity cannot report which microphone it records from, so the Booth listens to the one chosen in Levels.")
	}
	if status := reaperStatus(svc); status.Connection != reaperConnected {
		return inputUnavailable(status.Connection, readAloudConnectionMessage(status.Connection))
	}
	if reader == nil {
		return inputUnavailable(reaperStandalone, messageReaperOff)
	}
	state, err := reader.ChapterTrackState(ctx, inputTrackFor(svc, chapterID))
	if errors.Is(err, bridge.ErrStale) {
		// The link points at a track that is gone: the device is still REAPER's, so read it without the track.
		state, err = reader.ChapterTrackState(ctx, "")
	}
	if err != nil {
		refusal := readAloudRefusal(err, "", "")
		return inputUnavailable(refusal.Reason, refusal.Message)
	}
	if state.InputDevice == "" {
		answer := inputUnavailable(inputReaperNoDevice, "REAPER did not say which input device it has open. Choose the microphone in Levels.")
		answer.OutputDevice = state.OutputDevice
		return answer
	}
	if lister == nil {
		return inputUnavailable(inputDevicesFailed, "The microphones on this computer could not be listed.")
	}
	listCtx, cancel := context.WithTimeout(ctx, teleprompterDevicesTimeout)
	defer cancel()
	devices, message, err := lister.Devices(listCtx)
	if err == nil && message != "" {
		err = fmt.Errorf("%s", message)
	}
	if err != nil {
		answer := inputUnavailable(inputDevicesFailed, err.Error())
		answer.ReaperDevice, answer.InputChannel, answer.OutputDevice = state.InputDevice, state.InputChannel, state.OutputDevice
		return answer
	}
	names := make([]string, 0, len(devices))
	for _, device := range devices {
		names = append(names, device.Name)
	}
	match := daw.MatchInputDevice(state.InputDevice, names)
	answer := teleprompterReaperInput{Status: match.Status, ReaperDevice: state.InputDevice, InputChannel: state.InputChannel, OutputDevice: state.OutputDevice,
		Device: match.Device, Candidates: []string{}}
	switch match.Status {
	case daw.InputMatched:
		answer.Message = fmt.Sprintf("REAPER records from %q, so the Booth listens to %q.", state.InputDevice, match.Device)
	case daw.InputUncertain:
		answer.Candidates = match.Candidates
		answer.Message = fmt.Sprintf("REAPER records from %q, which could be any of %d microphones here. Pick the one REAPER uses.", state.InputDevice, len(match.Candidates))
	default:
		answer.Message = fmt.Sprintf("REAPER records from %q, which does not match a microphone here. Choose the microphone in Levels.", state.InputDevice)
	}
	return answer
}

func inputUnavailable(reason, message string) teleprompterReaperInput {
	return teleprompterReaperInput{Status: "unavailable", Reason: reason, Message: message, Candidates: []string{}}
}
