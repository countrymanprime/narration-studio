// Package wakelock keeps the computer, and its display, awake while a take is recording (#3574).
//
// The operating system's request is behind the Inhibitor port, so tests drive the Keeper with a fake and never touch the OS. The Keeper
// is level-driven: it is told whether a take is recording, and holds the request exactly while that is true. A caller that merges
// every engine into one answer (the host's transport state does) needs no count: two overlapping takes are one `true`, and the request
// is released only when the last one ends.
package wakelock

import "sync"

// Inhibitor is the operating system's "do not sleep" request. Acquire turns it on, Release turns it off; the Keeper calls them in
// that order, never twice in a row.
type Inhibitor interface {
	// Acquire asks the system not to sleep or turn the display off. An error means no request is held.
	Acquire() error
	// Release gives the request back. The system also drops it when the process ends.
	Release()
}

// Keeper holds an Inhibitor while a take is recording.
type Keeper struct {
	mu sync.Mutex
	// +checklocks:mu
	inhib Inhibitor
	// +checklocks:mu
	held bool
	// +checklocks:mu
	closed bool
}

// New is a Keeper over inhibitor.
func New(inhibitor Inhibitor) *Keeper { return &Keeper{inhib: inhibitor} }

// Set says whether a take is recording now. The request is acquired on the first true and released on the first false after it; the
// same answer again does nothing. An Acquire that fails is returned and leaves nothing held, so the next true tries again. After Close
// nothing is acquired.
func (k *Keeper) Set(recording bool) error {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.closed {
		return nil
	}
	switch {
	case recording && !k.held:
		if err := k.inhib.Acquire(); err != nil {
			return err
		}
		k.held = true
	case !recording && k.held:
		k.inhib.Release()
		k.held = false
	}
	return nil
}

// Held reports whether the request is held now.
func (k *Keeper) Held() bool {
	k.mu.Lock()
	defer k.mu.Unlock()
	return k.held
}

// Close releases the request and keeps it released: the app is quitting.
func (k *Keeper) Close() {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.closed = true
	if k.held {
		k.inhib.Release()
		k.held = false
	}
}
