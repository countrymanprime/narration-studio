//go:build audacityreal && linux

package audacityreal

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"desktop/internal/audacitybridge"
)

// State is what a poll tick concluded about Audacity, in the words of the matrix's heartbeat (N3a).
type State string

const (
	StateAnswering    State = "answering"
	StateNoProject    State = "no project"
	StateMaybeDialog  State = "may be waiting on a dialog"
	StateNotReachable State = "not reachable"
	StateUnknown      State = "unknown"
)

// Change is one thing the poller saw differ between two reads.
type Change struct {
	At   time.Time
	What string
}

// Poller is the prototype of the heartbeat the app does not have yet (docs/research/real-audacity3-ci-integration.md, "Events: how the
// adapter would poll"): every tick, a Message echo; when it answers, Tracks, Labels and Selection, diffed against the last read. It
// sends nothing while another request is in flight because the client serialises requests and a tick that finds the previous one still
// running is skipped. Test code only: it lives here so A3-T4 and A3-T5 measure the same machine.
type Poller struct {
	client  *audacitybridge.Client
	every   time.Duration
	mu      sync.Mutex
	state   State
	changes []Change
	ticks   int
	skipped int
	maxSeen int // the most requests ever in flight at once (the client serialises, so this must stay 1)
	inFl    int
	last    struct{ tracks, labels, sel string }
	cancel  context.CancelFunc
	done    chan struct{}
}

// NewPoller makes a poller over client that ticks every `every`.
func NewPoller(client *audacitybridge.Client, every time.Duration) *Poller {
	return &Poller{client: client, every: every, state: StateUnknown}
}

// Start begins polling until Stop.
func (p *Poller) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	p.cancel, p.done = cancel, make(chan struct{})
	go func() {
		defer close(p.done)
		tk := time.NewTicker(p.every)
		defer tk.Stop()
		p.tick(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-tk.C:
				p.tick(ctx)
			}
		}
	}()
}

// Stop ends polling and waits for the tick in progress.
func (p *Poller) Stop() {
	if p.cancel != nil {
		p.cancel()
		<-p.done
	}
}

// State is the last tick's conclusion.
func (p *Poller) State() State { p.mu.Lock(); defer p.mu.Unlock(); return p.state }

// Changes are the differences seen so far, oldest first.
func (p *Poller) Changes() []Change {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]Change(nil), p.changes...)
}

// Stats are the tick counts and the highest number of requests found in flight at once.
func (p *Poller) Stats() (ticks, skipped, maxInFlight int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.ticks, p.skipped, p.maxSeen
}

func (p *Poller) enter() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.ticks++
	if p.inFl > 0 {
		p.skipped++
		return false
	}
	p.inFl++
	p.maxSeen = max(p.maxSeen, p.inFl)
	return true
}

func (p *Poller) leave() { p.mu.Lock(); p.inFl--; p.mu.Unlock() }

func (p *Poller) set(s State) { p.mu.Lock(); p.state = s; p.mu.Unlock() }

func (p *Poller) note(what string) {
	p.mu.Lock()
	p.changes = append(p.changes, Change{At: time.Now(), What: what})
	p.mu.Unlock()
}

func (p *Poller) tick(ctx context.Context) {
	if !p.enter() {
		return
	}
	defer p.leave()
	if err := p.client.Ping(ctx); err != nil {
		switch {
		case errors.Is(err, audacitybridge.ErrNoProject):
			p.set(StateNoProject)
		case errors.Is(err, audacitybridge.ErrTimeout):
			p.set(StateMaybeDialog)
		case errors.Is(err, audacitybridge.ErrNotReachable):
			p.set(StateNotReachable)
		default:
			p.set(StateUnknown)
		}
		return
	}
	p.set(StateAnswering)
	tracksReply, terr := p.client.Do(ctx, audacitybridge.NewCommand("GetInfo").Choice("Type", "Tracks").Choice("Format", "JSON"))
	labels, lerr := p.client.Labels(ctx)
	reply, serr := p.client.Do(ctx, audacitybridge.NewCommand("GetInfo").Choice("Type", "Selection").Choice("Format", "JSON"))
	if terr != nil || lerr != nil || serr != nil {
		return
	}
	var ls []string
	for _, l := range labels {
		ls = append(ls, fmt.Sprintf("%d:%.4f-%.4f:%s", l.Index, l.Start, l.End, l.Text))
	}
	sort.Strings(ls)
	now := struct{ tracks, labels, sel string }{tracksReply.Text(), fmt.Sprint(ls), reply.Text()}
	if p.last.tracks != "" || p.last.labels != "" || p.last.sel != "" {
		if now.tracks != p.last.tracks {
			p.note("tracks changed")
		}
		if now.labels != p.last.labels {
			p.note("labels changed")
		}
		if now.sel != p.last.sel {
			p.note("selection changed")
		}
	}
	p.last = now
}
