package bridge

import (
	"sync"
	"time"
)

// The host drains events.log on a 150 ms tick (transcriptLoop), so a command's answer waits for the next tick: 75 ms on average, 150 at worst,
// on top of the script's own defer tick. After a command is sent, Expect makes the client dispatch every fastPollInterval itself until the
// answer arrives, then leaves it to the host's tick again.
const (
	// fastPollInterval is how often the client dispatches while an answer is awaited. Not shorter: the script ticks every 16 to 33 ms, so a
	// faster poll finds nothing, and the cost of a poll is a stat and a read of the new bytes.
	fastPollInterval = 15 * time.Millisecond
	// fastPollWindow caps how long one request is polled for. A command that takes longer (a render, a comparison) falls back to the host's tick
	// when the window ends, so a script that never answers costs a bounded number of polls, never a hot loop until the request's timeout.
	fastPollWindow = 2 * time.Second
)

// fastPoll is the state of the client's own polling: the requests awaiting an answer, by id, with the time each stops being polled for. The
// interval and window are the constants above unless a test sets them.
type fastPoll struct {
	mu sync.Mutex
	// +checklocks:mu
	interval time.Duration
	// +checklocks:mu
	window time.Duration
	// +checklocks:mu
	waiting map[uint64]time.Time
	// +checklocks:mu
	next uint64
	// +checklocks:mu
	running bool
}

// Expect says a command was sent and its answer is awaited: until release is called, or the window passes, the client calls Dispatch every
// fastPollInterval on a goroutine of its own, not the caller's, so a handler never runs on a goroutine that holds the caller's locks (the
// host's tick has the same property). Overlapping requests share one poller. release is safe to call more than once.
func (c *Client) Expect() (release func()) {
	p := &c.poll
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.waiting == nil {
		p.waiting = map[uint64]time.Time{}
	}
	p.next++
	id := p.next
	window := p.window
	if window <= 0 {
		window = fastPollWindow
	}
	p.waiting[id] = time.Now().Add(window)
	if !p.running {
		p.running = true
		go c.fastPoll()
	}
	return func() {
		p.mu.Lock()
		defer p.mu.Unlock()
		delete(p.waiting, id)
	}
}

// fastPoll dispatches until no request is waiting inside its window, then ends; the next Expect starts it again.
func (c *Client) fastPoll() {
	p := &c.poll
	p.mu.Lock()
	interval := p.interval
	p.mu.Unlock()
	if interval <= 0 {
		interval = fastPollInterval
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		p.mu.Lock()
		now := time.Now()
		for id, until := range p.waiting {
			if now.After(until) {
				delete(p.waiting, id)
			}
		}
		if len(p.waiting) == 0 {
			p.running = false
			p.mu.Unlock()
			return
		}
		p.mu.Unlock()
		// An error here is the host tick's to report (it reads the same file); this poll only makes answers arrive sooner.
		_ = c.Dispatch()
	}
}
