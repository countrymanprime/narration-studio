package measure

import (
	"context"
	"runtime"
)

// Slots bounds how many decodes run at once. A holder works while it holds a slot and waits for no other slot, so a queue of holders cannot
// deadlock.
type Slots chan struct{}

// NewSlots makes a bound of n decodes at once, at least one.
func NewSlots(n int) Slots { return make(Slots, max(1, n)) }

// Acquire waits for a slot, or answers ctx's error when it is done first (a done ctx never takes a free slot).
func (s Slots) Acquire(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	select {
	case s <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Release gives a slot back.
func (s Slots) Release() { <-s }

// DecodeSlots bounds the whole-file peaks decodes of the whole host to the machine's cores (#4042): every PeaksFile read, and every segment of a long
// file's read, holds one while it decodes, so a chapter of many recordings, or the page reading its neighbours, queues instead of decoding all at once.
var DecodeSlots = NewSlots(runtime.NumCPU())
