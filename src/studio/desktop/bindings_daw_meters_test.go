package main

import (
	"context"
	"errors"
	"maps"
	"slices"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/daw"
	"desktop/internal/dawport"
)

// DawMeters. What REAPER does is narration_meters.lua's (meters_test.lua) and what the role answers is bridge's
// (daw_meters_test.go). These cover the host's wiring: the resolver first, the role's answer and the sentence each refusal gets.

type fakeMeterReader struct {
	reads  int
	meters dawport.DawMeters
	err    error
}

func (f *fakeMeterReader) DawMeters(context.Context) (dawport.DawMeters, error) {
	f.reads++
	return f.meters, f.err
}

func TestDawMetersPassesOnTheArmedTrackAndTheOutput(t *testing.T) {
	role := &fakeMeterReader{meters: dawport.DawMeters{OutputDB: -20, Armed: true, InputDB: -6, InputTrack: "Chapter 1"}}
	got := dawMetersIn(t.Context(), "REAPER", available(), role)
	if !got.OK || got.Output != -20 || got.Input == nil || *got.Input != -6 || got.InputTrack != "Chapter 1" || got.Message != "" {
		t.Fatalf("DawMeters = %+v", got)
	}
}

func TestDawMetersAnswersNoInputWhenNoTrackIsArmed(t *testing.T) {
	role := &fakeMeterReader{meters: dawport.DawMeters{OutputDB: dawport.MeterFloorDB}}
	got := dawMetersIn(t.Context(), "REAPER", available(), role)
	if !got.OK || got.Output != dawport.MeterFloorDB || got.Input != nil || got.InputTrack != "" {
		t.Fatalf("DawMeters = %+v; want the output and no input", got)
	}
}

func TestDawMetersRefusesInASentence(t *testing.T) {
	scripts := &bridge.RefusalError{Sentence: "This REAPER version cannot read its meters."}
	for name, c := range map[string]struct {
		err      error
		contains string
	}{
		"the script's sentence": {scripts, "cannot read its meters"},
		"not answering":         {bridge.ErrNoAnswer, "is not answering"},
		"not connected":         {bridge.ErrUnavailable, "is not connected"},
		"old script":            {bridge.ErrScriptOutdated, "older than this app"},
		"timeout":               {context.DeadlineExceeded, "did not answer"},
		"anything else":         {errors.New("boom"), "boom"},
	} {
		got := dawMetersIn(t.Context(), "REAPER", available(), &fakeMeterReader{meters: dawport.DawMeters{OutputDB: -3, Armed: true, InputDB: -3}, err: c.err})
		if got.OK || got.Input != nil || got.Output != 0 || got.Message == "" || !strings.Contains(strings.ToLower(got.Message), c.contains) {
			t.Errorf("%s: %+v; want a refusal containing %q", name, got, c.contains)
		}
	}
}

func TestDawMetersRefusesWithTheResolversSentenceAndAsksNothing(t *testing.T) {
	for name, c := range map[string]struct {
		kind   string
		reach  *daw.Reachability
		reason dawport.Reason
	}{
		"standalone":    {"", liveReachability(), dawport.ReasonStandalone},
		"not answering": {"REAPER", daw.NewReachability(nil), dawport.ReasonNotRunning},
	} {
		t.Run(name, func(t *testing.T) {
			role := &fakeMeterReader{}
			host := deleteRangeHost(t, c.kind, c.reach, nil)
			host.mu.Lock()
			host.meterReader = role
			host.mu.Unlock()
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapDawMeters)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("daw_meters support = %+v, want reason %s", support, c.reason)
			}
			got := bindingAnswer[DawMetersResult](t)(host.DawMeters())
			if got.OK || got.Message != support.Message || got.Reason != string(c.reason) {
				t.Fatalf("DawMeters = %+v; want the resolver's %q (%s)", got, support.Message, c.reason)
			}
			if role.reads != 0 {
				t.Fatalf("the role was asked %d times", role.reads)
			}
		})
	}
}

// With the narrator's settings untouched and REAPER answering, the meters read: no setting stands in front of daw_meters (the
// owner's decisions on #2251).
func TestDawMetersReadsByDefault(t *testing.T) {
	role := &fakeMeterReader{meters: dawport.DawMeters{OutputDB: -20, Armed: true, InputDB: -6, InputTrack: "Chapter 1"}}
	host := deleteRangeHost(t, "REAPER", liveReachability(), nil)
	host.mu.Lock()
	host.meterReader = role
	host.mu.Unlock()
	got := bindingAnswer[DawMetersResult](t)(host.DawMeters())
	if !got.OK || got.Output != -20 || got.Input == nil || *got.Input != -6 || role.reads != 1 {
		t.Fatalf("DawMeters on default settings = %+v after %d reads; want the meters, read once", got, role.reads)
	}
}

// TestDawMetersContractGoldenIsCurrent pins the binding's answers. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-meters-*.json.
func TestDawMetersContractGoldenIsCurrent(t *testing.T) {
	refused := dawport.Support{Reason: dawport.ReasonNotRunning, Message: "REAPER is not answering. Check that REAPER is open, then try again."}
	cases := map[string]struct {
		support dawport.Support
		role    *fakeMeterReader
	}{
		"daw-meters-armed":   {available(), &fakeMeterReader{meters: dawport.DawMeters{OutputDB: -20, Armed: true, InputDB: -6, InputTrack: "Chapter 1"}}},
		"daw-meters-unarmed": {available(), &fakeMeterReader{meters: dawport.DawMeters{OutputDB: dawport.MeterFloorDB}}},
		"daw-meters-refused": {refused, &fakeMeterReader{}},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		c := cases[name]
		t.Run(name, func(t *testing.T) {
			contractfile.Check(t, name, dawMetersIn(t.Context(), "REAPER", c.support, c.role))
		})
	}
}
