package main

import (
	"context"
	"errors"
	"maps"
	"reflect"
	"slices"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/daw"
	"desktop/internal/dawport"
)

// DawMonitorLevel and DawSetMonitorLevel. What REAPER does is narration_levels.lua's (levels_test.lua) and what the role answers is
// dawport/reaper's (monitor_level_test.go). These cover the host's wiring: the level checked first, the resolver, the role's answers
// and the sentence each refusal gets.

type fakeMonitorLeveler struct {
	reads int
	sets  []int
	level int
	err   error
}

func (f *fakeMonitorLeveler) MonitorLevel(context.Context) (int, error) {
	f.reads++
	return f.level, f.err
}

func (f *fakeMonitorLeveler) SetMonitorLevel(_ context.Context, level int) (int, error) {
	f.sets = append(f.sets, level)
	return f.level, f.err
}

func intPtr(n int) *int { return &n }

// A read and a set are the role's answer as ok, the set passing the level on as given; the level the role read back is the one
// reported.
func TestDawMonitorLevelPassesOnTheRolesLevel(t *testing.T) {
	role := &fakeMonitorLeveler{level: 70}
	if got := dawMonitorLevelIn(t.Context(), "REAPER", available(), role, nil); got != (MonitorLevelResult{OK: true, Level: 70}) || role.reads != 1 || len(role.sets) != 0 {
		t.Errorf("read = %+v (reads %d, sets %v)", got, role.reads, role.sets)
	}
	role.level = 41
	if got := dawMonitorLevelIn(t.Context(), "REAPER", available(), role, intPtr(40)); got != (MonitorLevelResult{OK: true, Level: 41}) || !reflect.DeepEqual(role.sets, []int{40}) {
		t.Errorf("set = %+v (sets %v); want the level read back, 41", got, role.sets)
	}
	for _, edge := range []int{0, 100} {
		role.level = edge
		if got := dawMonitorLevelIn(t.Context(), "REAPER", available(), role, intPtr(edge)); got != (MonitorLevelResult{OK: true, Level: edge}) {
			t.Errorf("set %d = %+v", edge, got)
		}
	}
}

// Every way the role can fail is ok false with level 0 and a sentence, never a Go error and never a half answer.
func TestDawMonitorLevelRefusesInASentence(t *testing.T) {
	scripts := &bridge.RefusalError{Sentence: "The master track has no hardware output to set the monitor level on."}
	for name, c := range map[string]struct {
		err      error
		contains string
	}{
		"the script's sentence": {scripts, "no hardware output"},
		"not answering":         {bridge.ErrNoAnswer, "is not answering"},
		"not connected":         {bridge.ErrUnavailable, "is not connected"},
		"old script":            {bridge.ErrScriptOutdated, "older than this app"},
		"timeout":               {context.DeadlineExceeded, "did not answer"},
		"anything else":         {errors.New("boom"), "boom"},
	} {
		for _, set := range []*int{nil, intPtr(50)} {
			got := dawMonitorLevelIn(t.Context(), "REAPER", available(), &fakeMonitorLeveler{level: 55, err: c.err}, set)
			if got.OK || got.Level != 0 || got.Message == "" || !strings.Contains(strings.ToLower(got.Message), c.contains) {
				t.Errorf("%s (set %v): %+v; want a refusal containing %q", name, set != nil, got, c.contains)
			}
		}
	}
	for _, level := range []int{-1, 101} {
		if got := dawMonitorLevelIn(t.Context(), "REAPER", available(), &fakeMonitorLeveler{level: level}, nil); got.OK || got.Level != 0 || got.Message == "" {
			t.Errorf("a role answering %d = %+v; want a refusal", level, got)
		}
	}
	if got := dawMonitorLevelIn(t.Context(), "REAPER", available(), nil, intPtr(50)); got.OK || got.Level != 0 || got.Message == "" {
		t.Errorf("no role = %+v", got)
	}
}

// The capability's own refusal is checked first, in its own sentence, and the role is not asked.
func TestDawMonitorLevelRefusesWithTheResolversSentenceAndAsksNothing(t *testing.T) {
	for name, c := range map[string]struct {
		kind   string
		reach  *daw.Reachability
		reason dawport.Reason
	}{
		"standalone":    {"", liveReachability(), dawport.ReasonStandalone},
		"not answering": {"REAPER", daw.NewReachability(nil), dawport.ReasonNotRunning},
	} {
		t.Run(name, func(t *testing.T) {
			role := &fakeMonitorLeveler{level: 70}
			host := deleteRangeHost(t, c.kind, c.reach, nil)
			host.mu.Lock()
			host.monitorLeveler = role
			host.mu.Unlock()
			resolver, _ := host.dawResolverFor(host.services())
			support := resolver.Support(dawport.CapMonitorLevel)
			if support.Available || support.Reason != c.reason {
				t.Fatalf("monitor_level support = %+v, want reason %s", support, c.reason)
			}
			want := MonitorLevelResult{Message: support.Message}
			if got := bindingAnswer[MonitorLevelResult](t)(host.DawMonitorLevel()); got != want {
				t.Fatalf("DawMonitorLevel = %+v; want %+v", got, want)
			}
			if got := bindingAnswer[MonitorLevelResult](t)(host.DawSetMonitorLevel(30)); got != want {
				t.Fatalf("DawSetMonitorLevel = %+v; want %+v", got, want)
			}
			if role.reads != 0 || len(role.sets) != 0 {
				t.Fatalf("the role was asked: %d reads, sets %v", role.reads, role.sets)
			}
		})
	}
}

// A level outside 0 to 100 is an error and nothing is asked or sent, whatever the launch.
func TestDawSetMonitorLevelRefusesALevelOutsideTheScale(t *testing.T) {
	role := &fakeMonitorLeveler{level: 70}
	host := deleteRangeHost(t, "REAPER", liveReachability(), nil)
	host.mu.Lock()
	host.monitorLeveler = role
	host.mu.Unlock()
	for _, level := range []int{-1, 101, 1 << 40, -1 << 40} {
		if raw, err := host.DawSetMonitorLevel(level); err == nil {
			t.Errorf("level %d = %q; want an error", level, raw)
		}
	}
	if role.reads != 0 || len(role.sets) != 0 {
		t.Fatalf("the role was asked: %d reads, sets %v", role.reads, role.sets)
	}
}

// TestDawMonitorLevelContractGoldenIsCurrent pins the bindings' answers: a level read or set, and a refusal. UPDATE_CONTRACTS=1
// rewrites tests/fixtures/contracts/daw-monitor-level-*.json.
func TestDawMonitorLevelContractGoldenIsCurrent(t *testing.T) {
	refusedCapability := dawport.Support{Message: "REAPER is not answering. Check that REAPER is open, then try again."}
	cases := map[string]struct {
		support dawport.Support
		role    *fakeMonitorLeveler
	}{
		"daw-monitor-level-ok":      {available(), &fakeMonitorLeveler{level: 70}},
		"daw-monitor-level-refused": {refusedCapability, &fakeMonitorLeveler{level: 70}},
	}
	for _, name := range slices.Sorted(maps.Keys(cases)) {
		c := cases[name]
		t.Run(name, func(t *testing.T) {
			contractfile.Check(t, name, dawMonitorLevelIn(t.Context(), "REAPER", c.support, c.role, nil))
		})
	}
}
