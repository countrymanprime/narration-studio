package audacity

import (
	"sync"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// eventHub is the event side of an asynchronous role over Audacity (dawport.Events). The services above the roles speak to a DAW in
// REAPER's events (COMPARE_*, PICKUP_*, LINES_*), read from an events.log; Audacity has no log, so a role queues the events its
// requests produce and Dispatch delivers them to the subscribers on the caller's goroutine, in order, once. Each subscription gets the
// events it asks for (Subscription.Wants), as bridge.Client's fan-out gives them.
type eventHub struct {
	mu sync.Mutex
	// +checklocks:mu
	nextID uint64
	// +checklocks:mu
	subs map[uint64]dawport.Subscription
	// +checklocks:mu
	queue []bridge.Event
}

func newEventHub() *eventHub { return &eventHub{subs: map[uint64]dawport.Subscription{}} }

// Subscribe registers sub for the events Dispatch delivers.
func (h *eventHub) Subscribe(sub dawport.Subscription) (unsubscribe func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.nextID++
	id := h.nextID
	h.subs[id] = sub
	return func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		delete(h.subs, id)
	}
}

// Dispatch delivers the events queued since the last call, in order, to the subscriptions that want them.
func (h *eventHub) Dispatch() error {
	h.mu.Lock()
	events := h.queue
	h.queue = nil
	subs := make([]dawport.Subscription, 0, len(h.subs))
	for _, sub := range h.subs {
		subs = append(subs, sub)
	}
	h.mu.Unlock()
	for _, event := range events {
		for _, sub := range subs {
			if sub.Wants(event) {
				sub.Handle(event)
			}
		}
	}
	return nil
}

// emit queues one event: its tag, the run it answers and its fields.
func (h *eventHub) emit(tag, runID string, fields ...string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.queue = append(h.queue, bridge.Event{Tag: tag, RunID: runID, Fields: append([]string{tag, runID}, fields...)})
}
