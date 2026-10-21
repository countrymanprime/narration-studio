package manuscript

import (
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/countrymanprime/narration-utils/shell/internal/importer"
)

// previewCandidate is a character suggestion as the review shows it: the importer's own fields and how often the character's first
// name turns up in the story, so the narrator can tell a main character from a name that is mentioned once.
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

// countWord is how many times word stands alone in text: not inside a longer word ("Malice" is not "Alice"), with any punctuation, a
// possessive's apostrophe or a quote around it. Letters of any script count as word letters, which a regexp's \b does not do.
func countWord(text, word string) int {
	if word == "" {
		return 0
	}
	count := 0
	for from := 0; from < len(text); {
		at := strings.Index(text[from:], word)
		if at < 0 {
			break
		}
		start, end := from+at, from+at+len(word)
		before, _ := utf8.DecodeLastRuneInString(text[:start])
		after, _ := utf8.DecodeRuneInString(text[end:])
		if (start == 0 || !isWordRune(before)) && (end == len(text) || !isWordRune(after)) {
			count++
		}
		from = end
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
		out = append(out, previewCandidate{CharacterCandidate: candidate, Appearances: countWord(text, firstName(candidate.Name))})
	}
	return out
}
