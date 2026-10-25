package boothreplay

import (
	"encoding/json"
	"math"
	"reflect"
	"slices"
	"strings"
	"testing"

	"desktop/internal/scripttrack"
)

// The tracker and report half of the sidecar's test_replay.py, ported when replay.py's tracking moved here. replay.py
// keeps the event layer (replay_events: recorded Moonshine records to engine events), so each case's input is what
// that layer makes of the Python test's records, as `replay.py --events <records> --calls` prints it: a tick, then a
// feed of each engine event, at the wall time of the record that produced it.

// portedScript is test_replay.py's SCRIPT; its TOKENS are its ScriptWords (str.split).
const portedScript = "The old lighthouse keeper climbed the spiral stairs each evening. He lit the great lamp and watched the ships pass."

// recordedCalls are the tracker calls of each test_replay.py reading: reading is _reading(); restart, gap, clean, flagged
// and short are the records of the tests that use them.
var recordedCalls = map[string]string{
	"reading": `{"tick": 1.0}
{"feed": {"type": "partial", "segment": 0, "words": [{"word": "the", "start": 0.0, "end": 0.15}, {"word": "old", "start": 0.2, "end": 0.35}]}, "t": 1.0}
{"tick": 1.5}
{"feed": {"type": "partial", "segment": 0, "words": [{"word": "the", "start": 0.0, "end": 0.15}, {"word": "old", "start": 0.2, "end": 0.35}, {"word": "lighthouse", "start": 0.4, "end": 0.55}, {"word": "keeper", "start": 0.6, "end": 0.75}]}, "t": 1.5}
{"tick": 1.5}
{"feed": {"type": "word", "segment": 0, "word": "the", "start": 0.0, "end": 0.15}, "t": 1.5}
{"tick": 1.5}
{"feed": {"type": "word", "segment": 0, "word": "old", "start": 0.2, "end": 0.35}, "t": 1.5}
{"tick": 2.0}
{"feed": {"type": "partial", "segment": 0, "words": [{"word": "the", "start": 0.0, "end": 0.15}, {"word": "old", "start": 0.2, "end": 0.35}, {"word": "lighthouse", "start": 0.4, "end": 0.55}, {"word": "keeper", "start": 0.6, "end": 0.75}, {"word": "climbed", "start": 0.8, "end": 0.95}]}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "lighthouse", "start": 0.4, "end": 0.55}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "keeper", "start": 0.6, "end": 0.75}, "t": 2.0}
{"tick": 2.6}
{"feed": {"type": "word", "segment": 0, "word": "climbed", "start": 0.8, "end": 0.95}, "t": 2.6}
{"tick": 2.6}
{"feed": {"type": "segment_end", "segment": 0}, "t": 2.6}
`,
	"restart": `{"tick": 1.0}
{"feed": {"type": "partial", "segment": 0, "words": [{"word": "the", "start": 0.0, "end": 0.15}, {"word": "old", "start": 0.2, "end": 0.35}, {"word": "lighthouse", "start": 0.4, "end": 0.55}, {"word": "keeper", "start": 0.6, "end": 0.75}, {"word": "climbed", "start": 0.8, "end": 0.95}, {"word": "the", "start": 1.0, "end": 1.15}, {"word": "spiral", "start": 1.2, "end": 1.35}, {"word": "stairs", "start": 1.4, "end": 1.55}]}, "t": 1.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "the", "start": 0.0, "end": 0.15}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "old", "start": 0.2, "end": 0.35}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "lighthouse", "start": 0.4, "end": 0.55}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "keeper", "start": 0.6, "end": 0.75}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "climbed", "start": 0.8, "end": 0.95}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "the", "start": 1.0, "end": 1.15}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "spiral", "start": 1.2, "end": 1.35}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "stairs", "start": 1.4, "end": 1.55}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "segment_end", "segment": 0}, "t": 2.0}
{"tick": 3.0}
{"feed": {"type": "partial", "segment": 1, "words": [{"word": "the", "start": 0.0, "end": 0.15}, {"word": "old", "start": 0.2, "end": 0.35}, {"word": "lighthouse", "start": 0.4, "end": 0.55}, {"word": "keeper", "start": 0.6, "end": 0.75}, {"word": "climbed", "start": 0.8, "end": 0.95}]}, "t": 3.0}
`,
	"gap": `{"tick": 1.0}
{"feed": {"type": "partial", "segment": 0, "words": [{"word": "the", "start": 0.0, "end": 0.15}, {"word": "old", "start": 0.2, "end": 0.35}]}, "t": 1.0}
{"tick": 1.3}
{"feed": {"type": "word", "segment": 0, "word": "the", "start": 0.0, "end": 0.15}, "t": 1.3}
{"tick": 1.3}
{"feed": {"type": "word", "segment": 0, "word": "old", "start": 0.2, "end": 0.35}, "t": 1.3}
{"tick": 1.3}
{"feed": {"type": "segment_end", "segment": 0}, "t": 1.3}
{"tick": 5.0}
{"feed": {"type": "partial", "segment": 1, "words": [{"word": "lighthouse", "start": 0.0, "end": 0.15}, {"word": "keeper", "start": 0.2, "end": 0.35}]}, "t": 5.0}
`,
	"clean": `{"tick": 1.0}
{"feed": {"type": "partial", "segment": 0, "words": [{"word": "the", "start": 0.0, "end": 0.15}, {"word": "old", "start": 0.2, "end": 0.35}, {"word": "lighthouse", "start": 0.4, "end": 0.55}, {"word": "keeper", "start": 0.6, "end": 0.75}]}, "t": 1.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "the", "start": 0.0, "end": 0.15}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "old", "start": 0.2, "end": 0.35}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "lighthouse", "start": 0.4, "end": 0.55}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "keeper", "start": 0.6, "end": 0.75}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "climbed", "start": 0.8, "end": 0.95}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "the", "start": 1.0, "end": 1.15}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "spiral", "start": 1.2, "end": 1.35}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "stairs", "start": 1.4, "end": 1.55}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "each", "start": 1.6, "end": 1.75}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "evening", "start": 1.8, "end": 1.95}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "segment_end", "segment": 0}, "t": 2.0}
`,
	"flagged": `{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "the", "start": 0.0, "end": 0.15}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "old", "start": 0.2, "end": 0.35}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "lighthouse", "start": 0.4, "end": 0.55}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "keeper", "start": 0.6, "end": 0.75}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "slowly", "start": 0.8, "end": 0.95}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "climbed", "start": 1.0, "end": 1.15}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "the", "start": 1.2, "end": 1.35}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "spiral", "start": 1.4, "end": 1.55}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "chairs", "start": 1.6, "end": 1.75}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "each", "start": 1.8, "end": 1.95}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "evening", "start": 2.0, "end": 2.15}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "segment_end", "segment": 0}, "t": 2.0}
`,
	"short": `{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "the", "start": 0.0, "end": 0.15}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "old", "start": 0.2, "end": 0.35}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "word", "segment": 0, "word": "lighthouse", "start": 0.4, "end": 0.55}, "t": 2.0}
{"tick": 2.0}
{"feed": {"type": "segment_end", "segment": 0}, "t": 2.0}
`,
}

type portedSummary struct {
	FinalRead     int `json:"final_read"`
	BackwardMoves int `json:"backward_moves"`
	Jumps         []struct {
		Jump string `json:"jump"`
	} `json:"jumps"`
	WaitingEvents int `json:"waiting_events"`
	Lead          struct {
		Median *float64 `json:"median"`
		Words  int      `json:"words"`
	} `json:"speculation_lead_seconds"`
	Flags struct {
		HeardWords int                 `json:"heard_words"`
		Total      int                 `json:"total"`
		ByKind     map[string]int      `json:"by_kind"`
		Per100     map[string]*float64 `json:"per_100_heard_words"`
		List       []portedFlagRow     `json:"list"`
	} `json:"flags"`
}

type portedFlagRow struct {
	Kind   string `json:"kind"`
	Start  int    `json:"start"`
	End    int    `json:"end"`
	Script string `json:"script"`
	Heard  string `json:"heard"`
}

// replayed runs a case's calls over test_replay.py's TOKENS: the timeline, how many words were heard, and the summary.
func replayed(t *testing.T, calls []Call) ([]Timed, int, portedSummary) {
	t.Helper()
	tokens := scripttrack.ScriptWords(portedScript)
	timeline, heard, err := Run(calls, tokens)
	if err != nil {
		t.Fatal(err)
	}
	var summary portedSummary
	if err := json.Unmarshal([]byte(Dumps(Summary(timeline, tokens, heard), 2)), &summary); err != nil {
		t.Fatal(err)
	}
	return timeline, heard, summary
}

func recorded(t *testing.T, name string) []Call {
	t.Helper()
	calls, _, err := ParseCalls(recordedCalls[name])
	if err != nil {
		t.Fatal(err)
	}
	return calls
}

// printedStream is a case's engine events as a live session prints them, one a line (the --stream form of the case).
func printedStream(t *testing.T, name string) string {
	t.Helper()
	var sb strings.Builder
	for _, call := range recorded(t, name) {
		if !call.Tick {
			sb.Write(call.Event)
			sb.WriteByte('\n')
		}
	}
	return sb.String()
}

func TestTheCursorMovesAsTheRecordingProgresses(t *testing.T) {
	timeline, _, _ := replayed(t, recorded(t, "reading"))
	type reach struct {
		wall float64
		read int
	}
	speculative := []reach{}
	for _, timed := range timeline {
		if timed.Position != nil && timed.Position.Read != 0 {
			speculative = append(speculative, reach{timed.T.Value(), timed.Position.Read})
		}
	}
	if len(speculative) == 0 || speculative[0] != (reach{1.0, 2}) || speculative[len(speculative)-1].read != 5 {
		t.Fatalf("speculative positions %v", speculative)
	}
}

func TestTheSummaryReportsHowFarSpeculationLeadsConfirmation(t *testing.T) {
	_, _, summary := replayed(t, recorded(t, "reading"))
	if summary.FinalRead != 5 || summary.BackwardMoves != 0 || len(summary.Jumps) != 0 {
		t.Fatalf("summary %+v", summary)
	}
	if lead := summary.Lead; lead.Median == nil || math.Abs(*lead.Median-0.5) > 1e-9 || lead.Words != 5 {
		t.Fatalf("speculation lead %+v", lead)
	}
}

func TestTheSummaryCountsARestartAsAJumpAndABackwardMove(t *testing.T) {
	_, _, summary := replayed(t, recorded(t, "restart"))
	jumps := []string{}
	for _, jump := range summary.Jumps {
		jumps = append(jumps, jump.Jump)
	}
	if !reflect.DeepEqual(jumps, []string{"restart"}) || summary.BackwardMoves != 1 || summary.FinalRead != 5 {
		t.Fatalf("jumps %v, summary %+v", jumps, summary)
	}
}

func TestALongGapBetweenRecordsShowsUpAsAWaitingStatus(t *testing.T) {
	_, _, summary := replayed(t, recorded(t, "gap"))
	if summary.WaitingEvents != 1 || summary.FinalRead != 4 {
		t.Fatalf("summary %+v", summary)
	}
}

func TestACleanReadingHasNoFlagsAndAZeroFalseFlagRate(t *testing.T) {
	_, _, summary := replayed(t, recorded(t, "clean"))
	flags := summary.Flags
	if flags.HeardWords != 10 || flags.Total != 0 || flags.Per100["misread"] == nil || *flags.Per100["misread"] != 0.0 {
		t.Fatalf("flags %+v", flags)
	}
}

func TestTheSummaryListsEachFlagAgainstTheScriptAndRatesItPer100HeardWords(t *testing.T) {
	_, _, summary := replayed(t, recorded(t, "flagged"))
	flags := summary.Flags
	if want := map[string]int{"misread": 1, "extra": 1, "skipped": 0, "restart": 0}; !reflect.DeepEqual(flags.ByKind, want) {
		t.Fatalf("by kind %v, want %v", flags.ByKind, want)
	}
	if rate := flags.Per100["misread"]; rate == nil || math.Abs(*rate-100.0/11) > 0.01 {
		t.Fatalf("misread rate %v", rate)
	}
	want := []portedFlagRow{
		{Kind: "extra", Start: 4, End: 4, Script: "(before climbed)", Heard: "slowly"},
		{Kind: "misread", Start: 7, End: 8, Script: "stairs", Heard: "chairs"},
	}
	if !reflect.DeepEqual(flags.List, want) {
		t.Fatalf("list %+v, want %+v", flags.List, want)
	}
}

// test_replay.py's printed live session: the script and position it printed first and the stale flag it printed last are
// not engine events, so only its engine events are replayed.
const printedSession = `{"type": "script", "tokens": 3}
{"type": "position", "read": 9, "committed": 9, "status": "listening", "jump": null, "skipped": null}
{"type": "partial", "segment": 0, "words": [{"word": "the", "start": 0.0, "end": 0.2}, {"word": "old", "start": 0.3, "end": 0.5}, {"word": "lighthouse", "start": 0.6, "end": 0.8}]}
{"type": "word", "segment": 0, "word": "the", "start": 0.0, "end": 0.2}
{"type": "word", "segment": 0, "word": "old", "start": 0.3, "end": 0.5}
{"type": "word", "segment": 0, "word": "lighthouse", "start": 0.6, "end": 0.8}
{"type": "word", "segment": 0, "word": "keeper", "start": 0.8999999999999999, "end": 1.0999999999999999}
{"type": "word", "segment": 0, "word": "climbed", "start": 1.2, "end": 1.4}
{"type": "word", "segment": 0, "word": "the", "start": 1.5, "end": 1.7}
{"type": "word", "segment": 0, "word": "spiral", "start": 1.7999999999999998, "end": 1.9999999999999998}
{"type": "word", "segment": 0, "word": "chairs", "start": 2.1, "end": 2.3000000000000003}
{"type": "word", "segment": 0, "word": "each", "start": 3.0, "end": 3.2}
{"type": "segment_end", "segment": 0}
{"type": "flag", "id": 9, "kind": "extra", "start": 0, "end": 0, "heard": "stale"}
`

func TestAPrintedLiveSessionReplaysItsEngineEventsAndIgnoresWhatTheTrackerPrinted(t *testing.T) {
	calls, err := StreamCalls(printedSession)
	if err != nil {
		t.Fatal(err)
	}
	types, walls := []string{}, []float64{}
	for _, call := range calls {
		if call.Tick {
			continue
		}
		event, err := scripttrack.ParseEvent(call.Event)
		if err != nil {
			t.Fatal(err)
		}
		types, walls = append(types, event.Type), append(walls, call.T.Value())
	}
	if len(types) < 2 || types[0] != "partial" || types[1] != "word" || !slices.IsSorted(walls) {
		t.Fatalf("engine events %v at %v", types, walls)
	}
	timeline, heard, _ := replayed(t, calls)
	flags := [][2]string{}
	for _, timed := range timeline {
		if timed.Flag != nil {
			flags = append(flags, [2]string{timed.Flag.Kind, timed.Flag.Heard})
		}
	}
	if heard != 9 || !reflect.DeepEqual(flags, [][2]string{{"misread", "chairs"}}) {
		t.Fatalf("heard %d words, flags %v", heard, flags)
	}
}

// replay.py's report, `--timeline` first, for the tracker calls of a recording (--events) and for the same engine events
// printed as a live session (--stream).
func TestTheReportPrintsTheTimelineWithFlagsAndThenTheSummaryFromCallsAndFromAPrintedSession(t *testing.T) {
	fromStream, err := StreamCalls(printedStream(t, "flagged"))
	if err != nil {
		t.Fatal(err)
	}
	for way, calls := range map[string][]Call{"--events": recorded(t, "flagged"), "--stream": fromStream} {
		timeline, _, summary := replayed(t, calls)
		printed := strings.Join(TimelineLines(timeline, scripttrack.ScriptWords(portedScript)), "\n")
		if !strings.Contains(printed, "FLAG misread  7-8 script='stairs' heard='chairs'") || !strings.Contains(printed, "read=") {
			t.Fatalf("%s: timeline\n%s", way, printed)
		}
		if summary.Flags.ByKind["misread"] != 1 || summary.FinalRead != 10 {
			t.Fatalf("%s: summary %+v", way, summary)
		}
	}
}

// replay.py --stream --calls: a printed session's engine events become a tick then a feed each, for the host's tool.
func TestAPrintedSessionBecomesATickThenAFeedPerEngineEvent(t *testing.T) {
	calls, err := StreamCalls(printedStream(t, "short"))
	if err != nil {
		t.Fatal(err)
	}
	if len(calls) < 4 || !calls[0].Tick || calls[1].Tick || !calls[2].Tick || calls[3].Tick {
		t.Fatalf("calls %+v", calls)
	}
	last, err := scripttrack.ParseEvent(calls[len(calls)-1].Event)
	if err != nil || last.Type != "segment_end" {
		t.Fatalf("the last feed is %+v (%v)", last, err)
	}
}
