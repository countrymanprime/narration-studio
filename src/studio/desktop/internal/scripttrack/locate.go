package scripttrack

import (
	"cmp"
	"regexp"
	"slices"
	"strings"

	"desktop/internal/compare"
)

// Placing words decoded from a stretch of recording in the script, as the Booth's sidecar does in locate.py (Resume
// from here) and align_word.py (Punch from here): the sidecar decodes, and this places.

// The placement's limits, locate.py's constants.
const (
	MinConfidentMatches = 6   // a place needs this many heard words that fit, in order, to be confident
	ConfidentScore      = 0.5 // the score a place needs to be confident
	FollowSegmentWords  = 8   // how many heard words `follow` feeds the tracker as one segment
)

// sentenceEnd is _SENTENCE_END_RE: a token ending a sentence, before any closing quotes or brackets.
var sentenceEnd = regexp.MustCompile(`[.!?…]["'”’)\]]*$`)

// filtered is _Script: the tracker's view of a token list, punctuation-only tokens dropped and each word normalized, with
// the map back to the original index.
type filtered struct {
	tokenCount int
	original   []int
	words      []string
}

func newFiltered(tokens []string) filtered {
	script := filtered{tokenCount: len(tokens)}
	for index, token := range tokens {
		if word := NormalizeWord(token); word != "" {
			script.original = append(script.original, index)
			script.words = append(script.words, word)
		}
	}
	return script
}

func (s filtered) originalIndex(position int) int {
	if position < len(s.original) {
		return s.original[position]
	}
	return s.tokenCount
}

// startPositions is _start_positions: every script position whose word one of the heard words matches, in order.
func startPositions(heard, script []string) []int {
	wanted := map[string]bool{}
	for _, word := range heard {
		wanted[word] = true
	}
	matches := map[string]bool{}
	starts := []int{}
	for position, word := range script {
		match, known := matches[word]
		if !known {
			for heardWord := range wanted {
				if WordsMatch(heardWord, word) {
					match = true
					break
				}
			}
			matches[word] = match
		}
		if match {
			starts = append(starts, position)
		}
	}
	return starts
}

// Placement is one alignment of the heard words: the first and one-past-last script positions it matched, and how many.
type Placement struct{ First, Read, Matched int }

func (p Placement) overlaps(other Placement) bool {
	return p.First < other.Read && other.First < p.Read
}

// Placements is placements: every distinct alignment of heard (normalized words) that matches a script word, ordered
// by (First, Read).
func Placements(heard, script []string) []Placement {
	seen := map[Placement]bool{}
	found := []Placement{}
	for _, start := range startPositions(heard, script) {
		alignment := Advance(heard, script, start)
		placement := Placement{alignment.First, alignment.Read, alignment.Matched}
		if alignment.Matched > 0 && alignment.First != None && !seen[placement] {
			seen[placement] = true
			found = append(found, placement)
		}
	}
	slices.SortFunc(found, func(a, b Placement) int { return cmp.Or(cmp.Compare(a.First, b.First), cmp.Compare(a.Read, b.Read)) })
	return found
}

// better is rank's order: most words matched, then the tightest span, then the earliest.
func better(a, b Placement) bool {
	if a.Matched != b.Matched {
		return a.Matched > b.Matched
	}
	if a.Read-a.First != b.Read-b.First {
		return a.Read-a.First < b.Read-b.First
	}
	return a.First < b.First
}

// Rank is rank: the best placement and the matched count of the best one that does not overlap it (0 when none); ok
// is false when there are no candidates.
func Rank(candidates []Placement) (best Placement, runnerUp int, ok bool) {
	if len(candidates) == 0 {
		return Placement{}, 0, false
	}
	best = candidates[0]
	for _, candidate := range candidates[1:] {
		if better(candidate, best) {
			best = candidate
		}
	}
	for _, candidate := range candidates {
		if !candidate.overlaps(best) {
			runnerUp = max(runnerUp, candidate.Matched)
		}
	}
	return best, runnerUp, true
}

// follow is follow: the live tracker run over the heard words from startWord, in segments of FollowSegmentWords, and the
// committed word it ends on.
func follow(heard, tokens []string, startWord int) int {
	tracker := New(tokens)
	committed := startWord
	for _, position := range tracker.ResetTo(startWord, 0) {
		committed = position.Committed
	}
	for segment, offset := 0, 0; offset < len(heard); segment, offset = segment+1, offset+FollowSegmentWords {
		for _, word := range heard[offset:min(len(heard), offset+FollowSegmentWords)] {
			for _, position := range tracker.Feed(Event{Type: "word", Segment: float64(segment), Word: word}, 0) {
				committed = position.Committed
			}
		}
		tracker.Feed(Event{Type: "segment_end", Segment: float64(segment)}, 0)
	}
	return committed
}

// fitting is _fitting: how many heard words are words of passage, in any order.
func fitting(heard, passage []string) int {
	vocabulary := map[string]bool{}
	for _, word := range passage {
		vocabulary[word] = true
	}
	count := 0
	for _, word := range heard {
		fits := vocabulary[word]
		for known := range vocabulary {
			if fits {
				break
			}
			fits = WordsMatch(word, known)
		}
		if fits {
			count++
		}
	}
	return count
}

// lastWordBefore is _last_word_before: the last token before word that is a word, not punctuation alone (None if none).
func lastWordBefore(tokens []string, word int) int {
	for index := min(word, len(tokens)) - 1; index >= 0; index-- {
		if NormalizeWord(tokens[index]) != "" {
			return index
		}
	}
	return None
}

// TailLocation is TailLocation: where a tail ends in the script, in ScriptWords indices; Word and Last are None when it
// could not be placed.
type TailLocation struct {
	Word, Last               int
	Confidence               float64
	Confident                bool
	Matched, Heard, RunnerUp int
}

// LocateTail is locate_tail: place the words heard in a recording's tail in tokens, rank every place they fit for the
// confidence, then follow them with the tracker from the best one for the resume word.
func LocateTail(heardWords, tokens []string) TailLocation {
	heard := heardWordsOf(heardWords)
	script := newFiltered(tokens)
	best, runnerUp, ok := Rank(Placements(heard, script.words))
	if !ok || best.Matched < MinJumpMatches {
		return TailLocation{Word: None, Last: None, Matched: best.Matched, Heard: len(heard), RunnerUp: runnerUp}
	}
	coverage := float64(fitting(heard, script.words[best.First:best.Read])) / float64(len(heard))
	distinct := 1.0 - float64(runnerUp)/float64(best.Matched)
	confidence := compare.PyRound(coverage*distinct, 3)
	start := script.originalIndex(best.First)
	word := follow(heard, tokens, start)
	if word <= start {
		word = script.originalIndex(best.Read)
	}
	return TailLocation{
		Word: word, Last: lastWordBefore(tokens, word), Confidence: confidence,
		Confident: best.Matched >= MinConfidentMatches && confidence >= ConfidentScore,
		Matched:   best.Matched, Heard: len(heard), RunnerUp: runnerUp,
	}
}

func heardWordsOf(texts []string) []string {
	heard := []string{}
	for _, text := range texts {
		if word := NormalizeWord(text); word != "" {
			heard = append(heard, word)
		}
	}
	return heard
}

// SentenceBounds is sentence_bounds: the [start, end) token range of the sentence holding token index, never crossing a
// paragraph break (breaks holds each paragraph's first token).
func SentenceBounds(tokens []string, index int, breaks map[int]bool) (int, int) {
	start := index
	for start > 0 && !breaks[start] && !sentenceEnd.MatchString(tokens[start-1]) {
		start--
	}
	end := index + 1
	for end < len(tokens) && !breaks[end] && !sentenceEnd.MatchString(tokens[end-1]) {
		end++
	}
	return start, end
}

// LocateEvent is locate_event: the `locate` line for a tail's heard words, as json.dumps writes it once its keys are
// sorted.
func LocateEvent(heardWords, tokens []string, breaks map[int]bool) compare.PyObject {
	location := LocateTail(heardWords, tokens)
	var sentence any
	if location.Last != None {
		start, end := SentenceBounds(tokens, location.Last, breaks)
		sentence = compare.PyObject{"start": start, "end": end, "text": strings.Join(tokens[start:end], " ")}
	}
	said := []string{}
	for _, word := range heardWords {
		if word != "" {
			said = append(said, word)
		}
	}
	return compare.PyObject{
		"type": "locate", "word": intOrNil(location.Word), "last": intOrNil(location.Last), "sentence": sentence,
		"confidence": location.Confidence, "confident": location.Confident, "matched": location.Matched,
		"heard": location.Heard, "runnerUp": location.RunnerUp, "tokens": len(tokens), "heardText": strings.Join(said, " "),
	}
}

func intOrNil(value int) any {
	if value == None {
		return nil
	}
	return value
}
