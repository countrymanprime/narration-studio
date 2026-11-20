package extraction

import (
	"strings"
	"unicode"
)

// CleanSentence is a sentence from outside the app (a model's reason) as one line of valid text the narrator can be shown:
// control characters and runs of white space become one space, format characters (a right-to-left override among them) are
// removed except the two joiners that spell words and emoji (U+200C, U+200D), and text longer than maxRunes is cut to maxRunes
// with an ellipsis at the end, never between a letter and its combining marks. Text with no letter or digit left is "".
func CleanSentence(s string, maxRunes int) string {
	s = strings.ToValidUTF8(s, "")
	s = strings.Map(func(r rune) rune {
		switch {
		case unicode.IsControl(r):
			return ' '
		case r == '\u200c' || r == '\u200d':
			return r
		case unicode.Is(unicode.Cf, r):
			return -1
		}
		return r
	}, s)
	s = strings.Join(strings.Fields(s), " ")
	if !strings.ContainsFunc(s, func(r rune) bool { return unicode.IsLetter(r) || unicode.IsDigit(r) }) {
		return ""
	}
	runes := []rune(s)
	if maxRunes < 1 || len(runes) <= maxRunes {
		return s
	}
	cut := maxRunes - 1
	for cut > 0 && (unicode.In(runes[cut], unicode.Mn, unicode.Me, unicode.Mc) || runes[cut] == '\u200d' || runes[cut-1] == '\u200d') {
		cut--
	}
	return strings.TrimRight(string(runes[:cut]), " \u200c\u200d") + "…"
}
