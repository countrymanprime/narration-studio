package pickups

import (
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport/reaper"
)

// pickupListRole wraps client in the REAPER adapter and takes its PickupList role, the way the composition root does
// (apps/desktop/app.go), so these tests exercise the real bridge round trip through the same port the service now
// depends on.
func pickupListRole(t *testing.T, client *bridge.Client) dawport.PickupList {
	t.Helper()
	adapter, err := reaper.New(client, nil)
	if err != nil {
		t.Fatal(err)
	}
	role, ok := adapter.Role(dawport.CapPickups).(dawport.PickupList)
	if !ok {
		t.Fatal("the REAPER adapter did not return a PickupList role")
	}
	return role
}

func testService(t *testing.T) (*Service, string) {
	t.Helper()
	session := t.TempDir()
	client, err := bridge.New(session)
	if err != nil {
		t.Fatal(err)
	}
	return New(Config{SessionDir: session}, pickupListRole(t, client), nil), session
}

func firstCommand(t *testing.T, session string) string {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(session, "commands"))
	if err != nil || len(entries) != 1 {
		t.Fatalf("commands = %#v, %v", entries, err)
	}
	bytes, err := os.ReadFile(filepath.Join(session, "commands", entries[0].Name()))
	if err != nil {
		t.Fatal(err)
	}
	return string(bytes)
}

func appendEvents(t *testing.T, session string, lines ...string) {
	t.Helper()
	file, err := os.OpenFile(filepath.Join(session, "events.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = file.Close() }()
	if _, err := file.WriteString(strings.Join(lines, "\n") + "\n"); err != nil {
		t.Fatal(err)
	}
}

func TestImportWritesTheExactPayloadAndBridgeContract(t *testing.T) {
	service, session := testService(t)
	rows := []Row{{Start: 1.5, Tag: "narrator", Note: "Mispronounced"}, {Start: 9.25, Note: "Second pickup"}}
	if err := service.Import(rows); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	if state["phase"] != "importing" || state["runId"] == nil {
		t.Fatalf("unexpected import state: %#v", state)
	}
	runID := state["runId"].(string)
	command := firstCommand(t, session)
	if !strings.HasPrefix(command, "1|import_pickups|"+runID+"|") {
		t.Fatalf("command = %q", command)
	}
	payload, err := os.ReadFile(filepath.Join(session, "pickups_import_"+runID+".txt"))
	if err != nil {
		t.Fatal(err)
	}
	want := "1.500000|narrator|Mispronounced\n9.250000||Second pickup\n"
	if string(payload) != want {
		t.Fatalf("payload = %q, want %q", payload, want)
	}
}

func TestImportRejectsAnEmptyRowList(t *testing.T) {
	service, _ := testService(t)
	if err := service.Import(nil); err == nil || !strings.Contains(err.Error(), "select at least one pickup") {
		t.Fatalf("err = %v", err)
	}
}

func TestImportWithoutABridgeFails(t *testing.T) {
	service := New(Config{SessionDir: t.TempDir()}, nil, nil)
	if err := service.Import([]Row{{Start: 1, Note: "x"}}); err == nil || !strings.Contains(err.Error(), "REAPER bridge is unavailable") {
		t.Fatalf("err = %v", err)
	}
}

func TestHandleImportedReportsCountsThenSucceeds(t *testing.T) {
	service, session := testService(t)
	if err := service.Import([]Row{{Start: 1, Note: "x"}}); err != nil {
		t.Fatal(err)
	}
	runID := service.Snapshot()["runId"].(string)
	appendEvents(t, session, "PICKUPS_IMPORTED|"+runID+"|2|1|0")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	if state["phase"] != "success" {
		t.Fatalf("phase = %v, want success: %#v", state["phase"], state)
	}
	report := state["importReport"].(map[string]any)
	if report["added"] != float64(2) || report["existing"] != float64(1) || report["invalid"] != float64(0) {
		t.Fatalf("importReport = %#v", report)
	}
	if state["message"] != "Imported 2 pickups, 1 already there." {
		t.Fatalf("message = %v", state["message"])
	}
}

func TestExportWritesTheExactBridgeContractThenBuildsCSV(t *testing.T) {
	service, session := testService(t)
	if err := service.Export(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	runID := state["runId"].(string)
	command := firstCommand(t, session)
	if !strings.HasPrefix(command, "1|export_pickups|"+runID+"|") {
		t.Fatalf("command = %q", command)
	}
	path := filepath.Join(session, "pickups_export_"+runID+".txt")
	payload := "1.500000|narrator|Mispronounced\n9.250000||Second pickup, with a comma\n"
	if err := os.WriteFile(path, []byte(payload), 0o600); err != nil {
		t.Fatal(err)
	}
	appendEvents(t, session, "PICKUPS_EXPORTED|"+runID+"|"+bridge.PercentEncode(path)+"|2")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	state = service.Snapshot()
	if state["phase"] != "success" || state["message"] != "Exported 2 pickups." {
		t.Fatalf("state = %#v", state)
	}
	csvText := state["csv"].(string)
	if !strings.Contains(csvText, "start,note,tag") || !strings.Contains(csvText, "1.500000,Mispronounced,narrator") {
		t.Fatalf("csv = %q", csvText)
	}
	if !strings.Contains(csvText, `"Second pickup, with a comma"`) {
		t.Fatalf("csv did not quote a field containing a comma: %q", csvText)
	}
}

func TestNextWritesTheExactBridgeContractThenReportsThePosition(t *testing.T) {
	service, session := testService(t)
	if err := service.Next(); err != nil {
		t.Fatal(err)
	}
	runID := service.Snapshot()["runId"].(string)
	command := firstCommand(t, session)
	if command != "1|next_pickup|"+runID+"\n" {
		t.Fatalf("command = %q", command)
	}
	appendEvents(t, session, "PICKUP_NEXT|"+runID+"|9.25|narrator|Mispronounced")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	next := state["next"].(map[string]any)
	if next["position"] != 9.25 || next["tag"] != "narrator" || next["note"] != "Mispronounced" {
		t.Fatalf("next = %#v", next)
	}
}

func TestResolveSendsThePositionThenReportsTheResolvedPickup(t *testing.T) {
	service, session := testService(t)
	if err := service.Resolve(9.25); err != nil {
		t.Fatal(err)
	}
	runID := service.Snapshot()["runId"].(string)
	command := firstCommand(t, session)
	if command != "1|resolve_pickup|"+runID+"|9.250000\n" {
		t.Fatalf("command = %q", command)
	}
	appendEvents(t, session, "PICKUP_RESOLVED|"+runID+"|9.25|narrator|Mispronounced")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	resolved := state["resolved"].(map[string]any)
	if resolved["position"] != 9.25 || resolved["note"] != "Mispronounced" {
		t.Fatalf("resolved = %#v", resolved)
	}
}

func TestCountReportsRemainingAndTotal(t *testing.T) {
	service, session := testService(t)
	if err := service.Count(); err != nil {
		t.Fatal(err)
	}
	runID := service.Snapshot()["runId"].(string)
	appendEvents(t, session, "PICKUPS_COUNTED|"+runID+"|3|5")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	if state["remaining"] != float64(3) || state["total"] != float64(5) {
		t.Fatalf("state = %#v", state)
	}
}

func TestARunsCountsSurviveIntoTheNextRunUntilItReportsItsOwn(t *testing.T) {
	service, session := testService(t)
	if err := service.Count(); err != nil {
		t.Fatal(err)
	}
	runID := service.Snapshot()["runId"].(string)
	appendEvents(t, session, "PICKUPS_COUNTED|"+runID+"|3|5")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	if err := service.Next(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	if state["remaining"] != float64(3) || state["total"] != float64(5) {
		t.Fatalf("counts did not survive into the next run: %#v", state)
	}
}

func TestDrainSharesTheBridgeWithAnotherConsumerWithoutLosingOrStealingEvents(t *testing.T) {
	service, session := testService(t)
	if err := service.Count(); err != nil {
		t.Fatal(err)
	}
	runID := service.Snapshot()["runId"].(string)
	var others []string
	service.role.Subscribe(bridge.Subscription{
		Tags:   []string{"COMPARE_*"},
		Owns:   func(id string) bool { return id == "compare-1" },
		Handle: func(event bridge.Event) { others = append(others, event.Tag+"|"+event.RunID) },
	})
	appendEvents(t, session,
		"PICKUPS_COUNTED|"+runID+"|1|2",
		"COMPARE_INSPECTED|compare-1|1%20discrepancy%20found.|1|0",
	)
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	if state["phase"] != "success" {
		t.Fatalf("this service must still get its own events: %#v", state)
	}
	if want := []string{"COMPARE_INSPECTED|compare-1"}; len(others) != 1 || others[0] != want[0] {
		t.Fatalf("the other consumer got %v, want %v", others, want)
	}
}

func TestAnErrorForTheRunInProgressReachesTheState(t *testing.T) {
	service, session := testService(t)
	if err := service.Import([]Row{{Start: 1, Note: "x"}}); err != nil {
		t.Fatal(err)
	}
	runID := service.Snapshot()["runId"].(string)
	appendEvents(t, session, "ERROR|"+runID+"|This%20REAPER%20version%20cannot%20add%20markers.")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	if state["phase"] != "error" || state["message"] != "This REAPER version cannot add markers." {
		t.Fatalf("state = %#v", state)
	}
}

func TestAnErrorForAnotherRunIsNotShownAsThisRunsError(t *testing.T) {
	service, session := testService(t)
	if err := service.Count(); err != nil {
		t.Fatal(err)
	}
	appendEvents(t, session, "ERROR|some-other-run|Some%20other%20runs%20problem.")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	if state := service.Snapshot(); state["phase"] != "counting" {
		t.Fatalf("a stale run's error changed the current run: %#v", state)
	}
}

func TestDrainWithoutABridgeIsANoOp(t *testing.T) {
	service := New(Config{SessionDir: t.TempDir()}, nil, nil)
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
}

// reopen-and-list-roundtrip-on-the-service (SN-D44): Reopen sends reopen_pickup and ends on PICKUP_REOPENED.
func TestReopenSendsThePositionThenEndsOnReopened(t *testing.T) {
	service, session := testService(t)
	if err := service.Reopen(9.25); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	runID := state["runId"].(string)
	if state["phase"] != "reopening" {
		t.Fatalf("phase = %v, want reopening", state["phase"])
	}
	if command := firstCommand(t, session); command != "1|reopen_pickup|"+runID+"|9.250000\n" {
		t.Fatalf("command = %q", command)
	}
	appendEvents(t, session, "PICKUP_REOPENED|"+runID+"|9.25|narrator|Mispronounced")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	if state := service.Snapshot(); state["phase"] != "success" || state["message"] != "Marked this pickup open again." {
		t.Fatalf("state = %#v", state)
	}
}

func TestReopenRefusesABadPositionBeforeSendingAnything(t *testing.T) {
	for _, position := range []float64{-1, math.NaN(), math.Inf(1)} {
		service, session := testService(t)
		if err := service.Reopen(position); err == nil || !strings.Contains(err.Error(), "pickup position") {
			t.Fatalf("Reopen(%v) = %v", position, err)
		}
		if entries, _ := os.ReadDir(filepath.Join(session, "commands")); len(entries) != 0 {
			t.Fatalf("Reopen(%v) sent %d commands", position, len(entries))
		}
		if state := service.Snapshot(); state["phase"] != "idle" {
			t.Fatalf("Reopen(%v) left phase %v", position, state["phase"])
		}
	}
}

func TestReopenAndListWithoutABridgeFail(t *testing.T) {
	service := New(Config{SessionDir: t.TempDir()}, nil, nil)
	if err := service.Reopen(1); err == nil || !strings.Contains(err.Error(), "REAPER bridge is unavailable") {
		t.Fatalf("Reopen err = %v", err)
	}
	if err := service.ListMarkers(); err == nil || !strings.Contains(err.Error(), "REAPER bridge is unavailable") {
		t.Fatalf("ListMarkers err = %v", err)
	}
}

// listRun starts ListMarkers and returns its run id and the output path it sent.
func listRun(t *testing.T, service *Service, session string) (string, string) {
	t.Helper()
	if err := service.ListMarkers(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	runID := state["runId"].(string)
	if state["phase"] != "listing" {
		t.Fatalf("phase = %v, want listing", state["phase"])
	}
	path := filepath.Join(session, "pickups_markers_"+runID+".txt")
	if command := firstCommand(t, session); command != "1|"+bridge.EncodeFields([]string{"list_pickup_markers", runID, path})+"\n" {
		t.Fatalf("command = %q", command)
	}
	return runID, path
}

func TestListMarkersReadsTheFileBackIntoTheState(t *testing.T) {
	service, session := testService(t)
	runID, path := listRun(t, service, session)
	content := "1.500000|open|narrator|Mispronounced\n9.250000|done||Fix this | now\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	appendEvents(t, session, "PICKUP_MARKERS_LISTED|"+runID+"|"+path+"|1|1")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	if state["phase"] != "success" || state["message"] != "Read 2 pickup markers: 1 open, 1 done." {
		t.Fatalf("state = %#v", state)
	}
	want := []any{
		map[string]any{"start": 1.5, "state": "open", "tag": "narrator", "note": "Mispronounced"},
		map[string]any{"start": 9.25, "state": "done", "tag": "", "note": "Fix this | now"},
	}
	if got := state["markers"]; !reflect.DeepEqual(got, want) {
		t.Fatalf("markers = %#v, want %#v", got, want)
	}
}

func TestListMarkersNeverTrustsTheFile(t *testing.T) {
	service, session := testService(t)
	runID, path := listRun(t, service, session)
	content := strings.Join([]string{
		"2.000000|open||Kept",
		"-1.000000|open||Negative start",
		"nan|done||Not a number",
		"3.000000|maybe||Unknown state word",
		"4.000000|done|a|",
		"5.000000|open",
		"6.000000|done|tag|Kept too\r",
	}, "\n") + "\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	appendEvents(t, session, "PICKUP_MARKERS_LISTED|"+runID+"|"+path+"|1|1")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	markers := state["markers"].([]any)
	if len(markers) != 2 || markers[0].(map[string]any)["note"] != "Kept" || markers[1].(map[string]any)["note"] != "Kept too" {
		t.Fatalf("markers = %#v", markers)
	}
	if state["phase"] != "success" || state["message"] != "Read 2 pickup markers: 1 open, 1 done. 5 unreadable lines skipped." {
		t.Fatalf("state = %#v", state)
	}
}

func TestListMarkersWithAMissingFileIsASentence(t *testing.T) {
	service, session := testService(t)
	runID, path := listRun(t, service, session)
	appendEvents(t, session, "PICKUP_MARKERS_LISTED|"+runID+"|"+path+"|0|0")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	if state["phase"] != "error" || !strings.HasPrefix(state["message"].(string), "Could not read the pickup markers REAPER listed") {
		t.Fatalf("state = %#v", state)
	}
	if markers := state["markers"].([]any); len(markers) != 0 {
		t.Fatalf("markers = %#v", markers)
	}
}

func TestListMarkersReadsOnlyThePathItAskedFor(t *testing.T) {
	service, session := testService(t)
	runID, _ := listRun(t, service, session)
	elsewhere := filepath.Join(t.TempDir(), "other.txt")
	if err := os.WriteFile(elsewhere, []byte("1.000000|open||Planted\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	appendEvents(t, session, "PICKUP_MARKERS_LISTED|"+runID+"|"+elsewhere+"|1|0")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	state := service.Snapshot()
	if state["phase"] != "error" || len(state["markers"].([]any)) != 0 {
		t.Fatalf("state = %#v", state)
	}
}

func TestListMarkersRefusedByREAPERIsASentence(t *testing.T) {
	service, session := testService(t)
	runID, _ := listRun(t, service, session)
	appendEvents(t, session, "ERROR|"+runID+"|Could%20not%20write%20the%20pickup%20list.")
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	if state := service.Snapshot(); state["phase"] != "error" || state["message"] != "Could not write the pickup list." {
		t.Fatalf("state = %#v", state)
	}
}

func TestTheIdleStateCarriesAnEmptyMarkerList(t *testing.T) {
	state := New(Config{SessionDir: t.TempDir()}, nil, nil).Snapshot()
	if markers, ok := state["markers"].([]any); !ok || len(markers) != 0 {
		t.Fatalf("markers = %#v", state["markers"])
	}
}
