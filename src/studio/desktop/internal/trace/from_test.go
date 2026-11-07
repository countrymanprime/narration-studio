package trace

import (
	"encoding/json"
	"strings"
	"testing"
)

func pageRecords(t *testing.T, tracer *Tracer) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, line := range tracer.Snapshot() {
		var record map[string]any
		if err := json.Unmarshal(line, &record); err != nil {
			t.Fatal(err)
		}
		out = append(out, record)
	}
	return out
}

func TestAPageEventIsCheckedAgainstTheSameDefinitionAsAHostEvent(t *testing.T) {
	tracer := New(Options{})
	ok := tracer.EmitFromPage("ui", "binding", map[string]any{"name": "system_open_log_folder", "dur": float64(12), "outcome": "error", "err": "timeout"})
	if !ok {
		t.Fatal("a well-formed page event was refused")
	}
	records := pageRecords(t, tracer)
	if len(records) != 1 || records[0]["name"] != "system_open_log_folder" || records[0]["dur_ms"] != float64(12) || records[0]["err"] != "timeout" {
		t.Errorf("records = %v", records)
	}
}

func TestAPageCannotNameAHostEventOrAnUnknownOne(t *testing.T) {
	tracer := New(Options{})
	if tracer.EmitFromPage("daw", "reachable_changed", map[string]any{"kind": "reaper"}) {
		t.Error("a page wrote a host event")
	}
	if tracer.EmitFromPage("ui", "no_such_event", nil) {
		t.Error("a page wrote an event that is not registered")
	}
	if len(pageRecords(t, tracer)) != 0 || tracer.Dropped() != 2 {
		t.Errorf("records=%v dropped=%d, want none and two drops", pageRecords(t, tracer), tracer.Dropped())
	}
}

func TestAPageFieldOfTheWrongShapeIsDroppedAndTheRestIsKept(t *testing.T) {
	tracer := New(Options{})
	canary := "C:\\Users\\zelda\\Documents\\Secret Book.docx"
	tracer.EmitFromPage("ui", "binding", map[string]any{
		"name": canary, "dur": "fast", "outcome": "maybe", "err": "the manuscript says " + canary, "extra": canary, "secret_text": "CANARY",
	})
	tracer.EmitFromPage("ui", "nav", map[string]any{"page": "Secret Book Chapter"})
	for _, line := range tracer.Snapshot() {
		for _, banned := range []string{"zelda", "Secret", "CANARY", "manuscript", "Documents"} {
			if strings.Contains(string(line), banned) {
				t.Errorf("%q reached the trace: %s", banned, line)
			}
		}
	}
	if tracer.Dropped() < 6 {
		t.Errorf("dropped = %d, want every bad field counted", tracer.Dropped())
	}
}

func TestAPageNumberOutsideTheBoundIsRefused(t *testing.T) {
	tracer := New(Options{})
	tracer.EmitFromPage("ui", "host_event", map[string]any{"name": "teleprompter_event", "count": float64(1 << 50)})
	if got := pageRecords(t, tracer); len(got) != 1 || got[0]["count"] != nil {
		t.Errorf("record = %v, want the count dropped", got)
	}
}
