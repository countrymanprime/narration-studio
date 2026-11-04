package masteringport

import (
	"strings"
	"testing"

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
	contractfile.Check(t, "chain-names", map[string]any{"cases": rows})
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
		"EQ\u3164": "EQ", "\u2800EQ": "EQ", "\u3164 EQ \u2800": "EQ", "E\u3164Q": "E\u3164Q"} {
		if got := chainFX([]dawport.FXSlot{{Name: raw}})[0].Name; got != want {
			t.Errorf("plug-in %q = %q, want it kept", raw, got)
		}
	}
}
