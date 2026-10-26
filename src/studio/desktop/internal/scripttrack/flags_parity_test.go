package scripttrack

import (
	"encoding/json"
	"testing"

	"desktop/internal/compare"
)

// The flagging tracker is held to what flags.py answered over every run in tests/fixtures/booth-parity/flag-sessions.jsonl
// (a session of tracker-sessions.jsonl and a heading length), against flag-sessions.golden.jsonl (frozen).

func flagJSON(f FlagEvent) compare.PyObject {
	return compare.PyObject{"type": "flag", "id": f.ID, "kind": f.Kind, "start": f.Start, "end": f.End, "heard": f.Heard}
}

func flagRun(t *testing.T, session sessionInput, heading int) string {
	t.Helper()
	tracker := NewFlagging(session.Tokens, heading)
	outs := []any{}
	for _, op := range session.Ops {
		now, _ := ParseNum(op.Now)
		var positions []Position
		var flags []FlagEvent
		switch op.Op {
		case "feed":
			event, err := ParseEvent(op.Event)
			if err != nil {
				t.Fatal(err)
			}
			positions, flags = tracker.Feed(event, now.Value())
		case "tick":
			positions = tracker.Tick(now.Value())
		default:
			positions = tracker.ResetTo(op.Word, now.Value())
		}
		events := []any{}
		for _, p := range positions {
			events = append(events, positionJSON(p))
		}
		for _, f := range flags {
			events = append(events, flagJSON(f))
		}
		outs = append(outs, events)
	}
	return compare.DumpPy(compare.PyObject{"outs": outs}, true)
}

func TestEveryFlagRunGivesThePinnedPositionsAndFlags(t *testing.T) {
	sessions := fixture(t, "tracker-sessions.jsonl")
	runs, golden := fixture(t, "flag-sessions.jsonl"), fixture(t, "flag-sessions.golden.jsonl")
	if len(runs) != len(golden) || len(runs) < 340 {
		t.Fatalf("%d runs, %d answers", len(runs), len(golden))
	}
	headed := 0
	for k, line := range runs {
		var run struct {
			Session int `json:"session"`
			Heading int `json:"heading"`
		}
		if err := json.Unmarshal([]byte(line), &run); err != nil {
			t.Fatal(err)
		}
		var session sessionInput
		if err := json.Unmarshal([]byte(sessions[run.Session]), &session); err != nil {
			t.Fatal(err)
		}
		if run.Heading > 0 {
			headed++
		}
		if got := flagRun(t, session, run.Heading); got != golden[k] {
			t.Fatalf("run %d (session %d, heading %d) differs:\n got %.800s\nwant %.800s", k, run.Session, run.Heading, got, golden[k])
		}
	}
	if headed == 0 {
		t.Fatal("no run had a heading")
	}
}
