package bridge

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"
)

// roll (ADR 0860 point 1, narration_roll.lua): the answers as integrations/reaper/tests/roll_test.lua pins them.

func TestRollIsExperimentalAndRefusedWhileTheSettingIsOff(t *testing.T) {
	actions, client, dir := newActionsSession(t, false)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	if _, err := actions.Roll(context.Background(), testTrack, 40); !errors.Is(err, ErrExperimentalOff) {
		t.Fatalf("Roll: %v", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
	if !Experimental("roll") {
		t.Error("roll must stay experimental until the verification pass")
	}
}

func TestRollSendsTheTrackAndTimeAndReadsROLLED(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ROLLED", run(command), testTrack, "62.250000", "0"}}
	})
	got, err := actions.Roll(context.Background(), testTrack, 62.25)
	if err != nil {
		t.Fatal(err)
	}
	if want := (Rolled{TrackGUID: testTrack, At: 62.25, UndoPoints: 0}); got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	if command := fake.commands()[0]; command[1] != "roll" || command[3] != testTrack || command[4] != "62.250000" || len(command) != 5 {
		t.Fatalf("command = %v", command)
	}
}

func TestRollRefusesATimeREAPERWouldRefuseWithoutSendingIt(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	for _, at := range []float64{-0.5, math.NaN(), math.Inf(1), math.Inf(-1)} {
		if _, err := actions.Roll(context.Background(), testTrack, at); !errors.Is(err, ErrBadRoll) {
			t.Errorf("Roll(%v): %v, want ErrBadRoll", at, err)
		}
	}
	if _, err := actions.Roll(context.Background(), "", 4); !errors.Is(err, ErrBadRoll) {
		t.Errorf("Roll with no track: %v, want ErrBadRoll", err)
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestRollAnswers(t *testing.T) {
	setting := `Roll keeps the earlier audio as a take only when REAPER's option "New recording that overlaps existing media items" is set to "Splits existing items and creates new takes". It is set to "Trims existing items behind new recording (tape mode)". Change it in REAPER's Options menu; this app never changes it.`
	cases := []struct {
		name   string
		answer []string
		check  func(error) bool
	}{
		{"not ours", []string{"RECORD_NOT_OURS"}, func(err error) bool { return errors.Is(err, ErrNotOurRecording) }},
		{"stale track", []string{"TRACK_STALE", testTrack}, func(err error) bool {
			var stale *TrackStaleError
			return errors.As(err, &stale) && stale.GUID == testTrack
		}},
		{"bad time from REAPER", []string{"ERROR", "The roll time is not a usable number of seconds."}, func(err error) bool { return errors.Is(err, ErrBadRoll) }},
		{"stopped but not restarted", []string{"ERROR", "REAPER did not start recording again after the roll. The earlier audio is kept."}, func(err error) bool {
			var refusal *RefusalError
			return errors.Is(err, ErrRollStopped) && !errors.As(err, &refusal)
		}},
		{"stopped during the roll", []string{"ERROR", "The recording was stopped before REAPER recorded again after the roll. The earlier audio is kept."}, func(err error) bool { return errors.Is(err, ErrRollStopped) }},
		{"stop not seen", []string{"ERROR", "REAPER did not stop recording at once, so the roll did not record again. The earlier audio is kept."}, func(err error) bool { return errors.Is(err, ErrRollStopped) }},
		{"the setting", []string{"ERROR", setting}, func(err error) bool {
			var refusal *RefusalError
			return errors.As(err, &refusal) && refusal.Sentence == setting && err.Error() == setting
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			actions, client, dir := newActionsSession(t, true)
			startFakeReaper(t, client, dir, func(command []string) [][]string {
				line := append([]string{c.answer[0], run(command)}, c.answer[1:]...)
				return [][]string{line}
			})
			if _, err := actions.Roll(context.Background(), testTrack, 40); !c.check(err) {
				t.Fatalf("err = %v", err)
			}
		})
	}
}

func TestRollAnsweredForAnotherTrackIsAnError(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ROLLED", run(command), "{00000002-0000-4000-8000-000000000002}", "40.000000", "0"}}
	})
	if _, err := actions.Roll(context.Background(), testTrack, 40); err == nil {
		t.Fatal("a roll REAPER answered for another track was taken")
	}
}
