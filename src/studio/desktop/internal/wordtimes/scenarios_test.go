package wordtimes

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"testing"
)

// A synthetic chapter of 36 sentences of five words (0.45 s each), the shape the follow-along is scored on. The speech is synthetic with known
// timings; real speech and real REAPER are checked by scripts/dev/word-time-error.py and scripts/ci/real-reaper (scenarios_wordtimes.py).
const (
	sentences         = 36
	wordsPerSentence  = 5
	wordSeconds       = 0.45
	sentenceGap       = 0.3
	chapterSeconds    = 0.5 + sentences*(wordsPerSentence*wordSeconds+sentenceGap)
	savedItemPosition = 10.0
)

func chapter() []Word {
	var words []Word
	t := 0.5
	for s := 0; s < sentences; s++ {
		for w := 0; w < wordsPerSentence; w++ {
			words = append(words, Word{Index: len(words), ItemIndex: 0, Start: t, End: t + wordSeconds - 0.05})
			t += wordSeconds
		}
		t += sentenceGap
	}
	return words
}

func sentenceOf(index int) int { return index / wordsPerSentence }

// theOldWay is what the page did before the word table: the saved project's item with the alignment's GUID, by that GUID alone. A word whose item
// has another GUID in the project (a split's right half) is not placed, and an item the page has not re-read keeps its old place.
func theOldWay(saved []Live, w Word) (float64, bool) {
	for _, l := range saved {
		if l.GUID == "{A}" && w.Start >= l.SourceStart && w.Start < l.sourceEnd() {
			return l.Position + (w.Start-l.SourceStart)/l.rate(), true
		}
	}
	return 0, false
}

type scenario struct {
	name   string
	saved  []Live // what the page had read
	actual []Live // what the DAW has
}

func scenarios() []scenario {
	whole := func(position float64) Live { return live("{A}", position, chapterSeconds+1, 0, 1) }
	right := func(cut, gone float64) Live {
		return live("{B}", savedItemPosition+cut, chapterSeconds+1-cut-gone, cut+gone, 1)
	}
	return []scenario{
		{"untouched", []Live{whole(savedItemPosition)}, []Live{whole(savedItemPosition)}},
		{"moved +5 s, unsaved", []Live{whole(savedItemPosition)}, []Live{whole(savedItemPosition + 5)}},
		{"trimmed 20 s off the start, unsaved", []Live{whole(savedItemPosition)}, []Live{live("{A}", savedItemPosition, chapterSeconds+1-20, 20, 1)}},
		{"rate 1.25, unsaved", []Live{whole(savedItemPosition)}, []Live{live("{A}", savedItemPosition, (chapterSeconds+1)/1.25, 0, 1.25)}},
		{"6 s deleted at 40 s and closed up, unsaved", []Live{whole(savedItemPosition)}, []Live{live("{A}", savedItemPosition, 40, 0, 1), right(40, 6)}},
		{"6 s deleted at 40 s and closed up, saved", []Live{live("{A}", savedItemPosition, 40, 0, 1)}, []Live{live("{A}", savedItemPosition, 40, 0, 1), right(40, 6)}},
		{"split at 40 s, saved", []Live{live("{A}", savedItemPosition, 40, 0, 1)}, []Live{live("{A}", savedItemPosition, 40, 0, 1), right(40, 0)}},
	}
}

// TestPerWordErrorBeforeAndAfter scores the page's old way and the word table against the DAW, word by word: how many milliseconds off each
// placed word is, how many words the old way lit in another sentence or not at all. The table is exact by construction against the live items (that the
// live items are what REAPER plays is checked in real REAPER, scenarios_wordtimes.py); the old way is wrong by the size of the edit.
func TestPerWordErrorBeforeAndAfter(t *testing.T) {
	words := chapter()
	var report strings.Builder
	fmt.Fprintf(&report, "\n| Scenario | Old way: words off / not lit (of placed) | median / max error | max sentences off (and lit on silence) | Word table: words off / not placed |\n| - | - | - | - | - |\n")
	for _, sc := range scenarios() {
		after := Compute(Input{Words: words, Items: items, Live: sc.actual})
		var errs []float64
		off, unlit, placed, maxSentences, tableOff, notPlaced, silence := 0, 0, 0, 0, 0, 0, 0
		for i, w := range words {
			truth := after.Rows[i]
			if truth.State != Placed {
				notPlaced++
				continue
			}
			placed++
			before, ok := theOldWay(sc.saved, w)
			switch {
			case !ok:
				unlit++
			case math.Abs(before-truth.Start) > 0.05:
				off++
				errs = append(errs, math.Abs(before-truth.Start)*1000)
				// The sentence the old way lights is the one whose word plays at that project second.
				lit := sentenceAt(after, words, before)
				if lit < 0 {
					silence++
				} else if d := int(math.Abs(float64(lit - sentenceOf(i)))); d > maxSentences {
					maxSentences = d
				}
			}
		}
		sort.Float64s(errs)
		median, maxErr := 0.0, 0.0
		if len(errs) > 0 {
			median, maxErr = errs[len(errs)/2], errs[len(errs)-1]
		}
		fmt.Fprintf(&report, "| %s | %d off, %d not lit (of %d) | %.0f / %.0f ms | %d (%d) | %d / %d |\n", sc.name, off, unlit, placed, median, maxErr, maxSentences, silence, tableOff, notPlaced)
		if sc.name == "untouched" && (off != 0 || unlit != 0) {
			t.Errorf("untouched: the old way should be right, %d off %d unlit", off, unlit)
		}
		if sc.name != "untouched" && off+unlit < placed/5 {
			t.Errorf("%s: only %d of %d words wrong the old way; the scenario proves nothing", sc.name, off+unlit, placed)
		}
		// The table puts every word the DAW plays where the actual items play it: re-derive each place from the actual geometry by hand.
		for i, w := range words {
			row := after.Rows[i]
			if row.State != Placed {
				continue
			}
			var piece *Live
			for k := range sc.actual {
				l := &sc.actual[k]
				if w.Start >= l.SourceStart-eps && w.Start < l.sourceEnd()-eps {
					piece = l
				}
			}
			if piece == nil || math.Abs(row.Start-(piece.Position+(w.Start-piece.SourceStart)/piece.rate())) > 1e-9 {
				tableOff++
			}
		}
		if tableOff != 0 {
			t.Errorf("%s: the table is off for %d words", sc.name, tableOff)
		}
	}
	t.Log(report.String())
}

// sentenceAt is the sentence of the word the DAW plays at project second p (-1 when none).
func sentenceAt(table Table, words []Word, p float64) int {
	for i, r := range table.Rows {
		if r.State == Placed && p >= r.Start-1e-9 && p < r.End+1e-9 {
			return sentenceOf(words[i].Index)
		}
	}
	return -1
}
