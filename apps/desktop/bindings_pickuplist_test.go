package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/dawporttest"
	"github.com/countrymanprime/narration-utils/shell/internal/pickuplist"
	"github.com/countrymanprime/narration-utils/shell/internal/pickups"
)

func pickupsOf(t *testing.T, answer map[string]any) []map[string]any {
	t.Helper()
	raw, ok := answer["pickups"].([]any)
	if !ok {
		t.Fatalf("answer = %v", answer)
	}
	out := make([]map[string]any, 0, len(raw))
	for _, entry := range raw {
		out = append(out, entry.(map[string]any))
	}
	return out
}

func pickupBySource(t *testing.T, answer map[string]any, source string) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, p := range pickupsOf(t, answer) {
		if p["source"] == source {
			out = append(out, p)
		}
	}
	return out
}

func TestPickupListBindingsMergeTheCheckTheNotesAndTheNarratorsLines(t *testing.T) {
	f := newGapFixture(t)
	list := decodeAnswer(t)(f.host.PickupsList())
	speech := pickupBySource(t, list, "speech")
	if len(speech) != 1 || speech[0]["id"] != "speech:c-0001:"+f.gapID || speech[0]["confidence"] != nil || speech[0]["confReason"] != "no_word_scores" {
		t.Fatalf("speech = %v", speech)
	}

	// Accepting the gap makes a note; the list still has one pickup for it, now naming the note.
	accepted := decodeAnswer(t)(f.host.CoverageGapAccept("c-0001", f.gapID))
	list = decodeAnswer(t)(f.host.PickupsList())
	if got := pickupsOf(t, list); len(got) != 1 || got[0]["findingId"] != accepted["id"] {
		t.Fatalf("after accepting: %v", got)
	}

	list = decodeAnswer(t)(f.host.PickupsAdd("c-0001", 1.5, "a line read again"))
	you := pickupBySource(t, list, "you")
	if len(you) != 1 || you[0]["script"] != "a line read again" || you[0]["included"] != true {
		t.Fatalf("you = %v", you)
	}
	id := you[0]["id"].(string)
	list = decodeAnswer(t)(f.host.PickupsSetIncluded(id, false))
	if got := pickupBySource(t, list, "you"); got[0]["included"] != false {
		t.Fatalf("left out = %v", got)
	}
	list = decodeAnswer(t)(f.host.PickupsSetDone(id, true))
	if got := pickupBySource(t, list, "you"); got[0]["done"] != true || got[0]["waiting"] != false {
		t.Fatalf("done = %v", got)
	}
	list = decodeAnswer(t)(f.host.PickupsRemove(id))
	if got := pickupBySource(t, list, "you"); len(got) != 0 {
		t.Fatalf("removed = %v", got)
	}
	if _, err := os.Stat(pickuplist.File(f.project)); err != nil {
		t.Fatalf("the list file was not written: %v", err)
	}
}

func TestPickupListBindingsRefuseAPathAndAnUnknownID(t *testing.T) {
	f := newGapFixture(t)
	outside := filepath.Join(t.TempDir(), "outside.txt")
	if err := os.WriteFile(outside, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{outside, "../../etc/passwd", "speech:c-0001:nope", ""} {
		if _, err := f.host.PickupsRemove(id); err == nil {
			t.Fatalf("PickupsRemove(%q) answered", id)
		}
		if _, err := f.host.PickupsSetDone(id, true); err == nil {
			t.Fatalf("PickupsSetDone(%q) answered", id)
		}
	}
	list := decodeAnswer(t)(f.host.PickupsAdd("c-0001", 0, outside))
	for _, p := range pickupBySource(t, list, "you") {
		if strings.Contains(fmt.Sprint(p), "secret") {
			t.Fatalf("a path-shaped line was opened: %v", p)
		}
	}
	if _, err := f.host.PickupsAdd("c-9999", 0, "a line"); err == nil {
		t.Fatal("added to an unknown chapter")
	}
}

// listedMarkers answers a pickups service's ListMarkers run as REAPER would: the marker file, then the event.
func listedMarkers(t *testing.T, service *pickups.Service, session string, lines ...string) {
	t.Helper()
	if err := service.ListMarkers(); err != nil {
		t.Fatal(err)
	}
	runID, _ := service.Snapshot()["runId"].(string)
	path := filepath.Join(session, "pickups_markers_"+runID+".txt")
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	service.Handle([]string{"PICKUP_MARKERS_LISTED", runID, path, fmt.Sprint(len(lines)), "0"})
	if markers, _ := service.Snapshot()["markers"].([]any); len(markers) != len(lines) {
		t.Fatalf("markers = %v (%v)", service.Snapshot()["markers"], service.Snapshot()["message"])
	}
}

// placedGapSidecar is gapSidecar with the gap placed 1.25 s into the fixture project's one item, so the pickup has a
// position for its marker.
func placedGapSidecar() coverage.Launcher {
	inner := gapSidecar()
	return func(ctx context.Context, name string, args ...string) (coverage.Child, error) {
		child, err := inner(ctx, name, args...)
		for i := 0; i+1 < len(args); i++ {
			if args[i] == "--out" {
				raw, readErr := os.ReadFile(args[i+1])
				if readErr != nil {
					return nil, readErr
				}
				placed := strings.Replace(string(raw), `"position":null`, `"position":{"itemIndex":0,"itemGuid":"{ITEM-1}","sourceTime":1.25}`, 1)
				if writeErr := os.WriteFile(args[i+1], []byte(placed), 0o600); writeErr != nil {
					return nil, writeErr
				}
			}
		}
		return child, err
	}
}

func TestPickupsSetDoneWritesThroughTheMarkerOrWaits(t *testing.T) {
	project := coverageProject(t)
	f := gapFixture{host: coverageHost(t, project, true, placedGapSidecar()), project: project}
	if started := decodeAnswer(t)(f.host.CoverageStart("c-0001", nil)); started["status"] != "started" {
		t.Fatalf("start = %v", started)
	}
	f.host.services().coverage.Wait()
	speech := pickupBySource(t, decodeAnswer(t)(f.host.PickupsList()), "speech")
	at, placed := speech[0]["at"].(float64)
	if !placed || at != 1.25 || speech[0]["time"] != 1.25 {
		t.Fatalf("the gap has no place in the project: %v", speech[0])
	}
	id := speech[0]["id"].(string)

	// No DAW: the done state is kept and waits.
	if got := pickupsOf(t, decodeAnswer(t)(f.host.PickupsSetDone(id, true))); got[0]["done"] != true || got[0]["waiting"] != true {
		t.Fatalf("absent = %v", got)
	}

	// The DAW answers and lists the marker open: the list finishes the write through the role.
	fake := dawporttest.NewFake(dawport.KindREAPER, dawporttest.Levels(dawport.Supported))
	session := t.TempDir()
	service := pickups.New(pickups.Config{SessionDir: session}, fake.Role(dawport.CapPickups).(dawport.PickupList), nil)
	f.host.mu.Lock()
	f.host.pickups, f.host.reachability = service, fakeBackgroundHeartbeat{reachable: true}
	f.host.mu.Unlock()
	listedMarkers(t, service, session, fmt.Sprintf("%.3f|open|LINE|%s", at, "in … mind"))
	if got := pickupsOf(t, decodeAnswer(t)(f.host.PickupsList())); got[0]["done"] != true || got[0]["waiting"] != false {
		t.Fatalf("finished = %v", got)
	}
	if calls := fake.Calls(); calls[len(calls)-1] != "pickups.ResolvePickup" {
		t.Fatalf("calls = %v", calls)
	}

	// Marking it open goes through the marker; a closed transport is the refusal and nothing is stored.
	listedMarkers(t, service, session, fmt.Sprintf("%.3f|done|LINE|%s", at, "in … mind"))
	fake.Close()
	if _, err := f.host.PickupsSetDone(id, false); err == nil {
		t.Fatal("a refused write answered")
	}
	raw, err := os.ReadFile(pickuplist.File(f.project))
	if err != nil || !strings.Contains(string(raw), id) {
		t.Fatalf("a refusal changed the stored done state: %s %v", raw, err)
	}
}
