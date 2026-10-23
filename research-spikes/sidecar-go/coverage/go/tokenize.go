// Port of the coverage path's tokenization: narration_common.spoken_forms (canonical_tokens,
// merge_number_words) and compare.py (tokenize, tokenize_with_raw, split_sentences,
// build_sentence_units, build_chapter_units, the opcode half of diff_and_build_markers,
// _fuse_hyphen_split_opcodes) and recording_coverage.aligned_chapter_from_markers.
package main

import (
	"math/big"
	"strings"
)

var numberWords = map[string]int64{
	"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
	"ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
	"seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
	"sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90, "hundred": 100, "thousand": 1000,
	"million": 1000000, "billion": 1000000000,
}

var fillerWords = map[string]bool{"uh": true, "um": true, "umm": true, "uhh": true, "erm": true, "hmm": true, "mhm": true, "huh": true}

var homophoneGroups = [][]string{
	{"your", "you're"}, {"their", "there", "they're"}, {"its", "it's"}, {"whose", "who's"}, {"weather", "whether"},
	{"write", "right"}, {"here", "hear"}, {"new", "knew"}, {"know", "no"}, {"break", "brake"}, {"threw", "through"},
	{"passed", "past"}, {"peace", "piece"}, {"plain", "plane"}, {"sea", "see"}, {"way", "weigh"}, {"weak", "week"},
	{"which", "witch"}, {"would", "wood"}, {"allowed", "aloud"}, {"bare", "bear"}, {"board", "bored"},
	{"buy", "by", "bye"}, {"cell", "sell"}, {"flower", "flour"}, {"hole", "whole"}, {"hour", "our"}, {"made", "maid"},
	{"mail", "male"}, {"meat", "meet"}, {"night", "knight"}, {"pair", "pear"}, {"principal", "principle"},
	{"sale", "sail"}, {"sight", "site", "cite"}, {"sole", "soul"}, {"son", "sun"}, {"stair", "stare"},
	{"steal", "steel"}, {"tail", "tale"}, {"waist", "waste"}, {"wait", "weight"}, {"miner", "minor"},
	{"miners", "minors"}, {"vane", "vein"}, {"vanes", "veins"},
}

var homophoneCanon = buildCanon(homophoneGroups)

// customCanon is compare._CUSTOM_CANON (a project's equivalences.csv); empty for the fixtures.
var customCanon = map[string]string{}

func buildCanon(groups [][]string) map[string]string {
	m := map[string]string{}
	for _, g := range groups {
		for _, w := range g {
			m[w] = g[0]
		}
	}
	return m
}

var quoteNormalize = map[rune]rune{
	'‘': '\'', '’': '\'', '‛': '\'', 'ʼ': '\'', '`': '\'', '´': '\'',
	'“': '"', '”': '"', '„': '"', '‟': '"',
}

func isTokenByte(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '\''
}

// canonicalTokens is spoken_forms.canonical_tokens. TOKEN_RE is ASCII-only, so after the quote fold
// every non-ASCII rune is a separator and lowercasing is ASCII lowercasing.
func canonicalTokens(text string) []string {
	var sb strings.Builder
	for _, r := range text {
		if q, ok := quoteNormalize[r]; ok {
			r = q
		}
		sb.WriteRune(r)
	}
	s := sb.String()
	out := []string{}
	for i := 0; i < len(s); {
		if !isTokenByte(s[i]) {
			i++
			continue
		}
		j := i
		for j < len(s) && isTokenByte(s[j]) {
			j++
		}
		tok := strings.ToLower(s[i:j])
		if c, ok := homophoneCanon[tok]; ok {
			tok = c
		}
		if strings.HasSuffix(tok, "'s") && len(tok) > 2 {
			tok = tok[:len(tok)-2] + "s"
		}
		out = append(out, tok)
		i = j
	}
	return out
}

func tokenize(text string) []string {
	toks := canonicalTokens(text)
	for k, t := range toks {
		if c, ok := customCanon[t]; ok {
			toks[k] = c
		}
	}
	return toks
}

// pyIsSpace is str.isspace for one code point (what str.split(), str.strip() and re's \s use);
// unlike unicode.IsSpace it includes U+001C..U+001F.
func pyIsSpace(r rune) bool {
	switch r {
	case ' ', '\t', '\n', '\v', '\f', '\r', 0x1c, 0x1d, 0x1e, 0x1f, 0x85, 0xa0, 0x1680,
		0x2028, 0x2029, 0x202f, 0x205f, 0x3000:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}

func pySplit(s string) []string { return strings.FieldsFunc(s, pyIsSpace) }

func pyStrip(s string) string { return strings.TrimFunc(s, pyIsSpace) }

func tokenizeWithRaw(text string) ([]string, []string) {
	tokens, raws := []string{}, []string{}
	for _, raw := range pySplit(text) {
		for _, t := range tokenize(raw) {
			tokens = append(tokens, t)
			raws = append(raws, raw)
		}
	}
	return tokens, raws
}

var abbreviations = map[string]bool{"mr": true, "mrs": true, "ms": true, "dr": true, "st": true, "jr": true, "sr": true, "vs": true, "mt": true}

// sentenceBoundarySplit is re.split(r"(?<=[.!?])\s+", text): split at each maximal whitespace run
// that directly follows '.', '!' or '?'. Go's regexp has no lookbehind.
func sentenceBoundarySplit(text string) []string {
	rs := []rune(text)
	parts := []string{}
	start := 0
	for i := 0; i < len(rs); {
		if pyIsSpace(rs[i]) && i > 0 && (rs[i-1] == '.' || rs[i-1] == '!' || rs[i-1] == '?') {
			j := i
			for j < len(rs) && pyIsSpace(rs[j]) {
				j++
			}
			parts = append(parts, string(rs[start:i]))
			start, i = j, j
			continue
		}
		i++
	}
	return append(parts, string(rs[start:]))
}

func splitSentences(text string) []string {
	out := []string{}
	for _, p := range sentenceBoundarySplit(text) {
		part := pyStrip(p)
		if part == "" {
			continue
		}
		if len(out) > 0 {
			last := tokenize(out[len(out)-1])
			if len(last) > 0 && abbreviations[last[len(last)-1]] && strings.HasSuffix(out[len(out)-1], ".") {
				out[len(out)-1] = out[len(out)-1] + " " + part
				continue
			}
		}
		out = append(out, part)
	}
	return out
}

type sentenceUnit struct {
	text      string
	paragraph int
}

func buildSentenceUnits(paragraphs []string) []sentenceUnit {
	units := []sentenceUnit{}
	for p, para := range paragraphs {
		for _, s := range splitSentences(para) {
			units = append(units, sentenceUnit{s, p})
		}
	}
	return units
}

func buildChapterUnits(title string, paragraphs []string) ([]sentenceUnit, []string, []int, []string) {
	units := buildSentenceUnits(paragraphs)
	tokens, raws := tokenizeWithRaw(title)
	unitIdx := make([]int, len(tokens))
	for k := range unitIdx {
		unitIdx[k] = -1
	}
	for u, unit := range units {
		st, sr := tokenizeWithRaw(unit.text)
		for k := range st {
			tokens = append(tokens, st[k])
			raws = append(raws, sr[k])
			unitIdx = append(unitIdx, u)
		}
	}
	return units, tokens, unitIdx, raws
}

// mergeNumberWords keeps Python's arbitrary-precision int: "billion billion billion" overflows int64.
func mergeNumberWords(tokens []string, indexMap []int) ([]string, []int) {
	outT, outI := []string{}, []int{}
	n := len(tokens)
	for i := 0; i < n; {
		if _, ok := numberWords[tokens[i]]; ok {
			start := i
			total, chunk := new(big.Int), new(big.Int)
			one := big.NewInt(1)
			orOne := func(x *big.Int) *big.Int {
				if x.Sign() == 0 {
					return one
				}
				return x
			}
			j := i
			for j < n {
				tok := tokens[j]
				if val, ok := numberWords[tok]; ok {
					v := big.NewInt(val)
					switch {
					case val == 100:
						chunk = new(big.Int).Mul(orOne(chunk), v)
					case val >= 1000:
						total = new(big.Int).Add(total, new(big.Int).Mul(orOne(chunk), v))
						chunk = new(big.Int)
					default:
						chunk = new(big.Int).Add(chunk, v)
					}
					j++
				} else if tok == "and" && j+1 < n {
					if _, ok := numberWords[tokens[j+1]]; ok {
						j++
					} else {
						break
					}
				} else {
					break
				}
			}
			total.Add(total, chunk)
			outT = append(outT, total.String())
			outI = append(outI, indexMap[start])
			i = j
		} else {
			outT = append(outT, tokens[i])
			outI = append(outI, indexMap[i])
			i++
		}
	}
	return outT, outI
}

func fuseHyphenSplitOpcodes(ops []Opcode, doc, audio []string) []Opcode {
	out := make([]Opcode, 0, len(ops))
	for _, op := range ops {
		if op.Tag == "replace" {
			d, a := doc[op.I1:op.I2], audio[op.J1:op.J2]
			if (len(d) == 1 && len(a) > 1 && d[0] == strings.Join(a, "")) || (len(a) == 1 && len(d) > 1 && a[0] == strings.Join(d, "")) {
				out = append(out, Opcode{"equal", op.I1, op.I2, op.J1, op.J2})
				continue
			}
		}
		out = append(out, op)
	}
	return out
}

// alignChapter is build_chapter_units + the alignment half of diff_and_build_markers +
// aligned_chapter_from_markers: transcript words and a chapter in, AlignedChapter out.
func alignChapter(headingText string, paragraphs, paragraphIDs []string, words []string) *AlignedChapter {
	units, chapterTokens, unitIdx, rawWords := buildChapterUnits(headingText, paragraphs)
	filtered, indexMap := []string{}, []int{}
	for i, w := range words {
		for _, t := range tokenize(w) {
			if fillerWords[t] {
				continue
			}
			filtered = append(filtered, t)
			indexMap = append(indexMap, i)
		}
	}
	ident := make([]int, len(chapterTokens))
	for k := range ident {
		ident[k] = k
	}
	docNorm, docIndexMap := mergeNumberWords(chapterTokens, ident)
	filtered, _ = mergeNumberWords(filtered, indexMap)
	ops := fuseHyphenSplitOpcodes(NewSequenceMatcher(docNorm, filtered, false).GetOpcodes(), docNorm, filtered)
	a := &AlignedChapter{DocTokens: docNorm, ParagraphIDs: paragraphIDs, AudioTokens: filtered, Opcodes: ops}
	a.DocWords = make([]string, len(docNorm))
	a.TokenParagraph = make([]int, len(docNorm))
	for k, orig := range docIndexMap {
		a.DocWords[k] = rawWords[orig]
		if u := unitIdx[orig]; u < 0 {
			a.TokenParagraph[k] = heading
		} else {
			a.TokenParagraph[k] = units[u].paragraph
		}
	}
	return a
}
