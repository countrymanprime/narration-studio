// Package compare is the Go home of Transcript Compare's text logic
// (src/studio/sidecars/transcript-compare/core/compare.py and the parts of
// narration_common.spoken_forms it uses): the tokenizer, the number-word
// merge, the homophone canon, the sentence split, the chapter units and the
// word alignment the take markers and recording coverage both read. Each
// function is a faithful port: the goldens under
// src/studio/sidecars/transcript-compare/tests/fixtures/ hold it to the
// output the Python wrote, byte for byte, so Python's string rules (its
// whitespace, its lowercasing, its float repr) are reproduced, not Go's.
package compare

import (
	_ "embed"
	"math/big"
	"strconv"
	"strings"
)

// numberWords is spoken_forms.NUMBER_WORDS.
var numberWords = map[string]int64{
	"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
	"ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
	"seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
	"sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90, "hundred": 100, "thousand": 1000,
	"million": 1000000, "billion": 1000000000,
}

// IsNumberWord reports whether token is one of spoken_forms.NUMBER_WORDS.
func IsNumberWord(token string) bool {
	_, ok := numberWords[token]
	return ok
}

// fillerWords is spoken_forms.FILLER_WORDS: dropped from a transcript before
// it is aligned.
var fillerWords = map[string]bool{"uh": true, "um": true, "umm": true, "uhh": true, "erm": true, "hmm": true, "mhm": true, "huh": true}

// IsFiller reports whether token is a filler word the alignment drops.
func IsFiller(token string) bool { return fillerWords[token] }

// homophonesCSV is spoken_forms.HOMOPHONE_GROUPS written out as CSV (a Go
// embed cannot reach Python data);
// src/studio/sidecars/transcript-compare/tests/test_chapter_track_parity.py
// fails when the two drift apart.
//
//go:embed homophones.csv
var homophonesCSV string

var homophoneCanon = BuildCanon(LoadEquivalenceGroups(homophonesCSV))

// HomophoneCanon is the built-in canon: every word of a homophone group
// mapped to the group's first member. Callers must not modify it.
func HomophoneCanon() map[string]string { return homophoneCanon }

// LoadEquivalenceGroups is compare.py's load_equivalence_groups over text
// already read: one comma-separated group per line, '#' starts a comment,
// words are stripped and lowercased as Python does, and a group of fewer than
// two words is skipped.
func LoadEquivalenceGroups(text string) [][]string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n") // Python's universal newlines
	var groups [][]string
	for _, line := range strings.Split(text, "\n") {
		line, _, _ = strings.Cut(line, "#")
		line = PyStrip(line)
		if line == "" {
			continue
		}
		var words []string
		for _, word := range strings.Split(line, ",") {
			if word = PyStrip(word); word != "" {
				words = append(words, PyLower(word))
			}
		}
		if len(words) >= 2 {
			groups = append(groups, words)
		}
	}
	return groups
}

// BuildCanon is spoken_forms.build_canon: every word of every group mapped to
// the group's first member; a word in several groups takes the last group's,
// as the Python dict comprehension does.
func BuildCanon(groups [][]string) map[string]string {
	canon := map[string]string{}
	for _, group := range groups {
		for _, word := range group {
			canon[word] = group[0]
		}
	}
	return canon
}

// quoteFold is spoken_forms.QUOTE_NORMALIZE_TABLE: typographic single quotes
// become the ASCII apostrophe (so "Sentinel’s" stays one token) and
// typographic double quotes ASCII ones (which the token pattern drops).
var quoteFold = map[rune]byte{
	'‘': '\'', '’': '\'', '‛': '\'', 'ʼ': '\'', '`': '\'', '´': '\'',
	'“': '"', '”': '"', '„': '"', '‟': '"',
}

// isTokenByte is spoken_forms.TOKEN_RE's class, [A-Za-z0-9']: ASCII only, so
// after the quote fold every other rune separates tokens.
func isTokenByte(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '\''
}

// RawTokens is spoken_forms.TOKEN_RE.findall over the text with quotes
// folded: the runs of [A-Za-z0-9'], as written.
func RawTokens(text string) []string {
	out := []string{}
	var token []byte
	for _, r := range text {
		if folded, ok := quoteFold[r]; ok {
			r = rune(folded)
		}
		if r < 0x80 && isTokenByte(byte(r)) {
			token = append(token, byte(r))
			continue
		}
		if len(token) > 0 {
			out = append(out, string(token))
			token = token[:0]
		}
	}
	if len(token) > 0 {
		out = append(out, string(token))
	}
	return out
}

// FoldToken is canonical_tokens' folding of one lowercased token: the
// homophone canon, then a trailing possessive 's into a plain -s.
func FoldToken(token string) string {
	if canon, ok := homophoneCanon[token]; ok {
		token = canon
	}
	if strings.HasSuffix(token, "'s") && len(token) > 2 {
		token = token[:len(token)-2] + "s"
	}
	return token
}

// CanonicalTokens is spoken_forms.canonical_tokens: lowercase tokens with
// quotes folded, everything outside [A-Za-z0-9'] a separator, homophones
// canonicalized and a trailing possessive 's folded into a plain -s.
func CanonicalTokens(text string) []string {
	tokens := RawTokens(text)
	for k, token := range tokens {
		tokens[k] = FoldToken(strings.ToLower(token)) // ASCII only: Go and Python agree
	}
	return tokens
}

// MergeNumberWords is spoken_forms.merge_number_words: each run of
// spelled-out cardinal numbers collapses into one digit token ("twenty three"
// to "23", "one hundred and five" to "105"); an "and" continues a run only
// when another number word follows it. indexMap, parallel to tokens, is
// carried through: each output token points at its first input token's
// entry. Python's integers are unbounded, so a run past int64 ("billion"
// said a dozen times) is summed with math/big.
func MergeNumberWords(tokens []string, indexMap []int) ([]string, []int) {
	outTokens := make([]string, 0, len(tokens))
	outIndex := make([]int, 0, len(tokens))
	for i := 0; i < len(tokens); {
		if !IsNumberWord(tokens[i]) {
			outTokens = append(outTokens, tokens[i])
			outIndex = append(outIndex, indexMap[i])
			i++
			continue
		}
		start := i
		var sum numberSum
		j := i
		for j < len(tokens) {
			if value, ok := numberWords[tokens[j]]; ok {
				sum.add(value)
				j++
				continue
			}
			if tokens[j] == "and" && j+1 < len(tokens) && IsNumberWord(tokens[j+1]) {
				j++
				continue
			}
			break
		}
		outTokens = append(outTokens, sum.String())
		outIndex = append(outIndex, indexMap[start])
		i = j
	}
	return outTokens, outIndex
}

// numberSum is merge_number_words' (total, chunk) pair, in int64 until a step
// would overflow and in math/big from then on.
type numberSum struct {
	total, chunk int64
	big          *[2]big.Int // total, chunk once past int64
}

func (s *numberSum) add(value int64) {
	if s.big == nil && !s.fits(value) {
		s.big = &[2]big.Int{}
		s.big[0].SetInt64(s.total)
		s.big[1].SetInt64(s.chunk)
	}
	if s.big != nil {
		total, chunk := &s.big[0], &s.big[1]
		orOne := chunk
		if chunk.Sign() == 0 {
			orOne = big.NewInt(1)
		}
		switch {
		case value == 100:
			chunk.Mul(orOne, big.NewInt(100))
		case value >= 1000:
			total.Add(total, new(big.Int).Mul(orOne, big.NewInt(value)))
			chunk.SetInt64(0)
		default:
			chunk.Add(chunk, big.NewInt(value))
		}
		return
	}
	orOne := s.chunk
	if orOne == 0 {
		orOne = 1
	}
	switch {
	case value == 100:
		s.chunk = orOne * 100
	case value >= 1000:
		s.total += orOne * value
		s.chunk = 0
	default:
		s.chunk += value
	}
}

// fits reports whether the next step keeps total and chunk under 2^61, so
// that total+chunk cannot overflow int64.
func (s *numberSum) fits(value int64) bool {
	const limit = int64(1) << 61
	orOne := s.chunk
	if orOne == 0 {
		orOne = 1
	}
	switch {
	case value == 100:
		return orOne < limit/100 && s.total < limit
	case value >= 1000:
		return orOne < limit/value && s.total < limit-orOne*value
	default:
		return s.chunk < limit-value && s.total < limit
	}
}

func (s *numberSum) String() string {
	if s.big != nil {
		return new(big.Int).Add(&s.big[0], &s.big[1]).String()
	}
	return strconv.FormatInt(s.total+s.chunk, 10)
}
