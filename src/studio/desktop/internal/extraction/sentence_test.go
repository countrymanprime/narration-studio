package extraction

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestCleanSentence(t *testing.T) {
	zwnj, zwj, rlo := "\u200c", "\u200d", "\u202e"
	family := "👨" + zwj + "👩" + zwj + "👧"
	for name, c := range map[string]struct {
		in   string
		max  int
		want string
	}{
		"control characters and white space become one space": {"Bo\x00 says\n\tit.\r\n", 300, "Bo says it."},
		"a right-to-left override is removed":                 {"Bo " + rlo + "gnp.exe", 300, "Bo gnp.exe"},
		"a joiner that spells a word is kept":                 {"Bo می" + zwnj + "خواهم", 300, "Bo می" + zwnj + "خواهم"},
		"a joined emoji stays one emoji":                      {"Bo is " + family + " here", 300, "Bo is " + family + " here"},
		"invalid bytes are dropped":                           {"Bo\xff speaks", 300, "Bo speaks"},
		"only invisible characters is nothing":                {" \u200b" + zwj + "\u2060 ", 300, ""},
		"only punctuation is nothing":                         {"... !", 300, ""},
		"long text is cut with an ellipsis":                   {strings.Repeat("x", 10), 5, "xxxx…"},
		"a cut never leaves a letter without its mark":        {"xxxé́x", 5, "xxx…"},
		"a cut never splits a joined emoji":                   {"xx" + family, 4, "xx…"},
		"a cut that leaves nothing readable is nothing":       {"e" + strings.Repeat("\u0301", 40) + " Ada said so", 10, ""},
		"text at the limit is whole":                          {"xxxxx", 5, "xxxxx"},
	} {
		t.Run(name, func(t *testing.T) {
			got := CleanSentence(c.in, c.max)
			if got != c.want || !utf8.ValidString(got) || utf8.RuneCountInString(got) > c.max {
				t.Fatalf("got %q, want %q", got, c.want)
			}
		})
	}
}
