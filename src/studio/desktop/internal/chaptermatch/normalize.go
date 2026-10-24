// Package chaptermatch matches manuscript chapters to REAPER tracks. It is
// the one chapter-to-track matcher every consumer shares (the teleprompter's
// resume, Home's measured duration, line identity, the review dashboard's
// chapter grouping, the diagnostics DAW scan): docs/utilities/tracks.md.
//
// Two layers. FindChapterByTrackName (title.go) is a faithful port of
// Transcript Compare's find_chapter_by_track_name
// (src/studio/sidecars/transcript-compare/core/compare.py), over the
// tokenizer, number-word merge and homophone canon of internal/compare;
// tests/fixtures/chapter-track-match/parity-cases.json holds the cases both
// implementations must agree on. ForChapter (resolve.go) builds on it to
// answer the question the app asks, "which track holds this chapter?", with a
// narrator-confirmed link taking precedence, project region names as a second
// source, and an explicit ambiguous state instead of a silent pick.
package chaptermatch

import "desktop/internal/compare"

// tokenize is compare.py's tokenize without a project's own equivalence list,
// which the matcher has no manuscript folder to read.
func tokenize(text string) []string { return compare.CanonicalTokens(text) }

// MergeNumberWords is compare.py's merge_number_words without the index map:
// "twenty three" reads as 23 and "one hundred and five" as 105.
func MergeNumberWords(tokens []string) []string {
	merged, _ := compare.MergeNumberWords(tokens, make([]int, len(tokens)))
	return merged
}

// NormalizedTokens is compare.py's normalized_tokens: tokenize, then merge
// number words, so "CHAPTER ONE" and "Chapter 1" both read [chapter 1]. It is
// a token list, not a joined string, so prefix checks compare whole tokens and
// "chapter 1" never prefixes "chapter 11".
func NormalizedTokens(text string) []string {
	return MergeNumberWords(tokenize(text))
}
