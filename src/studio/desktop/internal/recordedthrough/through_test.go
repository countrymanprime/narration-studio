package recordedthrough

import (
	"testing"
)

// script is a chapter of four paragraphs after a two-word title: 2 title words, then paragraphs of 100, 100, 100 and 100.
func script() Script {
	return Script{
		Paragraphs: []Paragraph{{ID: "p1", Start: 2, Count: 100}, {ID: "p2", Start: 102, Count: 100}, {ID: "p3", Start: 202, Count: 100}, {ID: "p4", Start: 302, Count: 100}},
		Tokens:     402,
	}
}

func seconds(value float64) *float64 { return &value }

func TestNothingRecordedAnywhereIsNoValue(t *testing.T) {
	if got := Resolve(Inputs{Script: script()}); got != nil {
		t.Fatalf("Resolve() = %+v, want nil", got)
	}
}

func TestBoothRangesGiveTheFurthestContiguousWordNotTheLastTake(t *testing.T) {
	// Read 0 to 150, then 150 to 230, then a pickup far ahead (350 to 380): the chapter is recorded through word 230.
	got := Resolve(Inputs{Script: script(), Booth: []Range{{From: 0, To: 150}, {From: 350, To: 380}, {From: 150, To: 230}}})
	want := &Through{ParagraphID: "p3", Paragraph: 3, Word: 27, Percent: 57, Source: SourceBooth, Confident: true}
	if got == nil || *got != *want {
		t.Fatalf("Resolve() = %+v, want %+v", got, want)
	}
}

func TestASmallSkipBetweenTakesIsStillContiguous(t *testing.T) {
	// The second take began 20 words after the first stopped (the narrator started the next sentence): still one run.
	got := Resolve(Inputs{Script: script(), Booth: []Range{{From: 0, To: 100}, {From: 120, To: 200}}})
	if got == nil || got.ParagraphID != "p2" || got.Word != 97 {
		t.Fatalf("Resolve() = %+v, want p2 word 97", got)
	}
}

func TestATakeThatDidNotStartAtTheTopIsNotContiguous(t *testing.T) {
	// Only a pickup half way through: nothing is recorded from the top, so the Booth must not open half way.
	if got := Resolve(Inputs{Script: script(), Booth: []Range{{From: 250, To: 300}}}); got != nil {
		t.Fatalf("Resolve() = %+v, want nil", got)
	}
}

func TestReadingToTheLastWordIsComplete(t *testing.T) {
	got := Resolve(Inputs{Script: script(), Booth: []Range{{From: 0, To: 401}}})
	if got == nil || !got.Complete || got.Percent != 100 || got.ParagraphID != "p4" || got.Paragraph != 4 || got.Word != 99 {
		t.Fatalf("Resolve() = %+v, want complete at p4 (¶ 4) word 99", got)
	}
}

func TestOneWordShortIsNotCompleteAndNeverReads100(t *testing.T) {
	got := Resolve(Inputs{Script: script(), Booth: []Range{{From: 0, To: 396}}})
	if got == nil || got.Complete || got.Percent != 99 {
		t.Fatalf("Resolve() = %+v, want 99%% not complete", got)
	}
}

func TestProofParagraphsGiveTheRunAndToleratePickups(t *testing.T) {
	// Paragraph 2 is mostly missing (a pickup), 3 is read, 4 is not read at all: recorded through the end of paragraph 3.
	got := Resolve(Inputs{Script: script(), Proof: []Coverage{{ID: "p1", Tokens: 98, Present: 98}, {ID: "p2", Tokens: 98, Present: 10}, {ID: "p3", Tokens: 98, Present: 97}, {ID: "p4", Tokens: 98, Present: 0}}})
	want := &Through{ParagraphID: "p3", Paragraph: 3, Word: 99, Percent: 75, Source: SourceProof, Confident: true}
	if got == nil || *got != *want {
		t.Fatalf("Resolve() = %+v, want %+v", got, want)
	}
}

func TestTwoLongParagraphsMissingEndTheProofRun(t *testing.T) {
	got := Resolve(Inputs{Script: script(), Proof: []Coverage{{ID: "p1", Tokens: 100, Present: 100}, {ID: "p2", Tokens: 100, Present: 0}, {ID: "p3", Tokens: 100, Present: 0}, {ID: "p4", Tokens: 100, Present: 100}}})
	if got == nil || got.ParagraphID != "p1" || got.Word != 99 {
		t.Fatalf("Resolve() = %+v, want p1 word 99", got)
	}
}

func TestAPartlyReadLastParagraphPlacesTheWordByItsShare(t *testing.T) {
	got := Resolve(Inputs{Script: script(), Proof: []Coverage{{ID: "p1", Tokens: 100, Present: 100}, {ID: "p2", Tokens: 50, Present: 30}}})
	if got == nil || got.ParagraphID != "p2" || got.Word != 59 {
		t.Fatalf("Resolve() = %+v, want p2 word 59", got)
	}
}

func TestProofThatCoversEveryParagraphIsComplete(t *testing.T) {
	got := Resolve(Inputs{Script: script(), Proof: []Coverage{{ID: "p1", Tokens: 1, Present: 1}, {ID: "p2", Tokens: 1, Present: 1}, {ID: "p3", Tokens: 1, Present: 1}, {ID: "p4", Tokens: 1, Present: 1}}})
	if got == nil || !got.Complete || got.Percent != 100 {
		t.Fatalf("Resolve() = %+v, want complete", got)
	}
}

func TestTheFurtherOfProofAndBoothWins(t *testing.T) {
	proof := []Coverage{{ID: "p1", Tokens: 100, Present: 100}}
	got := Resolve(Inputs{Script: script(), Proof: proof, Booth: []Range{{From: 0, To: 250}}})
	if got == nil || got.Source != SourceBooth || got.ParagraphID != "p3" {
		t.Fatalf("Resolve() = %+v, want the Booth's p3", got)
	}
	got = Resolve(Inputs{Script: script(), Proof: proof, Booth: []Range{{From: 0, To: 50}}})
	if got == nil || got.Source != SourceProof || got.ParagraphID != "p1" || got.Word != 99 {
		t.Fatalf("Resolve() = %+v, want Proof's p1", got)
	}
}

func TestDAWLengthAloneIsAnEstimateAgainstTheChapterPace(t *testing.T) {
	// 402 words at 9300 words an hour is 155.6 s; 77.8 s recorded is half.
	got := Resolve(Inputs{Script: script(), RecordedSeconds: seconds(77.8), WordsPerHour: 9300})
	want := &Through{ParagraphID: "p2", Paragraph: 2, Word: 98, Percent: 50, Source: SourceDAW}
	if got == nil || *got != *want {
		t.Fatalf("Resolve() = %+v, want %+v", got, want)
	}
}

func TestARecordingLongerThanTheScriptIsComplete(t *testing.T) {
	got := Resolve(Inputs{Script: script(), RecordedSeconds: seconds(400), WordsPerHour: 9300})
	if got == nil || !got.Complete || got.Percent != 100 || got.Confident || got.ParagraphID != "p4" || got.Word != 99 {
		t.Fatalf("Resolve() = %+v, want an estimated complete", got)
	}
}

func TestAMeasuredPlaceWinsOverTheDAWEstimate(t *testing.T) {
	got := Resolve(Inputs{Script: script(), Booth: []Range{{From: 0, To: 50}}, RecordedSeconds: seconds(400), WordsPerHour: 9300})
	if got == nil || got.Source != SourceBooth {
		t.Fatalf("Resolve() = %+v, want the Booth's measured place", got)
	}
}

func TestALinkedTrackWithNoAudioMeansTheTakesWereRemoved(t *testing.T) {
	if got := Resolve(Inputs{Script: script(), Booth: []Range{{From: 0, To: 250}}, RecordedSeconds: seconds(0), WordsPerHour: 9300}); got != nil {
		t.Fatalf("Resolve() = %+v, want nil", got)
	}
}

func TestOnlyTheTitleReadIsNothing(t *testing.T) {
	if got := Resolve(Inputs{Script: script(), Booth: []Range{{From: 0, To: 1}}}); got != nil {
		t.Fatalf("Resolve() = %+v, want nil", got)
	}
}

func TestAnEmptyOrBrokenScriptIsNoValue(t *testing.T) {
	for _, in := range []Inputs{
		{Booth: []Range{{From: 0, To: 10}}},
		{Script: Script{Tokens: 5}, Booth: []Range{{From: 0, To: 10}}},
		{Script: script(), RecordedSeconds: seconds(50)}, // no pace to estimate with
		{Script: script(), Booth: []Range{{From: 50, To: 10}, {From: -5, To: -1}}},
	} {
		if got := Resolve(in); got != nil {
			t.Fatalf("Resolve(%+v) = %+v, want nil", in, got)
		}
	}
}

func TestProofNamingParagraphsTheScriptLacksIsIgnored(t *testing.T) {
	if got := Resolve(Inputs{Script: script(), Proof: []Coverage{{ID: "gone", Tokens: 10, Present: 10}}}); got != nil {
		t.Fatalf("Resolve() = %+v, want nil", got)
	}
}

func TestMergeKeepsRangesSortedAndJoined(t *testing.T) {
	got := Merge([]Range{{From: 100, To: 200}, {From: 0, To: 50}}, Range{From: 40, To: 120})
	if len(got) != 1 || got[0] != (Range{From: 0, To: 200}) {
		t.Fatalf("Merge() = %+v, want one range 0-200", got)
	}
	got = Merge(got, Range{From: 300, To: 310})
	if len(got) != 2 || got[1] != (Range{From: 300, To: 310}) {
		t.Fatalf("Merge() = %+v, want two ranges", got)
	}
	if got := Merge(nil, Range{From: 10, To: 5}); len(got) != 0 {
		t.Fatalf("Merge() of a backwards range = %+v, want none", got)
	}
}

func TestMergeCapsTheNumberOfRanges(t *testing.T) {
	var ranges []Range
	for i := 0; i < MaxRanges+20; i++ {
		ranges = Merge(ranges, Range{From: i * 1000, To: i*1000 + 10})
	}
	if len(ranges) != MaxRanges || ranges[0].From != 0 {
		t.Fatalf("Merge() kept %d ranges starting at %d, want %d starting at 0", len(ranges), ranges[0].From, MaxRanges)
	}
}
