package bridge

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

// The profiles in testdata/slowlink_profiles.json are read here and by the UI mock's parser (src/studio/ui/src/api/dawLatency.test.ts), so
// one profile means the same slowness on both sides.
func TestParseSlowLink(t *testing.T) {
	var fixture struct {
		Valid []struct {
			Text                                        string
			DelayMs, JitterMs, StallForMs, StallEveryMs int64
			Drop                                        int
			Only                                        []string
		}
		Invalid []string
	}
	content, err := os.ReadFile(filepath.Join("testdata", "slowlink_profiles.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(content, &fixture); err != nil || len(fixture.Valid) == 0 || len(fixture.Invalid) == 0 {
		t.Fatalf("the fixture did not load: %v", err)
	}
	ms := func(n int64) time.Duration { return time.Duration(n) * time.Millisecond }
	for _, want := range fixture.Valid {
		got, err := ParseSlowLink(want.Text)
		same := got.Delay == ms(want.DelayMs) && got.Jitter == ms(want.JitterMs) && got.StallFor == ms(want.StallForMs) &&
			got.StallEvery == ms(want.StallEveryMs) && got.Drop == want.Drop && strings.Join(got.Only, "+") == strings.Join(want.Only, "+")
		if err != nil || !same {
			t.Errorf("%q: got %+v, %v; want %+v", want.Text, got, err, want)
		}
		if got.Slows() != (want.DelayMs+want.JitterMs+want.StallForMs+int64(want.Drop) > 0) {
			t.Errorf("%q: Slows() = %v", want.Text, got.Slows())
		}
	}
	for _, text := range fixture.Invalid {
		if got, err := ParseSlowLink(text); err == nil {
			t.Errorf("%q parsed as %+v; want an error", text, got)
		}
	}
}

// tracksAnswer is a fake REAPER that answers tracks_read with one track and arm_lane with an armed track.
func tracksAnswer(command []string) [][]string {
	if command[1] == "arm_lane" {
		return [][]string{{"ARMED", run(command), testTrack, "1", "1"}}
	}
	return [][]string{
		{"TRACKS_READ", run(command), "C:/p/Alice.rpp", "0", "1"},
		{"TRACKS_ROW", run(command), "0", createdTrack, "Alice", "0"},
		{"TRACKS_READ_END", run(command), "1", "1"},
	}
}

// The owner's link, produced on demand (#3752): at every profile the suite names, a read and an arm the DAW is slow to answer are still
// answered, the wait is counted as the DAW's time and not as time in the queue, and nothing is lost. The profiles are scaled down, each on
// the side of the usual wait (40 ms here, 3 s in the app) it is on in the app; 3 s, the wait itself, runs well past it, because a command
// released in the instant the wait ends can be taken back, and then it is rightly not answered.
func TestASlowLinkStillAnswersACommandThatMayRunLong(t *testing.T) {
	profiles := map[string]string{"0 ms": "0ms", "300 ms": "4ms", "1 s": "13ms", "3 s": "80ms", "10 s": "200ms", "stall then recover": "stall=160ms", "jitter": "delay=100ms,jitter=40ms"}
	for name, text := range profiles {
		t.Run(name, func(t *testing.T) {
			actions, client, dir := newActionsSession(t, true)
			link, err := ParseSlowLink(text)
			if err != nil {
				t.Fatal(err)
			}
			fake := startFakeReaper(t, client, dir, tracksAnswer)
			var timings []RequestTiming
			actions.SetObserver(func(timing RequestTiming) { timings = append(timings, timing) })
			actions.SetTimeout(40 * time.Millisecond)
			actions.SetLateWait(fakeAnswersWithin)
			client.SetSlowLink(link)
			began := time.Now()
			got, err := actions.ReadTracks(context.Background())
			if err != nil || len(got.Tracks) != 1 {
				t.Fatalf("tracks_read: got %+v, err %v", got, err)
			}
			held := max(link.Delay, link.StallFor)
			if took := time.Since(began); took < held {
				t.Fatalf("answered in %v on a link that holds a command %v", took, held)
			}
			if _, err := actions.ArmLane(context.Background(), testTrack, false); err != nil {
				t.Fatalf("arm_lane: %v", err)
			}
			if len(fake.commands()) != 2 || len(timings) != 2 {
				t.Fatalf("the DAW got %d commands and the log %d timings; want 2 and 2", len(fake.commands()), len(timings))
			}
			if first := timings[0]; first.Outcome != "answered" || (held >= 50*time.Millisecond && (!first.Taken || first.Elapsed-first.Queue < held/2)) {
				t.Fatalf("the held command's timing reads %+v; want it answered, taken, and its wait counted as the DAW's", first)
			}
		})
	}
}

// A command outside mayRunLong keeps the short wait, so on a link slower than that wait the host reports no answer and the command
// still reaches the DAW afterwards: the simulator reproduces "it said it failed, then it happened".
func TestASlowLinkOutlastsTheShortWaitAndTheCommandStillLands(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
	actions.SetTimeout(20 * time.Millisecond)
	client.SetSlowLink(SlowLink{Delay: 150 * time.Millisecond})
	if _, err := actions.SelectTrack(context.Background(), testTrack); !errors.Is(err, ErrNoAnswer) {
		t.Fatalf("got %v; want ErrNoAnswer", err)
	}
	if len(fake.commands()) != 0 {
		t.Fatal("the DAW read the command before the link released it")
	}
	waitFor(t, func() bool { return len(fake.commands()) == 1 })
}

// A slow link never reorders: commands held for different lengths (jitter, a command the profile does not slow sent behind one it
// does, a stall) reach the DAW in the order they were sent.
func TestASlowLinkKeepsCommandsInTheOrderSent(t *testing.T) {
	for name, link := range map[string]SlowLink{
		"jitter":       {Delay: 5 * time.Millisecond, Jitter: 60 * time.Millisecond},
		"only one":     {Delay: 60 * time.Millisecond, Only: []string{"slow"}},
		"stall":        {StallFor: 60 * time.Millisecond},
		"stall, again": {StallFor: 30 * time.Millisecond, StallEvery: 40 * time.Millisecond},
	} {
		t.Run(name, func(t *testing.T) {
			_, client, dir := newActionsSession(t, true)
			fake := startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
			client.SetSlowLink(link)
			want := []string{"slow", "a", "slow", "b", "c", "slow", "d", "e"}
			for _, action := range want {
				if _, err := client.Send(action, nil); err != nil {
					t.Fatal(err)
				}
			}
			if len(fake.commands()) != 0 {
				t.Fatal("the DAW read a command the link was still holding")
			}
			waitFor(t, func() bool { return len(fake.commands()) == len(want) })
			var got []string
			for _, command := range fake.commands() {
				got = append(got, command[1])
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("the DAW read %v; sent %v", got, want)
			}
		})
	}
}

// drop=1 loses the first matching command and no other: its request ends unanswered as a command the DAW took (the caller reads back
// before sending it again), and the next one is answered.
func TestASlowLinkDropsOnlyTheFirstMatchingCommand(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, tracksAnswer)
	actions.SetTimeout(20 * time.Millisecond)
	actions.SetLateWait(20 * time.Millisecond)
	client.SetSlowLink(SlowLink{Drop: 1, Only: []string{"tracks_read"}})
	if _, err := actions.ArmLane(context.Background(), testTrack, false); err != nil {
		t.Fatalf("arm_lane is not the command to drop: %v", err)
	}
	if _, err := actions.ReadTracks(context.Background()); !errors.Is(err, ErrAnswerLate) {
		t.Fatalf("the dropped read: got %v; want ErrAnswerLate", err)
	}
	if got, err := actions.ReadTracks(context.Background()); err != nil || len(got.Tracks) != 1 {
		t.Fatalf("the read after the dropped one: got %+v, err %v", got, err)
	}
	if len(fake.commands()) != 2 {
		t.Fatalf("the DAW read %d commands; want the arm and the second read", len(fake.commands()))
	}
}

// The zero profile turns the slowness off again, and what was already held is still delivered.
func TestClearingASlowLinkReleasesWhatItHeld(t *testing.T) {
	_, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
	client.SetSlowLink(SlowLink{Delay: 80 * time.Millisecond})
	if _, err := client.Send("held", nil); err != nil {
		t.Fatal(err)
	}
	client.SetSlowLink(SlowLink{})
	if _, err := client.Send("prompt", nil); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(fake.commands()) == 2 })
	if got := fake.commands(); got[0][1] != "held" || got[1][1] != "prompt" {
		t.Fatalf("the DAW read %v", got)
	}
}

// waitFor polls until done answers true, and fails the test when it has not within fakeAnswersWithin.
func waitFor(t *testing.T, done func() bool) {
	t.Helper()
	for deadline := time.Now().Add(fakeAnswersWithin); !done(); time.Sleep(2 * time.Millisecond) {
		if time.Now().After(deadline) {
			t.Fatal("timed out waiting for the DAW to read what the link held")
		}
	}
}

// A stalled DAW is silent too: an event it wrote during the stall (a heartbeat, an answer) is delivered when the stall ends, not before.
func TestAStalledLinkDeliversNoEventsUntilItRecovers(t *testing.T) {
	_, client, dir := newActionsSession(t, true)
	heard := make(chan time.Time, 1)
	client.Subscribe(Subscription{Tags: []string{"PONG"}, Handle: func(Event) { heard <- time.Now() }})
	began := time.Now()
	client.SetSlowLink(SlowLink{StallFor: 100 * time.Millisecond})
	appendEvents(t, dir, []string{"PONG", "run-1", "1", "0", "0"})
	deadline := time.Now().Add(fakeAnswersWithin)
	for len(heard) == 0 && time.Now().Before(deadline) {
		if err := client.Dispatch(); err != nil {
			t.Fatal(err)
		}
		time.Sleep(2 * time.Millisecond)
	}
	select {
	case at := <-heard:
		if at.Sub(began) < 100*time.Millisecond {
			t.Fatalf("the event was delivered %v into a 100 ms stall", at.Sub(began))
		}
	default:
		t.Fatal("the event was never delivered after the stall")
	}
}
