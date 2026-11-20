package bridge

import (
	"context"
	"sync"
	"testing"
	"time"
)

func observeTimings(actions *Actions) func() []RequestTiming {
	var mu sync.Mutex
	var seen []RequestTiming
	actions.SetObserver(func(timing RequestTiming) {
		mu.Lock()
		defer mu.Unlock()
		seen = append(seen, timing)
	})
	return func() []RequestTiming {
		mu.Lock()
		defer mu.Unlock()
		return append([]RequestTiming(nil), seen...)
	}
}

// A request's wait is split where REAPER read the command: the time the file sat in the commands folder, then REAPER's own time to answer. The
// fake reads the command only after a stall (its tick is late) and then takes a while to answer.
func TestARequestsWaitIsSplitIntoQueueAndReaperTime(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	timings := observeTimings(actions)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		time.Sleep(150 * time.Millisecond)
		return [][]string{{"ARMED", run(command), testTrack, "0", "1"}}
	})
	actions.SetTimeout(5 * time.Second)
	fake.stall(120 * time.Millisecond)

	if _, err := actions.request(context.Background(), "arm_only", []string{"ARMED"}, testTrack); err != nil {
		t.Fatal(err)
	}
	got := timings()
	if len(got) != 1 || got[0].Outcome != "answered" || !got[0].Taken {
		t.Fatalf("timings = %+v, want one answered request REAPER read", got)
	}
	timing := got[0]
	if timing.Queue < 60*time.Millisecond || timing.Queue > timing.Elapsed {
		t.Errorf("queue = %v of %v elapsed, want most of the 120 ms the fake's tick was late", timing.Queue, timing.Elapsed)
	}
	if reaper := timing.Elapsed - timing.Queue; reaper < 100*time.Millisecond {
		t.Errorf("REAPER's time = %v, want about the 150 ms the fake took to answer", reaper)
	}
}

// A command REAPER never reads (a REAPER that is busy or hung) is not taken, and its whole wait is queue time.
func TestACommandREAPERNeverReadIsAllQueueTime(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	timings := observeTimings(actions)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
	actions.SetTimeout(60 * time.Millisecond)
	fake.stall(400 * time.Millisecond)

	if _, err := actions.request(context.Background(), "arm_only", []string{"ARMED"}, testTrack); err == nil {
		t.Fatal("no error from a request nobody answered")
	}
	got := timings()
	if len(got) != 1 || got[0].Outcome != "no_answer" || got[0].Taken || got[0].Queue != got[0].Elapsed {
		t.Fatalf("timings = %+v, want one no_answer request that was not taken, queue = elapsed", got)
	}
}
