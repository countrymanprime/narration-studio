package masteringport

import (
	"strings"
	"testing"
	"unicode"

	"desktop/internal/contractfile"
	"desktop/internal/dawport"
)

// chainNameCases are the names the host cleans and the UI's mock must clean the same way (masteringMock.ts's mockChainName, checked
// against chain-names.json by wireContracts.test.ts): hidden characters, controls, the length bound and blank-looking names.
var chainNameCases = []string{
	"VST: ReaEQ (Cockos)",
	"Voice\u202e lav\n2\x00",
	"VST:\tReaEQ\u200f",
	"Re\u200bEQ",
	"\u2066Limit\u2069",
	"  spaced   out  ",
	"",
	" \u200b\ufeff ",
	"\u3164",
	"\u2800",
	"\u115f\u1160",
	"\u0301",
	"\ufe0f",
	"\ue000",
	"\u3164 \u2800 \u0301",
	"e\u0301t\u00e9",
	"\U0001F50A Loud",
	"\u0645\u0631\u062d\u0628\u0627",
	strings.Repeat("x", 119),
	strings.Repeat("x", 120),
	strings.Repeat("x", 121),
	strings.Repeat("\u00e9", 130),
	"\ufffc",
	"\U0001D159",
	"EQ\u3164",
	"\u2800EQ",
	"\u3164 EQ \u2800",
	strings.Repeat("\u3164", 130),
	strings.Repeat("\u2800", 120) + "x",
	// Round 4, N6: the cut lands on a blank-looking character, which goes before the "…".
	strings.Repeat("a", 118) + "\u3164XYZ",
	strings.Repeat("a", 118) + "\u2800XYZ",
	strings.Repeat("a", 117) + " \u034fXYZ",
	// Round 4, N7: default-ignorable and blank characters next to a name, which go, and a combining mark, which stays.
	"EQ\u17b4", "\u17b4EQ", "EQ\u034f", "EQ\ufe0f", "\ufe0fEQ", "EQ\ue000", "\ue000EQ", "EQ\u180b", "EQ\u2d7f", "EQ\U00016FE4",
	"EQ\U000E0100", "EQ\u115f", "EQ\u0301", "\u2764\ufe0f Warm",
	// Round 5, B1: a default-ignorable character inside a name draws nothing either, so it goes there too; a blank-looking symbol
	// inside one draws a gap and stays.
	"E\u034fQ", "EQ\u034f\u0301", "E\ufe0fQ", "E\u17b4Q", "E\u180bQ", "E\u3164Q", "E\u2800Q",
}

// TestChainNameGoldenIsCurrent pins how a track's and a plug-in's name are cleaned, for the mock to match. UPDATE_CONTRACTS=1 rewrites
// tests/fixtures/contracts/chain-names.json.
func TestChainNameGoldenIsCurrent(t *testing.T) {
	type row struct {
		Raw   string `json:"raw"`
		Track string `json:"track"`
		FX    string `json:"fx"`
	}
	rows := make([]row, 0, len(chainNameCases))
	for _, raw := range chainNameCases {
		rows = append(rows, row{Raw: raw, Track: trackName(raw), FX: chainFX([]dawport.FXSlot{{Name: raw}})[0].Name})
	}
	contractfile.Check(t, "chain-names", map[string]any{"cases": rows, "ignorable": ignorableRanges()})
}

// ignorableRanges is ignorable as inclusive [first, last] code point ranges, for the mock to check its own
// \p{Default_Ignorable_Code_Point} against.
func ignorableRanges() [][2]rune {
	var out [][2]rune
	for r := rune(0); r <= unicode.MaxRune; r++ {
		if !ignorable(r) {
			continue
		}
		if n := len(out); n > 0 && out[n-1][1] == r-1 {
			out[n-1][1] = r
		} else {
			out = append(out, [2]rune{r, r})
		}
	}
	return out
}

// Every default-ignorable code point is trimmed from either end of a name, the whole class rather than a list (round 4, N7), and
// the derivation is the property's size in the unicode package's version (4174 since Unicode 15.1).
func TestEveryDefaultIgnorableIsTrimmedAtEitherEnd(t *testing.T) {
	count := 0
	for _, span := range ignorableRanges() {
		for r := span[0]; r <= span[1]; r++ {
			count++
			for _, raw := range []string{"EQ" + string(r), string(r) + "EQ", string(r) + " EQ " + string(r)} {
				if got := chainName(raw); got != "EQ" {
					t.Errorf("U+%04X: %q = %q, want EQ", r, raw, got)
				}
			}
		}
	}
	if count != 4174 {
		t.Errorf("%d default-ignorable code points, want 4174", count)
	}
	// What blankLooking adds, and private use, go too; a combining mark draws on the letter before it and stays.
	for r := range blankLooking {
		if got := chainName("EQ" + string(r)); got != "EQ" {
			t.Errorf("U+%04X: %q", r, got)
		}
	}
	if got := chainName("EQ\ue000"); got != "EQ" {
		t.Errorf("private use: %q", got)
	}
	if got := chainName("EQ\u0301"); got != "EQ\u0301" {
		t.Errorf("combining mark: %q", got)
	}
}

// A default-ignorable character draws nothing wherever it is, so no cleaned name keeps one: "E"+U+034F+"Q" is "EQ", and one
// between a name and its combining mark goes too, so the two names that draw alike digest alike (round 5, B1). The Hangul filler
// U+3164 is default-ignorable and goes with them (behaviour change from round 3, which kept an interior one).
func TestNoDefaultIgnorableSurvivesInsideAName(t *testing.T) {
	for _, span := range ignorableRanges() {
		for r := span[0]; r <= span[1]; r++ {
			for raw, want := range map[string]string{"E" + string(r) + "Q": "EQ", "EQ" + string(r) + "\u0301": "EQ\u0301"} {
				got := chainName(raw)
				if got != want {
					t.Errorf("U+%04X: %q = %q, want %q", r, raw, got, want)
				}
				for _, c := range got {
					if ignorable(c) {
						t.Errorf("U+%04X: %q kept U+%04X", r, raw, c)
					}
				}
			}
		}
	}
}

// The 120-rune cut never ends on a character that draws nothing before its "…" (round 4, N6). Ported for round 5 (B1): a
// default-ignorable character (U+3164, U+034F, U+FE0F) is gone before the cut, so the cases are the blanks that reach it.
func TestTheCutTrimsBlankCharactersBeforeTheEllipsis(t *testing.T) {
	for _, blank := range []string{"\u2800", "\ufffc", " \u2800", "\U0001D159"} {
		raw := strings.Repeat("a", 119-len([]rune(blank))) + blank + "XYZ"
		if got, want := chainName(raw), strings.Repeat("a", 119-len([]rune(blank)))+"…"; got != want {
			t.Errorf("%q = %q, want %q", raw, got, want)
		}
	}
}

// A name of only blank-looking characters (a Hangul filler, a braille blank, a lone combining mark, a variation selector, a
// private-use character) has nothing a narrator can read: a plug-in is "(unnamed)" and a track "Track" (qa round 2 on #2932, N2).
func TestABlankLookingNameIsUnnamed(t *testing.T) {
	// Round 3 (M2, and readable before the 120-rune cut): the object replacement character, the musical null notehead, and a name of
	// 130 blank-looking characters, which a cut would otherwise end with a readable "…".
	for _, raw := range []string{"\u3164", "\u2800", "\u115f\u1160", "\u0301", "\ufe0f", "\ue000", "\u3164 \u2800 \u0301", "\uffa0",
		"\ufffc", "\U0001D159", strings.Repeat("\u3164", 130)} {
		if got := chainFX([]dawport.FXSlot{{Name: raw}})[0].Name; got != unnamedFX {
			t.Errorf("plug-in %q = %q, want %q", raw, got, unnamedFX)
		}
		if got := trackName(raw); got != "Track" {
			t.Errorf("track %q = %q, want Track", raw, got)
		}
	}
	// Blank-looking characters at either end are trimmed, so "EQ" and "EQ" with a filler look and digest alike (round 3, M3).
	for raw, want := range map[string]string{"e\u0301t\u00e9": "e\u0301t\u00e9", "\U0001F50A Loud": "\U0001F50A Loud", "\u2800x": "x",
		"EQ\u3164": "EQ", "\u2800EQ": "EQ", "\u3164 EQ \u2800": "EQ", "E\u2800Q": "E\u2800Q"} {
		if got := chainFX([]dawport.FXSlot{{Name: raw}})[0].Name; got != want {
			t.Errorf("plug-in %q = %q, want it kept", raw, got)
		}
	}
}
