package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/daw"
	"desktop/internal/dawport"
)

// DawPunchPreroll. What REAPER does is narration_preroll.lua's
// (preroll_test.lua) and the bridge's (punch_preroll_test.go); these cover the host's wiring: the resolver first, the role's answers,
// and the sentence each refusal gets.

type fakePrerollReader struct {
	reads int
	held  dawport.PunchPreroll
	err   error
}

func (f *fakePrerollReader) PunchPreroll(context.Context) (dawport.PunchPreroll, error) {
	f.reads++
	return f.held, f.err
}

func TestDawPunchPrerollPassesOnWhatTheRoleHolds(t *testing.T) {
	role := &fakePrerollReader{held: dawport.PunchPreroll{OnRecord: true, Measures: 1.5, MeasureSeconds: 2}}
	want := PunchPrerollResult{OK: true, OnRecord: true, Measures: 1.5, MeasureSeconds: 2}
	if got := dawPunchPrerollIn(t.Context(), "REAPER", available(), role); got != want || role.reads != 1 {
		t.Errorf("read = %+v (reads %d)", got, role.reads)
	}
}

func TestDawPunchPrerollRefusesInASentence(t *testing.T) {
	scripts := &bridge.RefusalError{Sentence: "REAPER did not report its pre-roll."}
	for name, c := range map[string]struct {
		err      error
		contains string
	}{
		"the script's sentence": {scripts, "did not report"},
		"not answering":         {bridge.ErrNoAnswer, "is not answering"},
		"not connected":         {bridge.ErrUnavailable, "is not connected"},
		"old script":            {bridge.ErrScriptOutdated, "older than this app"},
		"timeout":               {context.DeadlineExceeded, "did not answer"},
		"anything else":         {errors.New("boom"), "boom"},
	} {
		got := dawPunchPrerollIn(t.Context(), "REAPER", available(), &fakePrerollReader{err: c.err})
		if got.OK || got.Message == "" || !strings.Contains(strings.ToLower(got.Message), c.contains) {
			t.Errorf("%s: %+v; want a refusal containing %q", name, got, c.contains)
		}
	}
	if got := dawPunchPrerollIn(t.Context(), "REAPER", available(), nil); got.OK || got.Message == "" {
		t.Errorf("no role = %+v", got)
	}
	if got := dawPunchPrerollIn(t.Context(), "REAPER", available(), &fakePrerollReader{held: dawport.PunchPreroll{Measures: 2}}); got.OK {
		t.Errorf("a role answering no measure length = %+v; want a refusal", got)
	}
}

func TestDawPunchPrerollRefusesWithTheResolversSentenceAndAsksNothing(t *testing.T) {
	for name, c := range map[string]struct {
		kind   string
		reach  *daw.Reachability
		reason dawport.Reason
	}{
		"standalone":    {"", liveReachability(), dawport.ReasonStandalone},
		"not answering": {"REAPER", daw.NewReachability(nil), dawport.ReasonNotRunning},
	} {
		t.Run(name, func(t *testing.T) {
			role := &fakePrerollReader{held: dawport.PunchPreroll{Measures: 2, MeasureSeconds: 2}}
			host := deleteRangeHost(t, c.kind, c.reach, nil)
			host.mu.Lock()
			host.prerollReader = role
			host.mu.Unlock()
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapPunchPreroll)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("punch_preroll support = %+v, want reason %s", support, c.reason)
			}
			if got := bindingAnswer[PunchPrerollResult](t)(host.DawPunchPreroll()); got != (PunchPrerollResult{Message: support.Message}) {
				t.Fatalf("DawPunchPreroll = %+v", got)
			}
			if role.reads != 0 {
				t.Fatalf("the role was asked %d times", role.reads)
			}
		})
	}
}

// With the narrator's settings untouched and REAPER answering, REAPER's pre-roll reads: no setting stands in front of
// punch_preroll (the owner's decisions on #2251).
func TestDawPunchPrerollReadsByDefault(t *testing.T) {
	role := &fakePrerollReader{held: dawport.PunchPreroll{OnRecord: true, Measures: 2, MeasureSeconds: 2}}
	host := deleteRangeHost(t, "REAPER", liveReachability(), nil)
	host.mu.Lock()
	host.prerollReader = role
	host.mu.Unlock()
	got := bindingAnswer[PunchPrerollResult](t)(host.DawPunchPreroll())
	if !got.OK || !got.OnRecord || got.Measures != 2 || got.MeasureSeconds != 2 || role.reads != 1 {
		t.Fatalf("DawPunchPreroll on default settings = %+v after %d reads; want the pre-roll, read once", got, role.reads)
	}
}

// TestDawPunchPrerollContractGoldenIsCurrent pins the binding's answers: REAPER's pre-roll on record at 1.5 measures, and the
// capability's refusal. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-punch-preroll-*.json.
func TestDawPunchPrerollContractGoldenIsCurrent(t *testing.T) {
	role := &fakePrerollReader{held: dawport.PunchPreroll{OnRecord: true, Measures: 1.5, MeasureSeconds: 2}}
	contractfile.Check(t, "daw-punch-preroll-held", dawPunchPrerollIn(t.Context(), "REAPER", available(), role))
	refused := dawport.Support{Message: "REAPER is not answering. Check that REAPER is open, then try again."}
	contractfile.Check(t, "daw-punch-preroll-refused", dawPunchPrerollIn(t.Context(), "REAPER", refused, role))
}
