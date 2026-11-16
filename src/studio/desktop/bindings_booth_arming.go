package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// boothArmTimeout bounds one arm or one release: a single quick request to the DAW, as a move to a chapter is.
const boothArmTimeout = placeTimeout

// followChapterSetting reports whether Booth.follow_chapter_in_daw is on (it is by default): the one switch for the DAW following the chapter the
// narrator works on, which includes arming the Booth's voice and turning its input monitoring on (#3428).
func followChapterSetting(svc hostServices) bool {
	if svc.settings == nil {
		return true
	}
	value, _ := svc.settings.Effective("Booth", "follow_chapter_in_daw", "true")
	return value != "false"
}

// DawArmBoothVoice arms the track the Booth's next take on chapterID records on (the chapter's one track, or the voice it chose, else its
// Narrator voice, as a record start picks it) and turns that track's input monitoring on when it is off, so the narrator hears themselves as
// soon as the Booth opens on the chapter (#3428, the owner's answer 8). The page sends it once per chapter it enters, when Booth.follow_chapter_in_daw
// is on and the DAW can follow; the voice a later choice makes is armed and monitored by BoothVoiceSet.
//
// It does nothing, and says nothing, for a DAW with no armed tracks, a chapter with no one track or no voice to arm, a take this app runs or
// starts, and a DAW that is recording (the DAW refuses and the answer carries its sentence): a hot track is never moved under a take. A DAW that
// does not answer, or a track it no longer has, is refused with the sentence and nothing changed. It adds no undo step.
func (h *Host) DawArmBoothVoice(chapterID string) (string, error) {
	svc := h.services()
	ctx, cancel := context.WithTimeout(context.Background(), boothArmTimeout)
	defer cancel()
	if h.recordStarting() || h.readAloudRecordingFor(chapterID) {
		return encodeBinding(dawport.Result{OK: true}, nil)
	}
	return encodeBinding(dawArmBoothVoiceIn(ctx, svc, readAloudAdapterName(svc), recorderFrom(svc), chapterID))
}

func dawArmBoothVoiceIn(ctx context.Context, svc hostServices, name string, recorder dawport.Recorder, chapterID string) (dawport.Result, error) {
	armer, ok := recorder.(dawport.LaneArmer)
	if recorder == nil || !ok {
		return dawport.Result{OK: true}, nil
	}
	link, refused, err := readAloudTrackGUID(svc, chapterID)
	if err != nil {
		return dawport.Result{}, err
	}
	if refused != nil {
		// A chapter with no or several tracks has the setup notice the Booth already shows.
		return dawport.Result{OK: true}, nil
	}
	target, noVoices, err := recordTarget(svc, chapterID, link)
	if err != nil {
		return dawport.Result{}, err
	}
	if noVoices != nil {
		return dawport.Result{OK: true}, nil
	}
	armed, err := armer.ArmLane(ctx, target, true)
	if err != nil {
		return dawport.Refused(boothArmRefusal(name, err)), nil
	}
	return dawport.Result{OK: true, Changed: armed.Changed || armed.Monitored}, nil
}

// DawReleaseBoothMonitor puts back the input monitoring the Booth turned on, when the narrator leaves the Booth or the app closes: only the
// tracks the Booth changed, and only where the narrator has not changed the monitoring since. While the DAW records it touches nothing and the
// DAW puts it back by itself once the recording stops. A DAW with nothing to put back answers as done.
func (h *Host) DawReleaseBoothMonitor() (string, error) {
	svc := h.services()
	ctx, cancel := context.WithTimeout(context.Background(), boothArmTimeout)
	defer cancel()
	return encodeBinding(dawReleaseBoothMonitorIn(ctx, readAloudAdapterName(svc), recorderFrom(svc)), nil)
}

func dawReleaseBoothMonitorIn(ctx context.Context, name string, recorder dawport.Recorder) dawport.Result {
	releaser, ok := recorder.(dawport.MonitorReleaser)
	if recorder == nil || !ok {
		return dawport.Result{OK: true}
	}
	released, err := releaser.ReleaseMonitor(ctx)
	if err != nil {
		return dawport.Refused(boothArmRefusal(name, err))
	}
	return dawport.Result{OK: true, Changed: released.Restored > 0}
}

// boothArmRefusal words the error an arm or a release returned: the DAW recording, a track it no longer has, or a DAW that did not answer.
func boothArmRefusal(name string, err error) string {
	var stale *bridge.TrackStaleError
	if errors.As(err, &stale) {
		return fmt.Sprintf("The track the Booth records on is no longer in the %s project, so it could not be armed.", name)
	}
	return readAloudRecordRefusal(name, err).Message
}

// shutdownReleaseTimeout bounds the release at shutdown: one quick request to a DAW that is answering (a DAW that is not has no recorder here).
const shutdownReleaseTimeout = 2 * time.Second

// releaseBoothMonitorOnShutdown is ServiceShutdown's best-effort release of the input monitoring the Booth turned on, as a take is stopped there
// (stopReadAloudRecordingOnShutdown). A DAW that is recording keeps the rest until its recording stops, and puts it back itself.
func (h *Host) releaseBoothMonitorOnShutdown() {
	svc := h.services()
	recorder := recorderFrom(svc)
	if recorder == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), shutdownReleaseTimeout)
	defer cancel()
	dawReleaseBoothMonitorIn(ctx, readAloudAdapterName(svc), recorder)
}
