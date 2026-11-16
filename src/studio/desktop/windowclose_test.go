package main

import (
	"sync/atomic"
	"testing"
	"time"
)

const testWait = 40 * time.Millisecond

func newTestGate() (*closeGate, *atomic.Int32, *atomic.Int32) {
	return newTestGateWait(testWait)
}

func newTestGateWait(wait time.Duration) (*closeGate, *atomic.Int32, *atomic.Int32) {
	var asked, closed atomic.Int32
	gate := newCloseGate(func() { asked.Add(1) }, func() { closed.Add(1) }, wait)
	return gate, &asked, &closed
}

func TestACloseWithNothingHeldGoesStraightThrough(t *testing.T) {
	gate, asked, _ := newTestGate()
	if !gate.closing() {
		t.Fatal("a close with no draft held was cancelled")
	}
	if asked.Load() != 0 {
		t.Fatal("the page was asked about a close with nothing held")
	}
	gate.arm(true)
	gate.arm(false)
	if !gate.closing() {
		t.Fatal("a close after the draft went away was cancelled")
	}
}

func TestACloseWithADraftHeldIsCancelledAndAskedAgainByASecondClose(t *testing.T) {
	gate, asked, closed := newTestGate()
	gate.arm(true)
	if gate.closing() {
		t.Fatal("a close with a draft held went ahead")
	}
	gate.asked()
	if gate.closing() {
		t.Fatal("a second close while the question is open went ahead")
	}
	gate.asked()
	if asked.Load() != 2 {
		t.Fatalf("the page was asked %d times, want once for each close", asked.Load())
	}
	time.Sleep(100 * time.Millisecond)
	if closed.Load() != 0 {
		t.Fatal("the window closed while the narrator was still answering")
	}
}

func TestSayingYesClosesAndSayingNoKeepsTheWindowAndAsksAgainNextTime(t *testing.T) {
	gate, asked, closed := newTestGate()
	gate.arm(true)
	gate.closing()
	gate.asked()
	gate.answer(false)
	if closed.Load() != 0 {
		t.Fatal("the window closed on a no")
	}
	if gate.closing() {
		t.Fatal("the next close went ahead after a no")
	}
	gate.asked()
	if asked.Load() != 2 {
		t.Fatalf("asked %d times after a no and a new close, want 2", asked.Load())
	}
	gate.answer(true)
	if closed.Load() != 1 {
		t.Fatal("the window did not close on a yes")
	}
	if !gate.closing() {
		t.Fatal("the close the yes started was cancelled again")
	}
}

func TestAPageThatNeverSaysItReceivedTheRequestDoesNotTrapTheWindow(t *testing.T) {
	gate, _, closed := newTestGate()
	gate.arm(true)
	if gate.closing() {
		t.Fatal("the close went ahead before the page was asked")
	}
	deadline := time.Now().Add(2 * time.Second)
	for closed.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if closed.Load() != 1 {
		t.Fatal("the window never closed although the page did not answer")
	}
	if !gate.closing() {
		t.Fatal("the close for an unresponsive page was cancelled again")
	}
}

func TestAPageThatSaidItReceivedTheRequestIsWaitedForLongerThanTheTimeout(t *testing.T) {
	gate, _, closed := newTestGate()
	gate.arm(true)
	gate.closing()
	gate.asked()
	time.Sleep(4 * testWait)
	if closed.Load() != 0 {
		t.Fatal("the window closed on its own after the page had received the request")
	}
}

func TestTheWindowCloseBindingsDoNothingBeforeTheWindowExists(t *testing.T) {
	host := NewHost()
	for _, call := range []func() (string, error){
		func() (string, error) { return host.WindowCloseGuard(true) },
		func() (string, error) { return host.WindowCloseAsked() },
		func() (string, error) { return host.WindowCloseAnswer(true) },
	} {
		if _, err := call(); err != nil {
			t.Fatal(err)
		}
	}
}

func TestAPageThatDiedAfterAcknowledgingStopsTrappingTheWindowOnTheNextClose(t *testing.T) {
	gate, asked, closed := newTestGate()
	gate.arm(true)
	gate.closing()
	gate.asked()
	// The page is gone: nothing answers. The narrator presses the close button again.
	if gate.closing() {
		t.Fatal("the second close went ahead before the page was asked again")
	}
	if asked.Load() != 2 {
		t.Fatalf("asked %d times, want a second request", asked.Load())
	}
	deadline := time.Now().Add(2 * time.Second)
	for closed.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if closed.Load() != 1 {
		t.Fatal("a page that did not acknowledge the second request still trapped the window")
	}
}

func TestAnAcknowledgedSecondRequestIsWaitedFor(t *testing.T) {
	gate, _, closed := newTestGate()
	gate.arm(true)
	gate.closing()
	gate.asked()
	gate.closing()
	gate.asked()
	time.Sleep(4 * testWait)
	if closed.Load() != 0 {
		t.Fatal("the window closed although the page acknowledged the second request")
	}
}

func TestATimerFromAnEarlierQuestionCannotCloseTheWindowUnderALaterOne(t *testing.T) {
	gate, _, closed := newTestGateWait(60 * time.Millisecond)
	gate.arm(true)
	gate.closing()
	gate.answer(false)
	// A new close starts a new question, acknowledged at once; the first question's timer fires inside its wait.
	gate.closing()
	gate.asked()
	time.Sleep(150 * time.Millisecond)
	if closed.Load() != 0 {
		t.Fatal("an old timer closed the window under a later question")
	}
}

func TestAYesWhenNothingIsBeingAskedDoesNotCloseTheWindow(t *testing.T) {
	gate, _, closed := newTestGate()
	gate.arm(true)
	gate.answer(true)
	if closed.Load() != 0 {
		t.Fatal("the page closed the window with no question open")
	}
	if gate.closing() {
		t.Fatal("a yes with no question confirmed the next close")
	}
}

func TestAConfirmedCloseDoesNotLetALaterDraftThrough(t *testing.T) {
	gate, asked, _ := newTestGate()
	gate.arm(true)
	gate.closing()
	gate.asked()
	gate.answer(true)
	if !gate.closing() {
		t.Fatal("the confirmed close was cancelled")
	}
	gate.arm(false)
	gate.arm(true)
	if gate.closing() {
		t.Fatal("a draft held after a confirmed close was let through unasked")
	}
	if asked.Load() != 2 {
		t.Fatalf("the page was asked %d times, want 2", asked.Load())
	}
}

func TestALateAcknowledgementOfAnEarlierRequestDoesNotDisarmTheLaterWait(t *testing.T) {
	gate, _, closed := newTestGate()
	gate.arm(true)
	gate.closing()
	gate.closing()
	gate.asked() // the receipt for the first request arrives after the second press
	time.Sleep(4 * testWait)
	if closed.Load() != 1 {
		t.Fatalf("a page that never received the second request trapped the window (closed %d times)", closed.Load())
	}
}
