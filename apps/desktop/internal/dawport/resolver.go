package dawport

import (
	"fmt"
	"reflect"
	"slices"
)

// Runtime is the engine's live state, read by the Resolver on every call.
type Runtime struct {
	// Bridge is whether there is a connection to an engine at all; false on a standalone launch.
	Bridge bool
	// Reachable is whether the engine is answering (a fresh heartbeat).
	Reachable bool
}

// ResolverConfig is the Resolver's three inputs. Each is read on every call, never cached, so a heartbeat, a settings save or a
// project switch is reflected in the next answer. Every field may be nil.
type ResolverConfig struct {
	// Adapter is the launch's engine; nil is a standalone launch with no engine, where every capability is unavailable.
	Adapter Adapter
	// Runtime is the engine's live state; nil reads as Runtime{} (no bridge).
	Runtime func() Runtime
	// Toggle is the narrator's DAW.capability.<name> setting; nil reads as ToggleAuto for every capability.
	Toggle func(Capability) Toggle
	// Experimental is the old DAW.experimental_reaper_actions switch: while it is on, every Experimental capability left on
	// ToggleAuto is on. nil reads as off.
	Experimental func() bool
}

// Resolver combines an adapter's declaration, the runtime state and the per-capability toggles into what is available now. It holds
// no state of its own, so it is safe for concurrent use as long as its inputs are.
type Resolver struct{ cfg ResolverConfig }

// NewResolver builds a resolver over cfg.
func NewResolver(cfg ResolverConfig) *Resolver { return &Resolver{cfg: cfg} }

// Kind is the adapter's engine, or KindNone with no adapter.
func (r *Resolver) Kind() Kind {
	if r.cfg.Adapter == nil {
		return KindNone
	}
	return r.cfg.Adapter.Kind()
}

// All is Support for every capability in the catalog.
func (r *Resolver) All() map[Capability]Support {
	all := make(map[Capability]Support, len(specs))
	for _, s := range specs {
		all[s.Capability] = r.Support(s.Capability)
	}
	return all
}

// Support is whether c can be used now and, when not, why. The checks run in a fixed order, so the narrator is told the first thing
// to change: what the engine declares, then the settings (as bridge.Actions refuses an experimental command before checking the
// connection), then the declaration and settings of each capability c requires (Requirer), then the runtime.
func (r *Resolver) Support(c Capability) Support { return r.support(c, nil) }

// support is Support with trail, the capabilities whose requirements led here: a requirement already on it is skipped, so a cycle
// an adapter should never declare (the conformance suite refuses one) cannot recurse for ever.
func (r *Resolver) support(c Capability, trail []Capability) Support {
	spec, level, refusal, ok := r.permitted(c, trail)
	if !ok {
		return refusal
	}
	var rt Runtime
	if r.cfg.Runtime != nil {
		rt = r.cfg.Runtime()
	}
	if spec.Needs != NeedsNothing && !rt.Bridge {
		return r.refuse(c, level, ReasonStandalone, trail)
	}
	if spec.Needs == NeedsRunning && !rt.Reachable {
		return r.refuse(c, level, ReasonNotRunning, trail)
	}
	if !r.depth(c).Destructive {
		for _, req := range r.requires(c, trail) {
			if s := r.support(req, with(trail, c)); !s.Available {
				return r.refuseFor(c, level, req, s, trail)
			}
		}
	}
	return r.withDepth(c, Support{Level: level, Available: true}, trail)
}

// Allowed is nil when the engine's declaration and the narrator's settings permit c, whatever the runtime state, and otherwise the
// *NotSupportedError Support would give. It is the gate bridge.Actions asks before it sends a command (ADR 0304): the
// settings are decided here and nowhere else, and a command that is permitted still goes out and fails on its own terms while the
// engine is not answering, as it did before the port.
func (r *Resolver) Allowed(c Capability) error {
	if _, _, refusal, ok := r.permitted(c, nil); !ok {
		return &NotSupportedError{Capability: c, Support: refusal}
	}
	return nil
}

// permitted is the first three of Support's checks: the declaration, the settings, then the declaration and settings of each
// requirement. ok is false with the refusal when any refuses c. A capability declared destructive is not refused for a
// requirement: the requirement only makes it safe (withDepth).
func (r *Resolver) permitted(c Capability, trail []Capability) (spec Spec, level Level, refusal Support, ok bool) {
	if r.cfg.Adapter == nil {
		return spec, Unsupported, r.refuse(c, Unsupported, ReasonStandalone, trail), false
	}
	spec, known := SpecOf(c)
	level = Unsupported
	if known {
		level = r.cfg.Adapter.Declares()[c]
	}
	switch level {
	case Supported, Experimental:
	case NotYetAvailable:
		return spec, level, r.refuse(c, level, ReasonNotYet, trail), false
	default:
		return spec, Unsupported, r.refuse(c, Unsupported, ReasonUnsupported, trail), false
	}

	switch r.toggle(c) {
	case ToggleOff:
		return spec, level, r.refuse(c, level, ReasonTurnedOff, trail), false
	case ToggleOn:
	default:
		if level == Experimental && (r.cfg.Experimental == nil || !r.cfg.Experimental()) {
			return spec, level, r.refuse(c, level, ReasonExperimentalOff, trail), false
		}
	}

	if !r.depth(c).Destructive {
		for _, req := range r.requires(c, trail) {
			if _, _, refused, ok := r.permitted(req, with(trail, c)); !ok {
				return spec, level, r.refuseFor(c, level, req, refused, trail), false
			}
		}
	}
	return spec, level, Support{}, true
}

func (r *Resolver) toggle(c Capability) Toggle {
	if r.cfg.Toggle == nil {
		return ToggleAuto
	}
	return r.cfg.Toggle(c)
}

// requires is what c needs, from the catalogue and from the adapter, less c itself and the capabilities already on trail.
func (r *Resolver) requires(c Capability, trail []Capability) []Capability {
	spec, _ := SpecOf(c)
	all := spec.Requires
	if req, ok := r.cfg.Adapter.(Requirer); ok {
		all = append(append([]Capability(nil), all...), req.Requires(c)...)
	}
	var out []Capability
	for _, need := range all {
		if need != c && !slices.Contains(trail, need) && !slices.Contains(out, need) {
			out = append(out, need)
		}
	}
	return out
}

// with is trail and c, in a slice of its own.
func with(trail []Capability, c Capability) []Capability {
	return append(slices.Clip(trail), c)
}

func (r *Resolver) depth(c Capability) Depth {
	if d, ok := r.cfg.Adapter.(Describer); ok {
		return d.Depth(c)
	}
	return Depth{}
}

func (r *Resolver) refuse(c Capability, level Level, reason Reason, trail []Capability) Support {
	return r.withDepth(c, Support{Level: level, Reason: reason, Message: r.message(c, reason)}, trail)
}

// refuseFor refuses c because its requirement required is refused: the same reason, in the adapter's sentence for the pair or, without
// one, a sentence naming both followed by the requirement's own.
func (r *Resolver) refuseFor(c Capability, level Level, required Capability, refused Support, trail []Capability) Support {
	message := ""
	if e, ok := r.cfg.Adapter.(RequirementExplainer); ok {
		message = e.ExplainRequirement(c, required, refused.Reason)
	}
	if message == "" {
		message = fmt.Sprintf("%s needs %s. %s", labelOf(c), labelOf(required), refused.Message)
	}
	return r.withDepth(c, Support{Level: level, Reason: refused.Reason, Message: message}, trail)
}

// withDepth copies the adapter's declared Depth for c into s, so a refusal still says what the capability would do. A destructive
// capability with requirements is not destructive while every requirement is available.
func (r *Resolver) withDepth(c Capability, s Support, trail []Capability) Support {
	depth := r.depth(c)
	if depth.Destructive {
		reqs := r.requires(c, trail)
		safe := len(reqs) > 0
		for _, req := range reqs {
			safe = safe && r.support(req, with(trail, c)).Available
		}
		depth.Destructive = !safe
	}
	s.Destructive, s.Mode = depth.Destructive, depth.Mode
	return s
}

func labelOf(c Capability) string {
	if spec, ok := SpecOf(c); ok {
		return spec.Label
	}
	return string(c)
}

// The resolver's own wording, used when the adapter has none. Each is a whole sentence for the narrator.
const (
	messageTurnedOff       = "Turned off in Settings."
	messageExperimentalOff = "Experimental: switched off in Settings."
	messageNoEngine        = "No DAW is connected to this app. Open this app from your DAW to use it."
)

func (r *Resolver) message(c Capability, reason Reason) string {
	if e, ok := r.cfg.Adapter.(Explainer); ok {
		if m := e.Explain(c, reason); m != "" {
			return m
		}
	}
	label := labelOf(c)
	daw := r.Kind().String()
	switch reason {
	case ReasonTurnedOff:
		return messageTurnedOff
	case ReasonExperimentalOff:
		return messageExperimentalOff
	case ReasonStandalone:
		if r.cfg.Adapter == nil {
			return messageNoEngine
		}
		return fmt.Sprintf("%s is not connected to this app. Open this app from %s to use it.", daw, daw)
	case ReasonNotRunning:
		return fmt.Sprintf("%s is not answering. Check that %s is open, then try again.", daw, daw)
	case ReasonNotYet:
		return fmt.Sprintf("%s is not available with %s yet.", label, daw)
	default:
		return fmt.Sprintf("%s is not something %s can do.", label, daw)
	}
}

// RoleError is an adapter breaking its own declaration: it declared a capability usable but returned no role for it, or a value
// that is not the role asked for. It is a bug, never a refusal to show the narrator, so it does not match ErrNotSupported.
type RoleError struct {
	Capability Capability
	Kind       Kind
	Got        any
	Want       reflect.Type
}

func (e *RoleError) Error() string {
	return fmt.Sprintf("dawport: the %s adapter's %s role is %T, not %v", e.Kind, e.Capability, e.Got, e.Want)
}

// Role returns c's role as T when c is available now, a *NotSupportedError when it is not, and a *RoleError when the adapter does
// not hold to its declaration. It is the port's only type assertion.
func Role[T any](r *Resolver, c Capability) (T, error) {
	var zero T
	support := r.Support(c)
	if !support.Available {
		return zero, &NotSupportedError{Capability: c, Support: support}
	}
	got := r.cfg.Adapter.Role(c)
	role, ok := got.(T)
	if !ok || got == nil {
		return zero, &RoleError{Capability: c, Kind: r.Kind(), Got: got, Want: reflect.TypeFor[T]()}
	}
	return role, nil
}
