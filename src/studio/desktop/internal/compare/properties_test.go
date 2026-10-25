package compare

import (
	"math/rand"
	"reflect"
	"regexp"
	"strings"
	"testing"
)

// Properties of the tokenizer and the sentence splitter over seeded random text: the manuscript and the transcript
// become the token lists that are aligned, so a lost character or a shifted map shows up later as a bogus MISREAD.
// They were Hypothesis tests of compare.py's own functions before those were deleted; the inputs here are drawn the
// same way (any text, and sentences made of abbreviations, end marks and quotes).

const propertyRuns = 2000

var anyRunes = []rune("abcXYZ019 '’‘“”.!?,;:-—\t\n   \x1cÉéßİıΣσςçñ😀日本")

func randomText(rng *rand.Rand, size int) string {
	var sb strings.Builder
	for range rng.Intn(size + 1) {
		sb.WriteRune(anyRunes[rng.Intn(len(anyRunes))])
	}
	return sb.String()
}

var (
	sentencePieces = []string{"Mr.", "Dr.", "Mt.", "end.", "yes!", "who?", "word", "more", "etc.", "“quote.”"}
	separators     = []string{" ", "  ", "\n", " \t "}
)

func sentenceText(rng *rand.Rand) string {
	var sb strings.Builder
	for range rng.Intn(21) {
		sb.WriteString(sentencePieces[rng.Intn(len(sentencePieces))] + separators[rng.Intn(len(separators))])
	}
	return sb.String()
}

func TestTokensAreOnlyLowercaseWordTokensAndEachKeepsTheRawWordItCameFrom(t *testing.T) {
	word := regexp.MustCompile(`^[a-z0-9']+$`)
	tokenizer := NewTokenizer(nil)
	rng := rand.New(rand.NewSource(2251))
	for range propertyRuns {
		text := randomText(rng, 80)
		for _, token := range tokenizer.Tokenize(text) {
			if !word.MatchString(token) {
				t.Fatalf("%q gave the token %q", text, token)
			}
		}
		tokens, raw := tokenizer.TokenizeWithRaw(text)
		want := []string{}
		for _, part := range PySplit(text) {
			want = append(want, tokenizer.Tokenize(part)...)
		}
		if len(tokens) != len(raw) || len(tokens) != len(want) || len(want) > 0 && !reflect.DeepEqual(tokens, want) {
			t.Fatalf("%q: tokens %q, raw %q, want %q", text, tokens, raw, want)
		}
		parts := map[string]bool{}
		for _, part := range PySplit(text) {
			parts[part] = true
		}
		for _, r := range raw {
			if !parts[r] {
				t.Fatalf("%q: the raw word %q is not one of its words", text, r)
			}
		}
	}
}

func TestSplittingSentencesLosesNoCharacterAndAnAbbreviationNeverEndsOne(t *testing.T) {
	tokenizer := NewTokenizer(nil)
	rng := rand.New(rand.NewSource(2251))
	squash := func(s string) string { return strings.Join(PySplit(s), "") }
	for k := range propertyRuns {
		text := sentenceText(rng)
		if k%2 == 0 {
			text = randomText(rng, 120)
		}
		sentences := tokenizer.SplitSentences(text)
		joined := ""
		for _, sentence := range sentences {
			if sentence == "" || PyStrip(sentence) != sentence {
				t.Fatalf("%q: the sentence %q is empty or untrimmed", text, sentence)
			}
			joined += squash(sentence)
		}
		if joined != squash(text) {
			t.Fatalf("%q: the sentences %q lose or reorder characters", text, sentences)
		}
		if k%2 == 1 && len(sentences) > 1 {
			for _, sentence := range sentences[:len(sentences)-1] {
				tokens := tokenizer.Tokenize(sentence)
				if len(tokens) > 0 && IsAbbreviation(tokens[len(tokens)-1]) && strings.HasSuffix(sentence, ".") {
					t.Fatalf("%q: %q ends on an abbreviation", text, sentence)
				}
			}
		}
	}
}

func TestTheTokenizerFoldsHomophonesPossessivesHyphensAndCurlyQuotesAsTheBundledFileDid(t *testing.T) {
	text := "Your sentinel’s right there, whose weight they're at-the-waist of twenty-three knights."
	want := []string{"your", "sentinels", "write", "their", "whose", "wait", "their", "at", "the", "waist", "of", "twenty", "three", "knights"}
	if got := NewTokenizer(nil).Tokenize(text); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q, want %q", got, want)
	}
}
