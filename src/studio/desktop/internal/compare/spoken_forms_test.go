package compare

import (
	"math/rand"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// The spoken forms the tokenizer and the Booth's live flags share (narration_common's test_spoken_forms.py), one
// case each, and the number-word merge's properties over seeded random tokens. homophones.csv is the only list of
// homophones now that spoken_forms.py is gone.

func TestHomophonesCanonicalizeToTheFirstMemberOfTheirGroup(t *testing.T) {
	same(t, "canonical tokens", CanonicalTokens("They're there with their bags"), []string{"their", "their", "with", "their", "bags"})
}

func TestNumberHomophonesAreDeliberatelyAbsentSoNumberMergingStaysSafe(t *testing.T) {
	for _, word := range []string{"one", "won", "two", "too", "to", "four", "for", "eight", "ate"} {
		if canon, ok := homophoneCanon[word]; ok {
			t.Errorf("%q is a homophone of %q", word, canon)
		}
	}
}

func TestCanonicalTokensFoldCurlyApostrophesPossessivesAndSplitHyphens(t *testing.T) {
	same(t, "canonical tokens", CanonicalTokens("The sentinel’s so-called post."), []string{"the", "sentinels", "so", "called", "post"})
}

func identityMap(n int) []int {
	index := make([]int, n)
	for k := range index {
		index[k] = k
	}
	return index
}

func TestMergeNumberWordsCollapsesRunsAndKeepsTheIndexOfTheFirstWord(t *testing.T) {
	tokens := []string{"page", "two", "hundred", "and", "five", "of", "one", "thousand"}
	merged, index := MergeNumberWords(tokens, identityMap(len(tokens)))
	same(t, "merged", [2]any{merged, index}, [2]any{[]string{"page", "205", "of", "1000"}, []int{0, 1, 5, 6}})
}

func TestSpelledOutNumbersMergeIntoTheirDigitValue(t *testing.T) {
	for _, c := range [][2]string{{"one", "1"}, {"twenty three", "23"}, {"one hundred and five", "105"}, {"two thousand", "2000"}} {
		tokens := strings.Fields(c[0])
		merged, index := MergeNumberWords(tokens, identityMap(len(tokens)))
		same(t, c[0], [2]any{merged, index}, [2]any{[]string{c[1]}, []int{0}})
	}
}

func TestFillerWordsAreTheHesitationsTranscriptCompareDrops(t *testing.T) {
	for _, word := range []string{"uh", "um", "hmm"} {
		if !IsFiller(word) {
			t.Errorf("%q is not a filler", word)
		}
	}
	if IsFiller("the") {
		t.Error(`"the" is a filler`)
	}
}

// Tokens drawn from the number words and "and", or short plain words that are never number words.

var numberTokens = func() []string {
	tokens := []string{"and"}
	for word := range numberWords {
		tokens = append(tokens, word)
	}
	slices.Sort(tokens)
	return tokens
}()

func plainToken(rng *rand.Rand) string {
	var sb strings.Builder
	for range 1 + rng.Intn(5) {
		sb.WriteByte("abcdefg"[rng.Intn(7)])
	}
	return sb.String()
}

func isDigits(token string) bool {
	return token != "" && strings.Trim(token, "0123456789") == ""
}

func TestMergingNumberWordsKeepsTheIndexMapAlignedAndOrdinaryTokensIntact(t *testing.T) {
	rng := rand.New(rand.NewSource(205))
	for range propertyRuns {
		tokens := make([]string, rng.Intn(15))
		for k := range tokens {
			tokens[k] = plainToken(rng)
			if rng.Intn(2) == 0 {
				tokens[k] = numberTokens[rng.Intn(len(numberTokens))]
			}
		}
		merged, index := MergeNumberWords(tokens, identityMap(len(tokens)))
		if len(merged) != len(index) || len(merged) > len(tokens) || !slices.IsSorted(index) {
			t.Fatalf("%q merged to %q, %v: the map is misaligned or moves backwards", tokens, merged, index)
		}
		for k, token := range merged {
			at := index[k]
			switch {
			case at < 0 || at >= len(tokens):
				t.Fatalf("%q: index %d is outside the tokens", tokens, at)
			case isDigits(token) && !IsNumberWord(tokens[at]):
				t.Fatalf("%q: the digit token %q points at %q, not the first number word it replaced", tokens, token, tokens[at])
			case !isDigits(token) && token != tokens[at]:
				t.Fatalf("%q: %q was changed to %q", tokens, tokens[at], token)
			}
		}
	}
}

func TestTextWithNoNumberWordsIsNotChangedByMerging(t *testing.T) {
	rng := rand.New(rand.NewSource(206))
	for range propertyRuns {
		tokens := make([]string, rng.Intn(15))
		for k := range tokens {
			tokens[k] = plainToken(rng)
		}
		merged, index := MergeNumberWords(tokens, identityMap(len(tokens)))
		if !reflect.DeepEqual(merged, tokens) || !reflect.DeepEqual(index, identityMap(len(tokens))) {
			t.Fatalf("%q merged to %q, %v", tokens, merged, index)
		}
	}
}
