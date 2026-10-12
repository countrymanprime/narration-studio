package dawport

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
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

func togglesOf(m map[Capability]Toggle) func(Capability) Toggle {
	return func(c Capability) Toggle { return m[c] }
}

func TestSupportCombinesDeclarationSettingsAndRuntime(t *testing.T) {
	connected := Runtime{Bridge: true, Reachable: true}
	cases := []struct {
		name         string
		level        Level
		toggle       Toggle
		experimental bool
		runtime      Runtime
		available    bool
		reason       Reason
	}{
		{"supported on auto is available", Supported, ToggleAuto, false, connected, true, ""},
		{"supported switched on is available", Supported, ToggleOn, false, connected, true, ""},
		{"supported switched off is turned off", Supported, ToggleOff, false, connected, false, ReasonTurnedOff},
		{"experimental on auto is off while the old switch is off", Experimental, ToggleAuto, false, connected, false, ReasonExperimentalOff},
		{"experimental on auto follows the old switch", Experimental, ToggleAuto, true, connected, true, ""},
		{"experimental switched on needs no old switch", Experimental, ToggleOn, false, connected, true, ""},
		{"experimental switched off beats the old switch", Experimental, ToggleOff, true, connected, false, ReasonTurnedOff},
		{"not yet available ignores a toggle", NotYetAvailable, ToggleOn, true, connected, false, ReasonNotYet},
		{"unsupported ignores a toggle", Unsupported, ToggleOn, true, connected, false, ReasonUnsupported},
		{"a setting refusal comes before runtime, like Actions.allowed", Experimental, ToggleAuto, false, Runtime{}, false, ReasonExperimentalOff},
		{"no bridge is standalone", Supported, ToggleAuto, false, Runtime{}, false, ReasonStandalone},
		{"a quiet DAW is not running", Supported, ToggleAuto, false, Runtime{Bridge: true}, false, ReasonNotRunning},
		{"an unknown toggle value counts as auto", Supported, Toggle("sometimes"), false, connected, true, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := NewResolver(ResolverConfig{
				Adapter:      plainAdapter{stubAdapter{kind: KindREAPER, declares: map[Capability]Level{CapPunch: tc.level}}},
				Runtime:      func() Runtime { return tc.runtime },
				Toggle:       togglesOf(map[Capability]Toggle{CapPunch: tc.toggle}),
				Experimental: func() bool { return tc.experimental },
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
		Toggle:  togglesOf(map[Capability]Toggle{CapPunch: ToggleOff}),
	})
	if got := r2.Support(CapPunch).Message; got != messageTurnedOff {
		t.Fatalf("Message = %q, want the resolver's %q", got, messageTurnedOff)
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
		Toggle:  togglesOf(map[Capability]Toggle{CapPunch: ToggleOn}),
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
		Runtime: func() Runtime { return Runtime{Bridge: true, Reachable: true} },
	})
	p, err := Role[Puncher](r, CapPunch)
	if p != nil {
		t.Fatalf("Role returned %v with an error", p)
	}
	var ns *NotSupportedError
	if !errors.As(err, &ns) {
		t.Fatalf("err = %v (%T), want *NotSupportedError", err, err)
	}
	if ns.Capability != CapPunch || ns.Support.Reason != ReasonExperimentalOff || ns.Error() != ns.Support.Message {
		t.Fatalf("NotSupportedError = %+v", ns)
	}
	if !errors.Is(err, ErrNotSupported) {
		t.Fatal("errors.Is(err, ErrNotSupported) = false")
	}
	if !errors.Is(err, bridge.ErrExperimentalOff) {
		t.Fatal("an experimental_off refusal must still match bridge.ErrExperimentalOff, which today's consumers check")
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

// Allowed is the declaration and settings half of Support: what the narrator's settings permit, whatever the engine's runtime state.
// bridge.Actions' gate asks it, so a command still goes out (and fails on its own terms) while REAPER is not answering.
func TestAllowedIsTheDeclarationAndSettingsHalfOfSupport(t *testing.T) {
	cases := []struct {
		name         string
		level        Level
		toggle       Toggle
		experimental bool
		reason       Reason // "" when allowed
	}{
		{"supported on auto", Supported, ToggleAuto, false, ""},
		{"supported switched off", Supported, ToggleOff, false, ReasonTurnedOff},
		{"experimental on auto, old switch off", Experimental, ToggleAuto, false, ReasonExperimentalOff},
		{"experimental on auto, old switch on", Experimental, ToggleAuto, true, ""},
		{"experimental switched on", Experimental, ToggleOn, false, ""},
		{"experimental switched off, old switch on", Experimental, ToggleOff, true, ReasonTurnedOff},
		{"not yet available", NotYetAvailable, ToggleOn, true, ReasonNotYet},
		{"unsupported", Unsupported, ToggleOn, true, ReasonUnsupported},
	}
	for _, tc := range cases {
		for _, rt := range []Runtime{{}, {Bridge: true}, {Bridge: true, Reachable: true}} {
			r := NewResolver(ResolverConfig{
				Adapter:      plainAdapter{stubAdapter{kind: KindREAPER, declares: map[Capability]Level{CapPunch: tc.level}}},
				Runtime:      func() Runtime { return rt },
				Toggle:       togglesOf(map[Capability]Toggle{CapPunch: tc.toggle}),
				Experimental: func() bool { return tc.experimental },
			})
			err := r.Allowed(CapPunch)
			if tc.reason == "" {
				if err != nil {
					t.Errorf("%s, runtime %+v: Allowed = %v, want nil", tc.name, rt, err)
				}
				continue
			}
			var refusal *NotSupportedError
			if !errors.As(err, &refusal) || refusal.Support.Reason != tc.reason || refusal.Support.Level != tc.level || refusal.Support.Message == "" {
				t.Errorf("%s, runtime %+v: Allowed = %#v, want a %q refusal at %v with a message", tc.name, rt, err, tc.reason, tc.level)
				continue
			}
			// Support agrees with Allowed on every refusal Allowed makes.
			if got := r.Support(CapPunch); got != refusal.Support {
				t.Errorf("%s, runtime %+v: Support = %+v, but Allowed refused with %+v", tc.name, rt, got, refusal.Support)
			}
		}
	}
}

func TestAllowedMatchesErrExperimentalOffOnlyForThatReason(t *testing.T) {
	r := NewResolver(ResolverConfig{
		Adapter: plainAdapter{stubAdapter{kind: KindREAPER, declares: map[Capability]Level{CapPunch: Experimental, CapFXChains: Experimental}}},
		Toggle:  togglesOf(map[Capability]Toggle{CapFXChains: ToggleOff}),
	})
	if err := r.Allowed(CapPunch); !errors.Is(err, bridge.ErrExperimentalOff) {
		t.Errorf("Allowed(punch) = %v, want a match for bridge.ErrExperimentalOff", err)
	}
	if err := r.Allowed(CapFXChains); errors.Is(err, bridge.ErrExperimentalOff) || !errors.Is(err, ErrNotSupported) {
		t.Errorf("Allowed(fx_chains, turned off) = %v, want ErrNotSupported and not ErrExperimentalOff", err)
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
		toggles map[Capability]Toggle
		cap     Capability
		want    Support
	}{
		{"available", Runtime{Bridge: true, Reachable: true}, nil, CapPunch,
			Support{Level: Supported, Available: true, Destructive: true, Mode: ModeSteps}},
		{"mode only", Runtime{Bridge: true, Reachable: true}, nil, CapRecord,
			Support{Level: Supported, Available: true, Mode: ModeNative}},
		{"declares neither", Runtime{Bridge: true, Reachable: true}, nil, CapMarkers,
			Support{Level: Supported, Available: true}},
		{"not running keeps reason and message", Runtime{Bridge: true}, nil, CapPunch,
			Support{Level: Supported, Reason: ReasonNotRunning, Message: "Audacity is not answering. Check that Audacity is open, then try again.",
				Destructive: true, Mode: ModeSteps}},
		{"turned off keeps reason and message", Runtime{Bridge: true, Reachable: true}, map[Capability]Toggle{CapPunch: ToggleOff}, CapPunch,
			Support{Level: Supported, Reason: ReasonTurnedOff, Message: messageTurnedOff, Destructive: true, Mode: ModeSteps}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := NewResolver(ResolverConfig{
				Adapter: adapter,
				Runtime: func() Runtime { return tc.runtime },
				Toggle:  togglesOf(tc.toggles),
			})
			if got := r.Support(tc.cap); got != tc.want {
				t.Fatalf("Support(%s) = %+v, want %+v", tc.cap, got, tc.want)
			}
		})
	}
	var refusal *NotSupportedError
	r := NewResolver(ResolverConfig{Adapter: adapter, Toggle: togglesOf(map[Capability]Toggle{CapPunch: ToggleOff})})
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

// The edit capabilities ship NotYetAvailable on every engine until their command lands: never usable, whatever the toggle, and
// the message names the capability's own label.
func TestTheEditCapabilitiesResolveNotYetWhileDeclaredSo(t *testing.T) {
	declares := map[Capability]Level{CapCutRange: NotYetAvailable, CapFXRange: NotYetAvailable, CapStackTakes: NotYetAvailable, CapBackups: NotYetAvailable}
	r := NewResolver(ResolverConfig{
		Adapter: plainAdapter{stubAdapter{kind: KindREAPER, declares: declares}},
		Runtime: func() Runtime { return Runtime{Bridge: true, Reachable: true} },
		Toggle:  togglesOf(map[Capability]Toggle{CapCutRange: ToggleOn, CapFXRange: ToggleOn, CapStackTakes: ToggleOn, CapBackups: ToggleOn}),
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

// needyAdapter is a deepAdapter whose capabilities may require others (a Requirer), and that words a refusal for a requirement
// (a RequirementExplainer) when need holds a sentence for the capability.
type needyAdapter struct {
	deepAdapter
	requires map[Capability][]Capability
	need     map[Capability]string
}

func (n needyAdapter) Requires(c Capability) []Capability { return n.requires[c] }
func (n needyAdapter) ExplainRequirement(c, _ Capability, r Reason) string {
	if r != ReasonTurnedOff && r != ReasonExperimentalOff {
		return ""
	}
	return n.need[c]
}

const needBackups = "Stacking takes needs Audacity backups. Turn on Audio backups in Settings."

func needy() needyAdapter {
	declares := map[Capability]Level{CapStackTakes: Experimental, CapPunch: Experimental, CapBackups: Experimental, CapTakes: Experimental}
	return needyAdapter{
		deepAdapter: deepAdapter{
			plainAdapter: plainAdapter{stubAdapter{kind: KindAudacity, declares: declares}},
			depth:        map[Capability]Depth{CapStackTakes: {Mode: ModeSteps}, CapPunch: {Destructive: true}},
		},
		requires: map[Capability][]Capability{CapStackTakes: {CapBackups}, CapPunch: {CapBackups}, CapTakes: {CapBackups}},
		need:     map[Capability]string{CapStackTakes: needBackups},
	}
}

func needyResolver(a Adapter, rt Runtime, toggles map[Capability]Toggle) *Resolver {
	return NewResolver(ResolverConfig{
		Adapter: a,
		Runtime: func() Runtime { return rt },
		Toggle: func(c Capability) Toggle {
			if t, ok := toggles[c]; ok {
				return t
			}
			return ToggleOn
		},
	})
}

// resolver-refuses-with-the-required-capabilitys-reason: a capability whose requirement is unavailable is refused with that
// requirement's reason, in the adapter's sentence, and is available once the requirement is.
func TestSupportRefusesWithTheRequiredCapabilitysReason(t *testing.T) {
	answering := Runtime{Bridge: true, Reachable: true}
	off := needyResolver(needy(), answering, map[Capability]Toggle{CapBackups: ToggleOff})
	got := off.Support(CapStackTakes)
	want := Support{Level: Experimental, Reason: ReasonTurnedOff, Message: needBackups, Mode: ModeSteps}
	if got != want {
		t.Fatalf("backups off: Support(stack_takes) = %+v, want %+v", got, want)
	}
	if err := off.Allowed(CapStackTakes); !errors.Is(err, ErrNotSupported) || err.Error() != needBackups {
		t.Fatalf("backups off: Allowed(stack_takes) = %v, want the requirement's refusal", err)
	}
	if _, err := Role[TakeStacker](off, CapStackTakes); !errors.Is(err, ErrNotSupported) {
		t.Fatalf("backups off: Role(stack_takes) = %v, want a refusal", err)
	}

	on := needyResolver(needy(), answering, nil)
	if got := on.Support(CapStackTakes); got != (Support{Level: Experimental, Available: true, Mode: ModeSteps}) {
		t.Fatalf("backups on: Support(stack_takes) = %+v, want available in steps", got)
	}
}

// A requirement refused for a reason the adapter does not word falls back to a sentence that names both capabilities and says
// the requirement's own refusal; the capability's own refusal still comes first.
func TestSupportOfARequirementGivesTheFirstThingTheNarratorCanChange(t *testing.T) {
	answering := Runtime{Bridge: true, Reachable: true}
	a := needy()
	a.declares = map[Capability]Level{CapStackTakes: Experimental, CapPunch: Experimental, CapTakes: Experimental, CapBackups: NotYetAvailable}
	got := needyResolver(a, answering, nil).Support(CapTakes)
	if got.Available || got.Reason != ReasonNotYet || got.Message != "Choose the active take needs Audio backups. Audio backups is not available with Audacity yet." {
		t.Fatalf("backups not yet: Support(takes) = %+v, want not_yet naming both", got)
	}

	ownOff := needyResolver(needy(), answering, map[Capability]Toggle{CapStackTakes: ToggleOff, CapBackups: ToggleOff})
	if got := ownOff.Support(CapStackTakes); got.Reason != ReasonTurnedOff || got.Message != messageTurnedOff {
		t.Fatalf("stack_takes itself off: Support = %+v, want its own turned_off first", got)
	}

	experimental := NewResolver(ResolverConfig{Adapter: needy(), Runtime: func() Runtime { return answering },
		Toggle: togglesOf(map[Capability]Toggle{CapStackTakes: ToggleOn})})
	if got := experimental.Support(CapStackTakes); got.Reason != ReasonExperimentalOff || got.Message != needBackups {
		t.Fatalf("backups experimental and switched off: Support(stack_takes) = %+v, want experimental_off in the adapter's sentence", got)
	}

	quiet := needyResolver(needy(), Runtime{Bridge: true}, nil)
	if got := quiet.Support(CapStackTakes); got.Reason != ReasonNotRunning {
		t.Fatalf("not answering: Support(stack_takes) = %+v, want not_running", got)
	}
}

// destructive-and-mode-follow-the-requirement: a capability the adapter declares destructive with a requirement stays usable while
// the requirement is not, and destructive; with the requirement available it is not destructive.
func TestADestructiveCapabilityIsMadeSafeByItsRequirement(t *testing.T) {
	answering := Runtime{Bridge: true, Reachable: true}
	off := needyResolver(needy(), answering, map[Capability]Toggle{CapBackups: ToggleOff}).Support(CapPunch)
	if off != (Support{Level: Experimental, Available: true, Destructive: true}) {
		t.Fatalf("backups off: Support(punch) = %+v, want available and destructive", off)
	}
	on := needyResolver(needy(), answering, nil).Support(CapPunch)
	if on != (Support{Level: Experimental, Available: true}) {
		t.Fatalf("backups on: Support(punch) = %+v, want available and not destructive", on)
	}
	refused := needyResolver(needy(), answering, map[Capability]Toggle{CapPunch: ToggleOff, CapBackups: ToggleOff}).Support(CapPunch)
	if !refused.Destructive || refused.Reason != ReasonTurnedOff {
		t.Fatalf("punch off, backups off: Support(punch) = %+v, want its own refusal, destructive", refused)
	}
}

// A cycle an adapter should never declare does not hang the resolver (the conformance suite refuses one).
func TestSupportSurvivesARequirementCycle(t *testing.T) {
	a := needy()
	a.requires = map[Capability][]Capability{CapStackTakes: {CapBackups}, CapBackups: {CapStackTakes}}
	r := needyResolver(a, Runtime{Bridge: true, Reachable: true}, nil)
	if got := r.Support(CapStackTakes); !got.Available {
		t.Fatalf("Support(stack_takes) with a cycle = %+v", got)
	}
}
