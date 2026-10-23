package main

// Port of libs/python/narration_common/spoken_forms.py (canonical_tokens, merge_number_words)
// and the tokenizing / sentence splitting of sidecars/transcript-compare/core/compare.py.

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
	{"your", "you're"}, {"their", "there", "they're"}, {"its", "it's"}, {"whose", "who's"},
	{"weather", "whether"}, {"write", "right"}, {"here", "hear"}, {"new", "knew"}, {"know", "no"},
	{"break", "brake"}, {"threw", "through"}, {"passed", "past"}, {"peace", "piece"}, {"plain", "plane"},
	{"sea", "see"}, {"way", "weigh"}, {"weak", "week"}, {"which", "witch"}, {"would", "wood"},
	{"allowed", "aloud"}, {"bare", "bear"}, {"board", "bored"}, {"buy", "by", "bye"}, {"cell", "sell"},
	{"flower", "flour"}, {"hole", "whole"}, {"hour", "our"}, {"made", "maid"}, {"mail", "male"},
	{"meat", "meet"}, {"night", "knight"}, {"pair", "pear"}, {"principal", "principle"}, {"sale", "sail"},
	{"sight", "site", "cite"}, {"sole", "soul"}, {"son", "sun"}, {"stair", "stare"}, {"steal", "steel"},
	{"tail", "tale"}, {"waist", "waste"}, {"wait", "weight"}, {"miner", "minor"}, {"miners", "minors"},
	{"vane", "vein"}, {"vanes", "veins"},
}

func buildCanon(groups [][]string) map[string]string {
	out := map[string]string{}
	for _, g := range groups {
		for _, w := range g {
			out[w] = g[0]
		}
	}
	return out
}

var homophoneCanon = buildCanon(homophoneGroups)

// customCanon is compare._CUSTOM_CANON (a project's equivalences.csv); empty in this spike.
var customCanon = map[string]string{}

var quoteFold = strings.NewReplacer("‘", "'", "’", "'", "‛", "'", "ʼ", "'", "`", "'", "´", "'", "“", "\"", "”", "\"", "„", "\"", "‟", "\"")

func isTokenByte(c byte) bool {
	return c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '\''
}

// canonicalTokens: TOKEN_RE [A-Za-z0-9']+ is ASCII-only, so scanning UTF-8 bytes is exact
// (no byte of a multi-byte rune is ASCII), and str.lower() of an ASCII token is ASCII lowering.
func canonicalTokens(text string) []string {
	if strings.ContainsAny(text, "`\u2018\u2019\u201b\u02bc\u00b4\u201c\u201d\u201e\u201f") {
		text = quoteFold.Replace(text)
	}
	var out []string
	for i := 0; i < len(text); {
		if !isTokenByte(text[i]) {
			i++
			continue
		}
		j := i
		for j < len(text) && isTokenByte(text[j]) {
			j++
		}
		tok := asciiLower(text[i:j])
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

func asciiLower(s string) string {
	for i := 0; i < len(s); i++ {
		if s[i] >= 'A' && s[i] <= 'Z' {
			b := []byte(s)
			for k := i; k < len(b); k++ {
				if b[k] >= 'A' && b[k] <= 'Z' {
					b[k] += 'a' - 'A'
				}
			}
			return string(b)
		}
	}
	return s
}

func tokenize(text string) []string {
	toks := canonicalTokens(text)
	for i, t := range toks {
		if c, ok := customCanon[t]; ok {
			toks[i] = c
		}
	}
	return toks
}

// mergeNumberWords: Python ints are unbounded ("hundred hundred ..." grows past int64), so the
// run is summed in big.Int.
func mergeNumberWords(tokens []string, indexMap []int) ([]string, []int) {
	outTokens := make([]string, 0, len(tokens))
	outMap := make([]int, 0, len(tokens))
	n := len(tokens)
	i := 0
	for i < n {
		if _, ok := numberWords[tokens[i]]; ok {
			start := i
			total := new(big.Int)
			chunk := new(big.Int)
			j := i
			for j < n {
				tok := tokens[j]
				if v, ok := numberWords[tok]; ok {
					if v == 100 {
						if chunk.Sign() == 0 {
							chunk.SetInt64(1)
						}
						chunk.Mul(chunk, big.NewInt(100))
					} else if v >= 1000 {
						c := new(big.Int).Set(chunk)
						if c.Sign() == 0 {
							c.SetInt64(1)
						}
						total.Add(total, c.Mul(c, big.NewInt(v)))
						chunk.SetInt64(0)
					} else {
						chunk.Add(chunk, big.NewInt(v))
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
			outTokens = append(outTokens, total.String())
			outMap = append(outMap, indexMap[start])
			i = j
		} else {
			outTokens = append(outTokens, tokens[i])
			outMap = append(outMap, indexMap[i])
			i++
		}
	}
	return outTokens, outMap
}

// pyIsSpace is Python's str.isspace() / Py_UNICODE_ISSPACE, the set str.split(), str.strip() and
// re's \s use. Go's unicode.IsSpace lacks U+001C..U+001F.
func pyIsSpace(r rune) bool {
	switch {
	case r >= 0x09 && r <= 0x0D, r >= 0x1C && r <= 0x20, r == 0x85, r == 0xA0, r == 0x1680,
		r >= 0x2000 && r <= 0x200A, r == 0x2028, r == 0x2029, r == 0x202F, r == 0x205F, r == 0x3000:
		return true
	}
	return false
}

func pySplit(s string) []string { return strings.FieldsFunc(s, pyIsSpace) }

func pyStrip(s string) string { return strings.TrimFunc(s, pyIsSpace) }

var abbreviations = map[string]bool{"mr": true, "mrs": true, "ms": true, "dr": true, "st": true, "jr": true, "sr": true, "vs": true, "mt": true}

// splitOnSentenceBoundary is re.split(r"(?<=[.!?])\s+", text): RE2 has no lookbehind.
func splitOnSentenceBoundary(text string) []string {
	var parts []string
	start := 0
	prev := rune(-1)
	rs := []rune(text)
	// work in byte offsets
	pos := 0
	for idx := 0; idx < len(rs); {
		r := rs[idx]
		if pyIsSpace(r) && (prev == '.' || prev == '!' || prev == '?') {
			parts = append(parts, text[start:pos])
			for idx < len(rs) && pyIsSpace(rs[idx]) {
				pos += len(string(rs[idx]))
				idx++
			}
			start = pos
			prev = ' '
			continue
		}
		prev = r
		pos += len(string(r))
		idx++
	}
	parts = append(parts, text[start:])
	return parts
}

func splitSentences(text string) []string {
	var out []string
	for _, p := range splitOnSentenceBoundary(text) {
		part := pyStrip(p)
		if part == "" {
			continue
		}
		if len(out) > 0 {
			toks := tokenize(out[len(out)-1])
			if len(toks) > 0 && abbreviations[toks[len(toks)-1]] && strings.HasSuffix(out[len(out)-1], ".") {
				out[len(out)-1] = out[len(out)-1] + " " + part
				continue
			}
		}
		out = append(out, part)
	}
	return out
}

type unit struct {
	sentence  string
	paragraph int
}

func buildSentenceUnits(paragraphs []string) []unit {
	var units []unit
	for p, para := range paragraphs {
		for _, s := range splitSentences(para) {
			units = append(units, unit{s, p})
		}
	}
	return units
}
