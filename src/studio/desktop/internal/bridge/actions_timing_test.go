package bridge

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
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
	// A stat that fails some other way than "does not exist", as a file whose delete is pending can on Windows.
	watch := &takenWatch{
		done:   make(chan struct{}),
		target: filepath.Join(t.TempDir(), "00000001.cmd"),
		stat: func(string) (os.FileInfo, error) {
			return nil, &os.PathError{Op: "stat", Path: "x", Err: fs.ErrPermission}
		},
	}
	defer watch.stop()
	started := time.Now().Add(-200 * time.Millisecond)

	queue, taken := watch.queue(started, 200*time.Millisecond, "answered")
	if !taken || queue != QueueUnknown {
		t.Errorf("answered: queue %v taken %v, want QueueUnknown and taken", queue, taken)
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
	actions.SetLateWait(noLateAnswerWithin)

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
	actions.SetLateWait(noLateAnswerWithin)
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

// A take-back that fails with the file still there (a read-only folder, a sharing violation) is not REAPER reading the command: it may
// still run, and the host log must not say REAPER had already read it.
func TestATakeBackThatFailsWithTheFileStillThereIsNotTaken(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	timings := observeTimings(actions)
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string { return nil })
	fake.stall(400 * time.Millisecond)
	actions.SetTimeout(60 * time.Millisecond)
	actions.SetLateWait(20 * time.Millisecond) // ends inside the stall: REAPER has still not read the command
	client.remove = func(string) error { return &os.PathError{Op: "remove", Path: "x", Err: fs.ErrPermission} }
	var lines []string
	var mu sync.Mutex
	client.SetLog(func(kind, message string) {
		mu.Lock()
		defer mu.Unlock()
		lines = append(lines, kind+": "+message)
	})

	_, _ = actions.request(context.Background(), "record_stop", []string{"RECORD_STOPPED"})
	got := timings()
	if len(got) != 1 || got[0].Taken || got[0].Queue != got[0].Elapsed {
		t.Fatalf("timings = %+v, want not taken, the whole wait as queue", got)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(lines) != 1 || !strings.Contains(lines[0], "could not be taken back") || strings.Contains(lines[0], "already read") {
		t.Errorf("host log = %q, want it to say the command could not be taken back", lines)
	}
}

// A command REAPER read (the watch saw its file go) stays taken when the commands folder is removed afterwards and the timeout then fires.
func TestACommandReadBeforeTheFolderVanishedIsStillTaken(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	timings := observeTimings(actions)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		time.Sleep(time.Second) // REAPER ran it and never answers within the timeout
		return nil
	})
	actions.SetTimeout(300 * time.Millisecond)
	actions.SetLateWait(noLateAnswerWithin)
	go func() {
		time.Sleep(120 * time.Millisecond)
		_ = os.RemoveAll(filepath.Join(dir, "commands"))
	}()

	_, _ = actions.request(context.Background(), "arm_only", []string{"ARMED"}, testTrack)
	got := timings()
	if len(got) != 1 || !got[0].Taken || got[0].Queue >= got[0].Elapsed {
		t.Fatalf("timings = %+v, want taken, queue within the wait", got)
	}
}

// The observer is a log write; a panic in it must not cost the caller an answer REAPER gave.
func TestAnObserverPanicDoesNotLoseAnAnswer(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ARMED", run(command), testTrack, "0", "1"}}
	})
	actions.SetTimeout(5 * time.Second)
	actions.SetObserver(func(RequestTiming) { panic("observer") })

	if _, err := actions.request(context.Background(), "arm_only", []string{"ARMED"}, testTrack); err != nil {
		t.Fatalf("an answered request failed: %v", err)
	}
}

// A command that changes REAPER, read and answered late, is waited for (waitLate), and its timing still says REAPER read it: the split
// is kept through the longer wait, whether the answer lands or the wait ends.
func TestALateAnswerKeepsItsQueueAndReaperSplit(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	timings := observeTimings(actions)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		time.Sleep(250 * time.Millisecond)
		return [][]string{{"ARMED", run(command), testTrack, "0", "1"}}
	})
	actions.SetTimeout(80 * time.Millisecond)
	actions.SetLateWait(2 * time.Second)

	if _, err := actions.request(context.Background(), "arm_only", []string{"ARMED"}, testTrack); err != nil {
		t.Fatalf("late answer: %v", err)
	}
	got := timings()
	if len(got) != 1 || got[0].Outcome != "answered" || !got[0].Taken || got[0].Queue < 0 || got[0].Queue >= got[0].Elapsed {
		t.Fatalf("timings = %+v, want one answered request REAPER read, queue within the wait", got)
	}
}

// A command whose take-back failed and that REAPER then read and answered in the late wait is Taken, answered or errored: the failed removal
// never makes a command REAPER ran look unread.
func TestAnAnswerAfterAFailedTakeBackIsTaken(t *testing.T) {
	for _, tc := range []struct {
		name    string
		answer  func(command []string) [][]string
		outcome string
	}{
		{"answered", func(c []string) [][]string { return [][]string{{"ARMED", run(c), testTrack, "0", "1"}} }, "answered"},
		{"error", func(c []string) [][]string { return [][]string{{"ERROR", run(c), "locked"}} }, "error"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			actions, client, dir := newActionsSession(t, true)
			timings := observeTimings(actions)
			fake := startFakeReaper(t, client, dir, tc.answer)
			fake.stall(250 * time.Millisecond) // REAPER reads the command after the timeout, in the late wait
			actions.SetTimeout(60 * time.Millisecond)
			actions.SetLateWait(3 * time.Second)
			client.remove = func(string) error { return &os.PathError{Op: "remove", Path: "x", Err: fs.ErrPermission} }

			_, _ = actions.request(context.Background(), "arm_only", []string{"ARMED"}, testTrack)
			got := timings()
			if len(got) != 1 || got[0].Outcome != tc.outcome || !got[0].Taken || got[0].Queue < 0 || got[0].Queue > got[0].Elapsed {
				t.Fatalf("timings = %+v, want one %s record that is Taken with queue within the wait", got, tc.outcome)
			}
		})
	}
}

// The take-back that fails is never worded as "already read", whichever command: the file may still be there and the command may still run.
func TestAFailedTakeBackIsWordedAsOneForEveryCommand(t *testing.T) {
	for _, command := range []string{"record_stop", "arm_only", "arm_lane", "track_create", "tracks_read", "switch_voice"} {
		t.Run(command, func(t *testing.T) {
			actions, client, dir := newActionsSession(t, true)
			fake := startFakeReaper(t, client, dir, func([]string) [][]string { return nil })
			fake.stall(700 * time.Millisecond)
			actions.SetTimeout(50 * time.Millisecond)
			actions.SetLateWait(80 * time.Millisecond)
			client.remove = func(string) error { return &os.PathError{Op: "remove", Path: "x", Err: fs.ErrPermission} }
			var mu sync.Mutex
			var lines []string
			client.SetLog(func(kind, message string) {
				mu.Lock()
				defer mu.Unlock()
				lines = append(lines, kind+": "+message)
			})

			_, _ = actions.request(context.Background(), command, []string{"X"})
			mu.Lock()
			defer mu.Unlock()
			if len(lines) != 1 || !strings.Contains(lines[0], "could not be taken back") || strings.Contains(lines[0], "already read") {
				t.Errorf("host log = %q, want it to say the command could not be taken back", lines)
			}
		})
	}
}
