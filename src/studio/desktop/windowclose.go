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
	wait     time.Duration

	mu sync.Mutex
	// armed is true while the page holds a draft.
	armed bool
	// asking is true from the request until the page answers (or the page was found not to answer).
	asking bool
	// confirmed lets the next close through: the narrator said yes, or the page could not be asked.
	confirmed bool
	timer     *time.Timer
}

func newCloseGate(ask, closeNow func()) *closeGate {
	return &closeGate{ask: ask, closeNow: closeNow, wait: closeAskTimeout}
}

// arm records whether the page holds a draft that a close would drop.
func (g *closeGate) arm(held bool) {
	g.mu.Lock()
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
	if g.asking {
		// A question is already open (or its answer was lost to another change in the page): ask again, so a second press of the close button
		// puts it back instead of leaving a window that neither closes nor asks.
		g.mu.Unlock()
		g.ask()
		return false
	}
	g.asking = true
	g.timer = time.AfterFunc(g.wait, g.pageDidNotAnswer)
	g.mu.Unlock()
	g.ask()
	return false
}

// pageDidNotAnswer closes the window when the page never said it received the request.
func (g *closeGate) pageDidNotAnswer() {
	g.mu.Lock()
	if !g.asking {
		g.mu.Unlock()
		return
	}
	g.asking = false
	g.confirmed = true
	g.mu.Unlock()
	g.closeNow()
}

// asked is the page saying it received the request: from here the host waits for the narrator.
func (g *closeGate) asked() {
	g.mu.Lock()
	if g.timer != nil {
		g.timer.Stop()
		g.timer = nil
	}
	g.mu.Unlock()
}

// answer is the narrator's reply: true closes the window now (they saved, or chose Discard & continue), false keeps it open.
func (g *closeGate) answer(closeWindow bool) {
	g.mu.Lock()
	if g.timer != nil {
		g.timer.Stop()
		g.timer = nil
	}
	g.asking = false
	if closeWindow {
		g.confirmed = true
	}
	g.mu.Unlock()
	if closeWindow {
		g.closeNow()
	}
}
