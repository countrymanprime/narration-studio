package manuscript

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"
)

// SearchMatch is one place the term appears in a hit's excerpt: JS string indices (UTF-16 code units), end exclusive.
type SearchMatch struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

// SearchHit is one paragraph that holds the term, with every match in it that the result sends.
type SearchHit struct {
	Chapter     string        `json:"chapter"`
	ChapterID   string        `json:"chapterId"`
	Paragraph   int           `json:"paragraph"`
	ParagraphID string        `json:"paragraphId"`
	Excerpt     string        `json:"excerpt"`
	Matches     []SearchMatch `json:"matches"`
}

// SearchResult is the hits in book order. Total counts every match in the book; Truncated is true when the hits hold fewer
// than Total because they stopped at maxSearchMatches.
type SearchResult struct {
	Hits      []SearchHit `json:"hits"`
	Total     int         `json:"total"`
	Truncated bool        `json:"truncated"`
}

// MaxSearchTermLength is the longest term Search takes, in UTF-16 code units (a JS string's length) after trimming.
const MaxSearchTermLength = 500

// maxSearchMatches bounds the matches one result sends, and so its size and the UI's rendering; counting past it costs
// no allocation, so Total stays exact.
const maxSearchMatches = 1000

// ErrSearchTermTooLong refuses a term longer than MaxSearchTermLength.
var ErrSearchTermTooLong = errors.New("the search term is longer than 500 characters")

// Search finds the term, ignoring case, in the paragraphs the Script page shows: front matter and reference chapters are
// skipped. Case is folded one code point at a time (unicode.ToLower), matches do not overlap, and the text is not
// Unicode-normalized. tests/fixtures/manuscript-search/parity-cases.json pins where each match is, for the mock too.
func (s *Service) Search(query string) (SearchResult, error) {
	result := SearchResult{Hits: []SearchHit{}}
	term := strings.TrimSpace(query)
	if term == "" {
		return result, nil
	}
	if utf16Length(term) > MaxSearchTermLength {
		return result, ErrSearchTermTooLong
	}
	data, err := s.Load()
	if err != nil {
		return result, err
	}
	needle := foldCase(term)
	hidden := hiddenFromScript(data)
	sent := 0
	for _, paragraph := range objects(data["paragraphs"]) {
		if hidden[text(paragraph, "chapterId")] {
			continue
		}
		body := text(paragraph, "text")
		folded := foldCase(body)
		count := strings.Count(folded, needle)
		if count == 0 {
			continue
		}
		result.Total += count
		room := maxSearchMatches - sent
		if room <= 0 {
			continue
		}
		matches := findMatches(body, folded, needle, room)
		sent += len(matches)
		index, _ := paragraph["index"].(float64)
		result.Hits = append(result.Hits, SearchHit{
			Chapter: text(paragraph, "chapterTitle"), ChapterID: text(paragraph, "chapterId"),
			Paragraph: int(index), ParagraphID: text(paragraph, "id"), Excerpt: body, Matches: matches,
		})
	}
	result.Truncated = sent < result.Total
	return result, nil
}

// hiddenFromScript is the ids of the chapters the Script page does not show: front matter and reference chapters.
func hiddenFromScript(data map[string]any) map[string]bool {
	ids := frontMatterChapterIDs(data)
	for _, chapter := range objects(data["chapters"]) {
		if text(chapter, "contentKind") == "reference" {
			ids[text(chapter, "id")] = true
		}
	}
	return ids
}

func foldCase(value string) string { return strings.Map(unicode.ToLower, value) }

// findMatches is the first limit non-overlapping places the needle appears in folded (foldCase(body)), as UTF-16 indices
// into body itself. Folding can change a code point's UTF-8 length (U+0130 is two bytes, its fold "i" one), so outside
// ASCII the offsets are mapped back through the code point each folded byte came from.
func findMatches(body, folded, needle string, limit int) []SearchMatch {
	var at []int
	if !isASCII(body) {
		// at[i] is the UTF-16 index in body of the code point that folded byte i came from; at[len(folded)] is body's length.
		at = make([]int, 0, len(folded)+1)
		units := 0
		for _, r := range body {
			for range utf8.RuneLen(unicode.ToLower(r)) {
				at = append(at, units)
			}
			units += utf16.RuneLen(r)
		}
		at = append(at, units)
	}
	index := func(offset int) int {
		if at == nil {
			return offset
		}
		return at[offset]
	}
	matches := []SearchMatch{}
	for from := 0; len(matches) < limit; {
		found := strings.Index(folded[from:], needle)
		if found < 0 {
			break
		}
		start := from + found
		from = start + len(needle)
		matches = append(matches, SearchMatch{Start: index(start), End: index(from)})
	}
	return matches
}

func isASCII(value string) bool {
	for i := 0; i < len(value); i++ {
		if value[i] >= utf8.RuneSelf {
			return false
		}
	}
	return true
}

func utf16Length(value string) int {
	units := 0
	for _, r := range value {
		units += utf16.RuneLen(r)
	}
	return units
}
