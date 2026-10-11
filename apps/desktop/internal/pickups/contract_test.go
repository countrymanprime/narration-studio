package pickups

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
)

// The PickupsState wire payloads apps/ui needs for its schema and mock (ADR 0069). "pickups-idle" is what
// PickupsState answers before any run; "pickups-import-success" is a completed import, so the UI's remaining-count and
// next states can be built and reviewed against a real shape. runId is time-based (newRunID), so it is fixed here the
// way lineidentity/contract_test.go fixes its own.
func stable(state map[string]any) map[string]any {
	if state["runId"] != nil {
		state["runId"] = "1790000000000000"
	}
	return state
}

func TestContractPickupsIdle(t *testing.T) {
	service := New(Config{SessionDir: t.TempDir()}, nil, nil)
	contractfile.Check(t, "pickups-idle", stable(service.Snapshot()))
}

func TestContractPickupsImportSuccess(t *testing.T) {
	session := t.TempDir()
	client, err := bridge.New(session)
	if err != nil {
		t.Fatal(err)
	}
	service := New(Config{SessionDir: session}, pickupListRole(t, client), nil)
	if err := service.Import([]Row{{Start: 1.5, Tag: "narrator", Note: "Mispronounced"}, {Start: 9.25, Note: "Second pickup"}}); err != nil {
		t.Fatal(err)
	}
	runID := service.Snapshot()["runId"].(string)
	if err := os.WriteFile(filepath.Join(session, "events.log"), []byte("PICKUPS_IMPORTED|"+runID+"|2|0|0\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "pickups-import-success", stable(service.Snapshot()))
}

// "pickups-markers-listed" is a finished ListMarkers with one open and one done marker (SN-D44), so the UI's markers schema is
// checked against a populated list, not only the empty one the other two goldens carry.
func TestContractPickupsMarkersListed(t *testing.T) {
	session := t.TempDir()
	client, err := bridge.New(session)
	if err != nil {
		t.Fatal(err)
	}
	service := New(Config{SessionDir: session}, pickupListRole(t, client), nil)
	if err := service.ListMarkers(); err != nil {
		t.Fatal(err)
	}
	runID := service.Snapshot()["runId"].(string)
	path := filepath.Join(session, "pickups_markers_"+runID+".txt")
	if err := os.WriteFile(path, []byte("1.500000|done|narrator|Mispronounced\n9.250000|open||Second pickup\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(session, "events.log"), []byte("PICKUP_MARKERS_LISTED|"+runID+"|"+path+"|1|1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.Drain(); err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "pickups-markers-listed", stable(service.Snapshot()))
}
