package localmodel

import (
	"strings"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"
)

// MinNameRunes is the shortest name the source will look for. A one-letter name ("A") is in every sentence.
const MinNameRunes = 2

// NameSpans returns the byte spans of text where name is written as a whole word, ignoring case, typographic quotes, the no-break
// and thin spaces and invisible format characters such as a zero-width joiner (the folds extraction.VerifyEvidence makes, and the
// ones a model's reason loses). A name that starts with a capital must start with one in the text too, so "Will" is not found in
// "she will go", though it is in "WILL" and "Will". A span is a slice of text itself, so its bounds are always valid for text,
// whatever the casing does to a rune's width. "Tom" is not found in "atom", "Tomorrow" or "Tom-Ann"; it is found in "Tom's" and
// "Tom,". A name shorter than MinNameRunes has no spans.
func NameSpans(text, name string) [][2]int {
	want := foldRunes(name)
	if len(want) < MinNameRunes {
		return nil
	}
	capital := startsWithCapital(name)
	type kept struct {
		folded, original rune
		start, end       int
	}
	var runes []kept
	for i := 0; i < len(text); {
		r, size := utf8.DecodeRuneInString(text[i:])
		if !unicode.Is(unicode.Cf, r) {
			runes = append(runes, kept{foldRune(r), r, i, i + size})
		}
		i += size
	}
	var spans [][2]int
	for i := 0; i+len(want) <= len(runes); i++ {
		match := true
		for j, w := range want {
			if runes[i+j].folded != w {
				match = false
				break
			}
		}
		if !match || (capital && !unicode.IsUpper(runes[i].original)) {
			continue
		}
		start, end := runes[i].start, runes[i+len(want)-1].end
		if wordBefore(text, start) || wordAfter(text, end) {
			continue
		}
		spans = append(spans, [2]int{start, end})
	}
	return spans
}

func startsWithCapital(name string) bool {
	for _, r := range strings.TrimSpace(name) {
		if unicode.Is(unicode.Cf, r) {
			continue
		}
		return unicode.IsUpper(r)
	}
	return false
}

// wordBefore reports whether the rune before byte offset at continues a word: a letter, digit or mark, or a hyphen that joins two.
func wordBefore(text string, at int) bool {
	if at <= 0 {
		return false
	}
	r, size := utf8.DecodeLastRuneInString(text[:at])
	if isWordRune(r) {
		return true
	}
	if isHyphen(r) {
		before, _ := utf8.DecodeLastRuneInString(text[:at-size])
		return isWordRune(before)
	}
	return false
}

// wordAfter is wordBefore for the rune at byte offset at.
func wordAfter(text string, at int) bool {
	if at >= len(text) {
		return false
	}
	r, size := utf8.DecodeRuneInString(text[at:])
	if isWordRune(r) {
		return true
	}
	if isHyphen(r) && at+size < len(text) {
		after, _ := utf8.DecodeRuneInString(text[at+size:])
		return isWordRune(after)
	}
	return false
}

func isWordRune(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsMark(r) }

func isHyphen(r rune) bool { return r == '-' || r == '\u2010' || r == '\u2011' }

// foldRunes is s as one folded rune per visible rune, so two strings that fold alike have the same length in runes. Format
// characters are dropped.
func foldRunes(s string) []rune {
	var out []rune
	for _, r := range strings.TrimSpace(s) {
		if unicode.Is(unicode.Cf, r) {
			continue
		}
		out = append(out, foldRune(r))
	}
	return out
}

// foldRune maps typographic quotes and apostrophes and the no-break, thin and narrow spaces to their plain forms and lowercases,
// one rune to one rune. A final sigma folds to the ordinary one.
func foldRune(r rune) rune {
	switch r {
	case '\u2018', '\u2019', '\u02bc':
		return '\''
	case '\u201c', '\u201d':
		return '"'
	case '\u00a0', '\u2009', '\u202f':
		return ' '
	case 'ς':
		return 'σ'
	}
	return unicode.ToLower(r)
}

// byteOffset is the byte offset in text of UTF-16 offset units, the unit extraction.Evidence counts in. An invalid byte is one unit,
// as it is when the manuscript is searched.
func byteOffset(text string, units int) int {
	n := 0
	for i := 0; i < len(text); {
		if n >= units {
			return i
		}
		r, size := utf8.DecodeRuneInString(text[i:])
		n += utf16.RuneLen(r)
		i += size
	}
	return len(text)
}
