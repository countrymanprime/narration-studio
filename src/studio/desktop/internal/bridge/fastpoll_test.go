package bridge

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"sync"
	"testing"
	"time"
)

// quietReaper answers commands the way the Lua bridge does, by taking the command file and appending the answer to events.log, but unlike
// startFakeReaper it never calls Dispatch: the only things that deliver an answer are the host's tick (not running here) and the client's own
// fast polling, which is what these tests are about.
func startQuietReaper(t *testing.T, dir string, answer func(command []string) [][]string) {
	t.Helper()
	done := make(chan struct{})
	stopped := make(chan struct{})
	t.Cleanup(func() {
		close(done)
		<-stopped
	})
	go func() {
		defer close(stopped)
		ticker := time.NewTicker(2 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				names, _ := filepath.Glob(filepath.Join(dir, "commands", "*.cmd"))
				sort.Strings(names)
				for _, name := range names {
					content, err := os.ReadFile(name)
					if err != nil {
						continue
					}
					_ = os.Remove(name)
					fields, err := DecodeFields(string(content))
					if err != nil {
						t.Errorf("the client wrote a command that does not decode: %v", err)
						continue
					}
					appendEvents(t, dir, answer(fields)...)
				}
			}
		}
	}()
}

func positionAnswer(command []string) [][]string {
	return [][]string{{"PLAY_POSITION", run(command), "1", "12.5", "12.4", "3.0"}}
}

// A request is answered without anyone else calling Dispatch: after a Send the client polls for the answer itself, instead of leaving it to
// the host's 150 ms tick.
func TestARequestIsAnsweredWithoutTheHostTick(t *testing.T) {
	actions, _, dir := newActionsSession(t, true)
	actions.SetTimeout(2 * time.Second)
	startQuietReaper(t, dir, positionAnswer)

	started := time.Now()
	position, err := actions.PlayPosition(context.Background())
	if err != nil {
		t.Fatalf("PlayPosition: %v", err)
	}
	if !position.Playing || position.Cursor != 3 {
		t.Errorf("position = %+v", position)
	}
	if took := time.Since(started); took > 500*time.Millisecond {
		t.Errorf("the answer took %v, want well under the host's 150 ms tick plus the reaper's", took)
	}
}

func TestANavigatorRequestIsAnsweredWithoutTheHostTick(t *testing.T) {
	navigator, client, dir := newNavigatorSession(t)
	_ = client
	startQuietReaper(t, dir, func(command []string) [][]string { return [][]string{{"PONG", run(command), "1", "0", "0"}} })
	if _, err := navigator.Ping(context.Background()); err != nil {
		t.Fatalf("Ping: %v", err)
	}
}

// Overlapping requests each get their own answer, whichever finishes first.
func TestOverlappingRequestsAreEachAnswered(t *testing.T) {
	actions, _, dir := newActionsSession(t, true)
	startQuietReaper(t, dir, positionAnswer)
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := actions.PlayPosition(context.Background())
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Errorf("a request failed: %v", err)
		}
	}
}

// Fast polling ends with the answer: once nothing is waiting, the client does not dispatch on its own any more (the host's tick is the only poller).
func TestFastPollingStopsWhenTheAnswerArrives(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	client.poll.interval = 5 * time.Millisecond
	startQuietReaper(t, dir, positionAnswer)
	if _, err := actions.PlayPosition(context.Background()); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond) // the poller notices on its next tick that nobody waits
	before := client.events.dispatches.Load()
	time.Sleep(100 * time.Millisecond)
	if after := client.events.dispatches.Load(); after != before {
		t.Errorf("the client kept dispatching after the answer: %d calls became %d in 100 ms", before, after)
	}
}

// With no answer coming, fast polling stops at its window instead of running until the request's timeout: a hung script costs a bounded
// number of dispatches, never a hot loop.
func TestFastPollingIsBoundedWhenNoAnswerComes(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	client.poll.interval, client.poll.window = 10*time.Millisecond, 100*time.Millisecond
	actions.SetTimeout(500 * time.Millisecond)
	startQuietReaper(t, dir, func([]string) [][]string { return nil })

	if _, err := actions.PlayPosition(context.Background()); !errors.Is(err, ErrNoAnswer) {
		t.Fatalf("PlayPosition: %v, want ErrNoAnswer", err)
	}
	calls := client.events.dispatches.Load()
	if calls < 3 || calls > 15 {
		t.Errorf("fast polling made %d dispatches in a 100 ms window at 10 ms, want about 10 and never the 50 a poll to the 500 ms timeout would make", calls)
	}
}

// A request that is cancelled stops its fast polling.
func TestFastPollingStopsWhenTheRequestIsCancelled(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	client.poll.interval = 5 * time.Millisecond
	startQuietReaper(t, dir, func([]string) [][]string { return nil })
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()
	if _, err := actions.PlayPosition(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("PlayPosition: %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	before := client.events.dispatches.Load()
	time.Sleep(100 * time.Millisecond)
	if after := client.events.dispatches.Load(); after != before {
		t.Errorf("dispatching continued after the cancel: %d became %d", before, after)
	}
}

// The log is read from where the last call stopped, not from its start: a long session's log (it only grows) costs a tick what its new
// lines cost.
func TestDispatchReadsOnlyWhatWasAppended(t *testing.T) {
	dir := t.TempDir()
	client, err := New(dir)
	if err != nil {
		t.Fatal(err)
	}
	var got []Event
	client.Subscribe(Subscription{Tags: []string{"PONG"}, Handle: func(event Event) { got = append(got, event) }})
	line := EncodeFields([]string{"PROJECT_STATUS", "", "C:/Projects/Book/Book.rpp", "0", "1234", "1", "62.500000"}) + "\n"
	big := make([]byte, 0, 32<<20)
	for len(big) < 32<<20 {
		big = append(big, line...)
	}
	if err := os.WriteFile(filepath.Join(dir, "events.log"), big, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := client.Dispatch(); err != nil {
		t.Fatal(err)
	}
	appendEvents(t, dir, []string{"PONG", "r1", "1", "0", "0"})

	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	if err := client.Dispatch(); err != nil {
		t.Fatal(err)
	}
	runtime.ReadMemStats(&after)
	if len(got) != 1 || got[0].RunID != "r1" {
		t.Fatalf("delivered %+v, want the one new PONG", got)
	}
	if allocated := after.TotalAlloc - before.TotalAlloc; allocated > 1<<20 {
		t.Errorf("a dispatch of one new line on a 32 MB log allocated %d bytes: it read the whole file", allocated)
	}
}

func TestALevelMatchApplyIsAnsweredWithoutTheHostTick(t *testing.T) {
	levelMatch, _, dir := newLevelMatchSession(t)
	startQuietReaper(t, dir, func(command []string) [][]string {
		id := run(command)
		return [][]string{{"GAIN_ITEM", id, testItem, "1.000000", "2.000000"}, {"GAIN_APPLIED", id, "1"}}
	})
	got, err := levelMatch.Apply(context.Background(), oneGainCandidate())
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if len(got.Changed) == 0 {
		t.Errorf("Apply = %+v, want the item changed", got)
	}
}
