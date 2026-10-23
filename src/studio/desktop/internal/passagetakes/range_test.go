package passagetakes

import (
	"reflect"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

func rangeToken(index int, paragraph string, word int, item *int, start, end float64) coverage.TokenLine {
	line := coverage.TokenLine{Index: index, Word: word, Item: item, Status: "read"}
	if paragraph != "" {
		line.ParagraphID = &paragraph
	}
	if item != nil {
		line.Start, line.End = &start, &end
	}
	return line
}

func itemIndex(i int) *int { return &i }

// rangeView is one paragraph of four words: three heard on item 0, which sits at 10 s in the project and plays its source
// from 2 s at rate 2, the fourth on item 1. The fifth token was not heard.
func rangeView() coverage.AlignmentView {
	return coverage.AlignmentView{
		Tokens: []coverage.TokenLine{
			rangeToken(0, "p-1", 0, itemIndex(0), 4, 5),
			rangeToken(1, "p-1", 1, itemIndex(0), 5, 6),
			rangeToken(2, "p-1", 2, itemIndex(0), 6, 8),
			rangeToken(3, "p-1", 3, itemIndex(1), 1, 2),
			rangeToken(4, "p-1", 4, nil, 0, 0),
		},
		Items: []coverage.AlignmentItem{
			{Index: 0, ItemGUID: "{ITEM-1}", Live: true, TakeGUID: "{TAKE-1}", SourceStart: 2, PlayRate: 2, Position: 10, Length: 4},
			{Index: 1, ItemGUID: "{ITEM-2}", Live: true, TakeGUID: "{TAKE-2}", Position: 20, Length: 5},
		},
	}
}

// The range resolves to its item's GUID and project seconds: position + (source - source start) / rate.
func TestResolveRangeAnswersTheItemAndTheProjectSecondsFromTheStoredAlignment(t *testing.T) {
	got, refused := ResolveRange(rangeView(), "c-1", 0, 2)
	if refused != nil {
		t.Fatalf("refused %+v", *refused)
	}
	want := CutRange{
		Request: dawport.RangeRequest{ChapterID: "c-1", ItemGUID: "{ITEM-1}", Start: 11, End: 13, Words: 3},
		Words:   []Word{{"p-1", 0}, {"p-1", 1}, {"p-1", 2}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ResolveRange = %+v, want %+v", got, want)
	}
	one, refused := ResolveRange(rangeView(), "c-1", 3, 3)
	if refused != nil || one.Request.ItemGUID != "{ITEM-2}" || one.Request.Start != 21 || one.Request.End != 22 || one.Request.Words != 1 {
		t.Fatalf("one word on a rate-1 item = %+v, %v", one, refused)
	}
}

func TestResolveRangeRefusesWhatCannotBeCut(t *testing.T) {
	gone := rangeView()
	gone.Items[0].Live = false
	moved := rangeView()
	moved.Items[0].Length = 2
	noTime := rangeView()
	noTime.Tokens[0].Start = nil
	for name, c := range map[string]struct {
		view        coverage.AlignmentView
		first, last int
		want        dawport.Result
	}{
		"backwards":         {rangeView(), 2, 1, dawport.RefusedStale(rangeNotInAlignmentSentence)},
		"past the end":      {rangeView(), 4, 5, dawport.RefusedStale(rangeNotInAlignmentSentence)},
		"negative":          {rangeView(), -1, 0, dawport.RefusedStale(rangeNotInAlignmentSentence)},
		"two items":         {rangeView(), 2, 3, dawport.Refused(rangeCrossesItemsSentence)},
		"not heard":         {rangeView(), 3, 4, dawport.Refused(rangeNotHeardSentence)},
		"no time":           {noTime, 0, 1, dawport.Refused(rangeNoTimeSentence)},
		"item gone":         {gone, 0, 1, dawport.RefusedStale(rangeItemGoneSentence)},
		"item trimmed":      {moved, 0, 2, dawport.RefusedStale(rangeItemMovedSentence)},
		"an empty view":     {coverage.AlignmentView{}, 0, 0, dawport.RefusedStale(rangeNotInAlignmentSentence)},
		"an unindexed item": {coverage.AlignmentView{Tokens: rangeView().Tokens}, 0, 0, dawport.RefusedStale(rangeItemGoneSentence)},
	} {
		t.Run(name, func(t *testing.T) {
			got, refused := ResolveRange(c.view, "c-1", c.first, c.last)
			if refused == nil || !reflect.DeepEqual(*refused, c.want) || !reflect.DeepEqual(got, CutRange{}) {
				t.Fatalf("ResolveRange = %+v, %+v; want %+v", got, refused, c.want)
			}
		})
	}
}

func TestCutRangeAllCutHoldsOnlyWhenEveryParagraphWordIsCut(t *testing.T) {
	cut := map[Word]bool{{"p-1", 0}: true, {"p-1", 1}: true}
	in := func(w Word) bool { return cut[w] }
	if !(CutRange{Words: []Word{{"p-1", 0}, {"p-1", 1}}}).AllCut(in) {
		t.Fatal("two cut words are not all cut")
	}
	for _, words := range [][]Word{nil, {{"p-1", 1}, {"p-1", 2}}} {
		if (CutRange{Words: words}).AllCut(in) {
			t.Fatalf("%v reads as all cut", words)
		}
	}
	if (CutRange{Words: []Word{{"", 0}}}).AllCut(func(Word) bool { return true }) {
		t.Fatal("a title word reads as cut")
	}
}
