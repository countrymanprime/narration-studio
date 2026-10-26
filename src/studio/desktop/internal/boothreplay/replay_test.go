package boothreplay

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/layout"
	"desktop/internal/scripttrack"
)

// The reports are held to what replay.py reports (tests/fixtures/booth-parity/replay-cases.golden.jsonl, written by the
// sidecar's test_replay_parity.py) for the 40 live sessions of live-sessions.golden.jsonl, each replayed as tracker calls
// and as a printed session, and the mock recording to the committed src/studio/ui/src/api/teleprompterRecording.json.

func root(t *testing.T) string {
	working, _ := os.Getwd()
	return layout.FindRoot(working)
}

func lines(t *testing.T, path string) []string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return strings.Split(strings.TrimSuffix(string(raw), "\n"), "\n")
}

type session struct {
	Source struct {
		Text           *string `json:"text"`
		ManuscriptPath string  `json:"manuscriptPath"`
		Chapter        string  `json:"chapter"`
	} `json:"source"`
	Tracked []string `json:"tracked"`
	Clock   []string `json:"clock"`
}

func tokensOf(t *testing.T, base string, s session) []string {
	t.Helper()
	if s.Source.Text != nil {
		script, err := scripttrack.TextScript(strings.ReplaceAll(*s.Source.Text, "\r\n", "\n"), "credits", "Credits")
		if err != nil {
			t.Fatal(err)
		}
		return script.Tokens
	}
	script, err := scripttrack.LoadChapterScript(filepath.Join(base, filepath.FromSlash(s.Source.ManuscriptPath)), s.Source.Chapter)
	if err != nil {
		t.Fatal(err)
	}
	return script.Tokens
}

// clockCalls is the test's clock_calls: a tick at each chunk's clock line, a feed of each engine event at its own.
func clockCalls(t *testing.T, printed []string) string {
	t.Helper()
	var sb strings.Builder
	at := json.RawMessage("0.0")
	for _, line := range printed {
		var head struct {
			Type  string          `json:"type"`
			T     json.RawMessage `json:"t"`
			Event bool            `json:"event"`
		}
		if err := json.Unmarshal([]byte(line), &head); err != nil {
			t.Fatal(err)
		}
		switch {
		case head.Type == "clock" && head.Event:
			at = head.T
		case head.Type == "clock":
			sb.WriteString(`{"tick": ` + string(head.T) + "}\n")
		case head.Type != "level":
			sb.WriteString(`{"feed": ` + line + `, "t": ` + string(at) + "}\n")
		}
	}
	return sb.String()
}

type report struct {
	Way      string   `json:"way"`
	Script   string   `json:"script"`
	Stream   []string `json:"stream"`
	Summary  string   `json:"summary"`
	Timeline []string `json:"timeline"`
}

func TestEverySessionReplaysToThePinnedSummaryAndTimeline(t *testing.T) {
	base := root(t)
	sessions := lines(t, filepath.Join(base, "tests", "fixtures", "booth-parity", "live-sessions.golden.jsonl"))
	golden := lines(t, filepath.Join(base, "tests", "fixtures", "booth-parity", "replay-cases.golden.jsonl"))
	if len(golden) <= 2*len(sessions) || len(sessions) < 40 {
		t.Fatalf("%d sessions, %d reports", len(sessions), len(golden))
	}
	check := func(k int, want report, calls []Call, tokens []string) {
		t.Helper()
		timeline, heard, err := Run(calls, tokens)
		if err != nil {
			t.Fatal(err)
		}
		if got := Dumps(Summary(timeline, tokens, heard), 2); got != want.Summary {
			t.Fatalf("report %d (%s): the summary differs:\n got %s\nwant %s", k, want.Way, got, want.Summary)
		}
		if got := TimelineLines(timeline, tokens); len(got)+len(want.Timeline) > 0 && !reflect.DeepEqual(got, want.Timeline) {
			t.Fatalf("report %d (%s): the timeline differs:\n got %q\nwant %q", k, want.Way, got, want.Timeline)
		}
	}
	for k := 2 * len(sessions); k < len(golden); k++ {
		var want report
		if err := json.Unmarshal([]byte(golden[k]), &want); err != nil {
			t.Fatal(err)
		}
		calls, err := StreamCalls(strings.Join(want.Stream, "\n"))
		if err != nil {
			t.Fatal(err)
		}
		check(k, want, calls, scripttrack.ScriptWords(want.Script))
	}
	for k, line := range sessions {
		var s session
		if err := json.Unmarshal([]byte(line), &s); err != nil {
			t.Fatal(err)
		}
		tokens := tokensOf(t, base, s)
		fromClock, _, err := ParseCalls(clockCalls(t, s.Clock))
		if err != nil {
			t.Fatal(err)
		}
		fromStream, err := StreamCalls(strings.Join(s.Tracked, "\n"))
		if err != nil {
			t.Fatal(err)
		}
		for way, calls := range [][]Call{fromClock, fromStream} {
			var want report
			if err := json.Unmarshal([]byte(golden[2*k+way]), &want); err != nil {
				t.Fatal(err)
			}
			check(2*k+way, want, calls, tokens)
		}
	}
}

// decodeExact decodes JSON with every number kept as written.
func decodeExact(t *testing.T, text string) any {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader([]byte(text)))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		t.Fatal(err)
	}
	return value
}

func TestTheMockRecordingsCallsGiveTheCommittedRecording(t *testing.T) {
	base := root(t)
	raw, err := os.ReadFile(filepath.Join(base, "tests", "fixtures", "booth-parity", "mock-calls.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	calls, tokens, err := ParseCalls(string(raw))
	if err != nil || len(tokens) == 0 {
		t.Fatalf("%v, %d tokens", err, len(tokens))
	}
	timeline, _, err := Run(calls, tokens)
	if err != nil {
		t.Fatal(err)
	}
	committed, err := os.ReadFile(filepath.Join(base, "src", "studio", "ui", "src", "api", "teleprompterRecording.json"))
	if err != nil {
		t.Fatal(err)
	}
	// The committed file is Prettier's layout of what the recorder writes: the same JSON, number for number.
	if got := MockRecording(timeline, tokens); !reflect.DeepEqual(decodeExact(t, got), decodeExact(t, string(committed))) {
		t.Fatal("the mock recording differs from teleprompterRecording.json")
	}
	if stats := MockStats(timeline, tokens); !strings.Contains(stats, `"final_status": "done"`) || !strings.Contains(stats, `"backward_moves": `) {
		t.Fatalf("stats %s", stats)
	}
}
