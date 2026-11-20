package main

import (
	"errors"
	"fmt"
	"sync"
	"sync/atomic"

	"desktop/internal/manuscript"
	"desktop/internal/persist"
	"desktop/internal/settings"
)

// The page sends the same read several times at once (at start: ManuscriptChapters three times, ChapterSyncState and
// PickupsList twice), and each copy then costs several times what one call costs alone. sharedRead gives the copies
// that arrive while one is computing that computation's answer (docs/architecture/host-binding-concurrency.md).

// eventGeneration counts the live events sent to the page (emitEvent), so a read the page sends because of an event
// never joins a computation started before it.
var eventGeneration atomic.Uint64

// readKey names one computation: the binding and its arguments, the project the services() snapshot belongs to, and
// the write and event generations when the call arrived. A project switch builds new services, and every host write
// (persist.Generation) or live event advances a generation, so a later call gets a new key.
type readKey struct {
	name, args string
	project    string
	manuscript *manuscript.Service
	settings   *settings.Store
	writes     uint64
	events     uint64
}

// readFlight is one computation in flight; payload and err are set before done closes.
type readFlight struct {
	done    chan struct{}
	payload string
	err     error
}

// readFlights holds the computations in flight. joins counts the calls that waited for another call's computation.
type readFlights struct {
	mu sync.Mutex
	// +checklocks:mu
	inFlight map[readKey]*readFlight
	joins    atomic.Uint64
}

// keyOf is the key of a read that arrives now.
func (h *Host) keyOf(name string, args []any) readKey {
	svc := h.services()
	return readKey{
		name: name, args: fmt.Sprintf("%#v", args), // %#v: ("a", "b") and ("ab") are different reads
		project: svc.config.projectFolder, manuscript: svc.manuscript, settings: svc.settings,
		writes: persist.Generation(), events: eventGeneration.Load(),
	}
}

// sharedRead answers a read binding: with compute's answer, or, when a call with the same name, arguments, project
// and generations is computing now, with that call's answer. compute must read, or do only work that one call may do
// for all of them (PickupsList also sends the done marks that waited for the DAW). No lock is held while it runs.
func (h *Host) sharedRead(name string, compute func() (string, error), args ...any) (string, error) {
	key := h.keyOf(name, args)
	flights := &h.reads
	flights.mu.Lock()
	if flight, ok := flights.inFlight[key]; ok {
		flights.mu.Unlock()
		flights.joins.Add(1)
		<-flight.done
		return flight.payload, flight.err
	}
	// The error stands only when compute panics: the waiting calls then fail instead of waiting for ever.
	flight := &readFlight{done: make(chan struct{}), err: errors.New(name + " did not finish")}
	if flights.inFlight == nil {
		flights.inFlight = map[readKey]*readFlight{}
	}
	flights.inFlight[key] = flight
	flights.mu.Unlock()
	defer func() {
		flights.mu.Lock()
		delete(flights.inFlight, key)
		flights.mu.Unlock()
		close(flight.done)
	}()
	flight.payload, flight.err = compute()
	return flight.payload, flight.err
}
