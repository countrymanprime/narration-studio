package main

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	abt "desktop/internal/audacitybridge/audacitybridgetest"
)

// settledPickups drains the transcript service's Dispatch (which also delivers the pickup list's events, as it does for REAPER's one
// log) until the pickup service's run is no longer in progress, and returns its state.
func settledPickups(t *testing.T, f *audacityLinkFixture) map[string]any {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		_ = f.host.services().transcript.Drain()
		state := f.host.services().pickups.Snapshot()
		switch state["phase"] {
		case "success", "error":
			return state
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("the pickup run never ended: %v", f.host.services().pickups.Snapshot())
	return nil
}

func TestAudacityPickupsRunThroughTheHostsPickupService(t *testing.T) {
	f := newAudacityReviewHost(t)
	if _, err := f.host.PickupsImport("start,note,tag\n12.5,re-read this,proofer\n40,second one,\n"); err != nil {
		t.Fatal(err)
	}
	state := settledPickups(t, f)
	if state["phase"] != "success" || !strings.Contains(state["message"].(string), "2") || strings.Contains(state["message"].(string), "REAPER") {
		t.Fatalf("import = %v", state)
	}
	var labels []string
	f.server.With(func(p *abt.Project) {
		for _, l := range p.AllLabels() {
			labels = append(labels, l.Text)
		}
	})
	if want := []string{"[nu:pickup open] [proofer] re-read this", "[nu:pickup open] second one"}; !reflect.DeepEqual(labels, want) {
		t.Fatalf("labels = %q", labels)
	}
	if _, err := f.host.PickupsCount(); err != nil {
		t.Fatal(err)
	}
	if state = settledPickups(t, f); fmt.Sprint(state["remaining"]) != "2" || fmt.Sprint(state["total"]) != "2" {
		t.Errorf("count = %v", state)
	}
	if _, err := f.host.PickupsResolve(12.5); err != nil {
		t.Fatal(err)
	}
	if state = settledPickups(t, f); state["phase"] != "success" {
		t.Errorf("resolve = %v", state)
	}
	if _, err := f.host.PickupsListMarkers(); err != nil {
		t.Fatal(err)
	}
	state = settledPickups(t, f)
	markers, _ := state["markers"].([]any)
	if len(markers) != 2 || markers[0].(map[string]any)["state"] != "done" || markers[1].(map[string]any)["state"] != "open" {
		t.Errorf("markers = %v", state["markers"])
	}
	// Next goes from the cursor to the next open pickup.
	if _, err := f.host.PickupsNext(); err != nil {
		t.Fatal(err)
	}
	if state = settledPickups(t, f); state["phase"] != "success" {
		t.Errorf("next = %v", state)
	}
	f.server.With(func(p *abt.Project) {
		if p.SelStart != 40 {
			t.Errorf("the cursor is at %v, want 40", p.SelStart)
		}
	})
}

func TestAudacityPickupsAreGatedAndNameAudacity(t *testing.T) {
	f := newAudacityReviewHost(t)
	f.server.SetDown(true)
	f.check(t)
	if _, err := f.host.PickupsCount(); err != nil {
		t.Fatal(err)
	}
	state := settledPickups(t, f)
	if state["phase"] != "error" || strings.Contains(state["message"].(string), "REAPER") {
		t.Errorf("closed Audacity = %v", state)
	}
}
