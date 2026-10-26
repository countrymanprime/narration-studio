package dawport

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// stubAdapter declares what a test says and hands back the roles it was given. The conformance suite's fake (dawporttest)
// is the full one; this is only enough to drive the resolver.
type stubAdapter struct {
	kind     Kind
	declares map[Capability]Level
	roles    map[Capability]any
	explain  map[Reason]string
}

func (s stubAdapter) Kind() Kind                            { return s.kind }
func (s stubAdapter) Declares() map[Capability]Level        { return s.declares }
func (s stubAdapter) Role(c Capability) any                 { return s.roles[c] }
func (s stubAdapter) Explain(_ Capability, r Reason) string { return s.explain[r] }

// plainAdapter is a stubAdapter without Explain, so the resolver's own wording is used.
type plainAdapter struct{ stubAdapter }

func (p plainAdapter) Explain() {} // shadows the method with a different signature, so plainAdapter is not an Explainer

type punch struct{}

func (punch) PunchTo(context.Context, float64, float64) (float64, error) { return 0, nil }
func (punch) Roll(context.Context, string, float64) (Result, error)      { return Result{}, nil }
func (punch) PlayPosition(context.Context) (PlayPosition, error)         { return PlayPosition{}, nil }

// No setting decides what is available: Experimental is available exactly as Supported is, and only the declaration and the
// runtime refuse.
func TestSupportCombinesDeclarationAndRuntime(t *testing.T) {
	connected := Runtime{Bridge: true, Reachable: true}
	cases := []struct {
		name      string
		level     Level
		runtime   Runtime
		available bool
		reason    Reason
	}{
		{"supported is available", Supported, connected, true, ""},
		{"experimental is available, as supported is", Experimental, connected, true, ""},
		{"not yet available", NotYetAvailable, connected, false, ReasonNotYet},
		{"unsupported", Unsupported, connected, false, ReasonUnsupported},
		{"the declaration comes before runtime", NotYetAvailable, Runtime{}, false, ReasonNotYet},
		{"no bridge is standalone", Supported, Runtime{}, false, ReasonStandalone},
		{"experimental with no bridge is standalone", Experimental, Runtime{}, false, ReasonStandalone},
		{"a quiet DAW is not running", Supported, Runtime{Bridge: true}, false, ReasonNotRunning},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := NewResolver(ResolverConfig{
				Adapter: plainAdapter{stubAdapter{kind: KindREAPER, declares: map[Capability]Level{CapPunch: tc.level}}},
				Runtime: func() Runtime { return tc.runtime },
			})
			got := r.Support(CapPunch)
			if got.Level != tc.level || got.Available != tc.available || got.Reason != tc.reason {
				t.Fatalf("Support(punch) = %+v, want level %v available %v reason %q", got, tc.level, tc.available, tc.reason)
			}
			if tc.available != (got.Message == "") {
				t.Fatalf("Support(punch).Message = %q: an available capability has no message and a refused one always has one", got.Message)
			}
		})
	}
}

func TestSupportRuntimeDependsOnWhatTheCapabilityNeeds(t *testing.T) {
	declares := map[Capability]Level{CapHeartbeat: Supported, CapProjectRead: Supported, CapNavigate: Supported}
	for _, tc := range []struct {
		name    string
		runtime Runtime
		want    map[Capability]Reason // "" means available
	}{
		{"standalone", Runtime{}, map[Capability]Reason{CapHeartbeat: ReasonStandalone, CapProjectRead: "", CapNavigate: ReasonStandalone}},
		{"bridge but quiet", Runtime{Bridge: true}, map[Capability]Reason{CapHeartbeat: "", CapProjectRead: "", CapNavigate: ReasonNotRunning}},
		{"connected", Runtime{Bridge: true, Reachable: true}, map[Capability]Reason{CapHeartbeat: "", CapProjectRead: "", CapNavigate: ""}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := NewResolver(ResolverConfig{
				Adapter: plainAdapter{stubAdapter{kind: KindREAPER, declares: declares}},
				Runtime: func() Runtime { return tc.runtime },
			})
			for c, reason := range tc.want {
				if got := r.Support(c); got.Reason != reason || got.Available != (reason == "") {
					t.Errorf("Support(%s) = %+v, want reason %q", c, got, reason)
				}
			}
		})
	}
}

func TestSupportWithNoAdapterIsStandaloneForEveryCapability(t *testing.T) {
	r := NewResolver(ResolverConfig{})
	all := r.All()
	if len(all) != len(Capabilities()) {
		t.Fatalf("All() has %d entries, want one per capability (%d)", len(all), len(Capabilities()))
	}
	for c, s := range all {
		if s.Available || s.Reason != ReasonStandalone || s.Level != Unsupported || s.Message == "" {
			t.Errorf("Support(%s) with no adapter = %+v, want unavailable, standalone, with a message", c, s)
		}
	}
	if r.Kind() != KindNone {
		t.Fatalf("Kind() with no adapter = %v, want none", r.Kind())
	}
}

func TestSupportOfAnUndeclaredOrUnknownCapabilityIsUnsupported(t *testing.T) {
	r := NewResolver(ResolverConfig{
		Adapter: plainAdapter{stubAdapter{kind: KindAudacity, declares: map[Capability]Level{}}},
		Runtime: func() Runtime { return Runtime{Bridge: true, Reachable: true} },
	})
	for _, c := range []Capability{CapPunch, Capability("time_travel")} {
		got := r.Support(c)
		if got.Available || got.Level != Unsupported || got.Reason != ReasonUnsupported {
			t.Errorf("Support(%s) = %+v, want unsupported", c, got)
		}
		if !strings.Contains(got.Message, "Audacity") {
			t.Errorf("Support(%s).Message = %q, want it to name the DAW", c, got.Message)
		}
	}
}

func TestSupportMessagesUseTheAdaptersWordingWhenItHasOne(t *testing.T) {
	sentence := "Audacity support is not available yet."
	r := NewResolver(ResolverConfig{
		Adapter: stubAdapter{kind: KindAudacity, declares: map[Capability]Level{CapPunch: NotYetAvailable},
			explain: map[Reason]string{ReasonNotYet: sentence}},
		Runtime: func() Runtime { return Runtime{Bridge: true, Reachable: true} },
	})
	if got := r.Support(CapPunch).Message; got != sentence {
		t.Fatalf("Message = %q, want the adapter's %q", got, sentence)
	}
	// A reason the adapter has no wording for falls back to the resolver's.
	r2 := NewResolver(ResolverConfig{
		Adapter: stubAdapter{kind: KindAudacity, declares: map[Capability]Level{CapPunch: Supported}},
		Runtime: func() Runtime { return Runtime{Bridge: true} },
	})
	if got, want := r2.Support(CapPunch).Message, "Audacity is not answering. Check that Audacity is open, then try again."; got != want {
		t.Fatalf("Message = %q, want the resolver's %q", got, want)
	}
}

func TestSupportReadsItsInputsOnEveryCall(t *testing.T) {
	rt := Runtime{Bridge: true}
	r := NewResolver(ResolverConfig{
		Adapter: plainAdapter{stubAdapter{kind: KindREAPER, declares: map[Capability]Level{CapNavigate: Supported}}},
		Runtime: func() Runtime { return rt },
	})
	if r.Support(CapNavigate).Available {
		t.Fatal("available before the heartbeat")
	}
	rt.Reachable = true
	if !r.Support(CapNavigate).Available {
		t.Fatal("still unavailable after the heartbeat: the resolver must not cache runtime state")
	}
}

func TestRoleReturnsTheAdaptersRoleWhenAvailable(t *testing.T) {
	r := NewResolver(ResolverConfig{
		Adapter: plainAdapter{stubAdapter{kind: KindREAPER,
			declares: map[Capability]Level{CapPunch: Experimental},
			roles:    map[Capability]any{CapPunch: punch{}}}},
		Runtime: func() Runtime { return Runtime{Bridge: true, Reachable: true} },
	})
	p, err := Role[Puncher](r, CapPunch)
	if err != nil || p == nil {
		t.Fatalf("Role[Puncher] = %v, %v; want the role", p, err)
	}
}

func TestRoleRefusesWithNotSupportedError(t *testing.T) {
	r := NewResolver(ResolverConfig{
		Adapter: plainAdapter{stubAdapter{kind: KindREAPER,
			declares: map[Capability]Level{CapPunch: Experimental},
			roles:    map[Capability]any{CapPunch: punch{}}}},
		Runtime: func() Runtime { return Runtime{Bridge: true} },
	})
	p, err := Role[Puncher](r, CapPunch)
	if p != nil {
		t.Fatalf("Role returned %v with an error", p)
	}
	var ns *NotSupportedError
	if !errors.As(err, &ns) {
		t.Fatalf("err = %v (%T), want *NotSupportedError", err, err)
	}
	if ns.Capability != CapPunch || ns.Support.Reason != ReasonNotRunning || ns.Error() != ns.Support.Message {
		t.Fatalf("NotSupportedError = %+v", ns)
	}
	if !errors.Is(err, ErrNotSupported) {
		t.Fatal("errors.Is(err, ErrNotSupported) = false")
	}
}

func TestRoleFailsLoudlyWhenAnAdapterBreaksItsDeclaration(t *testing.T) {
	for _, tc := range []struct {
		name string
		role any
	}{
		{"missing role", nil},
		{"wrong type", struct{}{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := NewResolver(ResolverConfig{
				Adapter: plainAdapter{stubAdapter{kind: KindREAPER,
					declares: map[Capability]Level{CapPunch: Supported},
					roles:    map[Capability]any{CapPunch: tc.role}}},
				Runtime: func() Runtime { return Runtime{Bridge: true, Reachable: true} },
			})
			_, err := Role[Puncher](r, CapPunch)
			var bad *RoleError
			if !errors.As(err, &bad) || bad.Capability != CapPunch {
				t.Fatalf("err = %v (%T), want *RoleError for punch", err, err)
			}
			if errors.Is(err, ErrNotSupported) {
				t.Fatal("a broken adapter is a bug, not a refusal for the narrator")
			}
		})
	}
}

func TestRoleOfTheWrongInterfaceIsARoleError(t *testing.T) {
	r := NewResolver(ResolverConfig{
		Adapter: plainAdapter{stubAdapter{kind: KindREAPER,
			declares: map[Capability]Level{CapPunch: Supported},
			roles:    map[Capability]any{CapPunch: punch{}}}},
		Runtime: func() Runtime { return Runtime{Bridge: true, Reachable: true} },
	})
	var bad *RoleError
	if _, err := Role[Recorder](r, CapPunch); !errors.As(err, &bad) {
		t.Fatalf("Role[Recorder](punch) err = %v, want *RoleError", err)
	}
}

// Allowed is the declaration half of Support, whatever the engine's runtime state. bridge.Actions' gate asks it, so a command still
// goes out (and fails on its own terms) while REAPER is not answering.
func TestAllowedIsTheDeclarationHalfOfSupport(t *testing.T) {
	cases := []struct {
		level  Level
		reason Reason // "" when allowed
	}{
		{Supported, ""},
		{Experimental, ""},
		{NotYetAvailable, ReasonNotYet},
		{Unsupported, ReasonUnsupported},
	}
	for _, tc := range cases {
		for _, rt := range []Runtime{{}, {Bridge: true}, {Bridge: true, Reachable: true}} {
			r := NewResolver(ResolverConfig{
				Adapter: plainAdapter{stubAdapter{kind: KindREAPER, declares: map[Capability]Level{CapPunch: tc.level}}},
				Runtime: func() Runtime { return rt },
			})
			err := r.Allowed(CapPunch)
			if tc.reason == "" {
				if err != nil {
					t.Errorf("%v, runtime %+v: Allowed = %v, want nil", tc.level, rt, err)
				}
				continue
			}
			var refusal *NotSupportedError
			if !errors.As(err, &refusal) || refusal.Support.Reason != tc.reason || refusal.Support.Level != tc.level || refusal.Support.Message == "" {
				t.Errorf("%v, runtime %+v: Allowed = %#v, want a %q refusal with a message", tc.level, rt, err, tc.reason)
				continue
			}
			// Support agrees with Allowed on every refusal Allowed makes.
			if got := r.Support(CapPunch); got != refusal.Support {
				t.Errorf("%v, runtime %+v: Support = %+v, but Allowed refused with %+v", tc.level, rt, got, refusal.Support)
			}
		}
	}
}

func TestAllowedWithNoAdapterIsStandalone(t *testing.T) {
	var refusal *NotSupportedError
	if err := NewResolver(ResolverConfig{}).Allowed(CapReview); !errors.As(err, &refusal) || refusal.Support.Reason != ReasonStandalone {
		t.Fatalf("Allowed with no adapter = %v, want a standalone refusal", err)
	}
}

// deepAdapter is a stubAdapter that also declares each capability's Depth.
type deepAdapter struct {
	plainAdapter
	depth map[Capability]Depth
}

func (d deepAdapter) Depth(c Capability) Depth { return d.depth[c] }

// go-support-carries-the-new-fields: the resolver reports a declared Depth whether or not the capability is available now, and a
// declaration without one reports neither field.
func TestSupportCarriesTheDeclaredDepth(t *testing.T) {
	declares := map[Capability]Level{CapPunch: Supported, CapRecord: Supported, CapMarkers: Supported}
	adapter := deepAdapter{
		plainAdapter: plainAdapter{stubAdapter{kind: KindAudacity, declares: declares}},
		depth:        map[Capability]Depth{CapPunch: {Destructive: true, Mode: ModeSteps}, CapRecord: {Mode: ModeNative}},
	}
	for _, tc := range []struct {
		name    string
		runtime Runtime
		cap     Capability
		want    Support
	}{
		{"available", Runtime{Bridge: true, Reachable: true}, CapPunch,
			Support{Level: Supported, Available: true, Destructive: true, Mode: ModeSteps}},
		{"mode only", Runtime{Bridge: true, Reachable: true}, CapRecord,
			Support{Level: Supported, Available: true, Mode: ModeNative}},
		{"declares neither", Runtime{Bridge: true, Reachable: true}, CapMarkers,
			Support{Level: Supported, Available: true}},
		{"not running keeps reason and message", Runtime{Bridge: true}, CapPunch,
			Support{Level: Supported, Reason: ReasonNotRunning, Message: "Audacity is not answering. Check that Audacity is open, then try again.",
				Destructive: true, Mode: ModeSteps}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := NewResolver(ResolverConfig{
				Adapter: adapter,
				Runtime: func() Runtime { return tc.runtime },
			})
			if got := r.Support(tc.cap); got != tc.want {
				t.Fatalf("Support(%s) = %+v, want %+v", tc.cap, got, tc.want)
			}
		})
	}
	var refusal *NotSupportedError
	notYet := deepAdapter{
		plainAdapter: plainAdapter{stubAdapter{kind: KindAudacity, declares: map[Capability]Level{CapPunch: NotYetAvailable}}},
		depth:        adapter.depth,
	}
	r := NewResolver(ResolverConfig{Adapter: notYet})
	if err := r.Allowed(CapPunch); !errors.As(err, &refusal) || !refusal.Support.Destructive || refusal.Support.Mode != ModeSteps {
		t.Fatalf("Allowed(punch) = %v, want a refusal that still carries the depth", err)
	}
}

func TestSupportWithoutADescriberReportsNoDepth(t *testing.T) {
	r := NewResolver(ResolverConfig{
		Adapter: plainAdapter{stubAdapter{kind: KindREAPER, declares: map[Capability]Level{CapPunch: Supported}}},
		Runtime: func() Runtime { return Runtime{Bridge: true, Reachable: true} },
	})
	if got := r.Support(CapPunch); got.Destructive || got.Mode != "" {
		t.Fatalf("Support(punch) = %+v, want no depth from an adapter that declares none", got)
	}
}

// A capability declared NotYetAvailable is never usable, and the message names the capability's own label.
func TestTheEditCapabilitiesResolveNotYetWhileDeclaredSo(t *testing.T) {
	declares := map[Capability]Level{CapCutRange: NotYetAvailable, CapFXRange: NotYetAvailable, CapStackTakes: NotYetAvailable, CapBackups: NotYetAvailable}
	r := NewResolver(ResolverConfig{
		Adapter: plainAdapter{stubAdapter{kind: KindREAPER, declares: declares}},
		Runtime: func() Runtime { return Runtime{Bridge: true, Reachable: true} },
	})
	for c := range declares {
		spec, _ := SpecOf(c)
		s := r.Support(c)
		if s.Available || s.Reason != ReasonNotYet || !strings.Contains(s.Message, spec.Label) {
			t.Errorf("Support(%s) = %+v, want not_yet naming %q", c, s, spec.Label)
		}
		if _, err := Role[any](r, c); !errors.Is(err, ErrNotSupported) {
			t.Errorf("Role(%s) = %v while not yet available, want ErrNotSupported", c, err)
		}
	}
}

// needyAdapter is a deepAdapter whose capabilities may require others (a Requirer).
type needyAdapter struct {
	deepAdapter
	requires map[Capability][]Capability
}

func (n needyAdapter) Requires(c Capability) []Capability { return n.requires[c] }

// needy is an Audacity-like adapter whose takes, stacking and punch need backups. backups is its level for backups.
func needy(backups Level) needyAdapter {
	declares := map[Capability]Level{CapStackTakes: Experimental, CapPunch: Experimental, CapBackups: backups, CapTakes: Experimental}
	return needyAdapter{
		deepAdapter: deepAdapter{
			plainAdapter: plainAdapter{stubAdapter{kind: KindAudacity, declares: declares}},
			depth:        map[Capability]Depth{CapStackTakes: {Mode: ModeSteps}, CapPunch: {Destructive: true}},
		},
		requires: map[Capability][]Capability{CapStackTakes: {CapBackups}, CapPunch: {CapBackups}, CapTakes: {CapBackups}},
	}
}

func needyResolver(a Adapter, rt Runtime) *Resolver {
	return NewResolver(ResolverConfig{Adapter: a, Runtime: func() Runtime { return rt }})
}

// resolver-refuses-with-the-required-capabilitys-reason: a capability whose requirement is unavailable is refused with that
// requirement's reason, in a sentence naming both, and is available once the requirement is.
func TestSupportRefusesWithTheRequiredCapabilitysReason(t *testing.T) {
	answering := Runtime{Bridge: true, Reachable: true}
	off := needyResolver(needy(NotYetAvailable), answering)
	got := off.Support(CapTakes)
	want := Support{Level: Experimental, Reason: ReasonNotYet,
		Message: "Choose the active take needs Audio backups. Audio backups is not available with Audacity yet."}
	if got != want {
		t.Fatalf("backups not yet: Support(takes) = %+v, want %+v", got, want)
	}
	if err := off.Allowed(CapTakes); !errors.Is(err, ErrNotSupported) || err.Error() != want.Message {
		t.Fatalf("backups not yet: Allowed(takes) = %v, want the requirement's refusal", err)
	}
	if _, err := Role[TakeStacker](off, CapStackTakes); !errors.Is(err, ErrNotSupported) {
		t.Fatalf("backups not yet: Role(stack_takes) = %v, want a refusal", err)
	}

	on := needyResolver(needy(Experimental), answering)
	if got := on.Support(CapStackTakes); got != (Support{Level: Experimental, Available: true, Mode: ModeSteps}) {
		t.Fatalf("backups on: Support(stack_takes) = %+v, want available in steps", got)
	}

	quiet := needyResolver(needy(Experimental), Runtime{Bridge: true})
	if got := quiet.Support(CapStackTakes); got.Reason != ReasonNotRunning {
		t.Fatalf("not answering: Support(stack_takes) = %+v, want not_running", got)
	}
}

// destructive-and-mode-follow-the-requirement: a capability the adapter declares destructive with a requirement stays usable while
// the requirement is not, and destructive; with the requirement available it is not destructive.
func TestADestructiveCapabilityIsMadeSafeByItsRequirement(t *testing.T) {
	answering := Runtime{Bridge: true, Reachable: true}
	off := needyResolver(needy(Unsupported), answering).Support(CapPunch)
	if off != (Support{Level: Experimental, Available: true, Destructive: true}) {
		t.Fatalf("no backups: Support(punch) = %+v, want available and destructive", off)
	}
	on := needyResolver(needy(Experimental), answering).Support(CapPunch)
	if on != (Support{Level: Experimental, Available: true}) {
		t.Fatalf("backups on: Support(punch) = %+v, want available and not destructive", on)
	}
}

// A cycle an adapter should never declare does not hang the resolver (the conformance suite refuses one).
func TestSupportSurvivesARequirementCycle(t *testing.T) {
	a := needy(Experimental)
	a.requires = map[Capability][]Capability{CapStackTakes: {CapBackups}, CapBackups: {CapStackTakes}}
	r := needyResolver(a, Runtime{Bridge: true, Reachable: true})
	if got := r.Support(CapStackTakes); !got.Available {
		t.Fatalf("Support(stack_takes) with a cycle = %+v", got)
	}
}
