package scripttrack

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/compare"
	"desktop/internal/layout"
)

// The tracker is held to what script_tracker.py answers, in tests/fixtures/booth-parity: every recorded and synthetic
// session (tracker-sessions.jsonl) and every single call (tracker-cases.jsonl), against the .golden.jsonl beside each,
// written by src/studio/sidecars/manuscript-teleprompter/tests/test_tracker_parity.py.

func fixture(t testing.TB, name string) []string {
	t.Helper()
	working, _ := os.Getwd()
	raw, err := os.ReadFile(filepath.Join(layout.FindRoot(working), "tests", "fixtures", "booth-parity", name))
	if err != nil {
		t.Fatal(err)
	}
	return strings.Split(strings.TrimSuffix(string(raw), "\n"), "\n")
}

func intOrNone(v int) any {
	if v == None {
		return nil
	}
	return v
}

func spanJSON(span *Span) any {
	if span == nil {
		return nil
	}
	return []any{span.From, span.To}
}

func stringOrNone(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// PositionJSON is a position event as the sidecar prints it.
func positionJSON(p Position) compare.PyObject {
	return compare.PyObject{
		"type": "position", "read": p.Read, "committed": p.Committed, "status": p.Status,
		"jump": stringOrNone(p.Jump), "skipped": spanJSON(p.Skipped),
	}
}

func closedJSON(r *SegmentReading) any {
	if r == nil {
		return nil
	}
	times := []any{}
	for _, pair := range r.HeardTimes {
		if pair == nil {
			times = append(times, nil)
		} else {
			times = append(times, []any{compare.RawJSON(pair.Start.Python()), compare.RawJSON(pair.End.Python())})
		}
	}
	strs := func(words []string) []any {
		out := make([]any, len(words))
		for k, w := range words {
			out[k] = w
		}
		return out
	}
	l := r.Location
	return compare.PyObject{
		"heard": strs(r.Heard), "heardRaw": strs(r.HeardRaw), "anchor": r.Anchor, "heardTimes": times,
		"location": compare.PyObject{
			"read": l.Read, "matched": l.Matched, "jump": stringOrNone(l.Jump), "skipped": spanJSON(l.Skipped),
			"start": l.Start, "first": intOrNone(l.First),
		},
	}
}

type sessionInput struct {
	Tokens []string `json:"tokens"`
	Ops    []struct {
		Op    string          `json:"op"`
		Event json.RawMessage `json:"event"`
		Now   json.RawMessage `json:"now"`
		Word  int             `json:"word"`
	} `json:"ops"`
}

func replay(t *testing.T, line string) string {
	t.Helper()
	var session sessionInput
	if err := json.Unmarshal([]byte(line), &session); err != nil {
		t.Fatal(err)
	}
	tracker := New(session.Tokens)
	outs, closed := []any{}, []any{}
	for _, op := range session.Ops {
		now, _ := ParseNum(op.Now)
		var out []Position
		switch op.Op {
		case "feed":
			event, err := ParseEvent(op.Event)
			if err != nil {
				t.Fatal(err)
			}
			out = tracker.Feed(event, now.Value())
		case "tick":
			out = tracker.Tick(now.Value())
		default:
			out = tracker.ResetTo(op.Word, now.Value())
		}
		events := []any{}
		for _, p := range out {
			events = append(events, positionJSON(p))
		}
		outs = append(outs, events)
		closed = append(closed, closedJSON(tracker.TakeClosedSegment()))
	}
	return compare.DumpPy(compare.PyObject{"outs": outs, "closed": closed}, true)
}

func TestEveryRecordedSessionGivesThePinnedPositionsAndClosedSegments(t *testing.T) {
	inputs, golden := fixture(t, "tracker-sessions.jsonl"), fixture(t, "tracker-sessions.golden.jsonl")
	if len(inputs) != len(golden) || len(inputs) < 300 {
		t.Fatalf("%d sessions, %d answers", len(inputs), len(golden))
	}
	for k, line := range inputs {
		if got := replay(t, line); got != golden[k] {
			t.Fatalf("session %d differs:\n got %.600s\nwant %.600s", k, got, golden[k])
		}
	}
}

type caseInput struct {
	K      string   `json:"k"`
	W      string   `json:"w"`
	A      string   `json:"a"`
	B      string   `json:"b"`
	Heard  []string `json:"heard"`
	Script []string `json:"script"`
	Anchor int      `json:"anchor"`
}

func answer(t *testing.T, c caseInput) any {
	t.Helper()
	switch c.K {
	case "norm":
		return NormalizeWord(c.W)
	case "match":
		return WordsMatch(c.A, c.B)
	case "ratio":
		return compare.PyFloatRepr(compare.NewSequenceMatcher([]rune(c.A), []rune(c.B), true).Ratio())
	case "locate":
		l := Locate(c.Heard, c.Script, c.Anchor)
		return []any{l.Read, l.Matched, stringOrNone(l.Jump), spanJSON(l.Skipped), l.Start, intOrNone(l.First)}
	case "align":
		matches := []any{}
		for _, m := range Align(c.Heard, c.Script, c.Anchor) {
			matches = append(matches, intOrNone(m))
		}
		return matches
	}
	t.Fatalf("unknown case %q", c.K)
	return nil
}

func TestEverySingleCallGivesThePinnedAnswer(t *testing.T) {
	inputs, golden := fixture(t, "tracker-cases.jsonl"), fixture(t, "tracker-cases.golden.jsonl")
	if len(inputs) != len(golden) || len(inputs) < 4000 {
		t.Fatalf("%d cases, %d answers", len(inputs), len(golden))
	}
	for k, line := range inputs {
		var c caseInput
		if err := json.Unmarshal([]byte(line), &c); err != nil {
			t.Fatal(err)
		}
		if got := compare.DumpPy(compare.PyObject{"r": answer(t, c)}, true); got != golden[k] {
			t.Errorf("case %d (%s) differs:\n got %s\nwant %s", k, c.K, got, golden[k])
		}
	}
}
