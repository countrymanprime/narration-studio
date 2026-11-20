// Package wakelocktest is the fake Inhibitor the tests use in place of the operating system.
package wakelocktest

import (
	"sync"

	"desktop/internal/wakelock"
)

var _ wakelock.Inhibitor = (*Fake)(nil)

// Fake records every Acquire and Release, and can be made to refuse the next Acquire.
type Fake struct {
	mu sync.Mutex
	// +checklocks:mu
	events []string
	// +checklocks:mu
	held bool
	// +checklocks:mu
	fail error
}

// FailNext makes the next Acquire return err (once).
func (f *Fake) FailNext(err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.fail = err
}

// Acquire records "acquire", or fails once after FailNext.
func (f *Fake) Acquire() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail != nil {
		err := f.fail
		f.fail = nil
		f.events = append(f.events, "acquire-failed")
		return err
	}
	f.held = true
	f.events = append(f.events, "acquire")
	return nil
}

// Release records "release".
func (f *Fake) Release() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.held = false
	f.events = append(f.events, "release")
}

// Events is every call so far, in order.
func (f *Fake) Events() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.events...)
}

// Held is whether a request is held now.
func (f *Fake) Held() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.held
}
