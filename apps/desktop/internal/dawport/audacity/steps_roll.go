package audacity

import (
	"context"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// The roll's steps and sentences.
const (
	stepStopRecording = "Stop the recording"
	stepRollCursor    = "Put the cursor at the roll point"
	stepPunchAndRoll  = "Record again from there with Punch and Roll"

	messageRollBad     = "That roll has no track or time Audacity can use, so nothing was changed."
	messageRollOutside = "The roll point is outside the track's audio in Audacity, so nothing was changed."
)

// Roll stops the recording, backs up the track's audio from at to its end, and records again from at with Audacity's Punch and
// Roll, which records over the audio from there on (ADR 0860 point 1: the earlier audio is kept, here in Backups). trackGUID is
// the track's name. With no backups it records over without one: the capability is destructive then, and the page has asked
// first (SN-D64). The recording's undo point is Audacity's, added when it stops, so UndoSteps is 0. Audacity's scripting cannot
// say who started a recording, so a roll is not refused for one the app did not start; the page offers a roll only while its own
// recording runs.
func (s *steps) Roll(ctx context.Context, trackGUID string, at float64) (dawport.Result, error) {
	if !backupText(trackGUID) || !finite(at) || at < 0 {
		return dawport.Refused(messageRollBad), nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	var e edits
	// The recording stops first, so the audio it made is on the track when the track is read and backed up.
	if err := s.client.Stop(ctx); err != nil {
		return dawport.Result{}, err
	}
	e.did(stepStopRecording, 0)
	tracks, err := s.client.Tracks(ctx)
	if err != nil {
		return dawport.Result{}, err
	}
	track, refusal, ok := oneTrack(tracks, trackGUID)
	if !ok {
		return refusal, nil
	}
	if !track.HasRange || at < track.Start-stepTolerance || at > track.End+stepTolerance {
		return dawport.Refused(messageRollOutside), nil
	}
	kept := s.canBackUp()
	if kept {
		// A roll has no chapter of its own, so the row names the track for both.
		answer, ok, err := s.backUp(ctx, dawport.BackupRequest{
			GUID: trackGUID, ChapterID: trackGUID, Start: at, End: max(at, track.End), Label: "Roll again from " + clock(at),
		})
		if !ok {
			return answer, err
		}
	}
	if err := s.selectRange(ctx, track.Index, at, at); err != nil {
		return dawport.Result{}, err
	}
	e.did(stepRollCursor, 0)
	if _, err := s.client.Do(ctx, audacitybridge.NewCommand("PunchAndRoll")); err != nil {
		return dawport.Result{}, err
	}
	e.did(stepPunchAndRoll, 0)
	message := "Rolled again in Audacity from " + clock(at) + ". The audio from there on was replaced."
	if kept {
		message = "Rolled again in Audacity from " + clock(at) + ". The earlier audio from there on is in Backups."
	}
	return e.done(message), nil
}
