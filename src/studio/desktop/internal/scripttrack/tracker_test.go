package scripttrack

import (
	"math/rand"
	"slices"
	"strings"
	"testing"
)

// What the tracker does on a lighthouse script, the sidecar's test_script_tracker.py example for example: the
// alignment functions, the cursor a stream of engine events moves, seeks and the closed segment handed on.

const lighthouseScript = "The old lighthouse keeper climbed the spiral stairs each evening. He lit the great lamp and watched the ships pass. Nobody ever thanked him for it."

// 0 The 1 old 2 lighthouse 3 keeper 4 climbed 5 the 6 spiral 7 stairs 8 each 9 evening.
// 10 He 11 lit 12 the 13 great 14 lamp 15 and 16 watched 17 the 18 ships 19 pass.
// 20 Nobody 21 ever 22 thanked 23 him 24 for 25 it.

func norm(text string) []string {
	out := []string{}
	for _, w := range strings.Fields(text) {
		out = append(out, NormalizeWord(w))
	}
	return out
}

func lighthouseTracker() *Tracker { return New(ScriptWords(lighthouseScript)) }

func partial(segment float64, text string) Event {
	return Event{Type: "partial", Segment: segment, Words: strings.Fields(text)}
}

// heardTimes is the (0.0, 0.1) every confirmed word in these tests carries.
var heardTimes = Times{Num{Kind: 'f', Float: 0}, Num{Kind: 'f', Float: 0.1}}

func confirmedWord(segment float64, text string) Event {
	times := heardTimes
	return Event{Type: "word", Segment: segment, Word: text, Times: &times}
}

func endOfSegment(segment float64) Event { return Event{Type: "segment_end", Segment: segment} }

// readWholeSegment feeds a whole segment the way an engine would: a partial, each word confirmed, then the segment end.
func readWholeSegment(tracker *Tracker, segment float64, text string, now float64) []Position {
	events := tracker.Feed(partial(segment, text), now)
	for _, w := range strings.Fields(text) {
		events = append(events, tracker.Feed(confirmedWord(segment, w), now)...)
	}
	return append(events, tracker.Feed(endOfSegment(segment), now)...)
}

func last(t *testing.T, events []Position) Position {
	t.Helper()
	if len(events) == 0 {
		t.Fatal("no position event")
	}
	return events[len(events)-1]
}

func reads(events []Position) []int {
	out := []int{}
	for _, e := range events {
		out = append(out, e.Read)
	}
	return out
}

func TestScriptWordsSplitOnWhitespaceAndKeepPunctuation(t *testing.T) {
	if got := ScriptWords("The old\nlighthouse  keeper."); !slices.Equal(got, []string{"The", "old", "lighthouse", "keeper."}) {
		t.Fatalf("%q", got)
	}
}

func TestWordsMatchIgnoringCaseAndPunctuation(t *testing.T) {
	if !WordsMatch(NormalizeWord("Evening."), NormalizeWord("evening")) {
		t.Fatal("Evening. and evening differ")
	}
}

func TestWordsMatchCloseSpellingsOfLongerWordsButNotShortOrUnrelatedOnes(t *testing.T) {
	if !WordsMatch("stairs", "stair") || !WordsMatch("keeper", "keepers") || WordsMatch("lamp", "lump") || WordsMatch("the", "then") {
		t.Fatal("close spellings misjudged")
	}
}

func TestAdvanceFollowsTheScriptInOrder(t *testing.T) {
	if got := Advance(norm("the old lighthouse keeper"), norm(lighthouseScript), 0); got != (Alignment{4, 4, 0}) {
		t.Fatalf("%+v", got)
	}
}

func TestAdvanceIgnoresInsertedWordsThatAreNotInTheScript(t *testing.T) {
	if got := Advance(norm("the old um lighthouse"), norm(lighthouseScript), 0); got.Read != 3 || got.Matched != 3 {
		t.Fatalf("%+v", got)
	}
}

func TestAdvanceStepsOverAScriptWordThatWasMisreadOrSkipped(t *testing.T) {
	if got := Advance(norm("the lighthouse keeper"), norm(lighthouseScript), 0); got.Read != 4 || got.Matched != 3 {
		t.Fatalf("%+v", got)
	}
}

func TestAdvanceWillNotSkipMoreThanTheAllowedNumberOfScriptWords(t *testing.T) {
	if got := Advance(norm("the climbed"), norm(lighthouseScript), 0); got.Read != 1 || got.Matched != 1 {
		t.Fatalf("%+v", got)
	}
}

func TestPartialsMoveTheCursorForwardAsMoreWordsAreHeard(t *testing.T) {
	tracker := lighthouseTracker()
	first := tracker.Feed(partial(0, "the"), 1.0)
	second := tracker.Feed(partial(0, "the old lighthouse"), 1.5)
	if got := reads(append(first, second...)); !slices.Equal(got, []int{1, 3}) {
		t.Fatalf("reads %v", got)
	}
}

func TestAGarbageFirstWordDoesNotBlockTheCursor(t *testing.T) {
	if got := last(t, lighthouseTracker().Feed(partial(0, "they're old lighthouse"), 1.0)); got.Read != 3 {
		t.Fatalf("%+v", got)
	}
}

func TestPartialsNeverMoveTheCursorBackward(t *testing.T) {
	tracker := lighthouseTracker()
	tracker.Feed(partial(0, "the old lighthouse"), 1.0)
	if got := tracker.Feed(partial(0, "the"), 1.5); len(got) != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestRepeatingTheSamePartialEmitsNothingNew(t *testing.T) {
	tracker := lighthouseTracker()
	tracker.Feed(partial(0, "the old"), 1.0)
	if got := tracker.Feed(partial(0, "the old"), 1.2); len(got) != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestConfirmedWordsAdvanceTheCommittedPositionBehindTheSpeculativeOne(t *testing.T) {
	tracker := lighthouseTracker()
	tracker.Feed(partial(0, "the old lighthouse"), 1.0)
	events := append(tracker.Feed(confirmedWord(0, "the"), 1.1), tracker.Feed(confirmedWord(0, "old"), 1.2)...)
	got := [][2]int{}
	for _, e := range events {
		got = append(got, [2]int{e.Read, e.Committed})
	}
	if !slices.Equal(got, [][2]int{{3, 1}, {3, 2}}) {
		t.Fatalf("(read, committed) %v", got)
	}
}

func TestTheNextSegmentContinuesFromWhereTheLastOneWasCommitted(t *testing.T) {
	tracker := lighthouseTracker()
	readWholeSegment(tracker, 0, "the old lighthouse keeper", 0)
	if got := last(t, tracker.Feed(partial(1, "climbed the"), 3.0)); got.Read != 6 {
		t.Fatalf("%+v", got)
	}
}

func TestARestartOfAnEarlierSentenceMovesTheCursorBack(t *testing.T) {
	tracker := lighthouseTracker()
	readWholeSegment(tracker, 0, "the old lighthouse keeper climbed the spiral stairs", 0)
	if got := last(t, tracker.Feed(partial(1, "the old lighthouse keeper climbed"), 4.0)); got.Read != 5 || got.Jump != "restart" {
		t.Fatalf("%+v", got)
	}
}

func TestAJumpIsReportedOnceAndLaterPartialsInTheSegmentJustAdvance(t *testing.T) {
	tracker := lighthouseTracker()
	readWholeSegment(tracker, 0, "the old lighthouse keeper climbed the spiral stairs", 0)
	tracker.Feed(partial(1, "the old lighthouse keeper climbed"), 4.0)
	if got := last(t, tracker.Feed(partial(1, "the old lighthouse keeper climbed the spiral"), 4.5)); got.Read != 7 || got.Jump != "" {
		t.Fatalf("%+v", got)
	}
}

func TestSkippingAheadInTheScriptIsAJumpThatReportsTheSkippedSpan(t *testing.T) {
	got := last(t, lighthouseTracker().Feed(partial(0, "he lit the great lamp"), 1.0))
	if got.Read != 15 || got.Jump != "skip" || got.Skipped == nil || *got.Skipped != (Span{0, 10}) {
		t.Fatalf("%+v skipped %v", got, got.Skipped)
	}
}

func TestASingleWordThatAppearsElsewhereInTheScriptIsNotEnoughToJump(t *testing.T) {
	if got := lighthouseTracker().Feed(partial(0, "lamp"), 1.0); len(got) != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestStatusBecomesWaitingAfterAPauseAndListeningAgainOnProgress(t *testing.T) {
	tracker := lighthouseTracker()
	tracker.Feed(partial(0, "the old"), 1.0)
	if got := tracker.Tick(2.0); len(got) != 0 {
		t.Fatalf("tick at 2.0: %+v", got)
	}
	waiting := tracker.Tick(3.0)
	resumed := tracker.Feed(partial(0, "the old lighthouse"), 3.2)
	if len(waiting) != 1 || waiting[0].Status != "waiting" {
		t.Fatalf("tick at 3.0: %+v", waiting)
	}
	if got := last(t, resumed); got.Status != "listening" {
		t.Fatalf("%+v", got)
	}
}

func TestStatusIsDoneWhenTheWholeScriptHasBeenRead(t *testing.T) {
	if got := last(t, New([]string{"a", "b"}).Feed(partial(0, "a b"), 1.0)); got.Read != 2 || got.Status != "done" {
		t.Fatalf("%+v", got)
	}
}

func TestPunctuationOnlyScriptTokensArePassedOverTransparently(t *testing.T) {
	tracker := New([]string{"a", "—", "b", "c"})
	if got := last(t, tracker.Feed(partial(0, "a"), 1.0)); got.Read != 2 {
		t.Fatalf("after a: %+v", got)
	}
	if got := last(t, tracker.Feed(partial(0, "a b c"), 1.5)); got.Read != 4 {
		t.Fatalf("after a b c: %+v", got)
	}
}

func TestANoisyRecordedStylePartialSequenceEndsAtTheRightPlace(t *testing.T) {
	tracker := lighthouseTracker()
	var events []Position
	for _, text := range []string{"okay", "the old light", "the old lighthouse keeper", "the old lighthouse keeper climbed the", "the old lighthouse keeper climbed the spiral"} {
		events = append(events, tracker.Feed(partial(0, text), 1.0)...)
	}
	if got := reads(events); !slices.IsSorted(got) || last(t, events).Read != 7 {
		t.Fatalf("reads %v", got)
	}
}

func TestEventsThatDoNotChangeAnythingProduceNoPositionEvents(t *testing.T) {
	for _, event := range []Event{endOfSegment(0), {Type: "unknown"}} {
		if got := lighthouseTracker().Feed(event, 1.0); len(got) != 0 {
			t.Fatalf("%+v gave %+v", event, got)
		}
	}
}

// resetTo is one seek's (read, committed, jump) events.
func resetTo(tracker *Tracker, word int, now float64) [][3]any {
	got := [][3]any{}
	for _, e := range tracker.ResetTo(word, now) {
		got = append(got, [3]any{e.Read, e.Committed, e.Jump})
	}
	return got
}

func TestResetToJumpsForwardAndReportsItAsARestart(t *testing.T) {
	if got := resetTo(lighthouseTracker(), 15, 1.0); !slices.Equal(got, [][3]any{{15, 15, "restart"}}) {
		t.Fatalf("%v", got)
	}
}

func TestResetToJumpsBackByOneWord(t *testing.T) {
	tracker := lighthouseTracker()
	readWholeSegment(tracker, 0, "the old lighthouse keeper climbed", 0)
	if got := resetTo(tracker, 4, 2.0); !slices.Equal(got, [][3]any{{4, 4, "restart"}}) {
		t.Fatalf("%v", got)
	}
}

func TestResetToJumpsBackByManyWords(t *testing.T) {
	tracker := lighthouseTracker()
	readWholeSegment(tracker, 0, "the old lighthouse keeper climbed the spiral stairs each evening", 0)
	if got := resetTo(tracker, 0, 3.0); !slices.Equal(got, [][3]any{{0, 0, "restart"}}) {
		t.Fatalf("%v", got)
	}
}

func TestResetToClampsAnOutOfRangeWordToTheEndOfTheScript(t *testing.T) {
	total := len(ScriptWords(lighthouseScript))
	if got := last(t, lighthouseTracker().ResetTo(total+500, 1.0)); got.Read != total || got.Jump != "restart" || got.Status != "done" {
		t.Fatalf("%+v", got)
	}
}

func TestResetToClampsANegativeWordToTheStart(t *testing.T) {
	if got := last(t, lighthouseTracker().ResetTo(-5, 1.0)); got.Read != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestResetToReportsAgainEvenWhenTheWordDoesNotChange(t *testing.T) {
	tracker := lighthouseTracker()
	tracker.ResetTo(4, 1.0)
	events := tracker.ResetTo(4, 2.0)
	if len(events) != 1 || events[0].Read != 4 || events[0].Jump != "restart" {
		t.Fatalf("%+v", events)
	}
}

func TestReadingContinuesNormallyAfterAResetToSeek(t *testing.T) {
	tracker := lighthouseTracker()
	tracker.ResetTo(10, 1.0)
	if got := last(t, tracker.Feed(partial(0, "lit the great lamp"), 2.0)); got.Read != 15 || got.Jump != "" {
		t.Fatalf("%+v", got)
	}
}

func TestAlignReportsTheScriptWordEachHeardWordMatchedOrNone(t *testing.T) {
	if got := Align(norm("the old um lighthouse climbed"), norm(lighthouseScript), 0); !slices.Equal(got, []int{0, 1, None, 2, 4}) {
		t.Fatalf("%v", got)
	}
}

func TestLocateReportsTheStartAndFirstMatchOfTheAlignmentItChose(t *testing.T) {
	near := Locate(norm("the old lighthouse"), norm(lighthouseScript), 0)
	ahead := Locate(norm("he lit the great lamp"), norm(lighthouseScript), 0)
	if near.Start != 0 || near.First != 0 {
		t.Fatalf("near %+v", near)
	}
	if ahead.Jump != "skip" || ahead.First != 10 || ahead.Start > ahead.First {
		t.Fatalf("ahead %+v", ahead)
	}
}

func TestAClosedSegmentIsHandedOverOnceWithItsConfirmedWordsAndAnchor(t *testing.T) {
	tracker := lighthouseTracker()
	readWholeSegment(tracker, 0, "The old lighthouse", 0)
	reading := tracker.TakeClosedSegment()
	if reading == nil {
		t.Fatal("no closed segment")
	}
	if !slices.Equal(reading.Heard, []string{"the", "old", "lighthouse"}) || !slices.Equal(reading.HeardRaw, []string{"The", "old", "lighthouse"}) {
		t.Fatalf("heard %q, raw %q", reading.Heard, reading.HeardRaw)
	}
	if len(reading.HeardTimes) != 3 {
		t.Fatalf("times %v", reading.HeardTimes)
	}
	for _, times := range reading.HeardTimes {
		if times == nil || *times != heardTimes {
			t.Fatalf("times %v", times)
		}
	}
	if reading.Anchor != 0 || reading.Location.Read != 3 {
		t.Fatalf("anchor %d, location %+v", reading.Anchor, reading.Location)
	}
	if again := tracker.TakeClosedSegment(); again != nil {
		t.Fatalf("handed over twice: %+v", again)
	}
}

func TestASegmentWithNoConfirmedWordsHandsNothingOver(t *testing.T) {
	tracker := lighthouseTracker()
	tracker.Feed(partial(0, "the old"), 1.0)
	tracker.Feed(endOfSegment(0), 1.2)
	if got := tracker.TakeClosedSegment(); got != nil {
		t.Fatalf("%+v", got)
	}
}

func TestASeekDiscardsAClosedSegmentNobodyTook(t *testing.T) {
	tracker := lighthouseTracker()
	readWholeSegment(tracker, 0, "the old lighthouse", 0)
	tracker.ResetTo(10, 2.0)
	if got := tracker.TakeClosedSegment(); got != nil {
		t.Fatalf("%+v", got)
	}
}

func TestOriginalIndexMapsAFilteredPositionBackToAScriptWordsIndex(t *testing.T) {
	tracker := New([]string{"a", "—", "b"})
	got := []int{tracker.OriginalIndex(0), tracker.OriginalIndex(1), tracker.OriginalIndex(2)}
	if !slices.Equal(got, []int{0, 2, 3}) {
		t.Fatalf("%v", got)
	}
}

// The two clauses of test_script_tracker_properties.py that properties_test.go leaves out: an alignment's first
// match is a script word at or after its start, and Align's matches strictly increase (no script word matched twice).
func TestAnAlignmentsFirstMatchIsInTheScriptAndItsMatchesStrictlyIncrease(t *testing.T) {
	rng := rand.New(rand.NewSource(7))
	for range runs {
		heard, script, start := words(rng, 0, 14), words(rng, 0, 40), rng.Intn(61)
		if result := Advance(heard, script, start); result.First != None && (result.First < start || result.First >= len(script)) {
			t.Fatalf("Advance(%q, %q, %d) = %+v", heard, script, start, result)
		}
		script, start, heard = heardFromTheScript(rng)
		previous := None
		for _, match := range Align(heard, script, start) {
			if match == None {
				continue
			}
			if match <= previous {
				t.Fatalf("Align(%q, %q, %d) matched %d after %d", heard, script, start, match, previous)
			}
			previous = match
		}
	}
}
