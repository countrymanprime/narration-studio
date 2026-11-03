package teleprompter

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"desktop/internal/scripttrack"
)

// The Booth's tracker follows a word said like the script's: the engine writes "twelve" where the manuscript has "12".
func TestTheBoothTrackerFollowsANumberTheEngineSpelledOut(t *testing.T) {
	tracker := spokenFlagging(scripttrack.ChapterScript{Tokens: []string{"We", "left", "at", "12", "sharp"}})
	var read int
	for _, word := range []string{"we", "left", "at", "twelve", "sharp"} {
		for _, p := range func() []scripttrack.Position {
			positions, _ := tracker.Feed(scripttrack.Event{Type: "word", Word: word, Segment: 1}, 1)
			return positions
		}() {
			read = p.Read
		}
	}
	if read != 5 {
		t.Fatalf("the cursor stopped at word %d of 5", read)
	}
}

// The confirmation pass's reading of a closed segment settles the flags the live reading raised, and reaches the UI only as
// flag_check lines.
func TestASegmentCheckSettlesTheFlagsOfItsSegmentAsFlagChecks(t *testing.T) {
	script := scripttrack.ChapterScript{Tokens: strings.Fields("The old lighthouse keeper climbed the spiral stairs each evening. He lit the great lamp.")}
	feed := func(f *follower, segment int, words string) (flags int) {
		f.event(json.RawMessage(fmt.Sprintf(`{"type":"partial","segment":%d,"words":[]}`, segment)))
		for k, w := range strings.Fields(words) {
			raw := fmt.Sprintf(`{"type":"word","segment":%d,"word":%q,"start":%.1f,"end":%.1f}`, segment, w, 0.3*float64(k), 0.3*float64(k)+0.2)
			for _, line := range f.event(json.RawMessage(raw)) {
				if strings.Contains(string(line), `"flag"`) && !strings.Contains(string(line), `flag_check`) {
					flags++
				}
			}
		}
		for _, line := range f.event(json.RawMessage(fmt.Sprintf(`{"type":"segment_end","segment":%d}`, segment))) {
			if strings.Contains(string(line), `"flag"`) && !strings.Contains(string(line), `flag_check`) {
				flags++
			}
		}
		return flags
	}
	checkWords := func(words string) json.RawMessage {
		parts := []string{}
		for k, w := range strings.Fields(words) {
			parts = append(parts, fmt.Sprintf(`{"word":%q,"start":%.1f,"end":%.1f}`, w, 0.3*float64(k), 0.3*float64(k)+0.2))
		}
		return json.RawMessage(`{"type":"segment_check","segment":0,"words":[` + strings.Join(parts, ",") + `]}`)
	}

	f := newFollower(script, nil)
	if raised := feed(f, 0, "the old lighthouse keeper climbed the spiral chairs each evening"); raised != 1 {
		t.Fatalf("setup: the live read raised %d flags, want 1", raised)
	}
	cleared := f.check(checkWords("the old lighthouse keeper climbed the spiral stairs each evening"))
	if len(cleared) != 1 || string(cleared[0]) != `{"type": "flag_check", "id": 1, "state": "cleared"}` {
		t.Fatalf("a check that read the script clears the flag: %s", cleared)
	}
	if again := f.check(checkWords("the old lighthouse keeper climbed the spiral chairs each evening")); len(again) != 0 {
		t.Fatalf("a segment is settled once: %s", again)
	}

	f = newFollower(script, nil)
	feed(f, 0, "the old lighthouse keeper climbed the spiral chairs each evening")
	confirmed := f.check(checkWords("the old lighthouse keeper climbed the spiral chairs each evening"))
	if len(confirmed) != 1 || string(confirmed[0]) != `{"type": "flag_check", "id": 1, "state": "confirmed"}` {
		t.Fatalf("a check that heard the same word confirms the flag: %s", confirmed)
	}
}

func TestACheckThatFailedOrCannotBeReadSettlesNothing(t *testing.T) {
	f := newFollower(scripttrack.ChapterScript{Tokens: strings.Fields("one two three four five six")}, nil)
	for _, raw := range []string{`{"type":"segment_check","segment":0,"error":"OSError: model missing"}`, `{"type":"segment_check","segment":"x","words":[]}`, `not json`, `{"type":"segment_check","segment":0,"words":[]}`} {
		if got := f.check(json.RawMessage(raw)); len(got) != 0 {
			t.Errorf("%s settled %s", raw, got)
		}
	}
}
