package bridge

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"
)

func TestSetCursorSendsTheTimeAsPlainDigitsAndReturnsTheCursorREAPERHolds(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"CURSOR_SET", run(command), "12.500000"}}
	})
	got, err := actions.SetCursor(context.Background(), 12.5)
	if err != nil || got != 12.5 {
		t.Fatalf("SetCursor = %v, %v", got, err)
	}
	if command := fake.commands()[0]; command[1] != "set_cursor" || len(command) != 4 || command[3] != "12.5" {
		t.Fatalf("command = %q, want set_cursor with 12.5", command)
	}
}

func TestTransportCommandsRefuseATimeThatIsNotUsableBeforeAnythingIsSent(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	for _, seconds := range []float64{math.NaN(), math.Inf(1), math.Inf(-1), -0.001, -1, 1e12, maxPlaceSeconds + 1} {
		if _, err := actions.SetCursor(context.Background(), seconds); err == nil {
			t.Errorf("SetCursor(%v) must be refused", seconds)
		}
		if _, err := actions.PlayFrom(context.Background(), seconds); err == nil {
			t.Errorf("PlayFrom(%v) must be refused", seconds)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestPlayFromSendsTheTimeAndReturnsWhereREAPERPlaysFrom(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRANSPORT_PLAYING", run(command), "40.250000"}}
	})
	got, err := actions.PlayFrom(context.Background(), 40.25)
	if err != nil || got != 40.25 {
		t.Fatalf("PlayFrom = %v, %v", got, err)
	}
	if command := fake.commands()[0]; command[1] != "play_from" || command[3] != "40.25" {
		t.Fatalf("command = %q", command)
	}
}

func TestStopPlayReturnsTheEditCursor(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRANSPORT_STOPPED", run(command), "5.000000"}}
	})
	got, err := actions.StopPlay(context.Background())
	if err != nil || got != 5 {
		t.Fatalf("StopPlay = %v, %v", got, err)
	}
	if command := fake.commands()[0]; command[1] != "stop_play" || len(command) != 3 {
		t.Fatalf("command = %q", command)
	}
}

func TestWatchTransportSendsWholeSecondsRoundedUpAndReturnsTheLeaseGranted(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	granted := "3"
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRANSPORT_WATCHING", run(command), granted}}
	})
	got, err := actions.WatchTransport(context.Background(), 2500*time.Millisecond)
	if err != nil || got != 3*time.Second {
		t.Fatalf("WatchTransport = %v, %v", got, err)
	}
	if command := fake.commands()[0]; command[1] != "watch_transport" || command[3] != "3" {
		t.Fatalf("command = %q, want a lease of 3 whole seconds", command)
	}
	for _, bad := range []time.Duration{0, -time.Second} {
		if _, err := actions.WatchTransport(context.Background(), bad); err == nil {
			t.Errorf("a lease of %v must be refused", bad)
		}
	}
	if len(fake.commands()) != 1 {
		t.Fatalf("a refused lease was sent: %v", fake.commands())
	}
}

func TestTransportCommandsAreRefusedWhileREAPERRecordsAndSayWhy(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "REAPER is recording. Stop recording first."}}
	})
	for name, call := range map[string]func() error{
		"set_cursor": func() error { _, err := actions.SetCursor(context.Background(), 3); return err },
		"play_from":  func() error { _, err := actions.PlayFrom(context.Background(), 3); return err },
		"stop_play":  func() error { _, err := actions.StopPlay(context.Background()); return err },
	} {
		err := call()
		if !errors.Is(err, ErrRecording) {
			t.Errorf("%s: err = %v, want ErrRecording", name, err)
		}
	}
}

func TestAnAnswerThatIsNotANumberIsAnErrorNotAZero(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"CURSOR_SET", run(command), "soon"}}
	})
	if _, err := actions.SetCursor(context.Background(), 3); err == nil {
		t.Fatal("an unreadable cursor must be an error")
	}
}

func TestTheTransportCommandsAreExperimentalUntilTheOwnerSeesThemInREAPER(t *testing.T) {
	for _, command := range []string{"set_cursor", "play_from", "stop_play", "watch_transport"} {
		if !Experimental(command) {
			t.Errorf("%s must be on experimentalCommands until the verification pass has run it", command)
		}
	}
}

func TestPlayRangeSendsBothTimesAndReturnsTheStretchREAPERTook(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"RANGE_PLAYING", run(command), "40.250000", "41.500000"}}
	})
	from, to, err := actions.PlayRange(context.Background(), 40.25, 41.5)
	if err != nil || from != 40.25 || to != 41.5 {
		t.Fatalf("PlayRange = %v, %v, %v", from, to, err)
	}
	if command := fake.commands()[0]; command[1] != "play_range" || len(command) != 5 || command[3] != "40.25" || command[4] != "41.5" {
		t.Fatalf("command = %q, want play_range with 40.25 and 41.5", command)
	}
}

func TestPlayRangeRefusesAStretchThatIsNotUsableBeforeAnythingIsSent(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
	for _, bad := range [][2]float64{{5, 5}, {6, 5}, {-1, 5}, {math.NaN(), 5}, {1, math.NaN()}, {0, math.Inf(1)}, {0, maxRangeSeconds + 1}, {0, maxPlaceSeconds + 1}} {
		if _, _, err := actions.PlayRange(context.Background(), bad[0], bad[1]); err == nil {
			t.Errorf("PlayRange(%v) must be refused", bad)
		}
	}
	time.Sleep(20 * time.Millisecond)
	if len(fake.commands()) != 0 {
		t.Fatalf("commands were written: %v", fake.commands())
	}
}

func TestPlayRangeIsRefusedWhileREAPERRecordsAndSaysWhy(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "REAPER is recording. Stop recording first."}}
	})
	if _, _, err := actions.PlayRange(context.Background(), 1, 2); !errors.Is(err, ErrRecording) {
		t.Fatalf("err = %v, want ErrRecording", err)
	}
}

// The wire table refuses the answer before play_range reads it, so a time that is not a number is an error, never a 0.
func TestPlayRangeAnswerThatIsNotANumberIsAnErrorNotAZero(t *testing.T) {
	for name, answer := range map[string][]string{
		"the start": {"RANGE_PLAYING", "", "soon", "41.500000"},
		"the end":   {"RANGE_PLAYING", "", "40.250000", "later"},
	} {
		actions, client, dir := newActionsSession(t, true)
		startFakeReaper(t, client, dir, func(command []string) [][]string {
			fields := append([]string(nil), answer...)
			fields[1] = run(command)
			return [][]string{fields}
		})
		if _, _, err := actions.PlayRange(context.Background(), 40.25, 41.5); err == nil {
			t.Errorf("%s: an unreadable answer must be an error", name)
		}
	}
}
