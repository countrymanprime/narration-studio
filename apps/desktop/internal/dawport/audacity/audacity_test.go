package audacity

import (
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/audacitybridge"
	abt "github.com/countrymanprime/narration-utils/shell/internal/audacitybridge/audacitybridgetest"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/dawporttest"
)

// closedAdapter is the adapter over a pipe that is not there: Audacity closed, scripting off, or Audacity 4.0.
func closedAdapter(tb testing.TB) *Adapter {
	server := abt.NewServer()
	server.SetDown(true)
	return New(audacitybridge.New(server.Transport(), audacitybridge.Options{Timeout: time.Second}))
}

func TestConformance(t *testing.T) {
	dawporttest.Run(t, func(tb testing.TB) dawport.Adapter { return closedAdapter(tb) })
}

// Exactly what is built is Experimental (ADR 0355): navigate, markers, macro_render, backups (ADR 0863) and the five rows that need
// backups (their role is the steps, steps.go). Everything else is NotYetAvailable with no role, until
// the owner's pass promotes a capability or a later phase builds one.
func TestTheDeclarationIsWhatIsBuilt(t *testing.T) {
	adapter := closedAdapter(t)
	declared := adapter.Declares()
	if len(declared) != len(dawport.Capabilities()) {
		t.Errorf("declares %d capabilities, want every one of the catalog's %d", len(declared), len(dawport.Capabilities()))
	}
	for _, spec := range dawport.Capabilities() {
		c := spec.Capability
		want := dawport.NotYetAvailable
		if built(c) {
			want = dawport.Experimental
		}
		if got := declared[c]; got != want {
			t.Errorf("%s is declared %v, want %v", c, got, want)
		}
		if role := adapter.Role(c); (role != nil) != (want == dawport.Experimental) {
			t.Errorf("%s has role %T", c, role)
		}
	}
	for _, d := range []dawport.Adapter{adapter, Declaration()} {
		for c, level := range d.Declares() {
			if level == dawport.Supported {
				t.Errorf("%T declares %s Supported before the owner's pass", d, c)
			}
		}
	}
}

// built is what the adapter builds, Experimental until the owner's pass.
func built(c dawport.Capability) bool {
	return c == dawport.CapNavigate || c == dawport.CapMarkers || c == dawport.CapMacroRender || c == dawport.CapBackups ||
		slices.Contains(backupRows, c)
}

// backupRows is the capabilities that exist in Audacity only while its backups are on (SN-D83): the Studio Next mock's
// AUDACITY_BACKUP_CAPS less backups itself.
var backupRows = []dawport.Capability{dawport.CapTakes, dawport.CapPunch, dawport.CapStackTakes, dawport.CapCutRange, dawport.CapFXRange}

// requires-is-a-catalogue-field (the adapter's half): Audacity declares the five rows Experimental and each requires backups; a
// roll is destructive (the requirement makes it safe) and the edits are made in steps.
func TestTheCapabilitiesThatNeedBackupsSaySo(t *testing.T) {
	for _, adapter := range []dawport.Adapter{closedAdapter(t), Declaration()} {
		requirer, ok := adapter.(dawport.Requirer)
		describer, okDepth := adapter.(dawport.Describer)
		if !ok || !okDepth {
			t.Fatalf("%T is not a Requirer and a Describer", adapter)
		}
		for _, spec := range dawport.Capabilities() {
			c := spec.Capability
			want := []dawport.Capability(nil)
			if slices.Contains(backupRows, c) {
				want = []dawport.Capability{dawport.CapBackups}
			}
			if got := requirer.Requires(c); !slices.Equal(got, want) {
				t.Errorf("%T: %s requires %v, want %v", adapter, c, got, want)
			}
			depth := dawport.Depth{}
			switch c {
			case dawport.CapPunch:
				depth = dawport.Depth{Destructive: true}
			case dawport.CapStackTakes, dawport.CapCutRange, dawport.CapFXRange:
				depth = dawport.Depth{Mode: dawport.ModeSteps}
			}
			if got := describer.Depth(c); got != depth {
				t.Errorf("%T: %s depth %+v, want %+v", adapter, c, got, depth)
			}
		}
	}
}

// audacityWith is the resolver of a connected, answering Audacity with every capability switched on and backups as given.
func audacityWith(adapter dawport.Adapter, backups dawport.Toggle) *dawport.Resolver {
	return dawport.NewResolver(dawport.ResolverConfig{
		Adapter: adapter,
		Runtime: func() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} },
		Toggle: func(c dawport.Capability) dawport.Toggle {
			if c == dawport.CapBackups {
				return backups
			}
			return dawport.ToggleOn
		},
	})
}

// resolver-refuses-with-the-required-capabilitys-reason and destructive-and-mode-follow-the-requirement, over the real adapter.
func TestBackupsDecideWhatAudacityCanDo(t *testing.T) {
	off := audacityWith(closedAdapter(t), dawport.ToggleOff)
	want := map[dawport.Capability]dawport.Support{
		dawport.CapTakes: {Level: dawport.Experimental, Reason: dawport.ReasonTurnedOff,
			Message: "Keeping takes needs Audacity backups. Turn on Audio backups in Settings."},
		dawport.CapStackTakes: {Level: dawport.Experimental, Reason: dawport.ReasonTurnedOff,
			Message: "Stacking takes needs Audacity backups. Turn on Audio backups in Settings.", Mode: dawport.ModeSteps},
		dawport.CapCutRange: {Level: dawport.Experimental, Reason: dawport.ReasonTurnedOff,
			Message: "Cutting words and their audio needs Audacity backups. Turn on Audio backups in Settings.", Mode: dawport.ModeSteps},
		dawport.CapFXRange: {Level: dawport.Experimental, Reason: dawport.ReasonTurnedOff,
			Message: "Adding an effect to words needs Audacity backups. Turn on Audio backups in Settings.", Mode: dawport.ModeSteps},
		dawport.CapPunch: {Level: dawport.Experimental, Available: true, Destructive: true},
	}
	for c, w := range want {
		if got := off.Support(c); got != w {
			t.Errorf("backups off: %s = %+v, want %+v", c, got, w)
		}
	}

	on := audacityWith(closedAdapter(t), dawport.ToggleOn)
	for _, c := range backupRows {
		got := on.Support(c)
		w := dawport.Support{Level: dawport.Experimental, Available: true, Mode: want[c].Mode}
		if got != w {
			t.Errorf("backups on: %s = %+v, want %+v", c, got, w)
		}
	}

	// Backups that are themselves Experimental and switched off by the old switch give the same sentence: turning them on is
	// what the narrator can change.
	experimental := dawport.NewResolver(dawport.ResolverConfig{
		Adapter: closedAdapter(t),
		Runtime: func() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} },
		Toggle: func(c dawport.Capability) dawport.Toggle {
			if c == dawport.CapBackups {
				return dawport.ToggleAuto
			}
			return dawport.ToggleOn
		},
	})
	if s := experimental.Support(dawport.CapStackTakes); s.Reason != dawport.ReasonExperimentalOff || s.Message != want[dawport.CapStackTakes].Message {
		t.Errorf("backups experimental_off: stack_takes = %+v", s)
	}
}

// The five capabilities that need backups share the steps role. Over an adapter with no project folder, so no backup can be made,
// a cut, an effect, a stack and an un-stack refuse with the capability's sentence; a roll still reaches for the pipe (here closed),
// since a roll without backups is the destructive one the page confirmed; and what is not built for Audacity keeps ADR 0144's
// sentence.
func TestTheRolesThatNeedBackupsAreTheSteps(t *testing.T) {
	adapter := closedAdapter(t)
	ctx := t.Context()
	for _, c := range backupRows {
		if _, ok := adapter.Role(c).(*steps); !ok {
			t.Errorf("%s role = %T, want the steps", c, adapter.Role(c))
		}
	}
	refused := func(name, want string, r dawport.Result, err error) {
		t.Helper()
		if err != nil || r.OK || r.Refused != want {
			t.Errorf("%s = %+v, %v; want Refused %q", name, r, err, want)
		}
	}
	notBuilt := func(name string, err error) {
		t.Helper()
		if !errors.Is(err, ErrNotAvailable) {
			t.Errorf("%s error = %v, want ErrNotAvailable", name, err)
		}
	}
	punch := adapter.Role(dawport.CapPunch).(dawport.Puncher)
	_, err := punch.PunchTo(ctx, 1, 1)
	notBuilt("PunchTo", err)
	_, err = punch.PlayPosition(ctx)
	notBuilt("PlayPosition", err)
	if _, err := punch.Roll(ctx, "Chapter 1", 1); !errors.Is(err, audacitybridge.ErrNotReachable) {
		t.Errorf("Roll over a closed pipe error = %v, want ErrNotReachable", err)
	}

	takes := adapter.Role(dawport.CapTakes).(dawport.TakeSelector)
	_, err = takes.SetActiveTake(ctx, "{item}", "{take}")
	notBuilt("SetActiveTake", err)
	r, err := takes.HideTakes(ctx, "{item}", "{take}")
	refused("HideTakes", string(ErrNotAvailable), r, err)

	stack := adapter.Role(dawport.CapStackTakes).(dawport.TakeStacker)
	r, err = stack.StackTakes(ctx, dawport.StackRequest{})
	refused("StackTakes", backupsSentence(dawport.CapStackTakes), r, err)
	r, err = stack.UnstackTakes(ctx, dawport.StackRequest{})
	refused("UnstackTakes", backupsSentence(dawport.CapStackTakes), r, err)
	r, err = adapter.Role(dawport.CapCutRange).(dawport.RangeCutter).DeleteRange(ctx, dawport.DeleteRangeRequest{})
	refused("DeleteRange", backupsSentence(dawport.CapCutRange), r, err)
	fx := adapter.Role(dawport.CapFXRange).(dawport.RangeFXApplier)
	r, err = fx.ApplyFXToRange(ctx, dawport.FXRangeRequest{})
	refused("ApplyFXToRange", backupsSentence(dawport.CapFXRange), r, err)
	r, err = fx.RemoveFXFromRange(ctx, "{item}", "chain")
	refused("RemoveFXFromRange", messageRemoveFX, r, err)
}

func resolverFor(adapter dawport.Adapter, rt dawport.Runtime, toggle dawport.Toggle) *dawport.Resolver {
	return dawport.NewResolver(dawport.ResolverConfig{
		Adapter: adapter,
		Runtime: func() dawport.Runtime { return rt },
		Toggle:  func(dawport.Capability) dawport.Toggle { return toggle },
	})
}

// What is not built still refuses with ADR 0144's sentence, whatever the runtime and settings say.
func TestWhatIsNotBuiltKeepsADR0144sSentence(t *testing.T) {
	for _, adapter := range []dawport.Adapter{closedAdapter(t), Declaration()} {
		for _, rt := range []dawport.Runtime{{}, {Bridge: true}, {Bridge: true, Reachable: true}} {
			resolver := resolverFor(adapter, rt, dawport.ToggleOn)
			for c, s := range resolver.All() {
				if built(c) {
					continue
				}
				if s.Available || s.Reason != dawport.ReasonNotYet || s.Message != string(ErrNotAvailable) {
					t.Errorf("%T %+v: %s = %+v, want not_yet with ADR 0144's sentence", adapter, rt, c, s)
				}
			}
			_, err := dawport.Role[dawport.ReviewSession](resolver, dawport.CapReview)
			if !errors.Is(err, dawport.ErrNotSupported) || err.Error() != string(ErrNotAvailable) {
				t.Errorf("Role(review) = %v, want the not-yet refusal", err)
			}
		}
	}
}

func TestExperimentalCapabilitiesAreOffUntilTurnedOnAndThenNeedAudacity(t *testing.T) {
	cases := []struct {
		name    string
		adapter dawport.Adapter
		rt      dawport.Runtime
		toggle  dawport.Toggle
		reason  dawport.Reason
		message string
	}{
		{"off by default", closedAdapter(t), dawport.Runtime{Bridge: true, Reachable: true}, dawport.ToggleAuto, dawport.ReasonExperimentalOff, ""},
		{"on, Audacity not answering", closedAdapter(t), dawport.Runtime{Bridge: true}, dawport.ToggleOn, dawport.ReasonNotRunning, messageNotReachable},
		{"on, no pipe opened by the host", Declaration(), dawport.Runtime{}, dawport.ToggleOn, dawport.ReasonStandalone, messageNotConnected},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := resolverFor(tc.adapter, tc.rt, tc.toggle).Support(dawport.CapNavigate)
			if s.Available || s.Reason != tc.reason || (tc.message != "" && s.Message != tc.message) {
				t.Errorf("navigate = %+v, want %s %q", s, tc.reason, tc.message)
			}
		})
	}
	s := resolverFor(closedAdapter(t), dawport.Runtime{Bridge: true, Reachable: true}, dawport.ToggleOn).Support(dawport.CapMarkers)
	if !s.Available {
		t.Errorf("markers, turned on with Audacity answering = %+v, want available", s)
	}
}

func TestRuntimeFollowsThePipe(t *testing.T) {
	server := abt.NewServer()
	client := audacitybridge.New(server.Transport(), audacitybridge.Options{Timeout: time.Second})
	adapter := New(client)
	if rt := adapter.Runtime(); !rt.Bridge || rt.Reachable {
		t.Errorf("before any request: %+v", rt)
	}
	if err := client.Ping(t.Context()); err != nil {
		t.Fatal(err)
	}
	if rt := adapter.Runtime(); !rt.Reachable {
		t.Errorf("after a reply: %+v", rt)
	}
	if adapter.Session() == nil || adapter.Kind() != dawport.KindAudacity {
		t.Error("the adapter must expose its session and kind")
	}
}

func TestTheFactoryIsRegisteredForAudacity(t *testing.T) {
	factory, ok := dawport.Lookup(dawport.KindAudacity)
	if !ok {
		t.Fatal("no factory registered for Audacity")
	}
	// An Audacity launch never opens REAPER's session directory, even when one is passed (ADR 0144).
	adapter, err := factory(dawport.Env{SessionDir: t.TempDir()})
	if err != nil {
		t.Fatalf("factory: %v", err)
	}
	if adapter.Kind() != dawport.KindAudacity {
		t.Errorf("Kind() = %v, want Audacity", adapter.Kind())
	}
}

// The review workflow's session on an Audacity launch refuses every request with a sentence the narrator can read, so it fails
// the run with that sentence instead of taking the "no DAW" path or writing REAPER bridge commands.
func TestUnavailableReviewRefusesEveryRequest(t *testing.T) {
	review := UnavailableReview()
	if review == nil {
		t.Fatal("an Audacity launch must get a review session, not the standalone nil")
	}
	requests := map[string]error{
		"PrepareReview":     review.PrepareReview("run-1", ""),
		"InspectFindings":   review.InspectFindings("run-1", "findings.json"),
		"NavigateToFinding": review.NavigateToFinding("run-1", "row-1"),
		"ExportFindings":    review.ExportFindings("run-1", "findings.json", dawport.MarkerColors{}),
	}
	for name, err := range requests {
		if !errors.Is(err, ErrNotAvailable) {
			t.Errorf("%s error = %v, want ErrNotAvailable", name, err)
		}
	}
	unsubscribe := review.Subscribe(dawport.Subscription{Tags: []string{"COMPARE_PREPARED"}, Handle: func(dawport.Event) { t.Fatal("no events") }})
	unsubscribe()
	if err := review.Dispatch(); err != nil {
		t.Fatalf("Dispatch() = %v, want nil", err)
	}
}

// declaration-and-conformance: backups is Experimental with the real role, Audacity 4 (no pipe) answers the not-reachable
// sentence for it, a launch with no pipe opened the not-connected one, and none of the role's sentences names another DAW.
func TestBackupsIsExperimentalWithTheRealRole(t *testing.T) {
	adapter := closedAdapter(t)
	if got := adapter.Declares()[dawport.CapBackups]; got != dawport.Experimental {
		t.Fatalf("backups is declared %v, want Experimental", got)
	}
	if _, ok := adapter.Role(dawport.CapBackups).(*Backups); !ok {
		t.Fatalf("backups role is %T, want *Backups", adapter.Role(dawport.CapBackups))
	}
	if s := resolverFor(adapter, adapter.Runtime(), dawport.ToggleOn).Support(dawport.CapBackups); s.Available ||
		s.Reason != dawport.ReasonNotRunning || s.Message != messageNotReachable {
		t.Errorf("backups with no pipe (Audacity 4.0) = %+v, want not_running with %q", s, messageNotReachable)
	}
	if s := resolverFor(Declaration(), dawport.Runtime{}, dawport.ToggleOn).Support(dawport.CapBackups); s.Reason != dawport.ReasonStandalone ||
		s.Message != messageNotConnected {
		t.Errorf("backups on a launch that opened no pipe = %+v", s)
	}
	for _, sentence := range []string{
		messageBackupNoProject, messageBackupBadRequest, messageBackupNoTrack, messageBackupTwoTracks, messageBackupNoAudio,
		messageBackupTableFull, messageNoBackup, messageBackupTrackGone, messageBackupSourceGone, messageBackupTwoBackups,
		messageBackupsNewer, messageBackupsUnreadable, string(ErrBackupLost),
	} {
		if strings.Contains(sentence, "REAPER") || !strings.HasSuffix(sentence, ".") && sentence != string(ErrBackupLost) {
			t.Errorf("%q is not a sentence for an Audacity narrator", sentence)
		}
	}
}
