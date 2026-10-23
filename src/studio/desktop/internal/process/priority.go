package process

import "context"

// Background work (a recording check the host started on its own) runs below normal priority, so the narrator's
// foreground work, above all the Booth's live tracking, keeps the processors it needs.

type lowPriorityKey struct{}

// WithLowPriority marks ctx so Start runs its program below normal priority.
func WithLowPriority(ctx context.Context) context.Context {
	return context.WithValue(ctx, lowPriorityKey{}, true)
}

// LowPriority reports whether ctx asks for a below-normal program.
func LowPriority(ctx context.Context) bool {
	low, _ := ctx.Value(lowPriorityKey{}).(bool)
	return low
}
