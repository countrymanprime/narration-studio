package manuscript

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf16"
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
		if !strings.Contains(foldCase(body), needle) {
			continue
		}
		matches := findMatches(body, needle)
		result.Total += len(matches)
		room := maxSearchMatches - sent
		if room <= 0 {
			continue
		}
		if len(matches) > room {
			matches = matches[:room]
		}
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

// findMatches is every non-overlapping place the folded needle appears in body, as UTF-16 indices into body itself.
// Folding can change a code point's UTF-8 length (U+0130 is two bytes, its fold "i" one), so offsets in the folded text
// are mapped back through the code point each folded byte came from.
func findMatches(body, needle string) []SearchMatch {
	folded := make([]byte, 0, len(body))
	// at[i] is the UTF-16 index in body of the code point that folded byte i came from; at[len(folded)] is body's length.
	at := make([]int, 0, len(body)+1)
	units := 0
	for _, r := range body {
		before := len(folded)
		folded = append(folded, string(unicode.ToLower(r))...)
		for range len(folded) - before {
			at = append(at, units)
		}
		units += utf16.RuneLen(r)
	}
	at = append(at, units)
	haystack := string(folded)
	matches := []SearchMatch{}
	for from := 0; ; {
		found := strings.Index(haystack[from:], needle)
		if found < 0 {
			return matches
		}
		start := from + found
		from = start + len(needle)
		matches = append(matches, SearchMatch{Start: at[start], End: at[from]})
	}
}

func utf16Length(value string) int {
	units := 0
	for _, r := range value {
		units += utf16.RuneLen(r)
	}
	return units
}
