// Package presstimeline is the record-press timeline (docs/research/record-press-timeline.md): with the bridge timing
// diagnostic switched on in REAPER, each step of a Booth record press is stamped on the host's monotonic clock, and the
// press ends in one line of milliseconds since its first step. Off, it keeps nothing. A line holds step names, an
// outcome word and numbers, never a path, a chapter or the narrator's text.
package presstimeline

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
)

// leadGap is the longest pause between the first two steps of one press. A step further ahead of the next one (an
// asset listing another page asked for earlier) is not part of the press and is left off its line.
const leadGap = 5 * time.Second

// joinGap is the longest pause between a step and the step Join may continue it with: the model check follows the lookup's answer at once.
const joinGap = 2 * time.Second

type mark struct {
	step string
	at   time.Time
}

// Timeline collects one press's steps. Its methods are safe on a nil *Timeline and from any goroutine.
type Timeline struct {
	on    func() bool
	now   func() time.Time
	write func(line string) error
	mu    sync.Mutex
	// +checklocks:mu
	marks []mark
	// anchor is when the press under way last took a step of its own (Begin, Join, Mark, Finish); a Note does not move it, so calls the page makes all
	// the time cannot keep a press alive for the next one to join.
	// +checklocks:mu
	anchor time.Time
	// awaited are the steps the press is not over without (Await); ended is the outcome of a Finish that came first, "" while none did.
	// +checklocks:mu
	awaited map[string]bool
	// +checklocks:mu
	ended string
}

// New is a timeline that stamps steps only while on answers true, reads time from now (time.Now carries the monotonic
// clock) and hands each finished line, newline included, to write.
func New(on func() bool, now func() time.Time, write func(line string) error) *Timeline {
	return &Timeline{on: on, now: now, write: write}
}

// Begin starts a new press at step, dropping the steps of one that never finished.
func (t *Timeline) Begin(step string) {
	if t == nil || !t.on() {
		return
	}
	at := t.now()
	t.mu.Lock()
	defer t.mu.Unlock()
	t.beginLocked(step, at)
}

// beginLocked starts a press at step.
// +checklocks:t.mu
func (t *Timeline) beginLocked(step string, at time.Time) {
	t.marks = append(t.marks[:0], mark{step, at})
	t.anchor = at
	t.awaited, t.ended = nil, ""
}

// Join continues the press under way with step when its last step was after and came less than joinGap ago (the model check right after the
// Start from here lookup answered), and otherwise starts a press at step. A call the page made earlier, or a press that never finished, is
// never joined: its time would read as part of this press.
func (t *Timeline) Join(step, after string) {
	if t == nil || !t.on() {
		return
	}
	at := t.now()
	t.mu.Lock()
	defer t.mu.Unlock()
	if n := len(t.marks); n > 0 && t.ended == "" && t.marks[n-1].step == after && at.Sub(t.anchor) <= joinGap {
		t.marks = append(t.marks, mark{step, at})
		t.anchor = at
		return
	}
	t.beginLocked(step, at)
}

// Note stamps step only in a press under way (less than leadGap after its last own step). It does not move that time: a call the page makes
// all the time, such as the project check, stamps nothing between presses and cannot chain one press to the next.
func (t *Timeline) Note(step string) {
	if t == nil || !t.on() {
		return
	}
	at := t.now()
	t.mu.Lock()
	defer t.mu.Unlock()
	if len(t.marks) > 0 && t.ended == "" && at.Sub(t.anchor) <= leadGap {
		t.marks = append(t.marks, mark{step, at})
	}
}

// Await says the press under way is not over until step is stamped: a Finish before it holds the line until then. Listening and the
// recording start together, and either can answer first.
func (t *Timeline) Await(step string) {
	if t == nil || !t.on() {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.awaited == nil {
		t.awaited = map[string]bool{}
	}
	t.awaited[step] = true
}

// Mark stamps step in the press under way, and ends it when step was the last one a Finish was waiting for.
func (t *Timeline) Mark(step string) {
	if t == nil || !t.on() {
		return
	}
	at := t.now()
	t.mu.Lock()
	t.marks = append(t.marks, mark{step, at})
	t.anchor = at
	delete(t.awaited, step)
	if t.ended == "" || len(t.awaited) > 0 {
		t.mu.Unlock()
		return
	}
	marks, outcome := t.endLocked()
	t.mu.Unlock()
	t.writeLine(marks, outcome)
}

// Finish stamps step and ends the press with outcome (a fixed word such as started, or a refusal reason): its line is written now, or
// once every awaited step is stamped. A write that fails is dropped: the diagnostic never fails a recording.
func (t *Timeline) Finish(step, outcome string) {
	if t == nil || !t.on() {
		return
	}
	at := t.now()
	t.mu.Lock()
	t.marks = append(t.marks, mark{step, at})
	t.anchor = at
	t.ended = outcome
	if len(t.awaited) > 0 {
		t.mu.Unlock()
		return
	}
	marks, outcome := t.endLocked()
	t.mu.Unlock()
	t.writeLine(marks, outcome)
}

// endLocked takes the press's steps and outcome and starts over.
// +checklocks:t.mu
func (t *Timeline) endLocked() ([]mark, string) {
	marks, outcome := t.marks, t.ended
	t.marks, t.awaited, t.ended = nil, nil, ""
	return marks, outcome
}

func (t *Timeline) writeLine(marks []mark, outcome string) {
	for len(marks) > 1 && marks[1].at.Sub(marks[0].at) > leadGap {
		marks = marks[1:]
	}
	_ = t.write(line(marks, outcome, marks[len(marks)-1].at))
}

func line(marks []mark, outcome string, at time.Time) string {
	start := marks[0].at
	var b strings.Builder
	fmt.Fprintf(&b, "%s record_press outcome=%s total_ms=%d", at.UTC().Format(time.RFC3339), outcome, at.Sub(start).Milliseconds())
	seen := map[string]int{}
	for _, m := range marks {
		seen[m.step]++
		name := m.step
		if n := seen[m.step]; n > 1 {
			name = fmt.Sprintf("%s#%d", m.step, n)
		}
		fmt.Fprintf(&b, " %s=%d", name, m.at.Sub(start).Milliseconds())
	}
	b.WriteString("\n")
	return b.String()
}

// pending is how many steps the press under way holds (tests).
func (t *Timeline) pending() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return len(t.marks)
}

type contextKey struct{}

// With is ctx carrying timeline, for a step taken further down a call (a record start's bridge steps).
func With(ctx context.Context, timeline *Timeline) context.Context {
	return context.WithValue(ctx, contextKey{}, timeline)
}

// From is the timeline ctx carries, or nil (which stamps nothing).
func From(ctx context.Context) *Timeline {
	timeline, _ := ctx.Value(contextKey{}).(*Timeline)
	return timeline
}
