package teleprompter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"desktop/internal/brand"
	"desktop/internal/layout"
	"desktop/internal/scripttrack"
)

// The host follows a `--clock` session as the sidecar followed it before: tests/fixtures/booth-parity/live-sessions.golden.jsonl,
// written by the sidecar's test_clock_parity.py, holds seeded sessions run through the sidecar's real loop both ways. Relaying
// the tracked lines as before and following the clock lines in the host must send the UI the same events.

type liveSession struct {
	Source struct {
		Text           *string `json:"text"`
		ManuscriptPath string  `json:"manuscriptPath"`
		Chapter        string  `json:"chapter"`
	} `json:"source"`
	StartWord *int     `json:"startWord"`
	Seeks     [][2]int `json:"seeks"`
	Tracked   []string `json:"tracked"`
	Clock     []string `json:"clock"`
}

// sent decodes what the service sent the UI, numbers kept as written.
func sent(t *testing.T, lines []json.RawMessage) []any {
	t.Helper()
	out := make([]any, len(lines))
	for k, line := range lines {
		decoder := json.NewDecoder(bytes.NewReader(line))
		decoder.UseNumber()
		if err := decoder.Decode(&out[k]); err != nil {
			t.Fatal(err)
		}
	}
	return out
}

func recordingService() (*Service, *[]json.RawMessage) {
	lines := &[]json.RawMessage{}
	service := New(Config{}, nil, func(raw json.RawMessage) { *lines = append(*lines, raw) }, nil)
	service.state = map[string]any{"phase": "running", "message": listeningMessage, "engine": "whisper", "chapter": "c", "paused": false, "coldRead": false}
	return service, lines
}

func sessionScript(t *testing.T, root string, session liveSession) scripttrack.ChapterScript {
	t.Helper()
	if session.Source.Text != nil {
		path := filepath.Join(t.TempDir(), "credits.txt")
		if err := os.WriteFile(path, []byte(*session.Source.Text), 0o600); err != nil {
			t.Fatal(err)
		}
		script, err := scripttrack.LoadTextScript(path, "credits", "Credits")
		if err != nil {
			t.Fatal(err)
		}
		return script
	}
	script, err := scripttrack.LoadChapterScript(filepath.Join(root, filepath.FromSlash(session.Source.ManuscriptPath)), session.Source.Chapter)
	if err != nil {
		t.Fatal(err)
	}
	return script
}

func TestTheHostFollowsAClockSessionAsTheSidecarFollowedIt(t *testing.T) {
	working, _ := os.Getwd()
	root := layout.FindRoot(working)
	raw, err := os.ReadFile(filepath.Join(root, "tests", "fixtures", "booth-parity", "live-sessions.golden.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSuffix(string(raw), "\n"), "\n")
	if len(lines) < 40 {
		t.Fatalf("%d sessions", len(lines))
	}
	generated := 0
	for k, line := range lines {
		var session liveSession
		if err := json.Unmarshal([]byte(line), &session); err != nil {
			t.Fatal(err)
		}
		before, relayed := recordingService()
		for _, printed := range session.Tracked {
			before.onLine(printed)
		}

		after, followed := recordingService()
		after.startFollowing(sessionScript(t, root, session), session.StartWord)
		clocks := 0
		for _, printed := range session.Clock {
			if strings.Contains(printed, `"type": "clock"`) {
				for _, seek := range session.Seeks {
					if seek[0] == clocks {
						after.follow.seek(seek[1])
					}
				}
				clocks++
			}
			after.onLine(printed)
		}
		want, got := sent(t, *relayed), sent(t, *followed)
		if !reflect.DeepEqual(want, got) {
			for i := range min(len(want), len(got)) {
				if !reflect.DeepEqual(want[i], got[i]) {
					t.Fatalf("session %d differs at event %d of %d (%d followed):\nwant %v\n got %v", k, i, len(want), len(got), want[i], got[i])
				}
			}
			t.Fatalf("session %d: %d events relayed, %d followed", k, len(want), len(got))
		}
		if !reflect.DeepEqual(before.Snapshot(), after.Snapshot()) {
			t.Fatalf("session %d: the state differs:\nwant %v\n got %v", k, before.Snapshot(), after.Snapshot())
		}
		generated += len(got) - (len(session.Clock) - clocks)
	}
	if generated < 800 {
		t.Errorf("only %d events made by the host's follower", generated)
	}
}

func TestAClockLineIsNeverRelayedAndASessionWithoutAFollowerIgnoresIt(t *testing.T) {
	service, lines := recordingService()
	service.onLine(`{"type": "clock", "t": 0.32}`)
	if len(*lines) != 0 || service.Dropped() != 0 {
		t.Fatalf("relayed %d, dropped %d", len(*lines), service.Dropped())
	}
	service.startFollowing(scripttrack.ChapterScript{ChapterID: "c", Tokens: []string{"one", "two"}, Spans: []scripttrack.ScriptSpan{}}, nil)
	for _, line := range []string{`{"type": "clock", "t": "soon"}`, `{"type": "clock"}`, `{"type": "clock", "t": 0.0}`, `{"type": "clock", "t": 0.32}`} {
		service.onLine(line)
	}
	service.onLine(`{"type": "word", "segment": 0, "word": "one", "start": 0.0, "end": 0.2}`)
	kinds := []string{}
	for _, line := range *lines {
		kind, _ := isEvent(line)
		kinds = append(kinds, kind)
	}
	if !reflect.DeepEqual(kinds, []string{"script", "word", "position"}) {
		t.Fatalf("sent %v", kinds)
	}
}

// runFakeClockSidecar is a `--clock` sidecar: its arguments, the start's clock line, one confirmed word, then a clock line
// every 20 ms until the stop file appears.
func runFakeClockSidecar(mode string) bool {
	if mode != "clock" {
		return false
	}
	args, _ := json.Marshal(os.Args[1:])
	fmt.Printf("{\"type\":\"args\",\"args\":%s}\n", args)
	fmt.Println(`{"type": "clock", "t": 0.0}`)
	fmt.Println(`{"type": "clock", "t": 0.32}`)
	fmt.Println(`{"type": "word", "segment": 0, "word": "Ada", "start": 0.0, "end": 0.3}`)
	stopFile := flagValue(os.Args[1:], "--stop-file")
	for t := 0.64; ; t += 0.32 {
		if _, err := os.Stat(stopFile); err == nil {
			fmt.Println(`{"type": "segment_end", "segment": 0}`)
			return true
		}
		fmt.Printf("{\"type\": \"clock\", \"t\": %g}\n", t)
		time.Sleep(20 * time.Millisecond)
	}
}

func writeFollowedManuscript(t *testing.T, project string) {
	t.Helper()
	text := `{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c1", "title": "Chapter One", "subtitle": "The Lamp"}], "paragraphs": [` +
		`{"id": "p1", "chapterId": "c1", "index": 0, "text": "Ada climbed the stairs."}]}`
	if err := os.WriteFile(filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json"), []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

func (r *recorder) eventsOf(kind string) []map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := []map[string]any{}
	for _, event := range r.events {
		if event["type"] == kind {
			out = append(out, event)
		}
	}
	return out
}

func TestAChapterSessionIsFollowedByTheHostAndSeeksNeverReachTheSidecar(t *testing.T) {
	f := newFixture(t, "clock")
	writeFollowedManuscript(t, f.project)
	options := validOptions()
	options["startWord"] = "3"
	if err := f.service.Start(options); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the word's position", func() bool { return len(f.recorder.eventsOf("position")) >= 2 })
	args, _ := f.recorder.firstEvent("args")["args"].([]any)
	if !slices.Contains(args, any("--clock")) || !slices.Contains(args, any("--start-word")) {
		t.Fatalf("args %v: the sidecar must run with --clock (and still check --start-word)", args)
	}
	f.recorder.mu.Lock()
	first := f.recorder.events[0]
	f.recorder.mu.Unlock()
	if first["type"] != "script" || first["tokens"] != float64(8) {
		t.Fatalf("the first event is %v, want the host's script event with the subtitle's words", first)
	}
	// The start word (3, "Lamp") places the tracker at the start's clock line; "Ada", word 4, then moves it on.
	positions := f.recorder.eventsOf("position")
	if positions[0]["read"] != float64(3) || positions[0]["jump"] != "restart" {
		t.Fatalf("the start word's position is %v", positions[0])
	}
	if len(f.recorder.eventsOf("clock")) != 0 {
		t.Fatal("a clock line reached the UI")
	}

	if err := f.service.Seek(6); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the seek's position", func() bool {
		for _, p := range f.recorder.eventsOf("position") {
			if p["read"] == float64(6) && p["jump"] == "restart" {
				return true
			}
		}
		return false
	})
	if matches, _ := filepath.Glob(filepath.Join(f.session, "*.control")); len(matches) != 0 {
		if content := controlFileContent(t, f.session); strings.Contains(content, "seek") {
			t.Fatalf("the seek reached the sidecar: %q", content)
		}
	}
	f.service.Stop()
	waitFor(t, "the stopped phase", func() bool { return phase(f.service) == "stopped" })
}

func TestAStartWordTheHostCannotReadLeavesTheSidecarToFollow(t *testing.T) {
	f := newFixture(t, "stream")
	writeFollowedManuscript(t, f.project)
	options := validOptions()
	options["startWord"] = "٣" // Python's int() reads an Arabic-Indic three; the host leaves it to the sidecar
	if err := f.service.Start(options); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the sidecar's position", func() bool { return f.recorder.firstEvent("position") != nil })
	args, _ := f.recorder.firstEvent("args")["args"].([]any)
	if slices.Contains(args, any("--clock")) {
		t.Fatalf("args %v", args)
	}
	if err := f.service.Seek(2); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(controlFileContent(t, f.session), `"seek"`) {
		t.Fatal("the sidecar following the read did not get the seek")
	}
}

// BenchmarkFollowAnEngineEvent is the host's follow latency: from an engine event line to the position and flag events
// it causes, over every engine event of the live-session sessions, with p50 and p99 per event.
func BenchmarkFollowAnEngineEvent(b *testing.B) {
	working, _ := os.Getwd()
	root := layout.FindRoot(working)
	raw, err := os.ReadFile(filepath.Join(root, "tests", "fixtures", "booth-parity", "live-sessions.golden.jsonl"))
	if err != nil {
		b.Fatal(err)
	}
	t := &testing.T{}
	var times []time.Duration
	for b.Loop() {
		for _, line := range strings.Split(strings.TrimSuffix(string(raw), "\n"), "\n") {
			var session liveSession
			_ = json.Unmarshal([]byte(line), &session)
			follow := newFollower(sessionScript(t, root, session), session.StartWord)
			for _, printed := range session.Clock {
				kind, _ := isEvent(json.RawMessage(printed))
				switch kind {
				case clockEventType:
					var clock struct{ T float64 }
					_ = json.Unmarshal([]byte(printed), &clock)
					follow.clock(clock.T)
				case "partial", "word", "segment_end":
					start := time.Now()
					follow.event(json.RawMessage(printed))
					times = append(times, time.Since(start))
				}
			}
		}
	}
	slices.Sort(times)
	micros := func(d time.Duration) float64 { return float64(d.Nanoseconds()) / 1000 }
	b.ReportMetric(micros(times[len(times)/2]), "p50-µs/event")
	b.ReportMetric(micros(times[len(times)*99/100]), "p99-µs/event")
}
