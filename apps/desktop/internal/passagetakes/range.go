package passagetakes

import (
	"math"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// Sentences ResolveRange refuses with. The stale ones carry dawport.CodeStale (ADR 0861).
const (
	rangeNotInAlignmentSentence = "That selection is not in this chapter's alignment any more, so nothing was changed. Reload the chapter and select the words again."
	rangeCrossesItemsSentence   = "These words cross two REAPER items. Select words from one item at a time."
	rangeNotHeardSentence       = "These words weren't heard in the recording, so there's no audio to cut. Run the check again if the chapter has changed."
	rangeNoTimeSentence         = "These words have no time in their audio to cut."
	rangeItemGoneSentence       = "These words' item is no longer in the REAPER project as it was checked, so nothing was changed. Run the check again to find it where it is now."
	rangeItemMovedSentence      = "These words' item no longer covers where they were heard (it was trimmed or moved), so nothing was changed. Run the check again."
)

// rangeSlack is how far, in seconds, a range may sit outside its item's played span and still be the item's: the saved
// project rounds positions to a few decimals.
const rangeSlack = 1e-6

// Word is one chapter word a range holds, as the edit log keys it: its paragraph and its ordinal there. A title or
// subtitle token has no paragraph.
type Word struct {
	ParagraphID string
	Ordinal     int
}

// CutRange is a token range resolved on the host: the request a RangeCutter is sent and the words it holds.
type CutRange struct {
	Request dawport.RangeRequest
	Words   []Word
}

// ResolveRange joins tokens first..last of chapterID's stored alignment to one item and the project seconds the words were
// heard at, from the alignment and the item as the saved project has it (ADR 0242): the page sends token indices only,
// never a GUID or a time (threat model row 5f). It refuses, as a Result and never an error, because these are the
// narrator's selection: a range outside the alignment or read backwards (stale: the page's copy is out of date), words
// heard on two items (one item per request, ADR 0705), a word nothing was heard for, a word with no time, and an item the
// saved project no longer has or that no longer covers the words (both stale).
func ResolveRange(view coverage.AlignmentView, chapterID string, first, last int) (CutRange, *dawport.Result) {
	refuse := func(result dawport.Result) (CutRange, *dawport.Result) { return CutRange{}, &result }
	if first < 0 || last < first || last >= len(view.Tokens) {
		return refuse(dawport.RefusedStale(rangeNotInAlignmentSentence))
	}
	tokens := view.Tokens[first : last+1]
	words := make([]Word, 0, len(tokens))
	itemIndex := -1
	for _, token := range tokens {
		if token.Item == nil {
			return refuse(dawport.Refused(rangeNotHeardSentence))
		}
		if itemIndex >= 0 && *token.Item != itemIndex {
			return refuse(dawport.Refused(rangeCrossesItemsSentence))
		}
		itemIndex = *token.Item
		word := Word{Ordinal: token.Word}
		if token.ParagraphID != nil {
			word.ParagraphID = *token.ParagraphID
		}
		words = append(words, word)
	}
	start, end := tokens[0].Start, tokens[len(tokens)-1].End
	if start == nil || end == nil || !(*end > *start) {
		return refuse(dawport.Refused(rangeNoTimeSentence))
	}
	item, ok := itemAt(view.Items, itemIndex)
	if !ok || item.ItemGUID == "" || !item.Live {
		return refuse(dawport.RefusedStale(rangeItemGoneSentence))
	}
	rate := item.PlayRate
	if rate <= 0 {
		rate = 1
	}
	at := func(source float64) float64 { return item.Position + (source-item.SourceStart)/rate }
	from, to := at(*start), at(*end)
	if math.IsNaN(from) || math.IsNaN(to) || from < item.Position-rangeSlack || to > item.Position+item.Length+rangeSlack {
		return refuse(dawport.RefusedStale(rangeItemMovedSentence))
	}
	from, to = max(from, item.Position), min(to, item.Position+item.Length)
	return CutRange{
		Request: dawport.RangeRequest{ChapterID: chapterID, ItemGUID: item.ItemGUID, Start: from, End: to, Words: len(tokens)},
		Words:   words,
	}, nil
}

// itemAt is the view's item with the token's item index.
func itemAt(items []coverage.AlignmentItem, index int) (coverage.AlignmentItem, bool) {
	for _, item := range items {
		if item.Index == index {
			return item, true
		}
	}
	return coverage.AlignmentItem{}, false
}

// AllCut reports whether every word of r is one cut already holds: cut answers whether a paragraph's word at an ordinal is
// in a cut the edit log keeps. A title or subtitle word is never in a cut.
func (r CutRange) AllCut(cut func(Word) bool) bool {
	if len(r.Words) == 0 {
		return false
	}
	for _, word := range r.Words {
		if word.ParagraphID == "" || !cut(word) {
			return false
		}
	}
	return true
}
