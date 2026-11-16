package main

import (
	"sync/atomic"
	"testing"
	"time"
)

func newTestGate() (*closeGate, *atomic.Int32, *atomic.Int32) {
	var asked, closed atomic.Int32
	gate := newCloseGate(func() { asked.Add(1) }, func() { closed.Add(1) })
	gate.wait = 40 * time.Millisecond
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
	time.Sleep(4 * gate.wait)
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
