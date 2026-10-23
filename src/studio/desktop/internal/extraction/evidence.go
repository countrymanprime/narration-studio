package extraction

import (
	"strings"
	"unicode/utf16"
)

// Evidence is a quoted stretch of one paragraph. Start and End are UTF-16 code units into the paragraph's text; Text
// is the manuscript's own text for that slice.
type Evidence struct {
	ParagraphID string
	Start       int
	End         int
	Text        string
}

// Paragraph is one paragraph of the manuscript as the evidence check searches it.
type Paragraph struct {
	ID        string
	ChapterID string
	Text      string
}

// QuoteHint says where a source thinks a quote is. Either field may be empty.
type QuoteHint struct {
	ParagraphID string
	ChapterID   string
}

// foldRune maps typographic quotes and apostrophes and the non-breaking and thin spaces to their plain forms. Every
// result is a single UTF-16 unit, as is every input, so a folded text has the offsets of the original.
func foldRune(r rune) rune {
	switch r {
	case '\u2018', '\u2019', '\u201b':
		return '\''
	case '\u201c', '\u201d', '\u201f':
		return '"'
	case '\u00a0', '\u2009', '\u202f':
		return ' '
	}
	return r
}

// fold returns s with typography folded. Invalid UTF-8 becomes U+FFFD, one per bad byte, the same as units, so the
// folded text and the original have the same length in code units.
func fold(s string) string {
	runes := []rune(s)
	for i, r := range runes {
		runes[i] = foldRune(r)
	}
	return string(runes)
}

// units returns s as UTF-16 code units; the offsets of Evidence index this form.
func units(s string) []uint16 {
	return utf16.Encode([]rune(s))
}

// indexUnits returns the first position of sub in s, or -1.
func indexUnits(s, sub []uint16) int {
	for at := 0; at+len(sub) <= len(s); at++ {
		match := true
		for i, u := range sub {
			if s[at+i] != u {
				match = false
				break
			}
		}
		if match {
			return at
		}
	}
	return -1
}

// VerifyEvidence finds quote in the manuscript and says exactly where it is. The paragraph the hint names is tried
// first, then the rest of its chapter, then the whole book. Offsets and text are computed from the manuscript, never
// taken from a provider. ok is false when the quote is empty or cannot be found, so the claim then needs verification.
func VerifyEvidence(paragraphs []Paragraph, quote string, hint QuoteHint) (ev Evidence, ok bool) {
	q := units(fold(strings.TrimSpace(quote)))
	if len(q) == 0 {
		return Evidence{}, false
	}
	var first, chapter, rest []Paragraph
	for _, p := range paragraphs {
		switch {
		case hint.ParagraphID != "" && p.ID == hint.ParagraphID:
			first = append(first, p)
		case hint.ChapterID != "" && p.ChapterID == hint.ChapterID:
			chapter = append(chapter, p)
		default:
			rest = append(rest, p)
		}
	}
	for _, group := range [][]Paragraph{first, chapter, rest} {
		for _, p := range group {
			text := units(p.Text)
			at := indexUnits(units(fold(p.Text)), q)
			if at < 0 {
				continue
			}
			end := at + len(q)
			return Evidence{ParagraphID: p.ID, Start: at, End: end, Text: string(utf16.Decode(text[at:end]))}, true
		}
	}
	return Evidence{}, false
}
