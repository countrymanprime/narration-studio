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

// Record in REAPER: arming a chapter's linked track, and starting and stopping a REAPER recording alongside a reading
// session. The Lua and bridge half (arm_only, record_start, record_stop in narration_transport.lua and bridge.Actions,
// and the DAW port's Recorder role) is already built and harness-tested; this file is the remaining caller. Every
// command is sent only from a click (or the Space shortcut on Play, the Booth's reading control bar), with the track GUID taken
// from the chapter-track mapping the same way ReadAloudReaperState reads it, never from the UI (threat-model row 5k).

const (
	// readAloudBadTime is the refusal of a start at a time that is not a finite, non-negative number of seconds.
	readAloudBadTime         = "bad_time"
	readAloudBadTimeSentence = "The record start time is not a usable number of seconds."
)

// readAloudRecordStartTimeout bounds how long RecordStart waits for REAPER to report recording: on a timeout nothing
// starts listening and the bar says why, the same as any other refusal.
const readAloudRecordStartTimeout = 3 * time.Second

// ReadAloudRecording is what an arm, a record start or a record stop did, in the shape the control bar reads. Outcome
// is "armed", "started", "stopped" or "refused" (Reason and Message say why; nothing in REAPER changed for a refusal).
type ReadAloudRecording struct {
	Outcome   string   `json:"outcome"`
	Reason    string   `json:"reason,omitempty"`
	Message   string   `json:"message,omitempty"`
	TrackGUID string   `json:"trackGuid,omitempty"`
	Disarmed  *int     `json:"disarmed,omitempty"`
	Changed   *bool    `json:"changed,omitempty"`
	Position  *float64 `json:"position,omitempty"`
	Restored  *int     `json:"restored,omitempty"`
	Kept      *int     `json:"kept,omitempty"`
}

func readAloudRefused(reason, message string) ReadAloudRecording {
	return ReadAloudRecording{Outcome: "refused", Reason: reason, Message: message}
}

// recorderFrom asks svc's DAW port resolver for the Record role (ADR 0300), the same seam trackStateReaderFrom uses:
// nil when there is no resolver, no adapter, the capability is toggled off, or REAPER is not reachable right now.
func recorderFrom(svc hostServices) dawport.Recorder {
	if svc.dawPortResolver == nil {
		return nil
	}
	recorder, err := dawport.Role[dawport.Recorder](svc.dawPortResolver, dawport.CapRecord)
	if err != nil {
		return nil
	}
	return recorder
}

// readAloudAdapterName is the display name of the DAW adapter the refusals speak of: what the resolver drives, or
// REAPER, the one adapter with a bridge, while there is no resolver. It is the only place in this file that spells a
// DAW's name (TestRecordRefusalsNameTheAdapterNotReaper scans for it), so a second adapter words its refusals without
// touching Go (ADR 0791).
func readAloudAdapterName(svc hostServices) string {
	if svc.dawPortResolver != nil {
		if name := svc.dawPortResolver.Kind().String(); name != "none" {
			return name
		}
	}
	return "REAPER"
}

// readAloudTrackGUID is chapterID's one linked track, or a refusal in the control bar's own words for no link or
// several links - the same cases and wording readAloudReaperStateIn turns into no_link. A chapter the manuscript does
// not have is still a hard error, not a refusal.
func readAloudTrackGUID(svc hostServices, chapterID string) (string, *ReadAloudRecording, error) {
	title, links, err := chapterLinksFor(svc, chapterID)
	if err != nil {
		return "", nil, err
	}
	name := readAloudAdapterName(svc)
	switch {
	case len(links) == 0:
		refused := readAloudRefused(readAloudUnlinked, fmt.Sprintf("%q has no linked track. Link it to its %s track in the audio engine panel.", title, name))
		return "", &refused, nil
	case len(links) > 1:
		refused := readAloudRefused(readAloudSeveralLinks, fmt.Sprintf("%q is linked to %d tracks. Keep the one to record on, in the audio engine panel.", title, len(links)))
		return "", &refused, nil
	}
	return links[0], nil, nil
}

// readAloudConnectionRefusal is the refusal for a bridge that is not connected or not answering, worded from name.
func readAloudConnectionRefusal(name, connection string) ReadAloudRecording {
	if connection == reaperNotRunning {
		return readAloudRefused(reaperNotRunning, fmt.Sprintf("%s is not answering. Check that %s is open and the Narration Utils action is running, then try again.", name, name))
	}
	return readAloudRefused(connection, fmt.Sprintf("%s is not connected to this app. To record with reading, open this app from the Narration Utils action in %s.", name, name))
}

func readAloudExperimentalOffRefusal(name string) ReadAloudRecording {
	return readAloudRefused(readAloudExperimentalOff, fmt.Sprintf("Reading %s's tracks is an experimental action. Turn on Experimental %s actions in Settings to use it.", name, name))
}

// readAloudRecordRefusal turns what ArmOnly, RecordStart or RecordStop answered into the reason and the sentence the
// bar shows. The sentence is built from name, the adapter's display name, never from the bridge's own error text.
func readAloudRecordRefusal(name string, err error) ReadAloudRecording {
	var stale *bridge.TrackStaleError
	switch {
	case errors.As(err, &stale):
		return readAloudRefused(readAloudTrackMissing, fmt.Sprintf("The track linked to this chapter is no longer in the %s project. Link it again in the audio engine panel.", name))
	case errors.Is(err, context.DeadlineExceeded):
		return readAloudRefused("timeout", fmt.Sprintf("%s did not confirm within 3 seconds. Nothing started.", name))
	case errors.Is(err, bridge.ErrNoTrackArmed):
		return readAloudRefused("not_armed", fmt.Sprintf("No track is armed in %s.", name))
	case errors.Is(err, bridge.ErrSeveralTracksArmed):
		return readAloudRefused("several_armed", fmt.Sprintf("More than one track is armed in %s.", name))
	case errors.Is(err, bridge.ErrOtherTrackArmed):
		return readAloudRefused("other_armed", fmt.Sprintf("Another track than this chapter's is armed in %s.", name))
	case errors.Is(err, bridge.ErrPlaying):
		return readAloudRefused("playing", fmt.Sprintf("%s is playing: stop it first.", name))
	case errors.Is(err, bridge.ErrAlreadyRecording), errors.Is(err, bridge.ErrPunchWhileRecording):
		return readAloudRefused("already_recording", fmt.Sprintf("%s is already recording.", name))
	case errors.Is(err, bridge.ErrRecordingDidNotStart):
		return readAloudRefused("did_not_start", fmt.Sprintf("%s did not start recording.", name))
	case errors.Is(err, bridge.ErrNotOurRecording):
		return readAloudRefused("not_our_recording", fmt.Sprintf("%s is not recording anything this app started, so nothing was stopped.", name))
	case errors.Is(err, bridge.ErrNoAnswer):
		return readAloudConnectionRefusal(name, reaperNotRunning)
	case errors.Is(err, bridge.ErrUnavailable):
		return readAloudConnectionRefusal(name, reaperStandalone)
	}
	return readAloudRefused(refusedFailed, fmt.Sprintf("%s could not do that: %s.", name, err.Error()))
}

// readAloudArmOnlyIn arms chapterID's linked track and disarms every other one (the "Arm Chapter N only" action),
// refusing while the DAW records. It changes nothing in the reading session. recorder is nil exactly when
// recorderFrom would answer nil (no resolver, the capability off, or the DAW not reachable).
func readAloudArmOnlyIn(ctx context.Context, svc hostServices, recorder dawport.Recorder, chapterID string) (ReadAloudRecording, error) {
	name := readAloudAdapterName(svc)
	if status := reaperStatus(svc); status.Connection != reaperConnected {
		return readAloudConnectionRefusal(name, status.Connection), nil
	}
	if recorder == nil {
		return readAloudExperimentalOffRefusal(name), nil
	}
	guid, refused, err := readAloudTrackGUID(svc, chapterID)
	if err != nil {
		return ReadAloudRecording{}, err
	}
	if refused != nil {
		return *refused, nil
	}
	armed, err := recorder.ArmOnly(ctx, guid)
	if err != nil {
		return readAloudRecordRefusal(name, err), nil
	}
	disarmed, changed := armed.Disarmed, armed.Changed
	return ReadAloudRecording{Outcome: "armed", TrackGUID: armed.TrackGUID, Disarmed: &disarmed, Changed: &changed}, nil
}

func (h *Host) ReadAloudArmOnly(chapterID string) (string, error) {
	svc := h.services()
	return encodeBinding(readAloudArmOnlyIn(context.Background(), svc, recorderFrom(svc), chapterID))
}

// readAloudRecordStartIn is Record: it arms chapterID's linked track alone (the narrator's other arms are remembered
// and come back on stop, ADR 0232), then starts recording at the end of the track's last item, and waits for ctx's
// deadline for the DAW to confirm. A precondition that fails first - playing, already recording - refuses before
// anything is armed or moved; reader is the track-state role that reads them, nil when it is not available. Another
// track being armed is no longer a refusal. Sent only from Play with the Record toggle on (the Booth's reading control bar) and
// the Companion's Record; TeleprompterStart follows only once this answers "started".
func readAloudRecordStartIn(ctx context.Context, svc hostServices, recorder dawport.Recorder, reader trackStateReader, chapterID string) (ReadAloudRecording, error) {
	return readAloudRecordStartFrom(ctx, svc, recorder, nil, reader, chapterID, nil)
}

// readAloudRecordStartAtIn is Record at a punch: the same arms, preconditions and refusals as readAloudRecordStartIn,
// but the DAW records from at (project seconds) instead of the end of the track's last item. The edit cursor is placed
// there with puncher (punch_to, no pre-roll) once the track is armed, and recording starts from the cursor; ADR 0791's
// end-of-track default stays for a start without a time. A time that is not a finite, non-negative number of seconds
// is refused before anything is read, armed or moved (threat-model row 5k). puncher is nil when the punch capability
// is not available, which refuses the same way as the record capability being off.
func readAloudRecordStartAtIn(ctx context.Context, svc hostServices, recorder dawport.Recorder, puncher dawport.Puncher, reader trackStateReader, chapterID string, at float64) (ReadAloudRecording, error) {
	if math.IsNaN(at) || math.IsInf(at, 0) || at < 0 {
		return readAloudRefused(readAloudBadTime, readAloudBadTimeSentence), nil
	}
	return readAloudRecordStartFrom(ctx, svc, recorder, puncher, reader, chapterID, &at)
}

// readAloudRecordStartFrom is both starts: from the end of the track's last item when at is nil, else from *at, placed
// with puncher.
func readAloudRecordStartFrom(ctx context.Context, svc hostServices, recorder dawport.Recorder, puncher dawport.Puncher, reader trackStateReader, chapterID string, at *float64) (ReadAloudRecording, error) {
	name := readAloudAdapterName(svc)
	if status := reaperStatus(svc); status.Connection != reaperConnected {
		return readAloudConnectionRefusal(name, status.Connection), nil
	}
	if recorder == nil || (at != nil && puncher == nil) {
		return readAloudExperimentalOffRefusal(name), nil
	}
	guid, refused, err := readAloudTrackGUID(svc, chapterID)
	if err != nil {
		return ReadAloudRecording{}, err
	}
	if refused != nil {
		return *refused, nil
	}
	if reader != nil {
		state, err := reader.ChapterTrackState(ctx, guid)
		if err != nil {
			return readAloudRecordRefusal(name, err), nil
		}
		switch {
		case state.Recording:
			return readAloudRecordRefusal(name, bridge.ErrAlreadyRecording), nil
		case state.Playing:
			return readAloudRecordRefusal(name, bridge.ErrPlaying), nil
		}
	}
	armed, err := recorder.ArmOnly(ctx, guid)
	if err != nil {
		return readAloudRecordRefusal(name, err), nil
	}
	opts, message := dawport.RecordOptions{Start: bridge.AtEnd}, ""
	if at != nil {
		if _, err := puncher.PunchTo(ctx, *at, 0); err != nil {
			if armed.Changed {
				putArmsBack(recorder)
			}
			return readAloudRecordRefusal(name, err), nil
		}
		opts, message = dawport.RecordOptions{Start: bridge.StartHere}, readAloudRecordingFrom(*at)
	}
	started, err := recorder.RecordStart(ctx, guid, opts)
	if err != nil {
		if armed.Changed {
			putArmsBack(recorder)
		}
		return readAloudRecordRefusal(name, err), nil
	}
	position := started.Position
	return ReadAloudRecording{Outcome: "started", Message: message, TrackGUID: started.TrackGUID, Position: &position}, nil
}

// readAloudRecordingFrom is the sentence a start at a punch answers with, so the narrator sees where the take begins.
func readAloudRecordingFrom(at float64) string {
	return fmt.Sprintf("Recording from %.1f seconds.", at)
}

// putArmsBack asks the recorder to give the narrator's arms back after a start that failed once the arms had changed,
// so no track is left armed behind a refusal. RecordStop is the only command that restores them; it answers
// ErrNotOurRecording when nothing was recording, which is expected here and ignored. It has its own deadline because
// the start's may be spent.
func putArmsBack(recorder dawport.Recorder) {
	ctx, cancel := context.WithTimeout(context.Background(), readAloudRecordStartTimeout)
	defer cancel()
	_, _ = recorder.RecordStop(ctx)
}

func (h *Host) ReadAloudRecordStart(chapterID string) (string, error) {
	svc := h.services()
	recorder := recorderFrom(svc)
	ctx, cancel := context.WithTimeout(context.Background(), readAloudRecordStartTimeout)
	defer cancel()
	result, err := readAloudRecordStartIn(ctx, svc, recorder, trackStateReaderFrom(svc), chapterID)
	if err == nil && result.Outcome == "started" {
		h.setReadAloudRecording(chapterID, recorder)
	}
	return encodeBinding(result, err)
}

// puncherFrom asks svc's DAW port resolver for the punch role, as recorderFrom asks for Record: nil when there is no
// resolver, no adapter, the capability is toggled off, or the DAW is not reachable right now.
func puncherFrom(svc hostServices) dawport.Puncher {
	if svc.dawPortResolver == nil {
		return nil
	}
	puncher, err := dawport.Role[dawport.Puncher](svc.dawPortResolver, dawport.CapPunch)
	if err != nil {
		return nil
	}
	return puncher
}

// ReadAloudRecordStartAt is Record from a punch the narrator chose: chapterID and a time in project seconds, never a
// track GUID (threat-model row 5k). ReadAloudRecordStart, with no time, keeps starting at the end of the last item.
func (h *Host) ReadAloudRecordStartAt(chapterID string, at float64) (string, error) {
	svc := h.services()
	recorder := recorderFrom(svc)
	ctx, cancel := context.WithTimeout(context.Background(), readAloudRecordStartTimeout)
	defer cancel()
	result, err := readAloudRecordStartAtIn(ctx, svc, recorder, puncherFrom(svc), trackStateReaderFrom(svc), chapterID, at)
	if err == nil && result.Outcome == "started" {
		h.setReadAloudRecording(chapterID, recorder)
	}
	return encodeBinding(result, err)
}

// readAloudRecordStopIn stops the recording this app started (Stop, or the dialog closing while reading and
// recording), and puts the narrator's own arms back. A recording this app did not start is left alone
// (ErrNotOurRecording). name is the adapter's display name for the refusal sentences.
func readAloudRecordStopIn(ctx context.Context, name string, recorder dawport.Recorder) (ReadAloudRecording, error) {
	if recorder == nil {
		return readAloudExperimentalOffRefusal(name), nil
	}
	stopped, err := recorder.RecordStop(ctx)
	if err != nil {
		return readAloudRecordRefusal(name, err), nil
	}
	restored, kept := stopped.Restored, stopped.Kept
	return ReadAloudRecording{Outcome: "stopped", Restored: &restored, Kept: &kept}, nil
}

func (h *Host) ReadAloudRecordStop() (string, error) {
	svc := h.services()
	result, err := readAloudRecordStopIn(context.Background(), readAloudAdapterName(svc), recorderFrom(svc))
	h.clearReadAloudRecording()
	return encodeBinding(result, err)
}

// setReadAloudRecording remembers that this app started a recording for chapterID, so ServiceShutdown can stop it if
// the app quits first, and registers the handler for a recording REAPER's own Stop button ends without
// ReadAloudRecordStop (the narrator's arms still come back; the bar picks up the change on its next ask).
func (h *Host) setReadAloudRecording(chapterID string, recorder dawport.Recorder) {
	h.mu.Lock()
	h.readAloudRecordingChapter = chapterID
	h.mu.Unlock()
	recorder.OnRecordEnded(func(bridge.RecordEnded) { h.clearReadAloudRecording() })
}

func (h *Host) clearReadAloudRecording() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.readAloudRecordingChapter = ""
}

// stopReadAloudRecordingOnShutdown is ServiceShutdown's best-effort recording stop (threat-model row 5k: the host
// stops a recording it started when the app shuts down, rather than leaving REAPER recording with no app open to
// stop it). It never blocks shutdown on REAPER answering.
func (h *Host) stopReadAloudRecordingOnShutdown() {
	h.mu.Lock()
	chapterID := h.readAloudRecordingChapter
	h.mu.Unlock()
	if chapterID == "" {
		return
	}
	if recorder := recorderFrom(h.services()); recorder != nil {
		ctx, cancel := context.WithTimeout(context.Background(), readAloudRecordStartTimeout)
		defer cancel()
		_, _ = recorder.RecordStop(ctx)
	}
	h.clearReadAloudRecording()
}
