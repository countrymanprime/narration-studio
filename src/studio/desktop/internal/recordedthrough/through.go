// Package recordedthrough decides how far a chapter is recorded: the one "recorded through" value the Booth resumes at
// and Production, Editing and Proof show beside each chapter. It weighs what the host already measures, never anything new:
// the chapter's current Proof (recording coverage) result, the stretches of script the Booth followed during takes
// (the teleprompter's reading file), and, when neither says, the length of the chapter's linked track against its words.
// It reads no file; the host gathers the inputs (docs/reference/data-files.md, the teleprompter reading row).
package recordedthrough

import (
	"math"
	"sort"
)

// Where a Through came from.
const (
	// SourceProof is the chapter's current recording coverage result: which words the recording says.
	SourceProof = "proof"
	// SourceBooth is the Booth's own record of the words it followed during takes.
	SourceBooth = "booth"
	// SourceDAW is the linked track's recorded length against the chapter's words at the planning pace: an estimate.
	SourceDAW = "daw"
)

// GapWords is the longest stretch of unrecorded words that still counts as one run: the narrator started the next take a
// sentence on, or a line is missing that Pickups will fix. A longer stretch ends the run.
const GapWords = 40

// MaxRanges bounds the stretches a reading file keeps, so a chapter read in many short takes cannot grow it without end.
const MaxRanges = 64

// presentShare is the share of a paragraph's words a Proof result must hear for the paragraph to count as recorded, and
// fullShare the share above which the whole paragraph is (a word or two the recognizer missed is not the end of the recording).
const (
	presentShare = 0.5
	fullShare    = 0.9
)

// completeSlack is how many words short of the last the recording may stop and still be the whole chapter (a last word swallowed).
const completeSlack = 3

// Script is a chapter's words as the teleprompter counts them (teleprompter.ChapterScript): Tokens in all, title first, then
// each paragraph's Count words from Start.
type Script struct {
	Paragraphs []Paragraph
	Tokens     int
}

// Paragraph is one paragraph's place in a Script.
type Paragraph struct {
	ID    string
	Start int
	Count int
}

// Range is a stretch of script words a take followed: From the first, To one past the last (a position event's `read`).
type Range struct {
	From int `json:"from"`
	To   int `json:"to"`
}

// Coverage is one paragraph of a Proof result: its words as the coverage sidecar counts them, and how many it heard.
type Coverage struct {
	ID      string
	Tokens  int
	Present int
}

// Inputs is everything Resolve weighs for one chapter. Proof is nil without a current result, Booth nil without a reading,
// RecordedSeconds nil when the chapter's track length is not known (not linked, several tracks, no project).
type Inputs struct {
	Script          Script
	Proof           []Coverage
	Booth           []Range
	RecordedSeconds *float64
	WordsPerHour    float64
}

// Through is how far a chapter is recorded: the last recorded word, as a paragraph and the word's index in it (the Booth's
// own way to name a place), the share of the chapter's words up to there, and whether that is the whole chapter. Confident
// is false for SourceDAW, which is an estimate ("about").
type Through struct {
	ParagraphID string `json:"paragraphId"`
	Word        int    `json:"word"`
	Percent     int    `json:"percent"`
	Complete    bool   `json:"complete"`
	Source      string `json:"source"`
	Confident   bool   `json:"confident"`
}

// Resolve is the chapter's Through, or nil when nothing says any of it is recorded. A measured place (the further of
// Proof's and the Booth's) wins over the track-length estimate; a linked track with no audio on it at all means the takes
// were removed, whatever the Booth remembers.
func Resolve(in Inputs) *Through {
	script := in.Script
	if script.Tokens <= 0 || len(script.Paragraphs) == 0 {
		return nil
	}
	if in.RecordedSeconds != nil && *in.RecordedSeconds <= 0 {
		return nil
	}
	end, source := -1, ""
	if to := proofEnd(script, in.Proof); to > end {
		end, source = to, SourceProof
	}
	if to := boothEnd(script, in.Booth); to > end {
		end, source = to, SourceBooth
	}
	confident := source != ""
	if !confident {
		end, source = dawEnd(script, in.RecordedSeconds, in.WordsPerHour), SourceDAW
	}
	return place(script, end, source, confident)
}

// place turns a run that ends before word `end` (exclusive) into a Through, or nil when it ends inside the title.
func place(script Script, end int, source string, confident bool) *Through {
	first, last := script.Paragraphs[0], script.Paragraphs[len(script.Paragraphs)-1]
	if end <= first.Start {
		return nil
	}
	finalWord := last.Start + last.Count
	complete := end >= finalWord-completeSlack
	if complete {
		end = finalWord
	}
	word := end - 1
	at := first
	for _, paragraph := range script.Paragraphs {
		if paragraph.Count > 0 && paragraph.Start <= word {
			at = paragraph
		}
	}
	offset := min(max(word-at.Start, 0), max(at.Count-1, 0))
	percent := int(math.Round(float64(min(end, script.Tokens)) / float64(script.Tokens) * 100))
	if complete {
		percent = 100
	} else {
		percent = min(percent, 99)
	}
	return &Through{ParagraphID: at.ID, Word: offset, Percent: percent, Complete: complete, Source: source, Confident: confident}
}

// proofEnd is where the run of recorded paragraphs from the top ends (exclusive, in script words), or -1. A paragraph is
// recorded when Proof heard presentShare of it; a stretch of unrecorded paragraphs ends the run once it is two paragraphs
// and GapWords long. A last paragraph heard only in part ends at the share heard.
func proofEnd(script Script, proof []Coverage) int {
	if len(proof) == 0 {
		return -1
	}
	heard := make(map[string]Coverage, len(proof))
	for _, line := range proof {
		heard[line.ID] = line
	}
	end, gapParagraphs, gapWords := -1, 0, 0
	for _, paragraph := range script.Paragraphs {
		line, ok := heard[paragraph.ID]
		share := 0.0
		if ok && line.Tokens > 0 {
			share = float64(line.Present) / float64(line.Tokens)
		} else if ok && line.Tokens == 0 {
			share = 1
		}
		if share < presentShare {
			gapParagraphs, gapWords = gapParagraphs+1, gapWords+paragraph.Count
			if gapParagraphs >= 2 && gapWords >= GapWords {
				break
			}
			continue
		}
		gapParagraphs, gapWords = 0, 0
		if share >= fullShare {
			end = paragraph.Start + paragraph.Count
		} else {
			end = paragraph.Start + int(math.Round(share*float64(paragraph.Count)))
		}
	}
	return end
}

// boothEnd is where the takes the Booth followed reach from the top without a gap longer than GapWords (exclusive), or -1.
// The first take must begin within GapWords of the first paragraph: a take that began half way is a pickup, not the
// chapter recorded to there.
func boothEnd(script Script, ranges []Range) int {
	valid := make([]Range, 0, len(ranges))
	for _, r := range ranges {
		if r.From >= 0 && r.To > r.From {
			valid = append(valid, r)
		}
	}
	if len(valid) == 0 {
		return -1
	}
	sort.Slice(valid, func(i, j int) bool { return valid[i].From < valid[j].From })
	if valid[0].From > script.Paragraphs[0].Start+GapWords {
		return -1
	}
	end := valid[0].To
	for _, r := range valid[1:] {
		if r.From > end+GapWords {
			break
		}
		end = max(end, r.To)
	}
	return min(end, script.Tokens)
}

// dawEnd is the word the track's recorded length reaches at wordsPerHour, or -1 when it cannot say.
func dawEnd(script Script, recorded *float64, wordsPerHour float64) int {
	if recorded == nil || wordsPerHour <= 0 {
		return -1
	}
	return int(math.Round(*recorded / 3600 * wordsPerHour))
}

// Merge adds a take's stretch to a chapter's stretches: sorted, overlapping or touching ones joined, at most MaxRanges
// (the earliest kept, since only the run from the top counts). A backwards or negative stretch adds nothing.
func Merge(ranges []Range, add Range) []Range {
	all := make([]Range, 0, len(ranges)+1)
	for _, r := range append(append([]Range{}, ranges...), add) {
		if r.From >= 0 && r.To > r.From {
			all = append(all, r)
		}
	}
	sort.Slice(all, func(i, j int) bool { return all[i].From < all[j].From })
	merged := make([]Range, 0, len(all))
	for _, r := range all {
		if n := len(merged); n > 0 && r.From <= merged[n-1].To {
			merged[n-1].To = max(merged[n-1].To, r.To)
			continue
		}
		merged = append(merged, r)
	}
	if len(merged) > MaxRanges {
		merged = merged[:MaxRanges]
	}
	return merged
}
