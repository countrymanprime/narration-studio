package localmodel

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// NameSpans returns the byte spans of text where name is written as a whole word, ignoring case, typographic quotes and the
// no-break and thin spaces (the same folds extraction.VerifyEvidence makes). A span is a slice of text itself, so its bounds are
// always valid for text, whatever the casing does to a rune's width. "Tom" is not found in "atom" or "Tomorrow"; it is found in
// "Tom's" and "Tom,". An empty name has no spans.
func NameSpans(text, name string) [][2]int {
	want := foldRunes(name)
	if len(want) == 0 {
		return nil
	}
	type at struct {
		r     rune
		start int
	}
	var runes []at
	for i, r := range text {
		runes = append(runes, at{foldRune(r), i})
	}
	var spans [][2]int
	for i := 0; i+len(want) <= len(runes); i++ {
		match := true
		for j, w := range want {
			if runes[i+j].r != w {
				match = false
				break
			}
		}
		if !match {
			continue
		}
		start := runes[i].start
		end := len(text)
		if next := i + len(want); next < len(runes) {
			end = runes[next].start
		}
		if wordBefore(text, start) || wordAfter(text, end) {
			continue
		}
		spans = append(spans, [2]int{start, end})
	}
	return spans
}

func wordBefore(text string, at int) bool {
	r, _ := utf8.DecodeLastRuneInString(text[:at])
	return at > 0 && isWordRune(r)
}

func wordAfter(text string, at int) bool {
	r, _ := utf8.DecodeRuneInString(text[at:])
	return at < len(text) && isWordRune(r)
}

func isWordRune(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsMark(r) }

// foldRunes is s as one folded rune per rune, so two strings that fold alike have the same length in runes.
func foldRunes(s string) []rune {
	var out []rune
	for _, r := range strings.TrimSpace(s) {
		out = append(out, foldRune(r))
	}
	return out
}

// foldRune maps typographic quotes and the no-break, thin and narrow spaces to their plain forms and lowercases, one rune to one
// rune. A final sigma folds to the ordinary one.
func foldRune(r rune) rune {
	switch r {
	case '‘', '’', 'ʼ':
		return '\''
	case '“', '”':
		return '"'
	case ' ', ' ', ' ':
		return ' '
	case 'ς':
		return 'σ'
	}
	return unicode.ToLower(r)
}
