package bridge

import (
	"context"
	"os"
	"path/filepath"
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

// An outcome that shows REAPER answered is never logged as a command REAPER did not read, even when the poll could not see the file go (a stat
// that fails some other way than "not there", as a file whose delete is pending can on Windows): the time is then unknown, not all queue.
func TestAnAnsweredRequestIsTakenEvenWhenTheFileGoingWasNotSeen(t *testing.T) {
	// A path under a regular file: stat fails with "not a directory", which is not "does not exist".
	file := filepath.Join(t.TempDir(), "plain")
	if err := os.WriteFile(file, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	watch := &takenWatch{done: make(chan struct{}), target: filepath.Join(file, "00000001.cmd")}
	defer watch.stop()
	started := time.Now().Add(-200 * time.Millisecond)

	queue, taken := watch.queue(started, 200*time.Millisecond, "answered")
	if !taken || queue != -1 {
		t.Errorf("answered: queue %v taken %v, want unknown (-1) and taken", queue, taken)
	}
	queue, taken = watch.queue(started, 200*time.Millisecond, "no_answer")
	if taken || queue != 200*time.Millisecond {
		t.Errorf("no_answer: queue %v taken %v, want the whole wait and not taken", queue, taken)
	}
}

// A command REAPER read and then took too long to answer is Taken: the file was gone when the host went to take it back.
func TestACommandREAPERReadButAnsweredLateIsTaken(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	timings := observeTimings(actions)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		time.Sleep(300 * time.Millisecond)
		return nil
	})
	actions.SetTimeout(100 * time.Millisecond)

	if _, err := actions.request(context.Background(), "arm_only", []string{"ARMED"}, testTrack); err == nil {
		t.Fatal("no error from a request answered after its timeout")
	}
	got := timings()
	if len(got) != 1 || got[0].Outcome != "no_answer" || !got[0].Taken || got[0].Queue > got[0].Elapsed {
		t.Fatalf("timings = %+v, want no_answer, Taken (REAPER read it), queue within elapsed", got)
	}
}

// The observer is a log write; a panic in it must not leave the command in the folder for REAPER to run late.
func TestATimedOutCommandIsTakenBackEvenWhenTheObserverPanics(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
	fake.stall(500 * time.Millisecond)
	actions.SetTimeout(50 * time.Millisecond)
	actions.SetObserver(func(RequestTiming) { panic("observer") })

	func() {
		defer func() { _ = recover() }()
		_, _ = actions.request(context.Background(), "arm_only", []string{"ARMED"}, testTrack)
	}()
	left, _ := filepath.Glob(filepath.Join(dir, "commands", "*.cmd"))
	if len(left) != 0 {
		t.Errorf("command files left for REAPER: %v", left)
	}
}

// A commands folder that vanishes (a dropped share, a session folder removed) is not REAPER reading the command.
func TestACommandFolderThatVanishesIsNotREAPERReadingTheCommand(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	timings := observeTimings(actions)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
	fake.stall(600 * time.Millisecond)
	actions.SetTimeout(150 * time.Millisecond)
	go func() {
		time.Sleep(30 * time.Millisecond)
		_ = os.RemoveAll(filepath.Join(dir, "commands"))
	}()

	_, _ = actions.request(context.Background(), "arm_only", []string{"ARMED"}, testTrack)
	got := timings()
	if len(got) != 1 || got[0].Taken || got[0].Queue != got[0].Elapsed {
		t.Fatalf("timings = %+v, want not taken, the whole wait as queue", got)
	}
}
