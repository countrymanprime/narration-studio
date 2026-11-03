package scripttrack

import (
	"strings"
	"testing"
)

// The trailing confirmation pass: a second engine's words for a closed segment confirm the flags that segment raised, or
// clear the ones it does not reproduce.

func checkWords(text string) []CheckedWord {
	words := []CheckedWord{}
	for k, w := range strings.Fields(text) {
		words = append(words, CheckedWord{Word: w, Start: 10 + 0.3*float64(k), End: 10 + 0.3*float64(k) + 0.2})
	}
	return words
}

const misheard = "the old lighthouse keeper climbed the spiral chairs each evening"
const read = "the old lighthouse keeper climbed the spiral stairs each evening"

func TestACheckThatHearsTheSameMisreadConfirmsItsFlag(t *testing.T) {
	tracker := flagTracker(flagScript)
	flags := readSegment(tracker, 0, misheard)
	if len(flags) != 1 {
		t.Fatalf("setup: %+v", flags)
	}

	got := tracker.Check(0, checkWords(misheard))

	if len(got) != 1 || got[0].ID != flags[0].ID || got[0].State != FlagConfirmed {
		t.Fatalf("checks = %+v, want flag %d confirmed", got, flags[0].ID)
	}
}

func TestACheckThatHearsTheScriptClearsTheFlagTheLiveEngineRaised(t *testing.T) {
	tracker := flagTracker(flagScript)
	flags := readSegment(tracker, 0, misheard)

	got := tracker.Check(0, checkWords(read))

	if len(got) != 1 || got[0].ID != flags[0].ID || got[0].State != FlagCleared {
		t.Fatalf("checks = %+v, want flag %d cleared", got, flags[0].ID)
	}
}

func TestASegmentThatRaisedNoFlagsHasNothingToCheck(t *testing.T) {
	tracker := flagTracker(flagScript)
	readSegment(tracker, 0, read)
	if got := tracker.Check(0, checkWords(misheard)); len(got) != 0 {
		t.Fatalf("a clean live read gains no flags from the check: %+v", got)
	}
}

func TestACheckThatHeardNothingChecksNothing(t *testing.T) {
	tracker := flagTracker(flagScript)
	readSegment(tracker, 0, misheard)
	if got := tracker.Check(0, nil); len(got) != 0 {
		t.Fatalf("silence says nothing about the flag: %+v", got)
	}
}

func TestACheckForAnUnknownOrAlreadyCheckedSegmentIsIgnored(t *testing.T) {
	tracker := flagTracker(flagScript)
	readSegment(tracker, 0, misheard)
	if got := tracker.Check(7, checkWords(read)); len(got) != 0 {
		t.Fatalf("unknown segment: %+v", got)
	}
	tracker.Check(0, checkWords(read))
	if got := tracker.Check(0, checkWords(read)); len(got) != 0 {
		t.Fatalf("a segment is checked once: %+v", got)
	}
}

func TestACheckLaterThanTheNextSegmentStillJudgesAgainstItsOwnAnchor(t *testing.T) {
	tracker := flagTracker(flagScript)
	flags := readSegment(tracker, 0, misheard)
	readSegment(tracker, 1, "he lit the great lamp and watched the ships pass")

	got := tracker.Check(0, checkWords(read))

	if len(got) != 1 || got[0].ID != flags[0].ID || got[0].State != FlagCleared {
		t.Fatalf("checks = %+v", got)
	}
}

func TestOnlyTheRecentSegmentsAreKeptForACheck(t *testing.T) {
	tracker := flagTracker(flagScript)
	readSegment(tracker, 0, misheard)
	for segment := 1; segment <= maxCheckedSegments+1; segment++ {
		readSegment(tracker, segment, "he lit the great lamp")
	}
	if got := tracker.Check(0, checkWords(read)); len(got) != 0 {
		t.Fatalf("the oldest segment should have been forgotten: %+v", got)
	}
}

func TestASkippedFlagIsConfirmedByACheckThatAlsoSkipsAndClearedByOneThatReadsIt(t *testing.T) {
	skipping := "the old lighthouse keeper climbed the stairs each evening"
	tracker := flagTracker(flagScript)
	flags := readSegment(tracker, 0, skipping)
	if len(flags) != 1 || flags[0].Kind != "skipped" {
		t.Fatalf("setup: %+v", flags)
	}
	if got := tracker.Check(0, checkWords(skipping)); len(got) != 1 || got[0].State != FlagConfirmed {
		t.Fatalf("same skip: %+v", got)
	}

	tracker = flagTracker(flagScript)
	readSegment(tracker, 0, skipping)
	if got := tracker.Check(0, checkWords(read)); len(got) != 1 || got[0].State != FlagCleared {
		t.Fatalf("read in full: %+v", got)
	}
}

func TestACheckWithMoreWordsThanASegmentCanHoldIsIgnored(t *testing.T) {
	tracker := flagTracker(flagScript)
	readSegment(tracker, 0, misheard)
	words := make([]CheckedWord, maxCheckedWords+1)
	for i := range words {
		words[i] = CheckedWord{Word: "word", Start: float64(i), End: float64(i) + 0.1}
	}
	if got := tracker.Check(0, words); len(got) != 0 {
		t.Fatalf("a check of %d words says nothing: %+v", len(words), got)
	}
}
