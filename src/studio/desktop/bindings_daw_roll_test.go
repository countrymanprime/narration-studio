package main

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"math"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// DawRoll (SND-6a) over readaloudreaper_test.go's Alice project, its first chapter linked to readAloudTrack, and a fake
// punch role standing in for REAPER. What REAPER answers a roll is dawport/reaper's own (reaper_test.go); these cover the
// host's wiring: the resolver first, the chapter's track looked up here, the time checked, and the confirmation rule.

type rollCall struct {
	track string
	at    float64
}

type fakeRoller struct {
	rolled   []rollCall
	asked    int
	answer   dawport.Result
	position dawport.PlayPosition
}

func (f *fakeRoller) PunchTo(context.Context, float64, float64) (float64, error) {
	return 0, errors.New("PunchTo is not the roll")
}

func (f *fakeRoller) PlayPosition(context.Context) (dawport.PlayPosition, error) {
	f.asked++
	return f.position, nil
}

func (f *fakeRoller) Roll(_ context.Context, trackGUID string, at float64) (dawport.Result, error) {
	f.rolled = append(f.rolled, rollCall{trackGUID, at})
	return f.answer, nil
}

// rolledFrom is what dawport/reaper's puncher answers a roll from at (reaper.go): a change with no undo point of its own.
func rolledFrom(at float64) dawport.Result {
	return dawport.OK(fmt.Sprintf("Rolled again from %.1f seconds. The earlier audio is kept as a take.", at), true).WithUndoSteps(0)
}

// recordingAt is REAPER recording, its play position at seconds.
func recordingAt(seconds float64) dawport.PlayPosition {
	return dawport.PlayPosition{Playing: true, Recording: true, Heard: seconds, Processed: seconds}
}

// rollHost is newReadAloudReaperHost launched for kind ("" standalone) with a bridge client, the given reachability and punch
// role, and the punch capability set to toggle ("" leaves it on auto, Experimental and off). It returns the host and the
// chapter ids: the first linked to readAloudTrack, the second to nothing.
func rollHost(t *testing.T, kind string, reach *daw.Reachability, role dawport.Puncher, toggle string) (*Host, []string) {
	t.Helper()
	t.Setenv("APPDATA", t.TempDir())
	host, ids := newReadAloudReaperHost(t)
	if toggle != "" {
		if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapPunch): &toggle}); err != nil {
			t.Fatal(err)
		}
	}
	client, err := bridge.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	host.mu.Lock()
	host.config.daw = kind
	if kind != "" {
		host.bridge = client
	}
	host.reachability, host.puncher = reach, role
	host.mu.Unlock()
	return host, ids
}

// destructivePunch is an engine whose roll replaces audio (the mock's Audacity without backups): punch Supported, answering,
// and declared destructive. No adapter in the app declares one yet.
type destructivePunch struct{}

func (destructivePunch) Kind() dawport.Kind { return dawport.KindAudacity }
func (destructivePunch) Declares() map[dawport.Capability]dawport.Level {
	return map[dawport.Capability]dawport.Level{dawport.CapPunch: dawport.Supported}
}
func (destructivePunch) Role(dawport.Capability) any { return nil }
func (destructivePunch) Depth(c dawport.Capability) dawport.Depth {
	return dawport.Depth{Destructive: c == dawport.CapPunch}
}

func destructiveSupport(t *testing.T) dawport.Support {
	t.Helper()
	resolver := dawport.NewResolver(dawport.ResolverConfig{
		Adapter: destructivePunch{},
		Runtime: func() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} },
	})
	support := resolver.Support(dawport.CapPunch)
	if !support.Available || !support.Destructive {
		t.Fatalf("support = %+v, want an available destructive punch", support)
	}
	return support
}

// binding-answers-a-dawresult: the chapter's linked track is looked up on the host and sent with at, and the answer is the
// role's DawResult.
func TestDawRollSendsTheChaptersLinkedTrackAndAnswersADawResult(t *testing.T) {
	role := &fakeRoller{answer: rolledFrom(40), position: recordingAt(52)}
	host, ids := rollHost(t, "REAPER", liveReachability(), role, "on")

	got := decodeDawResult(t)(host.DawRoll(ids[0], 40, false))

	if !reflect.DeepEqual(got, rolledFrom(40)) {
		t.Fatalf("DawRoll = %+v, want %+v", got, rolledFrom(40))
	}
	if want := []rollCall{{readAloudTrack, 40}}; !reflect.DeepEqual(role.rolled, want) {
		t.Fatalf("sent %v, want %v", role.rolled, want)
	}
}

// confirmation-is-the-hosts-rule: where the resolver says punch is destructive, an unconfirmed roll is refused with the one
// sentence and nothing is sent or read; a confirmed one is sent. REAPER's punch is not destructive, so confirmed is ignored.
func TestDawRollAsksForConfirmationOnlyWhereTheCapabilityIsDestructive(t *testing.T) {
	role := &fakeRoller{answer: dawport.OK("Rolled again. The audio from here on was replaced.", true), position: recordingAt(52)}
	host, ids := rollHost(t, "REAPER", liveReachability(), role, "on")
	svc := host.services()
	support := destructiveSupport(t)

	got, err := dawRollIn(t.Context(), svc, support, role, ids[0], 40, false)
	if err != nil || !reflect.DeepEqual(got, dawport.Refused(rollConfirmSentence)) || len(role.rolled) != 0 || role.asked != 0 {
		t.Fatalf("unconfirmed = %+v, %v; sent %v, asked %d", got, err, role.rolled, role.asked)
	}
	if rollConfirmSentence != "This will replace the audio from here on. Confirm to continue." {
		t.Fatalf("the confirmation sentence changed: %q", rollConfirmSentence)
	}
	got, err = dawRollIn(t.Context(), svc, support, role, ids[0], 40, true)
	if err != nil || !got.OK || len(role.rolled) != 1 {
		t.Fatalf("confirmed = %+v, %v; sent %v", got, err, role.rolled)
	}

	for _, confirmed := range []bool{false, true} {
		reaper := &fakeRoller{answer: rolledFrom(40), position: recordingAt(52)}
		host, ids := rollHost(t, "REAPER", liveReachability(), reaper, "on")
		if got := decodeDawResult(t)(host.DawRoll(ids[0], 40, confirmed)); !got.OK || len(reaper.rolled) != 1 {
			t.Fatalf("REAPER, confirmed %v: %+v, sent %v", confirmed, got, reaper.rolled)
		}
	}
}

// refusals-come-from-the-capability-or-the-host: the resolver's own sentence for each launch it refuses, checked before the
// chapter is read, and nothing sent or read for any of them.
func TestDawRollRefusesWithTheResolversSentenceAndSendsNothing(t *testing.T) {
	for name, c := range map[string]struct {
		kind   string
		reach  *daw.Reachability
		toggle string
		reason dawport.Reason
	}{
		"standalone":        {"", liveReachability(), "on", dawport.ReasonStandalone},
		"not answering":     {"REAPER", daw.NewReachability(nil), "on", dawport.ReasonNotRunning},
		"experimental off":  {"REAPER", liveReachability(), "", dawport.ReasonExperimentalOff},
		"toggle turned off": {"REAPER", liveReachability(), "off", dawport.ReasonTurnedOff},
	} {
		t.Run(name, func(t *testing.T) {
			role := &fakeRoller{answer: rolledFrom(40), position: recordingAt(52)}
			host, ids := rollHost(t, c.kind, c.reach, role, c.toggle)
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapPunch)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("punch support = %+v, want reason %s", support, c.reason)
			}

			got := decodeDawResult(t)(host.DawRoll(ids[0], 40, true))

			if !reflect.DeepEqual(got, dawport.Refused(support.Message)) || len(role.rolled) != 0 || role.asked != 0 {
				t.Fatalf("DawRoll = %+v, sent %v, asked %d; want Refused(%q) and nothing sent", got, role.rolled, role.asked, support.Message)
			}
		})
	}
}

func TestDawRollRefusesAChapterWithNoLinkedTrackAndSendsNothing(t *testing.T) {
	role := &fakeRoller{answer: rolledFrom(40), position: recordingAt(52)}
	host, ids := rollHost(t, "REAPER", liveReachability(), role, "on")

	got := decodeDawResult(t)(host.DawRoll(ids[1], 40, false))

	if got.OK || got.Code != "" || !strings.Contains(got.Refused, "has no linked track") || len(role.rolled) != 0 || role.asked != 0 {
		t.Fatalf("DawRoll = %+v, sent %v, asked %d", got, role.rolled, role.asked)
	}
}

// A track gone from the project is the role's stale refusal (dawport/reaper's puncher), passed on with its code.
func TestDawRollPassesOnAStaleTrackWithItsCode(t *testing.T) {
	stale := dawport.RefusedStale("That track is no longer in the REAPER project. Read the project again.")
	role := &fakeRoller{answer: stale, position: recordingAt(52)}
	host, ids := rollHost(t, "REAPER", liveReachability(), role, "on")

	got := decodeDawResult(t)(host.DawRoll(ids[0], 40, false))

	if !reflect.DeepEqual(got, stale) || got.Code != dawport.CodeStale {
		t.Fatalf("DawRoll = %+v, want %+v", got, stale)
	}
}

// A launch whose resolver allows punch but that has no punch role (no live adapter) refuses rather than failing.
func TestDawRollWithNoPunchRoleIsRefused(t *testing.T) {
	host, ids := rollHost(t, "REAPER", liveReachability(), nil, "on")
	if got := decodeDawResult(t)(host.DawRoll(ids[0], 40, false)); got.OK || got.Refused == "" {
		t.Fatalf("DawRoll = %+v, want a refusal", got)
	}
}

// at-is-checked-on-the-host: a time that is not a number of seconds, or one past where REAPER records now, is refused with
// a sentence before the role is asked to roll.
func TestDawRollChecksTheTimeBeforeTheRoleIsCalled(t *testing.T) {
	for _, at := range []float64{math.NaN(), math.Inf(1), math.Inf(-1), -0.5} {
		role := &fakeRoller{answer: rolledFrom(40), position: recordingAt(52)}
		host, ids := rollHost(t, "REAPER", liveReachability(), role, "on")
		got := decodeDawResult(t)(host.DawRoll(ids[0], at, true))
		if !reflect.DeepEqual(got, dawport.Refused(rollBadTimeSentence)) || len(role.rolled) != 0 || role.asked != 0 {
			t.Errorf("at %v: DawRoll = %+v, sent %v, asked %d", at, got, role.rolled, role.asked)
		}
	}

	role := &fakeRoller{answer: rolledFrom(60), position: recordingAt(52)}
	host, ids := rollHost(t, "REAPER", liveReachability(), role, "on")
	got := decodeDawResult(t)(host.DawRoll(ids[0], 60, false))
	if !reflect.DeepEqual(got, dawport.Refused(rollPastTheEndSentence)) || len(role.rolled) != 0 {
		t.Fatalf("past the end: DawRoll = %+v, sent %v", got, role.rolled)
	}
	// At the play position itself is still inside the recording.
	if got := decodeDawResult(t)(host.DawRoll(ids[0], 52, false)); !got.OK || len(role.rolled) != 1 {
		t.Fatalf("at the play position: DawRoll = %+v, sent %v", got, role.rolled)
	}
}

// The page names a chapter: a GUID, a track id or a path in its place is a chapter the manuscript does not have, and an error.
func TestDawRollTakesAChapterIDNeverATrack(t *testing.T) {
	role := &fakeRoller{answer: rolledFrom(40), position: recordingAt(52)}
	host, _ := rollHost(t, "REAPER", liveReachability(), role, "on")
	for _, id := range []string{readAloudTrack, "{TRACK-1}", "C:/Projects/Alice/Alice.rpp", "roll"} {
		if _, err := host.DawRoll(id, 40, true); err == nil {
			t.Errorf("DawRoll(%q) answered for a chapter the manuscript does not have", id)
		}
	}
	if len(role.rolled) != 0 {
		t.Fatalf("sent %v for ids that are not chapters", role.rolled)
	}
}

// TestDawRollContractGoldenIsCurrent pins DawRoll's answer: rolled (no undo point of its own), refused until confirmed where
// punch is destructive, and a stale track. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-roll-*.json.
func TestDawRollContractGoldenIsCurrent(t *testing.T) {
	stale := dawport.RefusedStale("That track is no longer in the REAPER project. Read the project again.")
	cases := map[string]struct {
		answer      dawport.Result
		destructive bool
	}{
		"daw-roll-done":            {rolledFrom(40), false},
		"daw-roll-refused-confirm": {rolledFrom(40), true},
		"daw-roll-refused-stale":   {stale, false},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		c := cases[name]
		t.Run(name, func(t *testing.T) {
			role := &fakeRoller{answer: c.answer, position: recordingAt(52)}
			host, ids := rollHost(t, "REAPER", liveReachability(), role, "on")
			var raw string
			var err error
			if c.destructive {
				raw, err = encodeBinding(dawRollIn(t.Context(), host.services(), destructiveSupport(t), role, ids[0], 40, false))
			} else {
				raw, err = host.DawRoll(ids[0], 40, false)
			}
			contractfile.Check(t, name, decodeDawResult(t)(raw, err))
		})
	}
}
