package teleprompter

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/contractfile"
	"desktop/internal/scripttrack"
)

// The tracker half of the sidecar's test_contract_goldens.py and test_live_asr.py, ported when the Booth's follower
// moved to the host: the sidecar prints clock lines and engine events (`--clock`) and the host follows them.

// lighthouseScript is the chapter test_contract_goldens.py reads: c1 of its manuscript.
func lighthouseScript(t *testing.T) scripttrack.ChapterScript {
	t.Helper()
	manuscript := filepath.Join(t.TempDir(), "manuscript.json")
	text := `{"schemaVersion": 1, "documentId": "lighthouse", "chapters": [{"id": "c1", "title": "Chapter One", "contentKind": "narration"}], "paragraphs": [` +
		`{"id": "p1", "chapterId": "c1", "index": 0, "text": "The old lighthouse keeper climbed the spiral stairs each evening. He lit the great lamp and watched the ships pass."}, ` +
		`{"id": "p2", "chapterId": "c1", "index": 1, "text": "Far out at sea a small boat rocked in the swell."}]}`
	if err := os.WriteFile(manuscript, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
	script, err := scripttrack.LoadChapterScript(manuscript, "c1")
	if err != nil {
		t.Fatal(err)
	}
	return script
}

// lighthouseWalls is the wall time of the record each engine event of test_contract_goldens.py's reading came from
// (replay.py's replay_events over _reading()), in the order of the engine events in teleprompter-events.json.
var lighthouseWalls = []string{
	"1.0", "1.6", "1.6", "1.6", "1.6", "1.6", "2.4", "2.4", "2.4", "2.4", "2.4", "2.4", "2.4", "2.4", "3.0", "3.8", "3.8",
	"3.8", "3.8", "3.8", "3.8", "3.8", "3.8", "4.6", "5.4", "5.4", "5.4", "5.4", "5.4", "5.4", "5.4", "5.4", "5.4", "5.4",
}

// lighthouseStream is test_contract_goldens.py's _stream made by the host: the script event, then for each engine event
// of the recorded reading a tick at its wall time, the event, and what feeding it raised. The engine events are the
// ones teleprompter-events.json pins (the sidecar's event layer stays in Python).
func lighthouseStream(t *testing.T) []any {
	t.Helper()
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	pinned, err := os.ReadFile(filepath.Join(dir, "teleprompter-events.json"))
	if err != nil {
		t.Fatal(err)
	}
	var events []json.RawMessage
	if err := json.Unmarshal(pinned, &events); err != nil {
		t.Fatal(err)
	}
	service, lines := recordingService()
	service.startFollowing(lighthouseScript(t), nil)
	service.onLine(`{"type": "clock", "t": 0.0}`)
	engine := 0
	for _, event := range events {
		if kind, _ := isEvent(event); kind == "script" || kind == "position" || kind == "flag" {
			continue
		}
		if engine >= len(lighthouseWalls) {
			t.Fatalf("teleprompter-events.json holds more than the reading's %d engine events", len(lighthouseWalls))
		}
		wall := lighthouseWalls[engine]
		engine++
		service.onLine(`{"type": "clock", "t": ` + wall + `}`)
		service.onLine(`{"type": "clock", "t": ` + wall + `, "event": true}`)
		service.onLine(string(event))
	}
	if engine != len(lighthouseWalls) {
		t.Fatalf("teleprompter-events.json holds %d engine events, the reading %d", engine, len(lighthouseWalls))
	}
	return sent(t, *lines)
}

func TestTheHostsEventStreamMatchesTheCommittedContractFile(t *testing.T) {
	contractfile.Check(t, "teleprompter-events", lighthouseStream(t))
}

// A --script named with --script-id/--script-title (the credits): no title span, one paragraph span per line, no
// manuscript index.
func TestTheHostsCreditsScriptEventMatchesTheCommittedContractFile(t *testing.T) {
	script, err := scripttrack.TextScript("You have been listening to Alice, written by Lewis Carroll,\nnarrated by Ada Finch.\n\nThe End.", "credits-closing", "Closing credits")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "teleprompter-credits-script", sent(t, []json.RawMessage{compactLine(scripttrack.ScriptEvent(script))})[0])
}

func TestTheHostsStreamHoldsEveryEventTypeTheUIReads(t *testing.T) {
	kinds := map[string]bool{}
	for _, event := range lighthouseStream(t) {
		kinds[event.(map[string]any)["type"].(string)] = true
	}
	want := map[string]bool{"script": true, "position": true, "partial": true, "word": true, "segment_end": true, "flag": true}
	if !reflect.DeepEqual(kinds, want) {
		t.Fatalf("event types %v, want %v", kinds, want)
	}
}

func TestTheHostsStreamHoldsAFlagOfEveryKind(t *testing.T) {
	kinds := map[string]bool{}
	for _, event := range lighthouseStream(t) {
		if fields := event.(map[string]any); fields["type"] == "flag" {
			kinds[fields["kind"].(string)] = true
		}
	}
	// flags.py's FLAG_KINDS.
	if want := map[string]bool{"misread": true, "extra": true, "skipped": true, "restart": true}; !reflect.DeepEqual(kinds, want) {
		t.Fatalf("flag kinds %v, want %v", kinds, want)
	}
}

// followTextScript follows lines a `--clock` sidecar printed over a --script file of text, as the host does, and returns
// what it sent the UI.
func followTextScript(t *testing.T, text string, printed []string) []any {
	t.Helper()
	script, err := scripttrack.TextScript(text, "script", "Script")
	if err != nil {
		t.Fatal(err)
	}
	service, lines := recordingService()
	service.startFollowing(script, nil)
	for _, line := range printed {
		service.onLine(line)
	}
	return sent(t, *lines)
}

// wordLines is a clock line at t then the word, for each word, as a `--clock` session prints them.
func wordLines(t string, words ...string) []string {
	lines := []string{}
	for _, word := range words {
		lines = append(lines, `{"type": "clock", "t": `+t+`, "event": true}`,
			fmt.Sprintf(`{"type": "word", "segment": 0, "word": %q, "start": 0.0, "end": 0.1}`, word))
	}
	return lines
}

// test_live_asr.py's session over "The old lighthouse keeper climbed the spiral stairs each evening." from one 0.5 s
// chunk of a file, heard with "chairs" for "stairs": the clock lines and engine events its `--clock` run prints.
func TestAFollowedSessionSendsAFlagAfterTheSegmentThatRaisedIt(t *testing.T) {
	printed := []string{`{"type": "clock", "t": 0.0}`, `{"type": "clock", "t": 0.5}`}
	printed = append(printed, wordLines("0.5", "the", "old", "lighthouse", "keeper", "climbed", "the", "spiral", "chairs", "each", "evening")...)
	printed = append(printed, `{"type": "clock", "t": 0.5, "event": true}`, `{"type": "segment_end", "segment": 0}`)

	got := followTextScript(t, "The old lighthouse keeper climbed the spiral stairs each evening.", printed)

	want := sent(t, []json.RawMessage{
		json.RawMessage(`{"type": "segment_end", "segment": 0}`),
		json.RawMessage(`{"type": "flag", "id": 1, "kind": "misread", "start": 7, "end": 8, "heard": "chairs"}`),
	})
	if len(got) < 2 || !reflect.DeepEqual(got[len(got)-2:], want) {
		t.Fatalf("sent %v", got)
	}
}

// test_live_asr.py's paused session over "one two three four": two 0.5 s chunks heard, ten chunks paused, two heard. Its
// clock stands still at 1.5 while paused, so the host never reports `waiting` for the pause itself.
func TestAPausedSessionsStandingClockNeverMakesTheHostWait(t *testing.T) {
	printed := []string{`{"type": "clock", "t": 0.0}`, `{"type": "clock", "t": 0.5}`}
	printed = append(printed, wordLines("0.5", "one")...)
	printed = append(printed, `{"type": "clock", "t": 1.0}`)
	for range 11 {
		printed = append(printed, `{"type": "clock", "t": 1.5}`)
	}
	printed = append(printed, `{"type": "clock", "t": 2.0}`, `{"type": "clock", "t": 2.0, "event": true}`, `{"type": "segment_end", "segment": 0}`)

	positions := 0
	for _, event := range followTextScript(t, "one two three four", printed) {
		if fields := event.(map[string]any); fields["type"] == positionEventType {
			positions++
			if fields["status"] == "waiting" {
				t.Fatalf("the host reported waiting during a pause: %v", fields)
			}
		}
	}
	if positions == 0 {
		t.Fatal("the host sent no position at all")
	}
}

// test_live_asr.py's named --script: a credits file of two lines gives a script event with the id and title it was named
// with and one paragraph span per line.
func TestANamedScriptsEventCarriesItsNameAndASpanPerLine(t *testing.T) {
	script, err := scripttrack.TextScript("Alice, written by Lewis Carroll.\nThe End.", "credits-closing", "Closing credits")
	if err != nil {
		t.Fatal(err)
	}
	event := sent(t, []json.RawMessage{compactLine(scripttrack.ScriptEvent(script))})[0].(map[string]any)
	if chapter := event["chapter"]; !reflect.DeepEqual(chapter, map[string]any{"id": "credits-closing", "title": "Closing credits"}) {
		t.Fatalf("chapter %v", chapter)
	}
	spans := []string{}
	for _, span := range event["spans"].([]any) {
		fields := span.(map[string]any)
		spans = append(spans, fmt.Sprintf("%v %v %v", fields["id"], fields["start"], fields["count"]))
	}
	if want := []string{"credits-closing-1 0 5", "credits-closing-2 5 2"}; strings.Join(spans, ";") != strings.Join(want, ";") {
		t.Fatalf("spans %v, want %v", spans, want)
	}
}
