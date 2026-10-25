package guide

import (
	_ "embed" // python-unicode.json
	"encoding/json"
	"slices"
	"sort"
	"strconv"
	"sync"
)

// This file is manuscript_guide.py find_occurrences and excerpt, run in the host (#2251 deleted the Python copy): where a name is in
// the manuscript, and the text stored beside each place. The sidecar searched with the regular expression \b + re.escape(name.strip())
// + \b under re.IGNORECASE, so what counts as a word, which letters are one letter, what strip removes and where an index falls are
// Python's, and Python indexes a string by code point. Go would answer from its own Unicode tables and its own idea of a letter's
// case, which differ in a few thousand places, so the host does not ask them: python-unicode.json holds the tables Python 3.12 searches by, written by the sidecar's
// test_python_text_goldens.py, and occurrence-parity.json (frozen) pins every answer below against the sidecar's
// (TestFindOccurrencesMatchesTheSidecar).

// excerptRadius is excerpt's default radius: the code points kept on each side of a match.
const excerptRadius = 150

//go:embed python-unicode.json
var pythonUnicodeJSON []byte

type runeRange struct{ first, last rune }

// pythonUnicodeTables is the Unicode data Python's re module and str.strip use.
type pythonUnicodeTables struct {
	word, space, cased []runeRange
	lower              map[rune]rune
	extra              map[rune][]rune // re's added case pairs: the characters a lower-cased letter also stands for (i is also dotless i)
	asciiWord          [128]bool
	asciiSpace         [128]bool
}

var pythonUnicode = sync.OnceValue(func() *pythonUnicodeTables {
	var file struct {
		Word       [][2]rune           `json:"word"`
		Space      [][2]rune           `json:"space"`
		Cased      [][2]rune           `json:"cased"`
		Lower      [][2]rune           `json:"lower"`
		ExtraCases [][]json.RawMessage `json:"extra_cases"`
	}
	if err := json.Unmarshal(pythonUnicodeJSON, &file); err != nil {
		panic("python-unicode.json: " + err.Error()) // an embedded file; a test reads it
	}
	ranges := func(pairs [][2]rune) []runeRange {
		out := make([]runeRange, len(pairs))
		for i, pair := range pairs {
			out[i] = runeRange{pair[0], pair[1]}
		}
		return out
	}
	tables := &pythonUnicodeTables{word: ranges(file.Word), space: ranges(file.Space), cased: ranges(file.Cased), lower: make(map[rune]rune, len(file.Lower)), extra: map[rune][]rune{}}
	for _, pair := range file.Lower {
		tables.lower[pair[0]] = pair[1]
	}
	for _, row := range file.ExtraCases {
		var code rune
		var others []rune
		if len(row) != 2 || json.Unmarshal(row[0], &code) != nil || json.Unmarshal(row[1], &others) != nil {
			panic("python-unicode.json: bad extra_cases row")
		}
		tables.extra[code] = others
	}
	for r := rune(0); r < 128; r++ {
		tables.asciiWord[r] = inRanges(tables.word, r)
		tables.asciiSpace[r] = inRanges(tables.space, r)
	}
	return tables
})

func inRanges(ranges []runeRange, r rune) bool {
	i := sort.Search(len(ranges), func(i int) bool { return ranges[i].last >= r })
	return i < len(ranges) && ranges[i].first <= r
}

// isWord is re's \w for text: Python's str.isalnum or an underscore.
func (t *pythonUnicodeTables) isWord(r rune) bool {
	if r >= 0 && r < 128 {
		return t.asciiWord[r]
	}
	return inRanges(t.word, r)
}

// isSpace is str.isspace, which is what strip removes.
func (t *pythonUnicodeTables) isSpace(r rune) bool {
	if r >= 0 && r < 128 {
		return t.asciiSpace[r]
	}
	return inRanges(t.space, r)
}

// lowerOf is the simple lower-casing re compares letters by (a letter with no single-character lower case is its own).
func (t *pythonUnicodeTables) lowerOf(r rune) rune {
	if r >= 'A' && r <= 'Z' {
		return r + 'a' - 'A'
	}
	if r < 128 {
		return r
	}
	if lower, ok := t.lower[r]; ok {
		return lower
	}
	return r
}

// stripRunes is str.strip(): the text without the whitespace at both ends.
func stripRunes(text []rune) []rune {
	tables := pythonUnicode()
	for len(text) > 0 && tables.isSpace(text[0]) {
		text = text[1:]
	}
	for len(text) > 0 && tables.isSpace(text[len(text)-1]) {
		text = text[:len(text)-1]
	}
	return text
}

// literal is one character of the pattern. re compiles an uncased character to an exact match, and a cased one to "its lower case is
// this lower case, or one of the characters re adds for it".
type literal struct {
	exact bool
	char  rune
	lower rune
	extra []rune
}

func (l literal) matches(tables *pythonUnicodeTables, r rune) bool {
	if l.exact {
		return r == l.char
	}
	lower := tables.lowerOf(r)
	return lower == l.lower || slices.Contains(l.extra, lower)
}

func compileLiterals(tables *pythonUnicodeTables, name []rune) []literal {
	out := make([]literal, len(name))
	for i, r := range name {
		// sre's iscased: the character has a lower case or an upper case other than itself. The table holds the answer for both.
		if !inRanges(tables.cased, r) {
			out[i] = literal{exact: true, char: r}
			continue
		}
		lower := tables.lowerOf(r)
		out[i] = literal{char: r, lower: lower, extra: tables.extra[lower]}
	}
	return out
}

// textParagraph is one paragraph of the narration, as load_manuscript lists it: the chapter it is in, its ids, and its text by code point.
type textParagraph struct {
	chapter                any
	chapterID, paragraphID string
	text                   []rune
}

// atBoundary is \b before text[at]: exactly one of the characters either side is a word character.
func atBoundary(tables *pythonUnicodeTables, text []rune, at int) bool {
	before := at > 0 && tables.isWord(text[at-1])
	after := at < len(text) && tables.isWord(text[at])
	return before != after
}

// forEachMatch calls found with the start and end (in code points) of every whole-word, case-insensitive appearance of the pattern in the
// text, in order. Appearances do not overlap: the search resumes where the last one ended, as re.finditer does.
func forEachMatch(tables *pythonUnicodeTables, pattern []literal, text []rune, found func(start, end int)) {
	for at := 0; at+len(pattern) <= len(text); {
		if !pattern[0].matches(tables, text[at]) || !matchesAt(tables, pattern, text, at) {
			at++
			continue
		}
		end := at + len(pattern)
		if !atBoundary(tables, text, at) || !atBoundary(tables, text, end) {
			at++
			continue
		}
		found(at, end)
		at = end
	}
}

// findOccurrences is find_occurrences: every whole-word, case-insensitive appearance of the name, one evidence record per appearance, in
// manuscript order. A name that is blank once stripped has none.
func findOccurrences(paragraphs []textParagraph, name string) []any {
	tables := pythonUnicode()
	found := []any{}
	pattern := compileLiterals(tables, stripRunes([]rune(name)))
	if len(pattern) == 0 {
		return found
	}
	for index, paragraph := range paragraphs {
		forEachMatch(tables, pattern, paragraph.text, func(start, end int) {
			found = append(found, map[string]any{
				"chapter":     paragraph.chapter,
				"chapterId":   paragraph.chapterID,
				"paragraph":   json.Number(strconv.Itoa(index)),
				"paragraphId": paragraph.paragraphID,
				"excerpt":     excerpt(paragraph.text, start, end),
			})
		})
	}
	return found
}

func matchesAt(tables *pythonUnicodeTables, pattern []literal, text []rune, at int) bool {
	for i, l := range pattern {
		if !l.matches(tables, text[at+i]) {
			return false
		}
	}
	return true
}

// excerpt is excerpt(text, start, end): the text from excerptRadius code points before the match to as many after it, stripped, with an
// ellipsis at each end the cut left something out of. Whether to add one is decided before the strip, as in the sidecar.
func excerpt(text []rune, start, end int) string {
	left := max(0, start-excerptRadius)
	right := min(len(text), end+excerptRadius)
	value := string(stripRunes(text[left:right]))
	if left > 0 {
		value = "…" + value
	}
	if right < len(text) {
		value += "…"
	}
	return value
}
