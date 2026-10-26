package dawport

import "desktop/internal/port"

// The shared vocabulary (Level, Reason, Support and the refusal) lives in internal/port, which the provider ports reuse. The names
// below are aliases of it, so dawport's callers and the port's other users see one set of types and values.

// Level is how far an engine supports a capability, least to most capable, so `level >= Experimental` means the adapter has a role
// for it.
type Level = port.Level

const (
	Unsupported     = port.Unsupported     // the engine cannot do this at all (Audacity has no punch-and-roll)
	NotYetAvailable = port.NotYetAvailable // the engine can, but this app cannot drive it yet (Audacity until its pipe client lands)
	Experimental    = port.Experimental    // built and on, not yet through the owner's REAPER verification pass
	Supported       = port.Supported       // built, on, and verified
)

// Reason is why a capability is unavailable now: the wire enum the UI switches on. See port.Reason for each value.
type Reason = port.Reason

// The reasons, port's own values.
const (
	ReasonStandalone  = port.ReasonStandalone
	ReasonNotRunning  = port.ReasonNotRunning
	ReasonFailed      = port.ReasonFailed
	ReasonNotYet      = port.ReasonNotYet
	ReasonUnsupported = port.ReasonUnsupported
)

// Support is the resolver's answer for one capability: the declared Level, whether it can be used now, and when it cannot, why
// (Reason) in the narrator's words (Message). An available capability has neither.
type Support = port.Support

// ErrNotSupported matches every *NotSupportedError, and every *port.NotSupportedError, under errors.Is.
var ErrNotSupported = port.ErrNotSupported

// NotSupportedError is Role's refusal. Its Error is Support.Message, a whole sentence for the narrator. It is dawport's own type, not
// an alias of port.NotSupportedError, because its Capability is a dawport.Capability. It unwraps to the port.NotSupportedError, so
// errors.As and errors.Is work with either package's names.
type NotSupportedError struct {
	Capability Capability
	Support    Support
}

func (e *NotSupportedError) Error() string { return e.Support.Message }

// Unwrap is the same refusal in port's vocabulary.
func (e *NotSupportedError) Unwrap() error {
	return &port.NotSupportedError{Capability: string(e.Capability), Support: e.Support}
}
