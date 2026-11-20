package bridge

import (
	"context"
	"errors"
	"testing"
	"time"
)

// tracks_read is on the list: a live list that comes after the usual wait is the live list, not a fall back to the saved project.
func TestReadTracksAnsweredAfterTheUsualWaitIsTheLiveList(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		time.Sleep(300 * time.Millisecond)
		return [][]string{
			{"TRACKS_READ", run(command), "C:/p/Alice.rpp", "0", "1"},
			{"TRACKS_ROW", run(command), "0", createdTrack, "Alice", "0"},
			{"TRACKS_READ_END", run(command), "1", "1"},
		}
	})
	actions.SetTimeout(50 * time.Millisecond)
	actions.SetLateWait(5 * time.Second)
	got, err := actions.ReadTracks(context.Background())
	if err != nil || len(got.Tracks) != 1 {
		t.Fatalf("got %+v, err %v", got, err)
	}
}

// #3645: REAPER read track_create and answered after the usual wait. The answer is the answer: the track was made, so the host gets it
// and does not report "not answering" for a change that landed.
func TestCreateTrackAnsweredAfterTheUsualWaitIsStillAnswered(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		time.Sleep(300 * time.Millisecond)
		return [][]string{{"TRACK_CREATED", run(command), createdTrack, "2", command[3]}}
	})
	actions.SetTimeout(50 * time.Millisecond)
	actions.SetLateWait(5 * time.Second)
	got, err := actions.CreateChildTrack(context.Background(), "Alice", createdTrack)
	if err != nil {
		t.Fatalf("a create answered late failed: %v", err)
	}
	if got.GUID != createdTrack || got.Name != "Alice" {
		t.Fatalf("got %+v", got)
	}
}

// The same class: arming a lane (arm_only, arm_lane) answered late is armed, not "did not confirm".
func TestArmAnsweredAfterTheUsualWaitIsStillAnswered(t *testing.T) {
	for _, command := range []string{"arm_only", "arm_lane"} {
		t.Run(command, func(t *testing.T) {
			actions, client, dir := newActionsSession(t, true)
			startFakeReaper(t, client, dir, func(cmd []string) [][]string {
				time.Sleep(300 * time.Millisecond)
				return [][]string{{"ARMED", run(cmd), testTrack, "1", "1"}}
			})
			actions.SetTimeout(50 * time.Millisecond)
			actions.SetLateWait(5 * time.Second)
			var err error
			if command == "arm_only" {
				_, err = actions.ArmOnly(context.Background(), testTrack)
			} else {
				_, err = actions.ArmLane(context.Background(), testTrack, false)
			}
			if err != nil {
				t.Fatalf("%s answered late failed: %v", command, err)
			}
		})
	}
}

// A command REAPER read and never answers is ErrAnswerLate (an ErrNoAnswer), so the caller reads back instead of sending it again.
func TestCreateTrackReadButNeverAnsweredIsErrAnswerLate(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
	actions.SetTimeout(50 * time.Millisecond)
	actions.SetLateWait(100 * time.Millisecond)
	_, err := actions.CreateTrack(context.Background(), "Alice")
	if !errors.Is(err, ErrAnswerLate) || !errors.Is(err, ErrNoAnswer) {
		t.Fatalf("err = %v, want ErrAnswerLate (and ErrNoAnswer)", err)
	}
}

// A command REAPER never read is taken back and fails at the usual wait, however long the late wait is: a REAPER that is closed is not waited on.
func TestCreateTrackNeverReadIsTakenBackAtTheUsualWait(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
	fake.stall(2 * time.Second)
	actions.SetTimeout(50 * time.Millisecond)
	actions.SetLateWait(10 * time.Second)
	started := time.Now()
	_, err := actions.CreateTrack(context.Background(), "Alice")
	if !errors.Is(err, ErrNoAnswer) || errors.Is(err, ErrAnswerLate) {
		t.Fatalf("err = %v, want plain ErrNoAnswer", err)
	}
	if time.Since(started) > time.Second {
		t.Fatalf("waited %v for a command REAPER never read", time.Since(started))
	}
}

// Other commands keep the usual wait: a track state read REAPER read and did not answer is plain ErrNoAnswer.
func TestOtherCommandsKeepTheUsualWait(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
	actions.SetTimeout(50 * time.Millisecond)
	actions.SetLateWait(10 * time.Second)
	started := time.Now()
	if _, err := actions.ChapterTrackState(context.Background(), testTrack); !errors.Is(err, ErrNoAnswer) || errors.Is(err, ErrAnswerLate) {
		t.Fatalf("err = %v, want plain ErrNoAnswer", err)
	}
	if time.Since(started) > time.Second {
		t.Fatalf("a read waited %v", time.Since(started))
	}
}

// Switching the voice during a take is the same class (switch_voice): answered late is switched, not "did not answer".
func TestSwitchVoiceAnsweredAfterTheUsualWaitIsStillAnswered(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		time.Sleep(300 * time.Millisecond)
		return [][]string{{"VOICE_SWITCHED", run(command), testTrack, "12.5"}}
	})
	actions.SetTimeout(50 * time.Millisecond)
	actions.SetLateWait(5 * time.Second)
	got, err := actions.SwitchVoice(context.Background(), testTrack)
	if err != nil {
		t.Fatalf("a switch answered late failed: %v", err)
	}
	if got.TrackGUID != testTrack && got.TrackGUID != "" {
		t.Fatalf("got %+v", got)
	}
}

// A caller's deadline that ends after REAPER read the command is late too, not a plain deadline: the caller reads back instead of retrying.
func TestACreateREAPERReadWhoseCallerDeadlineEndsIsErrAnswerLate(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
	actions.SetTimeout(10 * time.Second)
	ctx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
	defer cancel()
	_, err := actions.CreateTrack(ctx, "Alice")
	if !errors.Is(err, ErrAnswerLate) || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err = %v, want ErrAnswerLate wrapping the deadline", err)
	}
}
