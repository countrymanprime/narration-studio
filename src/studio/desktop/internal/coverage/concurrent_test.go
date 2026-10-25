package coverage

import (
	"strings"
	"sync"
	"testing"
	"time"
)

// twoChapters is a project with c-0001 and c-0003 and a service whose sidecars all hold at a gate until it is closed, so two
// runs can be in progress at once.
func twoChapters(t *testing.T) (*Service, *fakeSidecar, func()) {
	t.Helper()
	p := newTestProject(t)
	p.addSecondChapter()
	gate := make(chan struct{})
	var once sync.Once
	release := func() { once.Do(func() { close(gate) }) }
	sidecar := &fakeSidecar{during: func() { <-gate }}
	service := p.service(sidecar)
	// Registered after TempDir's own cleanup, so it runs first: no run is left writing into the folder.
	t.Cleanup(func() {
		release()
		service.Wait()
	})
	return service, sidecar, release
}

// awaitHeld returns a wait for n more of the sidecar's runs to be held at its gate. The fake honours a .cancel file between
// items, before it reaches the gate, so a test that cancels and then waits to see "Cancelling…" cancels only after this:
// a cancel sent earlier can end the run between items on a loaded runner, and the wait times out.
func awaitHeld(t *testing.T, sidecar *fakeSidecar) func(n int) {
	t.Helper()
	gate := sidecar.during
	reached := make(chan struct{}, 2)
	sidecar.during = func() {
		reached <- struct{}{}
		gate()
	}
	return func(n int) {
		t.Helper()
		for range n {
			select {
			case <-reached:
			case <-time.After(5 * time.Second):
				t.Fatal("a run never reached its sidecar's gate")
			}
		}
	}
}

func request(chapterID string, concurrent int) Request {
	return Request{ChapterID: chapterID, Transcription: Transcription{Model: "small"}, Alignment: DefaultAlignmentParams, Concurrent: concurrent}
}

func TestTwoChaptersRunAtOnceWhenTheStartsAskForIt(t *testing.T) {
	service, _, release := twoChapters(t)
	first, err := service.Start(request(testChapter, 2))
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Start(request(testSecondChapter, 2))
	if err != nil {
		t.Fatalf("the second chapter was refused: %v", err)
	}
	if first.RunID == second.RunID {
		t.Fatalf("two runs share the id %s", first.RunID)
	}
	states := service.States()
	if len(states) != 2 || states[0].ChapterID != testChapter || states[1].ChapterID != testSecondChapter {
		t.Fatalf("States = %+v, want both runs, oldest first", states)
	}
	if !service.Busy() || !service.Checking(testChapter) || !service.Checking(testSecondChapter) {
		t.Fatal("both chapters must read as being checked")
	}

	release()
	service.Wait()

	for _, chapter := range []string{testChapter, testSecondChapter} {
		result, err := service.Result(chapter, DefaultAlignmentParams)
		if err != nil || result.Result == nil {
			t.Fatalf("%s has no stored result: %+v, %v", chapter, result, err)
		}
	}
	if service.Busy() || len(service.States()) != 0 {
		t.Fatal("nothing must be running afterwards")
	}
}

func TestASecondStartIsRefusedUnlessTheRequestAllowsIt(t *testing.T) {
	service, _, _ := twoChapters(t)
	if _, err := service.Start(request(testChapter, 1)); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Start(request(testSecondChapter, 0)); err == nil || !strings.Contains(err.Error(), "already running") {
		t.Fatalf("err = %v, want the busy refusal", err)
	}
	// The limit is the new request's own: a run that asks for room still counts the one already going.
	if _, err := service.Start(request(testSecondChapter, 1)); err == nil {
		t.Fatal("a request for one at a time must be refused while one runs")
	}
}

func TestTheSameChapterIsNeverCheckedTwiceAtOnce(t *testing.T) {
	service, _, _ := twoChapters(t)
	if _, err := service.Start(request(testChapter, 4)); err != nil {
		t.Fatal(err)
	}
	_, err := service.Start(request(testChapter, 4))
	if err == nil || !strings.Contains(err.Error(), "already being checked") {
		t.Fatalf("err = %v", err)
	}
	if reason, refused := ReasonOf(err); !refused || reason != ReasonBusy {
		t.Fatalf("reason = %v, %v", reason, refused)
	}
}

func TestCancelStopsEveryRunAndReportsEach(t *testing.T) {
	service, _, release := twoChapters(t)
	var mu sync.Mutex
	cancelling := map[string]bool{}
	service.changed = func(state State) {
		if state.Message == "Cancelling…" {
			mu.Lock()
			cancelling[state.ChapterID] = true
			mu.Unlock()
		}
	}
	for _, chapter := range []string{testChapter, testSecondChapter} {
		if _, err := service.Start(request(chapter, 2)); err != nil {
			t.Fatal(err)
		}
	}

	service.Cancel()
	release()
	service.Wait()

	mu.Lock()
	defer mu.Unlock()
	if !cancelling[testChapter] || !cancelling[testSecondChapter] {
		t.Fatalf("every run must be told it is cancelling: %v", cancelling)
	}
}

func TestCancelBackgroundLeavesTheNarratorsRunGoing(t *testing.T) {
	service, sidecar, release := twoChapters(t)
	held := awaitHeld(t, sidecar)
	if _, err := service.Start(request(testSecondChapter, 2)); err != nil {
		t.Fatal(err)
	}
	background := request(testChapter, 2)
	background.Background = true
	if _, err := service.Start(background); err != nil {
		t.Fatal(err)
	}
	held(2)
	ended := make(chan struct{})
	go func() {
		service.CancelBackground()
		close(ended)
	}()
	cancelling := func(chapter string) bool {
		for _, state := range service.States() {
			if state.ChapterID == chapter && state.Message == "Cancelling…" {
				return true
			}
		}
		return false
	}
	waitFor(t, func() bool { return cancelling(testChapter) })
	if cancelling(testSecondChapter) {
		t.Fatal("the narrator's run was cancelled with the background one")
	}
	release()
	<-ended
}

func TestABackgroundRunHoldsTheOneSlotUntilItIsCancelled(t *testing.T) {
	service, sidecar, release := twoChapters(t)
	held := awaitHeld(t, sidecar)
	background := request(testChapter, 1)
	background.Background = true
	if _, err := service.Start(background); err != nil {
		t.Fatal(err)
	}
	held(1)
	if _, err := service.Start(request(testSecondChapter, 1)); err == nil {
		t.Fatal("a one-at-a-time start must be refused while the background run holds the slot")
	}
	ended := make(chan struct{})
	go func() {
		service.CancelBackground()
		close(ended)
	}()
	waitFor(t, func() bool { return len(service.States()) == 1 && service.States()[0].Message == "Cancelling…" })
	release()
	<-ended
	if _, err := service.Start(request(testSecondChapter, 1)); err != nil {
		t.Fatalf("refused after the background run ended: %v", err)
	}
}

func TestEachRunsStateAndEndAreReportedOnce(t *testing.T) {
	service, _, release := twoChapters(t)
	var mu sync.Mutex
	ends := map[string]int{}
	service.changed = func(state State) {
		if state.Phase != PhaseRunning {
			mu.Lock()
			ends[state.RunID]++
			mu.Unlock()
		}
	}
	for _, chapter := range []string{testChapter, testSecondChapter} {
		if _, err := service.Start(request(chapter, 2)); err != nil {
			t.Fatal(err)
		}
	}
	release()
	service.Wait()

	mu.Lock()
	defer mu.Unlock()
	if len(ends) != 2 {
		t.Fatalf("ends = %v, want one terminal state per run", ends)
	}
	for id, count := range ends {
		if count != 1 {
			t.Fatalf("run %s ended %d times", id, count)
		}
	}
}
