package main

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/reaper"
	"github.com/countrymanprime/narration-utils/shell/internal/pickups"
)

// newTestHostWithPickups is a Host whose pickups service talks to a bridge session in a temp dir, with every state it
// would emit as "pickups:state" collected in states.
func newTestHostWithPickups(t *testing.T) (*Host, string, *[]map[string]any) {
	t.Helper()
	session := t.TempDir()
	client, err := bridge.New(session)
	if err != nil {
		t.Fatal(err)
	}
	adapter, err := reaper.New(client, nil)
	if err != nil {
		t.Fatal(err)
	}
	role, ok := adapter.Role(dawport.CapPickups).(dawport.PickupList)
	if !ok {
		t.Fatal("the REAPER adapter did not return a PickupList role")
	}
	states := &[]map[string]any{}
	service := pickups.New(pickups.Config{SessionDir: session}, role, func(state map[string]any) { *states = append(*states, state) })
	return &Host{pickups: service}, session, states
}

func sentCommandCount(t *testing.T, session string) int {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(session, "commands"))
	if err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
	return len(entries)
}

func TestPickupsReopenAndListMarkersAnswerStartedAndReportThroughTheState(t *testing.T) {
	for name, call := range map[string]func(h *Host) (string, error){
		"reopen": func(h *Host) (string, error) { return h.PickupsReopen(9.25) },
		"list":   func(h *Host) (string, error) { return h.PickupsListMarkers() },
	} {
		t.Run(name, func(t *testing.T) {
			host, session, states := newTestHostWithPickups(t)
			answer, err := call(host)
			if err != nil {
				t.Fatal(err)
			}
			var decoded map[string]any
			if err := json.Unmarshal([]byte(answer), &decoded); err != nil || len(decoded) != 1 || decoded["status"] != "started" {
				t.Fatalf("answer = %s, %v", answer, err)
			}
			if sentCommandCount(t, session) != 1 || len(*states) != 1 {
				t.Fatalf("commands = %d, states = %d; want one each", sentCommandCount(t, session), len(*states))
			}
			if phase := (*states)[0]["phase"]; phase != "reopening" && phase != "listing" {
				t.Fatalf("phase = %v", phase)
			}
		})
	}
}

func TestPickupsReopenRefusesABadPositionBeforeSending(t *testing.T) {
	for _, position := range []float64{-0.5, math.NaN(), math.Inf(-1)} {
		host, session, states := newTestHostWithPickups(t)
		if _, err := host.PickupsReopen(position); err == nil || !strings.Contains(err.Error(), "pickup position") {
			t.Fatalf("PickupsReopen(%v) = %v", position, err)
		}
		if sentCommandCount(t, session) != 0 || len(*states) != 0 {
			t.Fatalf("PickupsReopen(%v) sent %d commands and %d states", position, sentCommandCount(t, session), len(*states))
		}
	}
}

func TestPickupsReopenAndListMarkersWithNoServiceSayWhatTheNeighboursSay(t *testing.T) {
	host := &Host{}
	_, neighbour := host.PickupsResolve(1)
	for name, call := range map[string]func() (string, error){
		"reopen": func() (string, error) { return host.PickupsReopen(1) },
		"list":   host.PickupsListMarkers,
	} {
		if _, err := call(); err == nil || err.Error() != neighbour.Error() {
			t.Errorf("%s with no service = %v, want %v", name, err, neighbour)
		}
	}
}

func TestPickupsStateWithNoServiceCarriesAnEmptyMarkerList(t *testing.T) {
	answer, err := (&Host{}).PickupsState()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(answer, `"markers":[]`) {
		t.Fatalf("PickupsState = %s", answer)
	}
}
