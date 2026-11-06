package bridge

import (
	"context"
	"errors"
	"fmt"
)

// Recording in REAPER for the Read Aloud control bar (arm_only, record_start and record_stop in
// narration_transport.lua). All three are experimental (actions.go) until the verification pass has confirmed them in
// a real REAPER.

// The refusals the control bar tells apart, in the script's own words (narration_transport.lua).
var (
	ErrNoTrackArmed         = errors.New("no track is armed in REAPER")
	ErrSeveralTracksArmed   = errors.New("more than one track is armed in REAPER")
	ErrOtherTrackArmed      = errors.New("another track than this chapter's is armed in REAPER")
	ErrPlaying              = errors.New("REAPER is playing: stop it first")
	ErrAlreadyRecording     = errors.New("REAPER is already recording")
	ErrRecordingDidNotStart = errors.New("REAPER did not start recording")
	ErrNotOurRecording      = errors.New("REAPER is not recording anything this app started, so nothing was stopped")
	ErrRecordingNotStarted  = errors.New("REAPER has not started recording yet")
)

var refusals = map[string]error{
	"No track is armed.":                    ErrNoTrackArmed,
	"More than one track is armed.":         ErrSeveralTracksArmed,
	"Another track is armed.":               ErrOtherTrackArmed,
	"REAPER is playing. Stop it first.":     ErrPlaying,
	"REAPER is already recording.":          ErrAlreadyRecording,
	"REAPER did not start recording.":       ErrRecordingDidNotStart,
	"REAPER has not started recording yet.": ErrRecordingNotStarted,
}

// Armed is what arm_only did: the track it armed, how many others it disarmed, and whether anything changed.
type Armed struct {
	TrackGUID string
	Disarmed  int
	Changed   bool
}

// StartRule says where recording begins. StartHere leaves the edit cursor where it is. AtEnd (the third argument of
// record_start in narration_transport.lua) keeps the cursor when it is still where the bridge's last take on the track
// stopped, so the narrator goes on from there; anywhere else it first moves it to the end of the last item on the
// track, so a take never records over audio from a place nobody chose.
type StartRule string

const (
	StartHere StartRule = ""
	AtEnd     StartRule = "end"
	// ChapterEnd is AtEnd for a chapter linked to a folder of voices (RecordOptions.Folder names it): the end is the latest item of the
	// folder and every track inside it, and the cursor stays where the chapter last stopped, on whichever voice.
	ChapterEnd StartRule = "chapter_end"
)

// RecordOptions is what RecordStart is asked besides the track.
type RecordOptions struct {
	Start StartRule
	// Folder is the chapter's folder track GUID, sent with ChapterEnd and ignored by every other rule.
	Folder string
}

// RecordStarted is the track REAPER records on and the edit cursor where recording began, in seconds.
type RecordStarted struct {
	TrackGUID string
	Position  float64
}

// RecordStopped says how many track arms were put back to what the narrator had before arm_only, and how many were
// kept because the narrator changed them during the take. UndoPoints is how many points REAPER's undo history gained
// while the recording ran (one per stop, a roll's included): what undo_last's record_take may take back. An older script
// does not send it, and it reads 0.
type RecordStopped struct {
	Restored, Kept, UndoPoints int
}

// RecordEnded is a recording the app started that stopped without record_stop (the narrator pressed Stop in REAPER),
// with the same counts as RecordStopped.
type RecordEnded struct {
	Restored, Kept, UndoPoints int
}

// ArmOnly arms the track trackGUID names and disarms every other one, after REAPER remembers the arms the narrator had;
// they come back when the recording the app starts stops. Refused while REAPER records (ErrRecording); a track that is
// gone is a *TrackStaleError.
func (a *Actions) ArmOnly(ctx context.Context, trackGUID string) (Armed, error) {
	events, err := a.request(ctx, "arm_only", []string{"ARMED", "TRACK_STALE"}, trackGUID)
	if err != nil {
		return Armed{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "TRACK_STALE" {
		return Armed{}, &TrackStaleError{GUID: event.Fields[2]}
	}
	if event.Fields[2] != normalizeGUID(trackGUID) {
		return Armed{}, fmt.Errorf("REAPER armed another track than the one this app asked for")
	}
	return Armed{TrackGUID: event.Fields[2], Disarmed: int(numberAt(event.Fields, 3)), Changed: event.Fields[4] == "1"}, nil
}

// RecordStart asks REAPER to record on trackGUID, which must be the one armed track, while REAPER is stopped, from
// where opts.Start says. It returns once REAPER reports recording, with the edit cursor where recording began. The refusals are ErrNoTrackArmed, ErrSeveralTracksArmed, ErrOtherTrackArmed,
// ErrPlaying, ErrAlreadyRecording and ErrRecordingDidNotStart.
func (a *Actions) RecordStart(ctx context.Context, trackGUID string, opts RecordOptions) (RecordStarted, error) {
	args := []string{trackGUID}
	if opts.Start != StartHere {
		args = append(args, string(opts.Start))
		if opts.Start == ChapterEnd {
			args = append(args, opts.Folder)
		}
	}
	events, err := a.request(ctx, "record_start", []string{"RECORD_STARTED", "TRACK_STALE"}, args...)
	if err != nil {
		return RecordStarted{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "TRACK_STALE" {
		return RecordStarted{}, &TrackStaleError{GUID: event.Fields[2]}
	}
	if event.Fields[2] != normalizeGUID(trackGUID) {
		return RecordStarted{}, fmt.Errorf("REAPER started recording on another track than the one this app asked for")
	}
	a.mu.Lock()
	a.recordingRun = event.RunID
	a.mu.Unlock()
	return RecordStarted{TrackGUID: event.Fields[2], Position: numberAt(event.Fields, 3)}, nil
}

// RecordStop stops the recording the app started and puts the narrator's arms back. A recording the app did not start
// is never stopped: that is ErrNotOurRecording.
func (a *Actions) RecordStop(ctx context.Context) (RecordStopped, error) {
	events, err := a.request(ctx, "record_stop", []string{"RECORD_STOPPED", "RECORD_NOT_OURS"})
	if err != nil {
		return RecordStopped{}, err
	}
	a.mu.Lock()
	a.recordingRun = ""
	a.mu.Unlock()
	event := events[len(events)-1]
	if event.Tag == "RECORD_NOT_OURS" {
		return RecordStopped{}, ErrNotOurRecording
	}
	return RecordStopped{Restored: int(numberAt(event.Fields, 2)), Kept: int(numberAt(event.Fields, 3)), UndoPoints: int(numberAt(event.Fields, 4))}, nil
}

// VoiceSwitched is the voice track REAPER records on after SwitchVoice and the play position of the switch, in seconds.
type VoiceSwitched struct {
	TrackGUID string
	At        float64
}

// SwitchVoice moves the recording the app started to the voice track trackGUID names while REAPER keeps recording
// (switch_voice in narration_transport.lua, decision E1 of docs/research/2026-10-30-booth-sub-track-recording.md): the
// new track is armed and the old one disarmed together, and the take stays one undo point. A recording the app did not
// start is ErrNotOurRecording, one REAPER has not started yet is ErrRecordingNotStarted, and a track that is gone is a
// *TrackStaleError, the old voice still recording.
func (a *Actions) SwitchVoice(ctx context.Context, trackGUID string) (VoiceSwitched, error) {
	events, err := a.request(ctx, "switch_voice", []string{"VOICE_SWITCHED", "RECORD_NOT_OURS", "TRACK_STALE"}, trackGUID)
	if err != nil {
		return VoiceSwitched{}, err
	}
	event := events[len(events)-1]
	switch event.Tag {
	case "RECORD_NOT_OURS":
		return VoiceSwitched{}, ErrNotOurRecording
	case "TRACK_STALE":
		return VoiceSwitched{}, &TrackStaleError{GUID: event.Fields[2]}
	}
	if event.Fields[2] != normalizeGUID(trackGUID) {
		return VoiceSwitched{}, fmt.Errorf("REAPER switched to another track than the one this app asked for")
	}
	return VoiceSwitched{TrackGUID: event.Fields[2], At: numberAt(event.Fields, 3)}, nil
}

// OnRecordEnded sets the function told when a recording the app started stops without RecordStop. It runs on its own
// goroutine.
func (a *Actions) OnRecordEnded(handler func(RecordEnded)) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.onRecordEnded = handler
}
