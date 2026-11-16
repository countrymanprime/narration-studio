package main

import (
	"sync"
	"time"
)

// windowCloseRequestedEvent asks the page to put the unsaved-changes question before the window closes (#3526). The page answers with
// WindowCloseAnswer; it says first, with WindowCloseAsked, that it received the request.
const windowCloseRequestedEvent = "window:close-requested"

// closeAskTimeout is how long the host waits for the page to say it received the request before it closes anyway: a page that has not loaded or has
// crashed cannot ask, and the narrator must not be left with a window that will not close. Once the page has said it received it, the host waits
// for the narrator as long as they take, and only an explicit Discard & continue drops what they typed.
const closeAskTimeout = 3 * time.Second

// closeGate decides what a window close does. The page tells it whether a draft is held (`arm`); a close with nothing held goes straight
// through, and one with a draft held is cancelled and put to the page as a question. It knows nothing about Wails: `ask` sends the request and
// `closeNow` closes the window for real, so a test drives it with fakes.
type closeGate struct {
	ask      func()
	closeNow func()

	mu sync.Mutex
	// wait is how long the host waits for the page to say it received a request; it is set when the gate is made and read under mu.
	// +checklocks:mu
	wait time.Duration
	// armed is true while the page holds a draft.
	// +checklocks:mu
	armed bool
	// asking is true from the request until the page answers (or the page was found not to answer).
	// +checklocks:mu
	asking bool
	// confirmed lets the next close through: the narrator said yes, or the page could not be asked.
	// +checklocks:mu
	confirmed bool
	// +checklocks:mu
	timer *time.Timer
	// unanswered counts the requests sent that the page has not yet said it received, so a late receipt for an earlier request does not stop the wait
	// for a later one.
	// +checklocks:mu
	unanswered int
	// generation numbers each question, so a timer from an earlier one cannot close the window under a later one.
	// +checklocks:mu
	generation int
}

func newCloseGate(ask, closeNow func(), wait time.Duration) *closeGate {
	return &closeGate{ask: ask, closeNow: closeNow, wait: wait}
}

// arm records whether the page holds a draft that a close would drop.
func (g *closeGate) arm(held bool) {
	g.mu.Lock()
	if held && !g.armed {
		// A new draft after a confirmed close (one that did not end the process) is asked about again.
		g.confirmed = false
	}
	g.armed = held
	g.mu.Unlock()
}

// closing is the window's close hook: it reports whether the close may go ahead. A close the narrator confirmed, or one with no draft held,
// does; otherwise the close is cancelled and the page is asked (another close while the question is open asks again, which the page treats as the same question).
func (g *closeGate) closing() bool {
	g.mu.Lock()
	if g.confirmed || !g.armed {
		g.mu.Unlock()
		return true
	}
	// A question is already open (or its answer was lost, or the page behind it has died): ask again and wait for the page to say it received this one, so a
	// second press of the close button puts the question back, or closes the window when nothing answers (a page that crashed after the first request).
	g.asking = true
	g.unanswered++
	g.restartTimer()
	g.mu.Unlock()
	g.ask()
	return false
}

// restartTimer starts the wait for the page to say it received the current request; the caller holds g.mu.
// +checklocks:g.mu
func (g *closeGate) restartTimer() {
	if g.timer != nil {
		g.timer.Stop()
	}
	g.generation++
	generation := g.generation
	g.timer = time.AfterFunc(g.wait, func() { g.pageDidNotAnswer(generation) })
}

// pageDidNotAnswer closes the window when the page never said it received the request.
func (g *closeGate) pageDidNotAnswer(generation int) {
	g.mu.Lock()
	if !g.asking || generation != g.generation {
		g.mu.Unlock()
		return
	}
	g.asking = false
	g.unanswered = 0
	g.confirmed = true
	g.mu.Unlock()
	g.closeNow()
}

// asked is the page saying it received the request: from here the host waits for the narrator (until a second close asks again and is not acknowledged).
func (g *closeGate) asked() {
	g.mu.Lock()
	if g.unanswered > 0 {
		g.unanswered--
	}
	if g.unanswered == 0 && g.timer != nil {
		g.timer.Stop()
		g.timer = nil
		// A timer that already fired and waits on the lock must not close the window under a question the page has now acknowledged.
		g.generation++
	}
	g.mu.Unlock()
}

// answer is the narrator's reply: true closes the window now (they saved, or chose Discard & continue), false keeps it open.
// A yes closes the window only while a question is open: the page cannot close the window at will, and an answer that arrives after the host closed
// it for an unresponsive page does nothing.
func (g *closeGate) answer(closeWindow bool) {
	g.mu.Lock()
	wasAsking := g.asking
	if g.timer != nil {
		g.timer.Stop()
		g.timer = nil
	}
	g.generation++
	g.asking = false
	g.unanswered = 0
	closing := closeWindow && wasAsking
	if closing {
		g.confirmed = true
	}
	g.mu.Unlock()
	if closing {
		g.closeNow()
	}
}
