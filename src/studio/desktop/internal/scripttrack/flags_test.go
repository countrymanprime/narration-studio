package scripttrack

import (
	"math/rand"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// The flag rules one case each (the sidecar's test_flags.py): a segment is read word by word over the lighthouse
// script below and closed, and the flags it raises are compared with the ones the rules give.

const flagScript = "The old lighthouse keeper climbed the spiral stairs each evening. He lit the great lamp and watched the ships pass. Nobody ever thanked him for it."

// 0 The 1 old 2 lighthouse 3 keeper 4 climbed 5 the 6 spiral 7 stairs 8 each 9 evening.
// 10 He 11 lit 12 the 13 great 14 lamp 15 and 16 watched 17 the 18 ships 19 pass.
// 20 Nobody 21 ever 22 thanked 23 him 24 for 25 it.

// flagged is a flag event without its id.
type flagged struct {
	kind       string
	start, end int
	heard      string
}

func flagTracker(text string) *FlaggingTracker { return NewFlagging(ScriptWords(text), 0) }

func confirmed(segment int, text string, at float64) Event {
	return Event{Type: "word", Segment: float64(segment), Word: text, Times: &Times{Num{Kind: 'f', Float: at}, Num{Kind: 'f', Float: at + 0.2}}}
}

func segmentEnd(segment int) Event { return Event{Type: "segment_end", Segment: float64(segment)} }

// readSegment is a segment spoken one word every 0.3 s of audio, each confirmed in turn, and the flags it raised.
func readSegment(tracker *FlaggingTracker, segment int, text string) []FlagEvent {
	heard := strings.Fields(text)
	_, raised := tracker.Feed(Event{Type: "partial", Segment: float64(segment), Words: heard}, 0)
	for k, w := range heard {
		_, more := tracker.Feed(confirmed(segment, w, 10*float64(segment)+0.3*float64(k)), 0)
		raised = append(raised, more...)
	}
	_, more := tracker.Feed(segmentEnd(segment), 0)
	return append(raised, more...)
}

func withoutIDs(events []FlagEvent) []flagged {
	out := []flagged{}
	for _, e := range events {
		out = append(out, flagged{e.Kind, e.Start, e.End, e.Heard})
	}
	return out
}

func wantFlags(t *testing.T, events []FlagEvent, want ...flagged) {
	t.Helper()
	if got := withoutIDs(events); !reflect.DeepEqual(got, append([]flagged{}, want...)) {
		t.Fatalf("flags %+v, want %+v", got, want)
	}
}

func TestACleanReadRaisesNoFlags(t *testing.T) {
	wantFlags(t, readSegment(flagTracker(flagScript), 0, "the old lighthouse keeper climbed the spiral stairs each evening"))
}

func TestADifferentWordReadInPlaceOfAScriptWordIsAMisread(t *testing.T) {
	events := readSegment(flagTracker(flagScript), 0, "the old lighthouse keeper climbed the spiral chairs each evening")
	wantFlags(t, events, flagged{"misread", 7, 8, "chairs"})
}

func TestAScriptWordPassedOverIsSkipped(t *testing.T) {
	events := readSegment(flagTracker(flagScript), 0, "the old lighthouse keeper climbed the stairs each evening")
	wantFlags(t, events, flagged{"skipped", 6, 7, ""})
}

func TestADroppedArticleIsNotFlaggedBecauseEnginesDropThemOnTheirOwn(t *testing.T) {
	wantFlags(t, readSegment(flagTracker(flagScript), 0, "the old lighthouse keeper climbed spiral stairs each evening"))
}

func TestAWordHeardBetweenTwoScriptWordsIsAnExtraAtTheWordAfterIt(t *testing.T) {
	events := readSegment(flagTracker(flagScript), 0, "the old lighthouse keeper slowly climbed the spiral stairs")
	wantFlags(t, events, flagged{"extra", 4, 4, "slowly"})
}

func TestHesitationsAreNotExtras(t *testing.T) {
	wantFlags(t, readSegment(flagTracker(flagScript), 0, "the old lighthouse keeper um climbed the spiral stairs"))
}

func TestAWordSaidRightButSpeltDifferentlyIsNotAMisread(t *testing.T) {
	for _, c := range [][2]string{
		{"She made a daisy-chain for her friends today.", "she made a daisy chain for her friends today"},
		{"She counted twenty-three of her friends today.", "she counted twenty three of her friends today"},
		{"She counted 23 of her friends today.", "she counted twenty three of her friends today"},
		{"She said it's far from her friends today.", "she said its far from her friends today"},
	} {
		if got := withoutIDs(readSegment(flagTracker(c[0]), 0, c[1])); len(got) > 0 {
			t.Errorf("%q read as %q: flags %+v", c[0], c[1], got)
		}
	}
}

func TestTheFirstWordsOfASegmentOnlyAnchorAndRaiseNothing(t *testing.T) {
	wantFlags(t, readSegment(flagTracker(flagScript), 0, "the ogled lighthouse keeper climbed the spiral stairs"))
}

func TestADiscrepancyJustAfterTheFirstWordsOfASegmentIsJudged(t *testing.T) {
	events := readSegment(flagTracker(flagScript), 0, "the old ogled keeper climbed the spiral stairs")
	wantFlags(t, events, flagged{"misread", 2, 3, "ogled"})
}

func TestUnmatchedWordsAtTheEndOfASegmentAreNotJudged(t *testing.T) {
	wantFlags(t, readSegment(flagTracker(flagScript), 0, "the old lighthouse keeper climbed the spiral xyzzy"))
}

func TestALongRunOfUnplaceableWordsIsNotCalledAMisread(t *testing.T) {
	wantFlags(t, readSegment(flagTracker(flagScript), 0, "the old lighthouse keeper climbed the grr brr frr zrr stairs each evening"))
}

func TestGoingBackToAnEarlierSentenceInANewSegmentIsARestartOfTheWordsReadAgain(t *testing.T) {
	tracker := flagTracker(flagScript)
	readSegment(tracker, 0, "the old lighthouse keeper climbed the spiral stairs")

	events := readSegment(tracker, 1, "the old lighthouse keeper climbed the spiral stairs each evening")
	wantFlags(t, events, flagged{"restart", 0, 8, "the old lighthouse keeper climbed the spiral stairs"})
}

func TestRepeatingTheLastWordsWithinASegmentIsARestart(t *testing.T) {
	events := readSegment(flagTracker(flagScript), 0, "the old lighthouse keeper climbed the spiral climbed the spiral stairs each evening")
	wantFlags(t, events, flagged{"restart", 4, 7, "climbed the spiral"})
}

func TestOneOrTwoRepeatedWordsAreNotFlaggedSinceEnginesDuplicateWordsToo(t *testing.T) {
	for _, heard := range []string{"the old lighthouse keeper keeper climbed the spiral stairs", "the old lighthouse keeper climbed the climbed the spiral stairs"} {
		if got := withoutIDs(readSegment(flagTracker(flagScript), 0, heard)); len(got) > 0 {
			t.Errorf("%q: flags %+v", heard, got)
		}
	}
}

func TestWordsTheEngineConfirmedTwiceFromTheSameAudioAreNotARestartOrAnExtra(t *testing.T) {
	type timed struct {
		word string
		at   float64
	}
	spoken := []timed{{"the", 0.0}, {"old", 0.3}, {"lighthouse", 0.6}, {"keeper", 0.9}, {"climbed", 1.2}, {"the", 1.5}, {"spiral", 1.8}}
	echoed := append(slices.Clone(spoken[4:]), timed{"stairs", 2.1}, timed{"each", 2.4}, timed{"evening", 2.7})

	tracker := flagTracker(flagScript)
	var raised []FlagEvent
	for _, w := range append(spoken, echoed...) {
		_, more := tracker.Feed(confirmed(0, w.word, w.at), 0)
		raised = append(raised, more...)
	}
	_, more := tracker.Feed(segmentEnd(0), 0)
	wantFlags(t, append(raised, more...))
}

func TestAWordTheEngineSplitAcrossAMatchedNeighbourIsNotAMisread(t *testing.T) {
	events := readSegment(flagTracker("He climbed the stairs at seven o'clock each evening."), 0, "he climbed the stairs at 7 o clock each evening")
	wantFlags(t, events)
}

func TestARunHeardWithinTheTrackersOwnSpellingToleranceIsNotAMisread(t *testing.T) {
	events := readSegment(flagTracker("She was making a daisy-chain for her sister."), 0, "she was making a daily chain for her sister")
	wantFlags(t, events)
}

func TestASkipAheadIsNotFlaggedWhenSomethingWasHeardInPlaceOfTheSkippedWords(t *testing.T) {
	wantFlags(t, readSegment(flagTracker(flagScript), 0, "grr brr he lit the great lamp and watched the ships"))
}

func TestSkippingAheadFlagsTheWordsPassedOver(t *testing.T) {
	events := readSegment(flagTracker(flagScript), 0, "he lit the great lamp and watched the ships")
	wantFlags(t, events, flagged{"skipped", 0, 10, ""})
}

func TestASeekIsTheNarratorMovingAndIsNeverFlagged(t *testing.T) {
	tracker := flagTracker(flagScript)
	readSegment(tracker, 0, "the old lighthouse keeper climbed the spiral stairs")

	positions := tracker.ResetTo(0, 1.0)
	wantFlags(t, readSegment(tracker, 1, "the old lighthouse keeper climbed the spiral"))
	if len(positions) == 0 || positions[0].Jump != "restart" {
		t.Fatalf("the seek reported %+v, want a restart jump first", positions)
	}
}

func TestFlagsWaitForTheSegmentToCloseAndFollowItsPositionEvents(t *testing.T) {
	tracker := flagTracker(flagScript)
	heard := strings.Fields("the old lighthouse keeper climbed the spiral chairs each evening")

	_, beforeEnd := tracker.Feed(Event{Type: "partial", Words: heard}, 0)
	for _, w := range heard {
		_, more := tracker.Feed(Event{Type: "word", Word: w, Times: &Times{Num{Kind: 'f'}, Num{Kind: 'f', Float: 0.2}}}, 0)
		beforeEnd = append(beforeEnd, more...)
	}
	positions, atEnd := tracker.Feed(segmentEnd(0), 0)

	wantFlags(t, beforeEnd)
	// Feed returns the positions before the flags, so "after the position events" holds by construction; Python's
	// closing event list was the flag alone.
	if len(positions) != 0 || len(atEnd) != 1 {
		t.Fatalf("the closing event gave %d positions and %d flags, want only the flag", len(positions), len(atEnd))
	}
}

func TestFlagEventsCarryAnIncreasingIDAndTheScriptWordSpan(t *testing.T) {
	tracker := flagTracker(flagScript)

	first := readSegment(tracker, 0, "the old lighthouse keeper climbed the spiral chairs each evening")
	second := readSegment(tracker, 1, "he lit the great lamp and watched the ships pass nobody thanked him")

	want := []FlagEvent{{ID: 1, Kind: "misread", Start: 7, End: 8, Heard: "chairs"}, {ID: 2, Kind: "skipped", Start: 21, End: 22, Heard: ""}}
	if got := append(first, second...); !reflect.DeepEqual(got, want) {
		t.Fatalf("flags %+v, want %+v", got, want)
	}
}

func TestSpansAreReportedInScriptWordsPositionsAcrossPunctuationOnlyTokens(t *testing.T) {
	tracker := NewFlagging([]string{"one", "two", "—", "three", "four", "five", "six"}, 0)
	wantFlags(t, readSegment(tracker, 0, "one two three four sticks six"), flagged{"misread", 5, 6, "sticks"})
}

func TestHalfOfAWordTheEngineSplitIsNotAnExtra(t *testing.T) {
	wantFlags(t, readSegment(flagTracker("It was a so-called lighthouse on the old hill."), 0, "it was a so called lighthouse on the old hill"))
}

// A script and confirmed-word segments drawn from anywhere in it, with some words swapped, so the stream holds
// misreads, skips, extras, restarts and skips ahead as well as clean reading.

var flagVocabulary = []string{"the", "old", "lamp", "keeper", "climbed", "stairs", "lighthouse", "um", "ships", "pass", "night", "sea", "—"}

func flagWord(rng *rand.Rand) string {
	if rng.Intn(2) == 0 {
		return flagVocabulary[rng.Intn(len(flagVocabulary))]
	}
	return randomFrom(rng, "abcd'-", 1, 6)
}

func TestEveryFlagIsAKnownKindInsideTheScriptWithIDsCountingFromOne(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	seen := map[string]int{}
	for range runs {
		script := make([]string, 4+rng.Intn(37))
		for k := range script {
			script[k] = flagWord(rng)
		}
		tracker := NewFlagging(script, 0)
		var raised []FlagEvent
		for segment := range rng.Intn(7) {
			offset := rng.Intn(len(script) + 1)
			for _, w := range script[offset:min(len(script), offset+rng.Intn(13))] {
				if rng.Intn(2) == 0 {
					w = flagWord(rng)
				}
				_, more := tracker.Feed(confirmed(segment, w, 0), 0)
				raised = append(raised, more...)
			}
			_, more := tracker.Feed(segmentEnd(segment), 0)
			raised = append(raised, more...)
		}
		for k, e := range raised {
			seen[e.Kind]++
			if !slices.Contains([]string{"misread", "extra", "skipped", "restart"}, e.Kind) ||
				e.Start < 0 || e.Start > e.End || e.End > len(script) ||
				(e.Start == e.End) != (e.Kind == "extra") || (e.Heard == "") != (e.Kind == "skipped") || e.ID != k+1 {
				t.Fatalf("flag %d %+v over %q", k, e, script)
			}
		}
	}
	// Hypothesis only reported how often each kind was drawn; here each must be, or the stream stopped covering it.
	// Every word is heard at the same audio time, so each gap is an engine echo and no extra (or in-segment restart)
	// can be raised: the stream's misreads, skips and jump restarts are what it covers.
	if seen["misread"] == 0 || seen["skipped"] == 0 || seen["restart"] == 0 || seen["extra"] != 0 {
		t.Fatalf("the stream raised only %v", seen)
	}
}

// The chapter heading (issue #2251 item 7): the title and subtitle open the script, and reading them is optional, so
// nothing the narrator says in the heading, or before the chapter's first word, is a flag. The credits have no
// heading, so their first words are judged as any.

const bodyRead = "the old lighthouse keeper climbed the spiral stairs each evening he lit the great lamp"

func headed() *FlaggingTracker {
	heading := ScriptWords("Chapter 12 The Storm Breaks")
	return NewFlagging(append(heading, ScriptWords(flagScript)...), len(heading))
}

func TestNothingSaidInTheHeadingIsFlagged(t *testing.T) {
	for _, said := range []string{
		"chapter twelve the storm breaks " + bodyRead,                          // read in full
		"chapter twelve " + bodyRead,                                           // the subtitle left out
		bodyRead,                                                               // the heading left out
		"chapter twelve the stork brakes " + bodyRead,                          // the subtitle misheard
		"chapter twelve part one the storm breaks " + bodyRead,                 // other words in the heading
		"chapter twelve the storm breaks sorry " + bodyRead,                    // a word between the heading and the first line
		"chapter twelve the storm chapter twelve the storm breaks " + bodyRead, // the heading said again
	} {
		if got := withoutIDs(readSegment(headed(), 0, said)); len(got) > 0 {
			t.Errorf("%q: flags %+v", said, got)
		}
	}
}

func TestAMisreadAfterTheHeadingIsStillFlaggedAtItsScriptWord(t *testing.T) {
	events := readSegment(headed(), 0, "chapter twelve the storm breaks the old lighthouse keeper climbed the spiral chairs each evening")
	wantFlags(t, events, flagged{"misread", 12, 13, "chairs"})
}

func TestAScriptWithNoHeadingJudgesItsFirstWordsAsAny(t *testing.T) {
	events := readSegment(flagTracker(flagScript), 0, "the old lighthouse keeper slowly climbed the spiral stairs")
	wantFlags(t, events, flagged{"extra", 4, 4, "slowly"})
}

// sameKey is spoken_forms.said_the_same (test_spoken_forms.py's cases): the spelling that does not change what was
// said is forgiven, a different word or nothing at all is not.

func TestSaidTheSameForgivesSpellingThatDoesNotChangeWhatWasSaid(t *testing.T) {
	for _, c := range [][2]string{
		{"daisy chain", "daisy-chain"}, {"twenty three", "23"}, {"there", "their"},
		{"sentinel's", "sentinels"}, {"Evening", "evening."}, {"7 o clock", "seven o'clock"},
	} {
		if !sameKey(c[0], c[1]) {
			t.Errorf("%q heard for %q was not forgiven", c[0], c[1])
		}
	}
}

func TestSaidTheSameDoesNotForgiveADifferentWordOrNothingAtAll(t *testing.T) {
	for _, c := range [][2]string{{"cited", "tired"}, {"won", "one"}, {"", ""}, {"lamp", "lump"}} {
		if sameKey(c[0], c[1]) {
			t.Errorf("%q heard for %q was forgiven", c[0], c[1])
		}
	}
}
