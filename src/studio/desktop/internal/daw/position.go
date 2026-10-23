package daw

import (
	"math"
	"strconv"
	"sync"
	"time"

	"desktop/internal/bridge"
)

// Position is REAPER's transport as a TRANSPORT event reported it (narration_transport.lua's watch_transport): the play state, where the play head
// is (project seconds, latency-compensated) and where the edit cursor is. It is a reading, not a command: the host passes it on and decides nothing.
type Position struct {
	Playing      bool
	Recording    bool
	PlayPosition float64
	EditCursor   float64
}

// PositionFeed turns the TRANSPORT broadcasts a watch lease buys into Positions. The DAW port's REAPER adapter subscribes Record to the bridge's
// TRANSPORT events (the bridge client is held only there); the events arrive on the host's bridge loop, so the handler must not block and must not
// make a bridge request.
type PositionFeed struct {
	now func() time.Time // +checklocksignore: set once by NewPositionFeed and never reassigned, so the lock is incidental
	mu  sync.Mutex
	// +checklocks:mu
	handler func(Position)
	// +checklocks:mu
	last Position
	// +checklocks:mu
	at time.Time
}

// NewPositionFeed is a feed that has heard nothing and tells nobody.
func NewPositionFeed() *PositionFeed { return &PositionFeed{now: time.Now} }

// OnPosition sets the function told each position heard, replacing the last one; nil stops telling.
func (f *PositionFeed) OnPosition(handler func(Position)) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.handler = handler
}

// Record is the Subscription.Handle callback for TRANSPORT. An event that is short or whose numbers are not numbers is dropped: wire.go has
// checked the table, but a position is never guessed.
func (f *PositionFeed) Record(event bridge.Event) {
	if len(event.Fields) < 5 {
		return
	}
	state, err := strconv.Atoi(event.Fields[2])
	if err != nil {
		return
	}
	head, headErr := strconv.ParseFloat(event.Fields[3], 64)
	cursor, cursorErr := strconv.ParseFloat(event.Fields[4], 64)
	if headErr != nil || cursorErr != nil || math.IsNaN(head) || math.IsNaN(cursor) || math.IsInf(head, 0) || math.IsInf(cursor, 0) {
		return
	}
	position := Position{Playing: state&1 != 0, Recording: state&4 != 0, PlayPosition: head, EditCursor: cursor}
	f.mu.Lock()
	f.last, f.at = position, f.now()
	handler := f.handler
	f.mu.Unlock()
	if handler != nil {
		handler(position)
	}
}

// Latest is the last position heard and how long ago, and false when none has been.
func (f *PositionFeed) Latest() (Position, time.Duration, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.at.IsZero() {
		return Position{}, 0, false
	}
	return f.last, f.now().Sub(f.at), true
}
