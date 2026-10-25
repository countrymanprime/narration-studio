// Package scripttrack follows a narrator through a known script from a live
// speech engine's events, as the Booth's sidecar did in script_tracker.py
// before the host took it over (the comments name the Python each part came
// from, and the recorded answers in tests/fixtures/booth-parity hold it): it
// consumes `partial`, `word` and `segment_end` events and reports `position`
// events when the cursor, the committed position or the status change
// (docs/architecture/manuscript-teleprompter.md). It also builds the script it
// follows from a chapter or the credits text, as the sidecar's chapter_script.py does.
//
// It is a port held byte for byte to the Python by
// tests/fixtures/booth-parity (tracker-sessions, tracker-cases, flag-sessions
// and chapter-scripts), so it
// lowercases and matches words with Python 3.12's rules (internal/compare's
// PyLower and IsPyWord), never Go's newer Unicode tables.
package scripttrack

import (
	"strings"
	"sync"
	"unicode/utf8"

	"desktop/internal/compare"
)

// The tracker's limits, script_tracker.py's constants.
const (
	MaxSkip        = 2   // script words a heard word may step over
	BackWords      = 40  // how far back a restart may jump
	AheadWords     = 30  // how far ahead a skip may jump
	MinJumpMatches = 3   // matching words a jump needs
	JumpMargin     = 2   // how many more than the nearby match a jump needs
	WaitSeconds    = 1.5 // no forward progress for longer is "waiting"
	FuzzyMinLength = 4   // code points both words need before a close spelling counts
	FuzzyRatio     = 0.8 // the SequenceMatcher ratio a close spelling needs
)

// NormalizeWord is normalize_word: the word lowercased with everything but
// re's \w and the apostrophe removed.
func NormalizeWord(word string) string {
	var out strings.Builder
	for _, r := range compare.PyLower(word) {
		if r == '\'' || compare.IsPyWord(r) {
			out.WriteRune(r)
		}
	}
	return out.String()
}

// ScriptWords is script_words: the whitespace-split tokens that position
// indices refer to.
func ScriptWords(text string) []string { return compare.PySplit(text) }

// WordsMatch is words_match: equal normalized words, or a close spelling
// (SequenceMatcher ratio at least FuzzyRatio, autojunk on) of two words of
// at least FuzzyMinLength code points each.
func WordsMatch(heard, script string) bool {
	if heard == script {
		return true
	}
	if utf8.RuneCountInString(heard) < FuzzyMinLength || utf8.RuneCountInString(script) < FuzzyMinLength {
		return false
	}
	key := [2]string{heard, script}
	matches.mu.Lock()
	defer matches.mu.Unlock()
	if match, ok := matches.seen[key]; ok {
		return match
	}
	match := compare.NewSequenceMatcher([]rune(heard), []rune(script), true).Ratio() >= FuzzyRatio
	if len(matches.seen) >= maxCachedMatches {
		clear(matches.seen)
	}
	matches.seen[key] = match
	return match
}

// maxCachedMatches bounds the fuzzy-match cache, words_match's lru_cache size: Locate tries every start near the
// anchor for every heard word, so the same pairs come back on every event of a read.
const maxCachedMatches = 65536

// matchCache is the fuzzy-match cache, shared by every tracker in the process.
type matchCache struct {
	mu sync.Mutex
	// +checklocks:mu
	seen map[[2]string]bool
}

var matches = &matchCache{seen: map[[2]string]bool{}}

// None stands for Python's None in an int field: the first matched word of an
// alignment that matched nothing.
const None = -1

// Alignment is advance's result: the position after the walk, how many heard
// words matched and the first script word matched (None if none).
type Alignment struct{ Read, Matched, First int }

// Advance is advance: each heard word matches the next script word or one of
// the MaxSkip after it, stepping over those; a heard word that matches none
// is ignored.
func Advance(heard, script []string, start int) Alignment {
	position, matched, first := start, 0, None
	for _, word := range heard {
		for skip := 0; skip <= MaxSkip; skip++ {
			index := position + skip
			if index >= len(script) {
				break
			}
			if WordsMatch(word, script[index]) {
				if first == None {
					first = index
				}
				position, matched = index+1, matched+1
				break
			}
		}
	}
	return Alignment{position, matched, first}
}

// Align is align: Advance's walk, reporting the script word each heard word
// matched (None for one it ignored).
func Align(heard, script []string, start int) []int {
	position := start
	matches := make([]int, 0, len(heard))
	for _, word := range heard {
		match := None
		for skip := 0; skip <= MaxSkip; skip++ {
			index := position + skip
			if index >= len(script) {
				break
			}
			if WordsMatch(word, script[index]) {
				match, position = index, index+1
				break
			}
		}
		matches = append(matches, match)
	}
	return matches
}

// Span is a [from, to) pair of script positions: the words a skip ahead
// stepped over.
type Span struct{ From, To int }

// Location is locate's result: Jump is "", "restart" or "skip"; Skipped is
// nil unless a skip stepped over words; Start is the position the chosen
// alignment walked from and First the first script word it matched (None if
// none).
type Location struct {
	Read, Matched int
	Jump          string
	Skipped       *Span
	Start, First  int
}

// Locate is locate: where the heard words sit in the script, from the anchor,
// unless a clearly better alignment exists nearby (a restart behind or a skip
// ahead), which is reported as a jump.
func Locate(heard, script []string, anchor int) Location {
	near := Advance(heard, script, anchor)
	if len(heard) < MinJumpMatches {
		return Location{near.Read, near.Matched, "", nil, anchor, near.First}
	}
	found, bestMatched, bestCloseness, bestStart := false, 0, 0, anchor
	var best Alignment
	for start := max(0, anchor-BackWords); start < min(len(script), anchor+AheadWords); start++ {
		if anchor <= start && start <= anchor+MaxSkip {
			continue
		}
		candidate := Advance(heard, script, start)
		if candidate.Matched < MinJumpMatches || candidate.Matched < near.Matched+JumpMargin {
			continue
		}
		// Python's key (matched, -abs(start - anchor)), the larger winning and the first of equals kept.
		closeness := -abs(start - anchor)
		if !found || candidate.Matched > bestMatched || candidate.Matched == bestMatched && closeness > bestCloseness {
			found, bestMatched, bestCloseness, bestStart, best = true, candidate.Matched, closeness, start, candidate
		}
	}
	if !found {
		return Location{near.Read, near.Matched, "", nil, anchor, near.First}
	}
	if bestStart < anchor {
		return Location{best.Read, best.Matched, "restart", nil, bestStart, best.First}
	}
	var skipped *Span
	if best.First != None && best.First > anchor {
		skipped = &Span{anchor, best.First}
	}
	return Location{best.Read, best.Matched, "skip", skipped, bestStart, best.First}
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
