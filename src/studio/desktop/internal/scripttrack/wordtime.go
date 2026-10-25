package scripttrack

import (
	"regexp"
	"slices"
	"sort"

	"desktop/internal/compare"
)

// The time a script word was read, from the timed words decoded from a stretch of recording (align_word.py, Punch from
// here's offline fallback).

// The alignment's limits, align_word.py's constants.
const (
	DefaultPaceSeconds = 0.4 // a stretch's pace when too few neighbouring words were heard to measure one
	PauseFactor        = 1.5 // how much slower than the pace a gap may run and still hold no pause
	PassageSlackWords  = 20  // script words past twice the heard count a stretch's passage still reaches
)

// pauseAfter and pauseBefore are _PAUSE_AFTER_RE and _PAUSE_BEFORE_RE: punctuation a reader pauses at that does not end
// a sentence, at the end of a word or opening the next.
var (
	pauseAfter  = regexp.MustCompile(`[,;:—–\-)\]’”"']$`)
	pauseBefore = regexp.MustCompile(`^[(\[‘“"'—–\-]`)
)

// TimedWord is a decoded word and its start and end, seconds into the stretch.
type TimedWord struct {
	Text       string
	Start, End float64
}

// WordTimeResult is WordTime: where script token Word starts in the decoded audio (ok false when it is not in it).
type WordTimeResult struct {
	Word           int
	Time           float64
	Found, Exact   bool
	Matched, Heard int
}

// bestFirst is _best_first: the first script word of the best alignment of heard (rank's order) and how many words it
// matches, None when nothing matches.
func bestFirst(heard, script []string) (int, int) {
	var best Placement
	found := false
	for _, start := range startPositions(heard, script) {
		alignment := Advance(heard, script, start)
		if alignment.Matched == 0 || alignment.First == None {
			continue
		}
		candidate := Placement{alignment.First, alignment.Read, alignment.Matched}
		if !found || better(candidate, best) {
			best, found = candidate, true
		}
	}
	if !found {
		return None, 0
	}
	return best.First, best.Matched
}

// pairs is _pairs: (heard index, passage index) for every heard word that is a word of passage, in order: the longest
// matching blocks, and a gap of the same length on both sides between two blocks paired word for word where WordsMatch
// accepts it.
func pairs(heard, passage []string) [][2]int {
	out := [][2]int{}
	heardAt, passageAt := 0, 0
	for _, block := range compare.NewSequenceMatcher(heard, passage, false).MatchingBlocks() {
		if block.A-heardAt == block.B-passageAt {
			for k := range block.A - heardAt {
				if WordsMatch(heard[heardAt+k], passage[passageAt+k]) {
					out = append(out, [2]int{heardAt + k, passageAt + k})
				}
			}
		}
		for k := range block.Size {
			out = append(out, [2]int{block.A + k, block.B + k})
		}
		heardAt, passageAt = block.A+block.Size, block.B+block.Size
	}
	return out
}

// aligned is Aligned: a stretch placed in the script, each script position heard in it with its (start, end).
type aligned struct {
	at     map[int][2]float64
	script filtered
	heard  int
	walked int
	tokens []string
	pace   float64
}

// alignStretch is align_stretch: place the timed words in tokens; nothing is placed when fewer than MinJumpMatches fit.
func alignStretch(timed []TimedWord, tokens []string) aligned {
	heard := []TimedWord{}
	for _, word := range timed {
		if text := NormalizeWord(word.Text); text != "" {
			heard = append(heard, TimedWord{text, word.Start, word.End})
		}
	}
	words := make([]string, len(heard))
	for k, word := range heard {
		words[k] = word.Text
	}
	script := newFiltered(tokens)
	first, matched := bestFirst(words, script.words)
	if first == None || matched < MinJumpMatches {
		return aligned{at: map[int][2]float64{}, script: script, heard: len(heard), walked: matched, pace: DefaultPaceSeconds}
	}
	reach := len(words) + PassageSlackWords
	begin := max(0, first-reach)
	passage := script.words[begin:min(len(script.words), first+2*reach)]
	at := map[int][2]float64{}
	for _, pair := range pairs(words, passage) {
		at[begin+pair[1]] = [2]float64{heard[pair[0]].Start, heard[pair[0]].End}
	}
	steps := []float64{}
	for _, position := range sortedPositions(at) {
		if next, ok := at[position+1]; ok {
			steps = append(steps, next[0]-at[position][0])
		}
	}
	pace := DefaultPaceSeconds
	if len(steps) >= MinJumpMatches {
		pace = median(steps)
	}
	return aligned{at: at, script: script, heard: len(heard), walked: matched, tokens: tokens, pace: pace}
}

// sortedPositions is a dict's positions in insertion order, which for `at` is the order pairs found them: ascending.
func sortedPositions(at map[int][2]float64) []int {
	positions := make([]int, 0, len(at))
	for position := range at {
		positions = append(positions, position)
	}
	slices.Sort(positions)
	return positions
}

// median is statistics.median: the middle value, or the mean of the two middle ones.
func median(values []float64) float64 {
	sorted := slices.Clone(values)
	slices.Sort(sorted)
	n := len(sorted)
	if n%2 == 1 {
		return sorted[n/2]
	}
	return (sorted[n/2-1] + sorted[n/2]) / 2
}

// timeOf is time_of: when script token word starts in an aligned stretch.
func timeOf(a aligned, word int) WordTimeResult {
	matched := a.walked
	if len(a.at) > 0 {
		matched = len(a.at)
	}
	result := WordTimeResult{Word: word, Matched: matched, Heard: a.heard}
	target := sort.SearchInts(a.script.original, word)
	if target >= len(a.script.words) {
		return result
	}
	if times, ok := a.at[target]; ok {
		result.Time, result.Found, result.Exact = compare.PyRound(times[0], 3), true, true
		return result
	}
	before, after := None, None
	for position := range a.at {
		if position < target && (before == None || position > before) {
			before = position
		}
		if position > target && (after == None || position < after) {
			after = position
		}
	}
	if before == None || after == None {
		return result
	}
	result.Time, result.Found = compare.PyRound(inGap(a, before, target, after), 3), true
	return result
}

// pauseStrength is _pause_strength: 2 at a sentence end, 1 at any other punctuation between token index and the next
// word, 0 inside a phrase.
func pauseStrength(tokens []string, index int) int {
	if sentenceEnd.MatchString(tokens[index]) {
		return 2
	}
	following := ""
	if index+1 < len(tokens) {
		following = tokens[index+1]
	}
	if pauseAfter.MatchString(tokens[index]) || pauseBefore.MatchString(following) {
		return 1
	}
	return 0
}

// inGap is _in_gap: where unheard script word target starts between the heard words before and after.
func inGap(a aligned, before, target, after int) float64 {
	first, last := a.at[before][0], a.at[after][0]
	steps, index := after-before, target-before
	even := first + (last-first)*float64(index)/float64(steps)
	if last-first <= float64(steps)*a.pace*PauseFactor {
		return even
	}
	original := a.script.original
	ahead := 0
	for token := original[before]; token < original[target]; token++ {
		ahead = max(ahead, pauseStrength(a.tokens, token))
	}
	behind := 0
	for token := original[target]; token < original[after]; token++ {
		behind = max(behind, pauseStrength(a.tokens, token))
	}
	switch {
	case ahead > behind:
		return max(first, last-float64(steps-index)*a.pace)
	case behind > ahead:
		return min(last, first+float64(index)*a.pace)
	}
	return even
}

// WordTime is word_time: when script token word starts in the decoded stretch.
func WordTime(timed []TimedWord, tokens []string, word int) WordTimeResult {
	return timeOf(alignStretch(timed, tokens), word)
}

// WordTimeEvent is word_time_event: the `word_time` line, its time in seconds of the file (offset is where the decoded
// stretch starts in it), as json.dumps writes it once its keys are sorted.
func WordTimeEvent(timed []TimedWord, tokens []string, word int, offset float64) compare.PyObject {
	result := WordTime(timed, tokens, word)
	var time any
	if result.Found {
		time = compare.PyRound(result.Time+offset, 3)
	}
	return compare.PyObject{
		"type": "word_time", "word": word, "time": time, "exact": result.Exact,
		"matched": result.Matched, "heard": result.Heard, "tokens": len(tokens),
	}
}
