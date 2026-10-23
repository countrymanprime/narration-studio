package manuscript

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/countrymanprime/narration-studio/shell/internal/importer"
)

// previewCandidate is a character suggestion as the review shows it: the importer's own fields and how often the character's name
// (the full name or the first) turns up in the story, so the narrator can tell a main character from a name that is mentioned once.
type previewCandidate struct {
	importer.CharacterCandidate
	Appearances int `json:"appearances"`
}

// leadingWords are the articles and forms of address that come before a name and are not the name: "The White Rabbit" is found by
// "White", "Mr. Holmes" by "Holmes".
var leadingWords = map[string]bool{
	"the": true, "a": true, "an": true, "mr": true, "mrs": true, "ms": true, "mx": true, "dr": true, "miss": true, "sir": true,
	"lady": true, "lord": true, "king": true, "queen": true, "prince": true, "princess": true, "professor": true, "captain": true,
	"uncle": true, "aunt": true,
}

// firstName is the word a suggestion is counted by: the first word of its name that is not an article or a form of address, or the
// first word at all when the name is nothing else.
func firstName(name string) string {
	words := strings.Fields(name)
	for index, word := range words {
		word = strings.Trim(word, ".,;:!?\"'\u201c\u201d\u2018\u2019")
		if leadingWords[strings.ToLower(word)] && index < len(words)-1 {
			continue
		}
		return word
	}
	return ""
}

func isWordRune(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' }

// foldText lower-cases s and collapses every run of white space to one space, so a name matches in any case and across a line break.
func foldText(s string) string { return strings.ToLower(strings.Join(strings.Fields(s), " ")) }

// indexWord is the first place at or after from where word stands alone in text: not inside a longer word ("Malice" is not "Alice"), with
// any punctuation, a possessive's apostrophe or a quote around it. Letters of any script count as word letters, which a regexp's  does
// not do. -1 when there is none.
func indexWord(text, word string, from int) int {
	if word == "" {
		return -1
	}
	for from <= len(text) {
		at := strings.Index(text[from:], word)
		if at < 0 {
			return -1
		}
		start, end := from+at, from+at+len(word)
		before, _ := utf8.DecodeLastRuneInString(text[:start])
		after, _ := utf8.DecodeRuneInString(text[end:])
		if (start == 0 || !isWordRune(before)) && (end == len(text) || !isWordRune(after)) {
			return start
		}
		from = start + 1
	}
	return -1
}

// countAppearances is how many mentions of a character the text holds: the full name or the first name, in any case. A mention that both
// would match ("Mr. Holmes") counts once, as the full name, and the scan moves past it.
func countAppearances(text, name string) int {
	text, full, first := foldText(text), foldText(name), foldText(firstName(name))
	count := 0
	for from := 0; from < len(text); {
		fullAt, firstAt := indexWord(text, full, from), indexWord(text, first, from)
		at, length := fullAt, len(full)
		if fullAt < 0 || (firstAt >= 0 && firstAt < fullAt) {
			at, length = firstAt, len(first)
		}
		if at < 0 {
			break
		}
		count++
		from = at + length
	}
	return count
}

// candidatesWithAppearances adds each suggestion's appearance count over all the draft's text. It is an empty list, never nil, for a
// draft with no cast, so the preview still sends "characterCandidates": [].
func candidatesWithAppearances(draft importer.Draft) []previewCandidate {
	story := make([]string, len(draft.Paragraphs))
	for index, paragraph := range draft.Paragraphs {
		story[index] = paragraph.Text
	}
	text := strings.Join(story, "\n")
	out := make([]previewCandidate, 0, len(draft.CharacterCandidates))
	for _, candidate := range draft.CharacterCandidates {
		out = append(out, previewCandidate{CharacterCandidate: candidate, Appearances: countAppearances(text, candidate.Name)})
	}
	return out
}
