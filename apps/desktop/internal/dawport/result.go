package dawport

import (
	"errors"

	"github.com/countrymanprime/narration-utils/shell/internal/port"
)

// MaxUndoSteps is the most undo points one result reports, the wire schema's bound (apps/ui/src/api/schemas/daw.ts).
const MaxUndoSteps = 12

// Result is what one call to the DAW answered (ADR 0810), the shape every role that changes the project returns on the wire.
// A refused call changed nothing: Refused holds the reason and Message repeats it, so the UI shows Message either way.
type Result struct {
	OK      bool   `json:"ok"`
	Changed bool   `json:"changed"`
	Message string `json:"message"`
	// UndoSteps is how many undo points the DAW added: 0 for a cursor move, 1 for one command. 0 to MaxUndoSteps.
	UndoSteps int    `json:"undoSteps"`
	Refused   string `json:"refused,omitempty"`
	// Steps are the edits a multi-step change performed, in order (a DAW with no native way to make it, ModeSteps).
	Steps []string `json:"steps,omitempty"`
}

// OK is a call that succeeded. A change adds one undo step and anything else none; WithUndoSteps sets another count.
func OK(message string, changed bool) Result {
	undo := 0
	if changed {
		undo = 1
	}
	return Result{OK: true, Changed: changed, Message: message, UndoSteps: undo}
}

// WithUndoSteps is r with n undo steps, held to 0..MaxUndoSteps so the payload always passes the wire schema.
func (r Result) WithUndoSteps(n int) Result {
	r.UndoSteps = min(max(n, 0), MaxUndoSteps)
	return r
}

// WithSteps is r listing the edits it performed, in order; none leaves the key off the wire.
func (r Result) WithSteps(steps []string) Result {
	if len(steps) == 0 {
		r.Steps = nil
		return r
	}
	r.Steps = append([]string(nil), steps...)
	return r
}

// Refused is a call that was not made: not ok, nothing changed, no undo step, and reason as both Refused and Message.
func Refused(reason string) Result {
	return Result{Message: reason, Refused: reason}
}

// RefusedFrom maps a capability refusal (a *port.NotSupportedError, or a *NotSupportedError, which unwraps to one) to Refused
// with the refusal's own whole sentence, so no caller words a refusal. ok is false for any other error, and for nil.
func RefusedFrom(err error) (Result, bool) {
	var refusal *port.NotSupportedError
	if !errors.As(err, &refusal) {
		return Result{}, false
	}
	return Refused(refusal.Support.Message), true
}
