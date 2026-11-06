package teleprompter

import (
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
