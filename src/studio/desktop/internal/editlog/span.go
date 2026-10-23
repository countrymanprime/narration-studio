package editlog

import (
	"errors"
	"strings"
)

// MaxSpanWords is the most words SpanText reads: far more than a voice sample's 30 seconds hold.
const MaxSpanWords = 1000

// Why SpanText cannot answer.
var (
	// ErrSpanKey means a key is not `paragraphId:ordinal`.
	ErrSpanKey = errors.New("that is not a word of the script")
	// ErrSpanOrder means the span ends before it starts.
	ErrSpanOrder = errors.New("a span ends after it starts")
	// ErrSpanTooLong means the span holds more than MaxSpanWords words.
	ErrSpanTooLong = errors.New("that passage is too long")
	// ErrSpanChapterMissing means the chapter is not in the manuscript.
	ErrSpanChapterMissing = errors.New("that chapter is not in the manuscript")
	// ErrSpanMoved means a line or a word the span names is not where its key says: the text was edited or replaced.
	ErrSpanMoved = errors.New("those words are not where they were")
)

// SpanText is the words from the word startKey names to the word endKey names (both included) in a chapter's current text, in
// reading order and joined by one space, the way a record that names a stretch of words (a voice sample) keeps what it was made
// from. Keys are `paragraphId:ordinal`, as everywhere in this package. A line or word that is no longer there is ErrSpanMoved,
// never a neighbour.
func SpanText(book Book, chapterID, startKey, endKey string) (string, error) {
	parsed, err := parseKeys([]string{startKey, endKey})
	if err != nil || len(parsed) == 0 {
		return "", ErrSpanKey
	}
	start, end := parsed[0], parsed[len(parsed)-1]
	if !hasChapter(book, chapterID) {
		return "", ErrSpanChapterMissing
	}
	var lines []Line
	for _, line := range book.Lines {
		if line.ChapterID == chapterID {
			lines = append(lines, line)
		}
	}
	first, last := -1, -1
	for index, line := range lines {
		if line.ID == start.paragraphID && first < 0 {
			first = index
		}
		if line.ID == end.paragraphID && last < 0 {
			last = index
		}
	}
	if first < 0 || last < 0 {
		// A key made of two equal strings parses to one word; a line missing is the same answer for either.
		return "", ErrSpanMoved
	}
	if last < first || (last == first && end.ordinal < start.ordinal) {
		return "", ErrSpanOrder
	}
	var picked []string
	for index := first; index <= last; index++ {
		words := wordsOf(lines[index].Text)
		from, to := 0, len(words)
		if index == first {
			from = start.ordinal
		}
		if index == last {
			if end.ordinal >= len(words) {
				return "", ErrSpanMoved
			}
			to = end.ordinal + 1
		}
		if from > len(words) || from > to {
			return "", ErrSpanMoved
		}
		picked = append(picked, words[from:to]...)
		if len(picked) > MaxSpanWords {
			return "", ErrSpanTooLong
		}
	}
	return strings.Join(picked, " "), nil
}
