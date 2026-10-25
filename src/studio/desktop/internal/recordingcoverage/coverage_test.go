package recordingcoverage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/compare"
	"desktop/internal/layout"
)

// The recording-coverage model, "What counts as read" made executable
// (docs/utilities/recording-coverage.md, Q1, Q3, Q11). Ported from the
// sidecar's tests/test_coverage.py when recording_coverage.py moved here.

const (
	p1 = "alpha bravo charlie delta echo foxtrot"
	p2 = "golf hotel india juliet kilo lima"
	p3 = "mike november oscar papa quebec romeo"
)

// aligned builds an AlignedChapter from plain words: paragraphs are strings
// and said is the transcript, aligned with SequenceMatcher (autojunk off)
// unless opcodes are given.
func aligned(t *testing.T, paragraphs []string, said, heading string, opcodes ...Opcode) *AlignedChapter {
	t.Helper()
	doc, owner := []string{}, []int{}
	for _, word := range strings.Fields(heading) {
		doc, owner = append(doc, word), append(owner, Heading)
	}
	for index, text := range paragraphs {
		for _, word := range strings.Fields(text) {
			doc, owner = append(doc, word), append(owner, index)
		}
	}
	audio := strings.Fields(said)
	if opcodes == nil {
		for _, op := range compare.NewSequenceMatcher(doc, audio, false).Opcodes() {
			opcodes = append(opcodes, Opcode(op))
		}
	}
	ids := make([]string, len(paragraphs))
	for index := range paragraphs {
		ids[index] = fmt.Sprintf("p-%06d", index+1)
	}
	a := &AlignedChapter{DocTokens: doc, DocWords: doc, TokenParagraph: owner, ParagraphIDs: ids, AudioTokens: audio, Opcodes: opcodes}
	if err := a.Validate(); err != nil {
		t.Fatal(err)
	}
	return a
}

func presentFraction(p ParagraphCoverage) float64 {
	if p.Tokens == 0 {
		return 1
	}
	return float64(p.Present) / float64(p.Tokens)
}

func chapterFraction(c ChapterCoverage) float64 {
	if c.BodyTokens == 0 {
		return 1
	}
	return float64(c.PresentTokens) / float64(c.BodyTokens)
}

// textComplete is the narrator's thresholds applied on read, as the host's
// recording signal applies them.
func textComplete(c ChapterCoverage, minPresent float64, maxMissingRun int) bool {
	if c.LongestMissingRun > maxMissingRun {
		return false
	}
	for _, p := range c.Paragraphs {
		if presentFraction(p) < minPresent || p.LongestMissingRun > maxMissingRun {
			return false
		}
	}
	return true
}

func byID(c ChapterCoverage, id string) ParagraphCoverage {
	for _, p := range c.Paragraphs {
		if p.ID == id {
			return p
		}
	}
	panic(id)
}

func one(t *testing.T, c ChapterCoverage) Region {
	t.Helper()
	if len(c.Regions) != 1 {
		t.Fatalf("want one region, got %+v", c.Regions)
	}
	return c.Regions[0]
}

func intp(v int) *int { return &v }

func eq(t *testing.T, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}

func TestACompleteReadIsAllPresentWithNoRegions(t *testing.T) {
	r := aligned(t, []string{p1, p2, p3}, p1+" "+p2+" "+p3, "").ComputeCoverage(DefaultParams)
	eq(t, []int{r.BodyTokens, r.PresentTokens, r.MissingTokens(), r.ExtraTokens, r.LongestMissingRun}, []int{18, 18, 0, 0, 0})
	eq(t, len(r.Regions), 0)
	if chapterFraction(r) != 1 || !textComplete(r, 0.8, 3) {
		t.Fatal("a complete read must be complete")
	}
}

func TestAnUnreadTailIsATailRegionNamingItsParagraphAndWords(t *testing.T) {
	r := aligned(t, []string{p1, p2, p3}, p1+" "+p2, "").ComputeCoverage(DefaultParams)
	region := one(t, r)
	eq(t, []any{region.Kind, region.ParagraphIDs, region.TokenCount, region.FirstWord, region.LastWord}, []any{"tail", []string{"p-000003"}, 6, "mike", "romeo"})
	eq(t, []int{region.DocStart, region.DocEnd, region.AudioIndex}, []int{12, 18, 12})
	if presentFraction(byID(r, "p-000003")) != 0 || textComplete(r, 0.8, 3) {
		t.Fatal("an unread tail is missing")
	}
}

func TestAnUnreadHeadIsAHeadRegionEvenWhenTheTitleWasRead(t *testing.T) {
	r := aligned(t, []string{p1, p2}, "chapter two "+p2, "chapter two").ComputeCoverage(DefaultParams)
	region := one(t, r)
	eq(t, []any{region.Kind, region.ParagraphIDs, region.AudioIndex, r.BodyTokens}, []any{"head", []string{"p-000001"}, 0, 12})
}

func TestAParagraphSkippedInsideTheReadIsASkipRegion(t *testing.T) {
	r := aligned(t, []string{p1, p2, p3}, p1+" "+p3, "").ComputeCoverage(DefaultParams)
	region := one(t, r)
	eq(t, []any{region.Kind, region.ParagraphIDs, region.AudioIndex}, []any{"skip", []string{"p-000002"}, 6})
	eq(t, []int{r.Paragraphs[0].Present, r.Paragraphs[1].Present, r.Paragraphs[2].Present}, []int{6, 0, 6})
}

func TestRegionBounds(t *testing.T) {
	paragraph := "golf hotel the india juliet kilo lima mike november oscar papa"
	speech := "we will wait until the dog stops barking and carry on now"
	cases := []struct {
		name            string
		region          Region
		kind            string
		before, after   *int
		firstWordOrNone string
	}{
		{"a skip is bounded by the matched tokens on either side", one(t, aligned(t, []string{p1, p2, p3}, p1+" "+p3, "").ComputeCoverage(DefaultParams)), "skip", intp(5), intp(6), ""},
		{"a head has no bound before it even when the title was read", one(t, aligned(t, []string{p1, p2}, "chapter two "+p2, "chapter two").ComputeCoverage(DefaultParams)), "head", nil, intp(2), ""},
		{"a tail has no bound after it", one(t, aligned(t, []string{p1, p2, p3}, p1+" "+p2, "").ComputeCoverage(DefaultParams)), "tail", intp(11), nil, ""},
		{"a region is bounded by anchors, not by the speech inside its gap", one(t, aligned(t, []string{p1, paragraph, p3}, p1+" "+speech+" "+p3, "").ComputeCoverage(DefaultParams)), "different_text", intp(5), intp(6 + len(strings.Fields(speech))), ""},
		{"a short read is bounded by the anchors around its gap", one(t, aligned(t, []string{p1, "golf hotel india juliet", p3}, p1+" golf hotel indigo "+p3, "").ComputeCoverage(DefaultParams)), "short_read", intp(7), intp(9), "juliet"},
		{"nothing read has no bounds", one(t, aligned(t, []string{p1, p2}, "something else entirely", "").ComputeCoverage(DefaultParams)), "head", nil, nil, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			eq(t, []any{c.region.Kind, c.region.AudioBefore, c.region.AudioAfter}, []any{c.kind, c.before, c.after})
			if c.firstWordOrNone != "" {
				eq(t, c.region.FirstWord, c.firstWordOrNone)
			}
		})
	}
}

func TestAMisreadCountsAsPresentAndIsNotExtra(t *testing.T) {
	r := aligned(t, []string{p1, p2}, "alpha bravo charlie delta echo foxtrot golf hotel indigo julia kilo lima", "").ComputeCoverage(DefaultParams)
	eq(t, []int{r.PresentTokens, r.ExtraTokens}, []int{12, 0})
	if !textComplete(r, 0.8, 3) {
		t.Fatal("a misread chapter is complete")
	}
}

func TestAReplacementLongerThanTheMisreadBoundIsDifferentText(t *testing.T) {
	unrelated := "one two three four five six seven eight nine ten"
	long := "golf hotel india juliet kilo lima xray yankee zulu whiskey"
	r := aligned(t, []string{p1, long, p3}, p1+" "+unrelated+" "+p3, "").ComputeCoverage(DefaultParams)
	region := one(t, r)
	eq(t, []any{region.Kind, region.ParagraphIDs, region.TokenCount, r.ExtraTokens}, []any{"different_text", []string{"p-000002"}, 10, 10})
}

func TestTheMisreadBoundIsAParameter(t *testing.T) {
	said := p1 + " one two three four five six " + p3
	r := aligned(t, []string{p1, p2, p3}, said, "").ComputeCoverage(AlignmentParams{MaxMisreadRun: 5, MinAnchorRun: 3})
	eq(t, r.Regions[0].Kind, "different_text")
	eq(t, aligned(t, []string{p1, p2, p3}, said, "").ComputeCoverage(DefaultParams).PresentTokens, 18)
}

func TestAShortReadCountsTheSurplusAsMissing(t *testing.T) {
	r := aligned(t, []string{p1, p2, p3}, p1+" golf hotel said three "+p3, "").ComputeCoverage(DefaultParams)
	region := one(t, r)
	eq(t, []any{region.Kind, region.TokenCount, region.FirstWord, region.LastWord, byID(r, "p-000002").Present}, []any{"short_read", 2, "kilo", "lima", 4})
}

func TestAShortChanceMatchInsideUnrelatedSpeechDoesNotCount(t *testing.T) {
	paragraph := "golf hotel the india juliet kilo lima mike november oscar papa"
	speech := "we will wait until the dog stops barking and carry on now"
	r := aligned(t, []string{p1, paragraph, p3}, p1+" "+speech+" "+p3, "").ComputeCoverage(DefaultParams)
	eq(t, []any{byID(r, "p-000002").Present, one(t, r).Kind}, []any{0, "different_text"})
}

func TestAShortMatchAtTheStartOfTheAlignmentIsAnAnchor(t *testing.T) {
	r := aligned(t, []string{p1}, "alpha bravo", "", Opcode{"equal", 0, 2, 0, 2}, Opcode{"delete", 2, 6, 2, 2}).ComputeCoverage(DefaultParams)
	eq(t, []any{r.PresentTokens, r.Regions[0].Kind}, []any{2, "tail"})
}

func TestExtraSpeechIsCountedAndNeverHeldAgainstTheNarrator(t *testing.T) {
	r := aligned(t, []string{p1, p2}, p1+" sorry let me go again "+p2, "").ComputeCoverage(DefaultParams)
	eq(t, []int{r.ExtraTokens, r.PresentTokens}, []int{5, 12})
	if !textComplete(r, 0.8, 3) {
		t.Fatal("extra speech never counts against the narrator")
	}
}

func TestAnOmittedTitleIsNotMissingAndAReadTitleIsNotExtra(t *testing.T) {
	omitted := aligned(t, []string{p1}, p1, "chapter one the pool").ComputeCoverage(DefaultParams)
	read := aligned(t, []string{p1}, "chapter one the pool "+p1, "chapter one the pool").ComputeCoverage(DefaultParams)
	eq(t, []any{len(omitted.Regions), omitted.BodyTokens, chapterFraction(omitted), len(read.Regions), read.ExtraTokens}, []any{0, 6, 1.0, 0, 0})
}

func TestAMisreadTitleIsNotCountedAgainstTheBody(t *testing.T) {
	r := aligned(t, []string{p1}, "chapter 1 "+p1, "chapter i").ComputeCoverage(DefaultParams)
	eq(t, []int{r.PresentTokens, r.ExtraTokens, len(r.Regions)}, []int{6, 0, 0})
}

func TestALargeGapWhereChapterTextWasReadAgainIsASkipNotDifferentText(t *testing.T) {
	long := "golf hotel india juliet kilo lima xray yankee zulu whiskey"
	eq(t, one(t, aligned(t, []string{p1, long, p3}, p1+" charlie delta echo foxtrot "+p3, "").ComputeCoverage(DefaultParams)).Kind, "skip")
}

func TestTheMissingRunThresholdSeparatesASkippedBlockFromADroppedWord(t *testing.T) {
	three := aligned(t, []string{p1 + " " + p2}, "alpha bravo charlie golf hotel india juliet kilo lima", "").ComputeCoverage(DefaultParams)
	eq(t, three.LongestMissingRun, 3)
	if !textComplete(three, 0.5, 3) || textComplete(three, 0.5, 2) {
		t.Fatal("the missing-run threshold decides a three-word run")
	}
}

func TestTheParagraphThresholdAppliesOnRead(t *testing.T) {
	r := aligned(t, []string{p1 + " " + p2 + " " + p3}, p1+" golf hotel india juliet kilo "+p3, "").ComputeCoverage(DefaultParams)
	p := byID(r, "p-000001")
	eq(t, presentFraction(p), 17.0/18.0)
	if !(presentFraction(p) >= 0.9) || presentFraction(p) >= 0.95 {
		t.Fatal("the paragraph threshold applies on read")
	}
}

func TestAMissingRunIsCountedAcrossParagraphBoundaries(t *testing.T) {
	r := aligned(t, []string{p1, p2, p3}, "alpha bravo charlie delta hotel india juliet kilo lima "+p3, "").ComputeCoverage(DefaultParams)
	region := one(t, r)
	eq(t, []any{region.ParagraphIDs, region.FirstWord, region.LastWord}, []any{[]string{"p-000001", "p-000002"}, "echo", "golf"})
	eq(t, []int{byID(r, "p-000001").LongestMissingRun, byID(r, "p-000002").LongestMissingRun, byID(r, "p-000003").LongestMissingRun}, []int{3, 3, 0})
}

func TestAShortEqualBlockBesideAnotherEqualBlockIsAnAnchor(t *testing.T) {
	// compare.Align fuses "sailcloth" against "sail cloth" into an equal block with uneven sides.
	a := aligned(t, []string{"of the sailcloth to sea"}, "of the sail cloth to sea", "",
		Opcode{"equal", 0, 2, 0, 2}, Opcode{"equal", 2, 3, 2, 4}, Opcode{"equal", 3, 5, 4, 6})
	r := a.ComputeCoverage(DefaultParams)
	eq(t, []int{r.PresentTokens, r.ExtraTokens, len(r.Regions)}, []int{5, 0, 0})
}

func TestNothingReadIsOneHeadRegionOverTheWholeChapter(t *testing.T) {
	r := aligned(t, []string{p1, p2}, "something else entirely", "").ComputeCoverage(DefaultParams)
	region := one(t, r)
	eq(t, []any{region.Kind, region.ParagraphIDs, chapterFraction(r)}, []any{"head", []string{"p-000001", "p-000002"}, 0.0})
}

func TestAnEmptyChapterAndAnEmptyParagraphCountAsComplete(t *testing.T) {
	empty := aligned(t, nil, "anything at all", "").ComputeCoverage(DefaultParams)
	eq(t, []any{empty.BodyTokens, chapterFraction(empty), empty.ExtraTokens}, []any{0, 1.0, 3})
	if !textComplete(empty, 0.8, 3) {
		t.Fatal("an empty chapter is complete")
	}
	eq(t, presentFraction(byID(aligned(t, []string{p1, ""}, p1, "").ComputeCoverage(DefaultParams), "p-000002")), 1.0)
}

func TestAnInconsistentAlignmentIsRejected(t *testing.T) {
	base := func() AlignedChapter {
		return AlignedChapter{
			DocTokens: []string{"a", "b", "c"}, DocWords: []string{"a", "b", "c"}, TokenParagraph: []int{0, 0, 0},
			ParagraphIDs: []string{"p-000001"}, AudioTokens: []string{"a", "b", "c"}, Opcodes: []Opcode{{"equal", 0, 3, 0, 3}},
		}
	}
	cases := []struct {
		change  func(*AlignedChapter)
		message string
	}{
		{func(a *AlignedChapter) { a.DocWords = []string{"a"} }, "same length"},
		{func(a *AlignedChapter) { a.TokenParagraph = []int{5, 0, 0} }, "index paragraph_ids"},
		{func(a *AlignedChapter) { a.Opcodes = []Opcode{{"equal", 0, 2, 0, 2}} }, "not at the ends"},
		{func(a *AlignedChapter) { a.Opcodes = []Opcode{{"equal", 0, 3, 0, 3}, {"insert", 3, 3, 4, 4}} }, "does not continue"},
		{func(a *AlignedChapter) { a.Opcodes = []Opcode{{"swap", 0, 3, 0, 3}} }, "does not continue"},
		{func(a *AlignedChapter) { a.Opcodes = []Opcode{{"equal", 0, 3, 0, 0}, {"insert", 3, 3, 0, 3}} }, "empty side"},
	}
	for _, c := range cases {
		a := base()
		c.change(&a)
		if err := a.Validate(); err == nil || !strings.Contains(err.Error(), c.message) {
			t.Errorf("want an error with %q, got %v", c.message, err)
		}
	}
}

func TestOutOfRangeParametersAreRejected(t *testing.T) {
	for _, c := range []struct {
		params  AlignmentParams
		message string
	}{{AlignmentParams{-1, 3}, "max_misread_run"}, {AlignmentParams{8, 0}, "min_anchor_run"}} {
		if err := c.params.Validate(); err == nil || !strings.Contains(err.Error(), c.message) {
			t.Errorf("%+v: want an error with %q, got %v", c.params, c.message, err)
		}
	}
	if _, err := Results(Input{Params: AlignmentParams{8, 0}}); err == nil {
		t.Fatal("Results must refuse out-of-range parameters")
	}
}

func TestTheDefaultsAreTheShippedCalibratedValues(t *testing.T) {
	eq(t, DefaultParams, AlignmentParams{MaxMisreadRun: 8, MinAnchorRun: 3})
}

// viaCompare aligns through compare's own tokenizing: numbers, homophones and hyphen fusing.
func viaCompare(t *testing.T, title string, paragraphs []string, said string) ChapterCoverage {
	t.Helper()
	var tokenizer compare.Tokenizer
	units := tokenizer.BuildChapterUnits(title, paragraphs)
	words := []compare.Word{}
	for index, word := range strings.Fields(said) {
		words = append(words, compare.Word{Text: word, Start: float64(index) * 0.4, End: float64(index)*0.4 + 0.4})
	}
	ids := make([]string, len(paragraphs))
	for index := range paragraphs {
		ids[index] = fmt.Sprintf("p-%06d", index+1)
	}
	a := AlignedFromAlignment(tokenizer.Align(units, words), units.Sentences, ids)
	if err := a.Validate(); err != nil {
		t.Fatal(err)
	}
	return a.ComputeCoverage(DefaultParams)
}

func TestSpokenNumbersHomophonesAndSplitCompoundsArePresent(t *testing.T) {
	r := viaCompare(t, "Chapter 4", []string{"They're carrying 214 barrels and a notebook to the ship.", "It sailed in 1847, a well-known year."},
		"chapter four their carrying two hundred fourteen barrels and a note book to the ship it sailed in 1847 a well known year")
	eq(t, []int{r.PresentTokens, len(r.Regions), r.ExtraTokens}, []int{r.BodyTokens, 0, 0})
}

func TestRegionWordsAreTheManuscriptsOwnWords(t *testing.T) {
	region := one(t, viaCompare(t, "Chapter One", []string{"The first paragraph is read aloud.", "The second paragraph, sadly, is not."}, "the first paragraph is read aloud"))
	eq(t, []string{region.Kind, region.FirstWord, region.LastWord}, []string{"tail", "The", "not."})
}

func TestASpokenSubtitleInTheHeadingIsNeitherMissingNorExtra(t *testing.T) {
	r := viaCompare(t, "Chapter I Down the Rabbit-Hole", []string{"Alice was beginning to get very tired of sitting by her sister."},
		"chapter one down the rabbit hole alice was beginning to get very tired of sitting by her sister")
	eq(t, []int{r.PresentTokens, r.BodyTokens, r.ExtraTokens, len(r.Regions)}, []int{12, 12, 0, 0})
}

func TestWordsSaidBeforeTheFirstLineOfAChapterWithAHeadingAreNotExtra(t *testing.T) {
	// Issue #2251 item 7: what is said before the chapter's first word is the heading in the narrator's own words.
	for _, said := range []string{
		"chapter twelve part one " + p1 + " " + p2, // other words in the heading
		"take two chapter twelve " + p1 + " " + p2, // words before the heading
		"chapter twelve sorry " + p1 + " " + p2,    // a word between the heading and the first line
		"the harbour " + p1 + " " + p2,             // the heading said some other way
	} {
		a := aligned(t, []string{p1, p2}, said, "chapter twelve")
		r := a.ComputeCoverage(DefaultParams)
		_, extras := a.AlignTokens(DefaultParams)
		eq(t, []int{r.PresentTokens, r.ExtraTokens, len(r.Regions), len(extras)}, []int{12, 0, 0, 0})
	}
}

func TestWordsSaidBeforeTheFirstLineOfAScriptWithNoHeadingAreExtra(t *testing.T) {
	a := aligned(t, []string{p1, p2}, "take two "+p1+" "+p2, "")
	_, extras := a.AlignTokens(DefaultParams)
	eq(t, []any{a.ComputeCoverage(DefaultParams).ExtraTokens, extras}, []any{2, [][2]int{{0, 2}}})
}

func TestWordsSaidAfterTheFirstLineOfAChapterWithAHeadingAreStillExtra(t *testing.T) {
	a := aligned(t, []string{p1, p2}, "chapter twelve "+p1+" take two "+p2, "chapter twelve")
	_, extras := a.AlignTokens(DefaultParams)
	said := [][]string{}
	for _, extra := range extras {
		said = append(said, a.AudioTokens[extra[0]:extra[1]])
	}
	eq(t, []any{a.ComputeCoverage(DefaultParams).ExtraTokens, said}, []any{2, [][]string{{"take", "two"}}})
}

func TestAPhraseSaidTwiceIsARepeatOfTheChapterTextItSaysAgain(t *testing.T) {
	// Issue #2251 item 30: the second copy of "golf hotel india" is a second take (docs/research/proof-pickups-editing-split.md, C1).
	a := aligned(t, []string{p1, p2}, p1+" golf hotel india golf hotel india juliet kilo lima", "")
	r := a.ComputeCoverage(DefaultParams)
	eq(t, []int{r.PresentTokens, r.ExtraTokens, len(r.Regions)}, []int{12, 3, 0})
	tokens, extras := a.AlignTokens(DefaultParams)
	eq(t, a.AudioTokens[extras[0][0]:extras[0][1]], []string{"golf", "hotel", "india"})
	eq(t, a.Repeats(tokens, extras), []*Repeat{{Start: 6, End: 9, First: 0, Last: 3}})
}

func repeatOf(t *testing.T, paragraphs []string, said string) (*AlignedChapter, [][2]int, []*Repeat) {
	t.Helper()
	a := aligned(t, paragraphs, said, "")
	tokens, extras := a.AlignTokens(DefaultParams)
	return a, extras, a.Repeats(tokens, extras)
}

func TestARetakeAfterAnAsideIsARepeatOfTheWordsBeforeIt(t *testing.T) {
	a, extras, repeats := repeatOf(t, []string{p1, p2}, p1+" "+p2+" once more india juliet kilo lima")
	eq(t, a.AudioTokens[extras[0][0]:extras[0][1]], []string{"once", "more", "india", "juliet", "kilo", "lima"})
	eq(t, repeats, []*Repeat{{Start: 8, End: 12, First: 2, Last: 6}})
}

func TestAFalseStartThenAnAsideIsARepeatOfTheWordsAfterIt(t *testing.T) {
	a, extras, repeats := repeatOf(t, []string{p1, p2}, p1+" golf hotel india sorry "+p2)
	said := a.AudioTokens[extras[0][0]:extras[0][1]]
	repeat := repeats[0]
	eq(t, said[repeat.First:repeat.Last], a.DocTokens[repeat.Start:repeat.End])
	eq(t, repeat.End-repeat.Start, 3)
}

func TestTwoWordsSaidAgainAreNotARepeatButAWholeTwoWordLineIs(t *testing.T) {
	_, _, repeats := repeatOf(t, []string{p1, p2}, p1+" golf hotel golf hotel india juliet kilo lima")
	eq(t, repeats, []*Repeat{nil})
	_, _, repeats = repeatOf(t, []string{p1, "golf hotel", p3}, p1+" golf hotel golf hotel "+p3)
	if repeats[0] == nil || repeats[0].End-repeats[0].Start != 2 {
		t.Fatalf("a whole two-word line said again is a repeat: %+v", repeats)
	}
}

func TestWordsThatAreNotTheChapterTextBesideThemAreNoRepeat(t *testing.T) {
	_, _, repeats := repeatOf(t, []string{p1, p2, p3}, p1+" mike november oscar "+p2+" "+p3)
	eq(t, repeats, []*Repeat{nil})
	_, _, repeats = repeatOf(t, []string{p1, p2}, p1+" what a lovely day "+p2)
	eq(t, repeats, []*Repeat{nil})
}

func TestARunBeforeAnythingWasHeardCanRepeatTheWordsAfterIt(t *testing.T) {
	_, _, repeats := repeatOf(t, []string{p1}, "alpha bravo charlie "+p1)
	if r := repeats[0]; r == nil || (r.Start != 0 || r.End != 3) && (r.Start != 3 || r.End != 6) {
		t.Fatalf("got %+v", repeats)
	}
}

func TestTheRepeatRuleAnswersTheSharedParityCases(t *testing.T) {
	// The Editing page runs the same rule (src/studio/ui/src/components/editing/model/duplicates.ts saysScriptAgain) on the same file.
	working, _ := os.Getwd()
	raw, err := os.ReadFile(filepath.Join(layout.FindRoot(working), "tests", "fixtures", "repeat-rule", "parity-cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases struct {
		Cases []struct {
			Name, Script, Run string
			Prev, Next        *int
			Repeat            bool
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil || len(cases.Cases) == 0 {
		t.Fatalf("parity cases: %v", err)
	}
	for _, c := range cases.Cases {
		script := strings.Fields(c.Script)
		found := RepeatOf(strings.Fields(c.Run), script, make([]int, len(script)), c.Prev, c.Next)
		if (found != nil) != c.Repeat {
			t.Errorf("%s: repeat = %v, want %v", c.Name, found != nil, c.Repeat)
		}
	}
}

func TestARetakeEndsWithTheWordsBeforeAndARestartBeginsWithTheWordsAfter(t *testing.T) {
	doc := []string{"a", "b", "c", "d", "e", "f"}
	lines := []int{0, 0, 0, 1, 1, 1}
	// Before is "c" (index 2), after is "d" (index 3): "a b c" ends with the words up to before.
	eq(t, RepeatOf([]string{"a", "b", "c"}, doc, lines, intp(2), intp(3)), &Repeat{Start: 0, End: 3, First: 0, Last: 3})
	eq(t, RepeatOf([]string{"d", "e", "f", "x"}, doc, lines, intp(2), intp(3)), &Repeat{Start: 3, End: 6, First: 0, Last: 3})
}

func TestTwoWordsAcrossALineBreakAreNotAWholeLineSaidAgain(t *testing.T) {
	doc := []string{"alpha", "golf", "hotel", "india"}
	lines := []int{0, 0, 1, 1}
	if RepeatOf([]string{"golf", "hotel"}, doc, lines, intp(2), nil) != nil {
		t.Fatal("two words straddling a line break are no repeat")
	}
	eq(t, RepeatOf([]string{"hotel", "india"}, doc, lines, intp(3), nil), &Repeat{Start: 2, End: 4, First: 0, Last: 2})
}
