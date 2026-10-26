package guide

import (
	"maps"
	"slices"
	"strings"
	"sync"

	"desktop/internal/compare"
)

// This file is the text half of the rules (rules.go): what is left of manuscript_guide.py's name rules (the word statistics, the
// cleaning spacy_candidates uses, classify; rule_candidates gave way to rules_scan.go in #2251) and speech-tag rules (QUOTE_PATTERN, AFTER_QUOTE_TAG, BEFORE_QUOTE_TAG), and extraction_rules.py sentence_around. Each
// regular expression is matched by hand, trying the alternatives in the order Python's re backtracks through them, because Go's
// regexp has no look-behind and its \b and \s are ASCII where Python's are Unicode. A string is a []rune, so an index is a code
// point, as Python counts. \w and \s are compare.IsPyWord and compare.IsPySpace, Python 3.12's tables; [A-Z] and [a-z] are ASCII,
// as in the patterns.

// The name rules' word lists, from manuscript_guide.py.
var (
	ruleStopwords = wordSet("A", "About", "Above", "After", "An", "And", "As", "At", "But", "Before", "Chapter", "For", "He", "Her",
		"His", "I", "In", "It", "Its", "My", "No", "Now", "Not", "Of", "On", "Or", "Our", "She", "So", "The", "Their", "They", "This",
		"That", "Then", "These", "Those", "To", "We", "When", "With", "You", "Your")
	fillerPrefixes = []string{"about", "the", "a", "an", "with", "from", "near", "of", "in", "on", "at", "to", "by"}
	// leadingFillerWords is FILLER_PREFIXES with every stopword lower-cased: the words LEADING_FILLER strips from a name's start.
	leadingFillerWords = func() map[string]bool {
		words := wordSet(fillerPrefixes...)
		for word := range ruleStopwords {
			words[strings.ToLower(word)] = true
		}
		return words
	}()
	personWords        = wordSet("said", "asked", "replied", "cried", "whispered", "smiled", "walked", "looked", "thought")
	placeWords         = wordSet("city", "town", "village", "kingdom", "country", "street", "river", "mountain", "forest", "castle", "planet", "station", "island")
	orgWords           = wordSet("company", "guild", "order", "society", "council", "army", "agency", "corporation", "clan", "house", "university", "church")
	titleWords         = wordSet("captain", "commander", "doctor", "dr", "lady", "lord", "master", "miss", "mister", "mr", "mrs", "ms", "professor", "queen", "king", "prince", "princess", "saint", "sir")
	speechVerbs        = wordSet("said", "asked", "replied", "cried", "whispered", "murmured", "shouted", "answered", "exclaimed", "muttered", "called", "continued", "added", "interrupted", "announced", "demanded", "gasped", "laughed", "stated", "remarked", "snapped", "yelled")
	commonWordSuffixes = []string{"able", "ible", "ing", "ed", "ly", "ous", "ful", "less", "ive"}
)

// The name rules' numbers and character sets, from manuscript_guide.py and extraction_rules.py.
const (
	minSuffixStem           = 3 // MIN_SUFFIX_STEM_LENGTH: "Ned" and "Fred" are names, not -ed adjectives
	minMidSentenceMentions  = 2
	minNeedsReviewMentions  = 3
	sentenceStartLookbehind = 16
	tagWindow               = 60
	maxQuoteSpan            = 400 // QUOTE_PATTERN's {1,400}
	maxQuote                = 300 // extraction_rules.py MAX_QUOTE
	classifyWindow          = 28
	sentenceEndCharacters   = ".!?…"
	sentenceStartSkippable  = " \t\r\n\"'“”‘’()[]{}"
	trailingPunctuation     = " ,.;:!?\"'”’"
	quoteLeadingJunk        = "”’)] " // what sentence_around strips from a sentence that starts after a closing quote or bracket
)

func wordSet(words ...string) map[string]bool {
	set := make(map[string]bool, len(words))
	for _, word := range words {
		set[word] = true
	}
	return set
}

func isUpper(r rune) bool        { return r >= 'A' && r <= 'Z' }
func isLower(r rune) bool        { return r >= 'a' && r <= 'z' }
func isLetter(r rune) bool       { return isUpper(r) || isLower(r) }
func isNameChar(r rune) bool     { return isLetter(r) || r == '\'' || r == '’' || r == '-' } // [A-Za-z'’-]
func isWordSplitter(r rune) bool { return r == '-' || r == '\'' || r == '’' }                // [-'’]

// boundary is re's \b at i: a \w character on one side and not on the other.
func boundary(text []rune, i int) bool {
	before := i > 0 && compare.IsPyWord(text[i-1])
	after := i < len(text) && compare.IsPyWord(text[i])
	return before != after
}

func spacesFrom(text []rune, i int) int {
	for i < len(text) && compare.IsPySpace(text[i]) {
		i++
	}
	return i
}

func nameCharsFrom(text []rune, i int) int {
	for i < len(text) && isNameChar(text[i]) {
		i++
	}
	return i
}

func lettersFrom(text []rune, i int) int {
	for i < len(text) && isLetter(text[i]) {
		i++
	}
	return i
}

// capitalizedAt matches CAPITALIZED (reps 3) or CAPITAL_TOKEN (reps 0) at start:
// \b[A-Z][A-Za-z'’-]*(?:\s+(?:(?:of|the|and)\s+)?[A-Z][A-Za-z'’-]*){0,reps}\b
func capitalizedAt(text []rune, start, reps int) (int, bool) {
	if start >= len(text) || !isUpper(text[start]) || !boundary(text, start) {
		return 0, false
	}
	for end := nameCharsFrom(text, start+1); end > start; end-- {
		if found, ok := capitalizedRest(text, end, reps); ok {
			return found, true
		}
	}
	return 0, false
}

// capitalizedRest is the rest of capitalizedAt after a word ending at at: one more word, greedily, then the closing \b. A shorter
// run of space cannot help (a word or a filler would have to start with a space), so only the longest is tried.
func capitalizedRest(text []rune, at, reps int) (int, bool) {
	if reps > 0 {
		if gap := spacesFrom(text, at); gap > at {
			for _, filler := range []bool{true, false} {
				word := gap
				if filler {
					word = fillerFrom(text, gap)
					if word < 0 {
						continue
					}
				}
				if word >= len(text) || !isUpper(text[word]) {
					continue
				}
				for end := nameCharsFrom(text, word+1); end > word; end-- {
					if found, ok := capitalizedRest(text, end, reps-1); ok {
						return found, true
					}
				}
			}
		}
	}
	if boundary(text, at) {
		return at, true
	}
	return 0, false
}

// fillerFrom matches (?:of|the|and)\s+ at i and gives where the next word starts, or -1.
func fillerFrom(text []rune, i int) int {
	for _, word := range []string{"of", "the", "and"} {
		end := i + len(word)
		if end <= len(text) && string(text[i:end]) == word {
			if next := spacesFrom(text, end); next > end {
				return next
			}
		}
	}
	return -1
}

// finditer is re.finditer for a pattern that never matches empty text: each match's [start, end), left to right, not overlapping.
func finditer(text []rune, at func(text []rune, start int) (int, bool)) [][2]int {
	var found [][2]int
	for start := 0; start < len(text); {
		end, ok := at(text, start)
		if !ok {
			start++
			continue
		}
		found = append(found, [2]int{start, end})
		start = end
	}
	return found
}

// lowercaseTokenAt matches LOWERCASE_TOKEN, (?<![A-Za-z])[a-z]+(?:[-'’][a-z]+)*(?![A-Za-z]), at start.
func lowercaseTokenAt(text []rune, start int) (int, bool) {
	if start >= len(text) || !isLower(text[start]) || (start > 0 && isLetter(text[start-1])) {
		return 0, false
	}
	end := start
	for end < len(text) && isLower(text[end]) {
		end++
	}
	ends := []int{end}
	for end+1 < len(text) && isWordSplitter(text[end]) && isLower(text[end+1]) {
		end += 2
		for end < len(text) && isLower(text[end]) {
			end++
		}
		ends = append(ends, end)
	}
	// A shorter run of letters leaves a letter next, which the look-ahead refuses, so only whole parts are tried, longest first.
	for i := len(ends) - 1; i >= 0; i-- {
		if ends[i] >= len(text) || !isLetter(text[ends[i]]) {
			return ends[i], true
		}
	}
	return 0, false
}

// asciiWords is re.findall(r"[a-z]+", text).
func asciiWords(text []rune) []string {
	var words []string
	for i := 0; i < len(text); {
		if !isLower(text[i]) {
			i++
			continue
		}
		end := i
		for end < len(text) && isLower(text[end]) {
			end++
		}
		words = append(words, string(text[i:end]))
		i = end
	}
	return words
}

// wordStats is manuscript_guide.py WordStats: every word written wholly in lower case somewhere (with each part of a hyphenated or
// apostrophised one longer than a letter), and how often each capitalised word appears where it does not start a sentence.
type wordStats struct {
	lowercase   map[string]bool
	midSentence map[string]int
}

func wordStatsOf(paragraphs []ruleParagraph) wordStats {
	stats := wordStats{lowercase: map[string]bool{}, midSentence: map[string]int{}}
	for _, paragraph := range paragraphs {
		text := paragraph.text
		for _, match := range finditer(text, lowercaseTokenAt) {
			token := text[match[0]:match[1]]
			stats.lowercase[string(token)] = true
			for part := range strings.FieldsFuncSeq(string(token), isWordSplitter) {
				if len([]rune(part)) > 1 {
					stats.lowercase[part] = true
				}
			}
		}
		for _, match := range finditer(text, func(text []rune, start int) (int, bool) { return capitalizedAt(text, start, 0) }) {
			if !isSentenceStart(text, match[0]) {
				stats.midSentence[normalizeName(withoutPossessive(string(text[match[0]:match[1]])))]++
			}
		}
	}
	return stats
}

// withoutPossessive is POSSESSIVE.sub("", word): a final 's or ’s removed, the s in either case (re.IGNORECASE, so also ſ), and where
// the word ends with a line break, the one before it ($ matches there too).
func withoutPossessive(word string) string {
	runes := []rune(word)
	end := len(runes)
	if end > 0 && runes[end-1] == '\n' {
		end--
	}
	if end >= 2 && (runes[end-2] == '\'' || runes[end-2] == '’') && possessiveS().matches(pythonUnicode(), runes[end-1]) {
		return string(append(runes[:end-2:end-2], runes[end:]...))
	}
	return word
}

// possessiveS is the s of POSSESSIVE as re.IGNORECASE compiles it.
var possessiveS = sync.OnceValue(func() literal { return compileLiterals(pythonUnicode(), []rune("s"))[0] })

// leadingFillers is LEADING_FILLER's words as re.IGNORECASE compiles them.
var leadingFillers = sync.OnceValue(func() [][]literal {
	words := slices.Sorted(maps.Keys(leadingFillerWords))
	out := make([][]literal, len(words))
	for i, word := range words {
		out[i] = compileLiterals(pythonUnicode(), []rune(word))
	}
	return out
})

// isLeadingFiller is whether word is one of LEADING_FILLER's words, compared as re.IGNORECASE compares them.
func isLeadingFiller(word []rune) bool {
	tables := pythonUnicode()
	return slices.ContainsFunc(leadingFillers(), func(pattern []literal) bool {
		return len(pattern) == len(word) && matchesAt(tables, pattern, word, 0)
	})
}

// isSentenceStart is manuscript_guide.py is_sentence_start: the word at index opens a sentence or the paragraph.
func isSentenceStart(text []rune, index int) bool {
	prefix := text[max(0, index-sentenceStartLookbehind):index]
	for len(prefix) > 0 && strings.ContainsRune(sentenceStartSkippable, prefix[len(prefix)-1]) {
		prefix = prefix[:len(prefix)-1]
	}
	if len(prefix) == 0 {
		return index <= sentenceStartLookbehind
	}
	return strings.ContainsRune(sentenceEndCharacters, prefix[len(prefix)-1])
}

// isStopword is manuscript_guide.py is_stopword.
func isStopword(word string) bool { return leadingFillerWords[compare.PyLower(word)] }

// cleanEntityText is manuscript_guide.py clean_entity_text: raw (found at start) without leading filler ("About S-Dawn" is S-Dawn),
// a possessive and trailing punctuation, with where it now starts; false when nothing name-like is left.
func cleanEntityText(raw []rune, start int) ([]rune, int, bool) {
	body := raw
	for len(body) > 0 && compare.IsPySpace(body[0]) {
		body = body[1:]
	}
	start += len(raw) - len(body)
	for len(body) > 0 && strings.ContainsRune(trailingPunctuation, body[len(body)-1]) {
		body = body[:len(body)-1]
	}
	body = []rune(withoutPossessive(string(body)))
	name := body
	// LEADING_FILLER, ^(?:(?:about|...|your)\s+)+ under IGNORECASE: an alternative only matches when a space follows it, so the
	// word before the next space is the only one that can.
	for {
		end := 0
		for end < len(name) && !compare.IsPySpace(name[end]) {
			end++
		}
		if end == len(name) || !isLeadingFiller(name[:end]) {
			break
		}
		name = name[spacesFrom(name, end):]
	}
	start += len(body) - len(name)
	if len(name) == 0 || !slices.ContainsFunc(compare.PySplit(string(name)), func(word string) bool { return !isStopword(word) }) {
		return nil, 0, false
	}
	return name, start, true
}

// hasCommonSuffix is manuscript_guide.py has_common_suffix.
func hasCommonSuffix(word string) bool {
	letters := []rune{}
	for _, r := range compare.PyLower(word) {
		if isLower(r) {
			letters = append(letters, r)
		}
	}
	for _, suffix := range commonWordSuffixes {
		if strings.HasSuffix(string(letters), suffix) && len(letters) >= len(suffix)+minSuffixStem {
			return true
		}
	}
	return false
}

// ruleCandidate is one of scanCandidates' (or spacy_candidates') candidates: a name, where it is, the spaCy label that found it
// ("" for the rules, whose make_candidate source is "rule"), and for the rules the scan group it belongs to.
type ruleCandidate struct {
	name       string
	paragraph  int
	start, end int
	label      string
	group      string
}

// The categories classify gives.
const (
	categoryCharacter    = "Character"
	categoryPlace        = "Place"
	categoryOrganization = "Organization"
	categoryNeedsReview  = "Needs Review"
)

// classify is manuscript_guide.py classify: a spaCy label says what a name is; for a rules candidate, a word of the name, or a word just
// before or after it, does. lowered is the paragraph's text through str.lower, which the window is cut from at the candidate's own
// offsets even where lower-casing made the text longer.
func classify(candidate ruleCandidate, lowered []rune) string {
	switch candidate.label {
	case "PERSON":
		return categoryCharacter
	case "GPE", "LOC", "FAC":
		return categoryPlace
	case "ORG":
		return categoryOrganization
	}
	words := asciiWords([]rune(compare.PyLower(candidate.name)))
	has := func(set map[string]bool, words []string) bool {
		return slices.ContainsFunc(words, func(w string) bool { return set[w] })
	}
	switch {
	case has(orgWords, words):
		return categoryOrganization
	case has(placeWords, words):
		return categoryPlace
	case has(titleWords, words):
		return categoryCharacter
	case len(compare.PySplit(candidate.name)) < 2:
		return categoryNeedsReview
	}
	before := asciiWords(pySlice(lowered, candidate.start-classifyWindow, candidate.start))
	after := asciiWords(pySlice(lowered, candidate.end, min(len(lowered), candidate.end+classifyWindow)))
	switch {
	case has(personWords, after):
		return categoryCharacter
	case has(placeWords, before):
		return categoryPlace
	case has(personWords, before):
		return categoryCharacter
	}
	return categoryNeedsReview
}

// pySlice is text[from:to] as Python slices: a start below zero is zero, an end past the text is its end, and an empty slice when
// they cross. Only the clamping the rules reach is done: from is never negative-from-the-end here.
func pySlice(text []rune, from, to int) []rune {
	from, to = max(0, from), min(len(text), to)
	if from >= to {
		return nil
	}
	return text[from:to]
}

// sentenceAround is extraction_rules.py sentence_around: the sentence of text holding text[start:end], trimmed, or a window of at
// most maxQuote characters around it when the sentence is longer. Always a slice of text.
func sentenceAround(text []rune, start, end int) string {
	left := 0
	for i := start - 1; i >= 0; i-- {
		if strings.ContainsRune(sentenceEndCharacters, text[i]) {
			left = i + 1
			break
		}
	}
	right := len(text)
	for i := end; i < len(text); i++ {
		if strings.ContainsRune(sentenceEndCharacters, text[i]) {
			right = i + 1
			break
		}
	}
	if right-left > maxQuote {
		room := max(0, maxQuote-(end-start)) / 2
		left = max(left, start-room)
		right = min(right, left+maxQuote)
	}
	sentence := pySlice(text, left, right)
	for len(sentence) > 0 && compare.IsPySpace(sentence[0]) {
		sentence = sentence[1:]
	}
	for len(sentence) > 0 && compare.IsPySpace(sentence[len(sentence)-1]) {
		sentence = sentence[:len(sentence)-1]
	}
	for len(sentence) > 0 && strings.ContainsRune(quoteLeadingJunk, sentence[0]) {
		sentence = sentence[1:]
	}
	return string(sentence)
}

// quoteAt matches QUOTE_PATTERN, [“"]([^”"]{1,400}?)[”"], at start: the inner text cannot hold a closing mark, so the first one
// after the opening mark ends it, and a quote longer than 400 characters does not match.
func quoteAt(text []rune, start int) (int, bool) {
	if start >= len(text) || (text[start] != '“' && text[start] != '"') {
		return 0, false
	}
	for i := start + 1; i < len(text) && i-start-1 <= maxQuoteSpan; i++ {
		if text[i] == '”' || text[i] == '"' {
			if i == start+1 {
				return 0, false
			}
			return i + 1, true
		}
	}
	return 0, false
}

// speechTag is a match of AFTER_QUOTE_TAG or BEFORE_QUOTE_TAG: the name (group 1), the verb (group 2), and the match's extent.
type speechTag struct {
	name, verb string
	start, end int
}

// tagNameEnds are where NAME_TOKEN, [A-Z][A-Za-z'’\-]*(?:\s+[A-Z][A-Za-z'’\-]*){0,2}, can end when it starts at start: after one,
// two or three words. A word cannot end early (the next part needs a space after it), so each is whole.
func tagNameEnds(text []rune, start int) []int {
	ends := []int{nameCharsFrom(text, start+1)}
	for len(ends) < 3 {
		last := ends[len(ends)-1]
		word := spacesFrom(text, last)
		if word == last || word >= len(text) || !isUpper(text[word]) {
			break
		}
		ends = append(ends, nameCharsFrom(text, word+1))
	}
	return ends
}

// tagAfter is AFTER_QUOTE_TAG.match(window), ^[,.\s]*(NAME_TOKEN)\s+([A-Za-z]+): a name and a word right after a quote.
func tagAfter(window []rune) (speechTag, bool) {
	start := 0
	for start < len(window) && (window[start] == ',' || window[start] == '.' || compare.IsPySpace(window[start])) {
		start++
	}
	if start >= len(window) || !isUpper(window[start]) {
		return speechTag{}, false
	}
	ends := tagNameEnds(window, start)
	for i := len(ends) - 1; i >= 0; i-- {
		verb := spacesFrom(window, ends[i])
		if verb == ends[i] {
			continue
		}
		if end := lettersFrom(window, verb); end > verb {
			return speechTag{name: string(window[start:ends[i]]), verb: string(window[verb:end]), start: 0, end: end}, true
		}
	}
	return speechTag{}, false
}

// tagBefore is BEFORE_QUOTE_TAG.search(window), (NAME_TOKEN)\s+([A-Za-z]+)[,:]?\s*$: a name and a word that end the text before a
// quote, found from the leftmost place it can start.
func tagBefore(window []rune) (speechTag, bool) {
	for start := range window {
		if !isUpper(window[start]) {
			continue
		}
		ends := tagNameEnds(window, start)
		for i := len(ends) - 1; i >= 0; i-- {
			verb := spacesFrom(window, ends[i])
			if verb == ends[i] {
				continue
			}
			end := lettersFrom(window, verb)
			if end == verb {
				continue
			}
			rest := end
			if rest < len(window) && (window[rest] == ',' || window[rest] == ':') {
				rest++
			}
			if spacesFrom(window, rest) == len(window) {
				return speechTag{name: string(window[start:ends[i]]), verb: string(window[verb:end]), start: start, end: len(window)}, true
			}
		}
	}
	return speechTag{}, false
}
