package compare

import "strings"

// Tokenizer is compare.py's tokenize with one project's own equivalence list
// (its _CUSTOM_CANON, loaded from TranscriptCompare/equivalences.csv). The
// zero value has no project list: the built-in canon only.
type Tokenizer struct {
	custom map[string]string
}

// NewTokenizer builds a tokenizer over a project's equivalence groups
// (LoadEquivalenceGroups); nil or empty groups give the built-in canon only.
func NewTokenizer(groups [][]string) Tokenizer {
	if len(groups) == 0 {
		return Tokenizer{}
	}
	return Tokenizer{custom: BuildCanon(groups)}
}

// Tokenize is compare.py's tokenize: CanonicalTokens, then the project's own
// canon.
func (t Tokenizer) Tokenize(text string) []string {
	tokens := CanonicalTokens(text)
	if len(t.custom) > 0 {
		for k, token := range tokens {
			if canon, ok := t.custom[token]; ok {
				tokens[k] = canon
			}
		}
	}
	return tokens
}

// TokenizeWithRaw is compare.py's tokenize_with_raw: the tokens of each
// whitespace word and, parallel to them, the word each came from (a word with
// several tokens repeats; a word with none adds nothing).
func (t Tokenizer) TokenizeWithRaw(text string) (tokens, raw []string) {
	tokens, raw = []string{}, []string{}
	for _, word := range PySplit(text) {
		for _, token := range t.Tokenize(word) {
			tokens = append(tokens, token)
			raw = append(raw, word)
		}
	}
	return tokens, raw
}

// abbreviations is compare.py's ABBREVIATIONS: a sentence ending in one of
// these and a period is joined to the next.
var abbreviations = map[string]bool{"mr": true, "mrs": true, "ms": true, "dr": true, "st": true, "jr": true, "sr": true, "vs": true, "mt": true}

// splitAtSentenceEnds is re.split(r"(?<=[.!?])\s+", text): split at each
// maximal whitespace run that directly follows '.', '!' or '?'. Go's regexp
// has no lookbehind.
func splitAtSentenceEnds(text string) []string {
	runes := []rune(text)
	parts := []string{}
	start := 0
	for i := 0; i < len(runes); {
		if i > 0 && IsPySpace(runes[i]) && strings.ContainsRune(".!?", runes[i-1]) {
			j := i
			for j < len(runes) && IsPySpace(runes[j]) {
				j++
			}
			parts = append(parts, string(runes[start:i]))
			start, i = j, j
			continue
		}
		i++
	}
	return append(parts, string(runes[start:]))
}

// SplitSentences is compare.py's split_sentences: split on sentence-final
// punctuation, joining back a sentence that ends in an abbreviation and a
// period ("Mr. Smith").
func (t Tokenizer) SplitSentences(text string) []string {
	out := []string{}
	for _, raw := range splitAtSentenceEnds(text) {
		part := PyStrip(raw)
		if part == "" {
			continue
		}
		if n := len(out); n > 0 {
			last := t.Tokenize(out[n-1])
			if len(last) > 0 && abbreviations[last[len(last)-1]] && strings.HasSuffix(out[n-1], ".") {
				out[n-1] += " " + part
				continue
			}
		}
		out = append(out, part)
	}
	return out
}

// SentenceUnit is one sentence of a chapter and the index of the paragraph it
// is in.
type SentenceUnit struct {
	Text      string
	Paragraph int
}

// BuildSentenceUnits is compare.py's build_sentence_units: a chapter's
// paragraphs as sentences, each tagged with its paragraph.
func (t Tokenizer) BuildSentenceUnits(paragraphs []string) []SentenceUnit {
	units := []SentenceUnit{}
	for p, paragraph := range paragraphs {
		for _, sentence := range t.SplitSentences(paragraph) {
			units = append(units, SentenceUnit{sentence, p})
		}
	}
	return units
}

// HeadingUnit is the unit index build_chapter_units gives the heading's
// tokens.
const HeadingUnit = -1

// ChapterUnits is compare.py's build_chapter_units' result: the sentence
// units, and per chapter token (heading first, then every sentence's) the
// token, its unit (HeadingUnit for the heading) and the word it came from.
type ChapterUnits struct {
	Sentences []SentenceUnit
	Tokens    []string
	UnitIdx   []int
	RawWords  []string
}

// BuildChapterUnits is compare.py's build_chapter_units for a chapter whose
// heading (the title, and the subtitle when the caller joins it in) is
// heading.
func (t Tokenizer) BuildChapterUnits(heading string, paragraphs []string) ChapterUnits {
	units := ChapterUnits{Sentences: t.BuildSentenceUnits(paragraphs)}
	units.Tokens, units.RawWords = t.TokenizeWithRaw(heading)
	units.UnitIdx = make([]int, len(units.Tokens))
	for k := range units.UnitIdx {
		units.UnitIdx[k] = HeadingUnit
	}
	for u, sentence := range units.Sentences {
		tokens, raw := t.TokenizeWithRaw(sentence.Text)
		units.Tokens = append(units.Tokens, tokens...)
		units.RawWords = append(units.RawWords, raw...)
		for range tokens {
			units.UnitIdx = append(units.UnitIdx, u)
		}
	}
	return units
}
