package main

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// boothArmTimeout bounds one release: a single quick request to the DAW, as a move to a chapter is.
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
// is on and the DAW can follow, and again after a take that a voice was chosen during (with the switch off too, when it arms without monitoring: a voice
// choice still arms); the voice a later choice makes is armed and monitored by BoothVoiceSet.
//
// It does nothing, and says nothing, for a DAW with no armed tracks, a chapter with no one track or no voice to arm, a take this app runs or
// starts, and a DAW that is recording (the DAW refuses and the answer carries its sentence): a hot track is never moved under a take. A DAW that
// does not answer, or a track it no longer has, is refused with the sentence and nothing changed. It adds no undo step.
func (h *Host) DawArmBoothVoice(chapterID string) (string, error) {
	svc := h.services()
	ctx, cancel := boothArmContext()
	defer cancel()
	return encodeBinding(h.dawArmBoothVoiceIn(ctx, svc, recorderFrom(svc), chapterID))
}

// boothArmContext bounds the Booth's arm as a lane command, like a voice choice (laneCommandTimeout): REAPER may be slow to read the track
// list or to arm, and an arm it has read is waited for, never reported as failed while it is still landing (#3752: on a link of 1.5 s the
// old 3 s bound ran out in the track list read, and opening the Booth said "did not confirm within 3 seconds"). The page waits on nothing
// for it. A REAPER that never reads the command still fails at the usual answer wait.
func boothArmContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), laneCommandTimeout)
}

func (h *Host) dawArmBoothVoiceIn(ctx context.Context, svc hostServices, recorder dawport.Recorder, chapterID string) (dawport.Result, error) {
	if h.recordStarting() || h.readAloudRecordingFor(chapterID) {
		// Back in the Booth during a take: arming waits for the stop (the page arms again then), and a release that waits is dropped.
		keepBoothMonitor(ctx, recorder)
		return dawport.Result{OK: true}, nil
	}
	return armBoothVoiceLane(ctx, svc, readAloudAdapterName(svc), recorder, chapterID, followChapterSetting(svc), &h.boothMonitorOwed, !h.recordingOtherChapter(chapterID))
}

func armBoothVoiceLane(ctx context.Context, svc hostServices, name string, recorder dawport.Recorder, chapterID string, monitor bool, owed *monitorDebt, keepOnRecording bool) (dawport.Result, error) {
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
	project, err := liveSelectedProjectForLane(svc)
	if err != nil {
		return dawport.Result{}, err
	}
	target, noVoices, err := recordTargetIn(svc, chapterID, link, &project)
	if err != nil {
		return dawport.Result{}, err
	}
	if noVoices != nil {
		return dawport.Result{OK: true}, nil
	}
	armed, err := armLaneOwing(ctx, armer, target, monitor, owed)
	if err != nil {
		if errors.Is(err, bridge.ErrRecording) && keepOnRecording {
			keepBoothMonitor(ctx, recorder)
		}
		return dawport.Refused(boothArmRefusal(name, err)), nil
	}
	return dawport.Result{OK: true, Changed: armed.Changed || armed.Monitored}, nil
}

// recordingOtherChapter is true while this app records a chapter other than chapterID: an arm for chapterID then says nothing about a release that waits for
// that take, so it is not dropped.
func (h *Host) recordingOtherChapter(chapterID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.readAloudRecordingChapter != "" && h.readAloudRecordingChapter != chapterID
}

// keepBoothMonitor drops a monitoring release that waits for a take to stop, when the narrator is back in the Booth during it. Best effort: a recorder
// without the role, or one that does not answer, leaves the release to the page's arm after the stop.
func keepBoothMonitor(ctx context.Context, recorder dawport.Recorder) {
	if releaser, ok := recorder.(dawport.MonitorReleaser); ok {
		_ = releaser.KeepMonitor(ctx)
	}
}

// DawReleaseBoothMonitor puts back the input monitoring the Booth turned on, when the narrator leaves the Booth or the app closes: only the
// tracks the Booth changed, and only where the narrator has not changed the monitoring since. While the DAW records it touches nothing and the
// DAW puts it back by itself once the recording stops. A DAW with nothing to put back answers as done.
func (h *Host) DawReleaseBoothMonitor() (string, error) {
	svc := h.services()
	ctx, cancel := context.WithTimeout(context.Background(), boothArmTimeout)
	defer cancel()
	return encodeBinding(h.releaseBoothMonitor(ctx, svc, recorderFrom(svc)), nil)
}

// monitorDebt is the host's note that the DAW may hold an input monitoring the Booth turned on (the embedded Bool), with a count of the arms that have
// started, so an arm that finishes late cannot clear what a later one set.
type monitorDebt struct {
	atomic.Bool
	arms atomic.Int64
}

// armLaneOwing sends ArmLane and keeps the debt in step with what the DAW answered. It is set before the call when a monitoring is asked for, so a call that
// times out (the DAW may have acted) stays owed; an answer that monitored sets it again, whatever a release did meanwhile; a definite answer that turned
// nothing on (a refusal, or a lane that was on already) puts back what it was only when no other arm has started since. Two overlapping arms that both
// turned nothing on leave it set until a release succeeds: a false "may still be on" is said only when the DAW is also unreachable at leave, and any answered
// release clears it.
func armLaneOwing(ctx context.Context, armer dawport.LaneArmer, target string, monitor bool, owed *monitorDebt) (dawport.Armed, error) {
	if !monitor || owed == nil {
		return armer.ArmLane(ctx, target, monitor)
	}
	started := owed.arms.Add(1)
	prior := owed.Swap(true)
	armed, err := armer.ArmLane(ctx, target, monitor)
	if err == nil && armed.Monitored {
		owed.Store(true)
		return armed, nil
	}
	var stale *bridge.TrackStaleError
	definite := err == nil || errors.Is(err, bridge.ErrRecording) || errors.As(err, &stale)
	if !definite {
		// The DAW may have acted (a timeout, a lost answer): owed, whatever a release took meanwhile.
		owed.Store(true)
	} else if !prior && owed.arms.Load() == started {
		owed.CompareAndSwap(true, false)
	}
	return armed, err
}

// releaseBoothMonitor is the release when the Booth is left. The owed note is taken before the DAW is asked, so an arm that lands while the release
// is in flight sets it again and is not lost; a release that fails puts it back. A DAW that cannot be reached while a monitoring may still be on is
// said once, then forgotten: the DAW's own ledger puts the monitoring back the next time its bridge starts. Nothing owed, nothing said.
func (h *Host) releaseBoothMonitor(ctx context.Context, svc hostServices, recorder dawport.Recorder) dawport.Result {
	owed := h.boothMonitorOwed.Swap(false)
	if recorder == nil {
		if owed {
			return dawport.Refused(monitorUnreachableSentence(svc))
		}
		return dawport.Result{OK: true}
	}
	result := dawReleaseBoothMonitorIn(ctx, readAloudAdapterName(svc), recorder)
	if _, can := recorder.(dawport.MonitorReleaser); !can {
		// A recorder that cannot release (another DAW after a relink): the monitoring a REAPER turned on may still be on, and its own ledger is what puts it back.
		if owed {
			h.boothMonitorOwed.Store(true)
		}
		return result
	}
	if !result.OK {
		if !owed {
			// Nothing was turned on in this session (the switch is off, or the Booth never monitored): a slow DAW has nothing to tell the narrator.
			return dawport.Result{OK: true}
		}
		h.boothMonitorOwed.Store(true)
	}
	return result
}

// monitorUnreachableSentence names the linked DAW, or says "The DAW" when none is linked. The DAW's own ledger puts the monitoring back the next time its
// bridge starts, but when that is depends on the launcher script setting, so the sentence promises no time.
func monitorUnreachableSentence(svc hostServices) string {
	name, again := "The DAW", "the DAW"
	if svc.dawPortResolver != nil && svc.dawPortResolver.Kind().String() != "none" {
		name = readAloudAdapterName(svc)
		again = name
	}
	return fmt.Sprintf("%s could not be reached, so your input monitoring may still be on. Turn it off in %s.", name, again)
}

// boothReleaseRefusal words a failed release on leaving the Booth (monitor_restore answers only MONITOR_RESTORED or an error, never a stale track): what failed (putting the input monitoring back), that it may still be on and what to do.
func boothReleaseRefusal(name string, err error) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return fmt.Sprintf("%s did not answer in time, so your input monitoring may still be on. Turn it off in %s.", name, name)
	}
	return fmt.Sprintf("%s could not put your input monitoring back, so it may still be on. Turn it off in %s.", name, name)
}

func dawReleaseBoothMonitorIn(ctx context.Context, name string, recorder dawport.Recorder) dawport.Result {
	releaser, ok := recorder.(dawport.MonitorReleaser)
	if recorder == nil || !ok {
		return dawport.Result{OK: true}
	}
	released, err := releaser.ReleaseMonitor(ctx)
	if err != nil {
		// A script from before this command never turned any monitoring on, so there is nothing to put back and nothing to say.
		if errors.Is(err, bridge.ErrScriptOutdated) {
			return dawport.Result{OK: true}
		}
		return dawport.Refused(boothReleaseRefusal(name, err))
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
