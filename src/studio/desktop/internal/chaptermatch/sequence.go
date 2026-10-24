package chaptermatch

import "desktop/internal/compare"

// sequenceRatio is Python's difflib.SequenceMatcher(None, a, b).ratio() over
// the two strings' code points, autojunk included, as find_chapter_by_track_name
// calls it.
func sequenceRatio(a, b string) float64 {
	return compare.NewSequenceMatcher([]rune(a), []rune(b), true).Ratio()
}
