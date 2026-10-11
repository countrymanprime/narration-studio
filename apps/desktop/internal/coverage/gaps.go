package coverage

import (
	"fmt"
	"slices"
	"strings"
)

// GapKind is what a gap in the recording is (ADR 0830): the stretch of script
// not said (missing), words said that are not in the script (extra), other
// words said in place of the script's (misread), or a region kind this reader
// does not know yet (other, carried so a newer sidecar never loses a gap).
type GapKind string

const (
	GapMissing GapKind = "missing"
	GapExtra   GapKind = "extra"
	GapMisread GapKind = "misread"
	GapOther   GapKind = "other"
)

// ConfNoWordScores is the reason every gap's confidence is null: the words file
// carries no Whisper word probabilities, so a score would be made up (ADR 0830).
const ConfNoWordScores = "no_word_scores"

// gapKinds maps a sidecar region kind to a gap kind. head and tail are not
// here: an unread start or end is unfinished recording (Unfinished), not a
// pickup. A kind that is in neither place is carried as GapOther.
var gapKinds = map[string]GapKind{
	"skip":           GapMissing,
	"different_text": GapMisread,
	"short_read":     GapMisread,
}

// gapKindOf reports the gap kind of a region kind, and false for head and tail.
func gapKindOf(regionKind string) (GapKind, bool) {
	if regionKind == "head" || regionKind == "tail" {
		return "", false
	}
	if kind, known := gapKinds[regionKind]; known {
		return kind, true
	}
	return GapOther, true
}

// GapLine is one line to redo in the read part of a chapter. Confidence is a
// number or null: it is always null with a ConfReason today.
type GapLine struct {
	ID           string          `json:"id"`
	Kind         GapKind         `json:"kind"`
	ParagraphIDs []string        `json:"paragraphIds"`
	TokenCount   int             `json:"tokenCount"`
	FirstWord    string          `json:"firstWord"`
	LastWord     string          `json:"lastWord"`
	Text         *string         `json:"text,omitempty"`
	Position     *RegionPosition `json:"position,omitempty"`
	Before       *RegionPosition `json:"before,omitempty"`
	After        *RegionPosition `json:"after,omitempty"`
	Confidence   *float64        `json:"confidence"`
	ConfReason   string          `json:"confReason"`
}

// Unfinished counts the paragraphs not read at the start and at the end of the
// chapter. They are recording still to do, not pickups. A chapter with nothing
// read has Start set to every paragraph.
type Unfinished struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

// ClassifyGaps derives the gap taxonomy from a stored report (ADR 0830): the
// regions and extra runs inside the read part, in reading order, and the
// unread start and end. The list is never nil.
func ClassifyGaps(report Report) ([]GapLine, Unfinished) {
	index := map[string]int{}
	first, last := -1, -1
	for i, paragraph := range report.Paragraphs {
		index[paragraph.ID] = i
		if paragraph.Present > 0 {
			if first < 0 {
				first = i
			}
			last = i
		}
	}
	gaps := []GapLine{}
	if first < 0 {
		return gaps, Unfinished{Start: len(report.Paragraphs)}
	}
	unfinished := Unfinished{Start: first, End: len(report.Paragraphs) - 1 - last}

	type placed struct {
		paragraph, token int
		gap              GapLine
	}
	var found []placed
	claimed := map[int]bool{}
	for ordinal, region := range report.Regions {
		kind, isGap := gapKindOf(region.Kind)
		if !isGap || !withinRead(region.ParagraphIDs, index, first, last) {
			continue
		}
		paragraph := paragraphIndex(region.ParagraphIDs, index)
		token := -ordinal - 1
		if len(region.ParagraphIDs) > 0 {
			for i, t := range report.Tokens {
				if !claimed[i] && t.Status == region.Kind && t.ParagraphID != nil && *t.ParagraphID == region.ParagraphIDs[0] {
					token = i
					for n := 0; n < region.TokenCount && i+n < len(report.Tokens); n++ {
						claimed[i+n] = true
					}
					break
				}
			}
		}
		found = append(found, placed{paragraph, token, GapLine{
			ID: gapID(kind, region.ParagraphIDs, token), Kind: kind, ParagraphIDs: nonNil(region.ParagraphIDs),
			TokenCount: region.TokenCount, FirstWord: region.FirstWord, LastWord: region.LastWord,
			Position: region.Position, Before: region.Before, After: region.After, ConfReason: ConfNoWordScores,
		}})
	}

	firstHeard, lastHeard := -1, -1
	for _, token := range report.Tokens {
		if token.ParagraphID != nil && (token.Status == "read" || token.Status == "misread") {
			if firstHeard < 0 {
				firstHeard = token.Index
			}
			lastHeard = token.Index
		}
	}
	for _, extra := range report.Extras {
		after := extra.AfterToken
		if after == nil || *after < firstHeard || *after >= lastHeard || *after >= len(report.Tokens) {
			continue
		}
		ids := []string{}
		paragraph := first
		if id := report.Tokens[*after].ParagraphID; id != nil {
			ids = []string{*id}
			paragraph = paragraphIndex(ids, index)
		}
		words := strings.Fields(extra.Text)
		line := GapLine{
			ID: gapID(GapExtra, ids, *after+1), Kind: GapExtra, ParagraphIDs: ids, TokenCount: extra.Tokens,
			Text: &extra.Text, Position: &extra.Start, Before: &extra.Start, After: &extra.End, ConfReason: ConfNoWordScores,
		}
		if len(words) > 0 {
			line.FirstWord, line.LastWord = words[0], words[len(words)-1]
		}
		found = append(found, placed{paragraph, *after + 1, line})
	}

	slices.SortStableFunc(found, func(a, b placed) int {
		if a.paragraph != b.paragraph {
			return a.paragraph - b.paragraph
		}
		return a.token - b.token
	})
	for _, p := range found {
		gaps = append(gaps, p.gap)
	}
	return gaps, unfinished
}

func gapID(kind GapKind, paragraphIDs []string, token int) string {
	paragraph := ""
	if len(paragraphIDs) > 0 {
		paragraph = paragraphIDs[0]
	}
	return fmt.Sprintf("%s:%s:%d", kind, paragraph, token)
}

// paragraphIndex is the position of the first paragraph a gap names (0 when none is known).
func paragraphIndex(ids []string, index map[string]int) int {
	if len(ids) > 0 {
		return index[ids[0]]
	}
	return 0
}

// withinRead reports whether every known paragraph of a region lies between the first and last read paragraph.
func withinRead(ids []string, index map[string]int, first, last int) bool {
	for _, id := range ids {
		if i, known := index[id]; known && (i < first || i > last) {
			return false
		}
	}
	return true
}
