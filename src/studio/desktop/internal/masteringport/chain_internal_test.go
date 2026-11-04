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
	for _, raw := range []string{"\u3164", "\u2800", "\u115f\u1160", "\u0301", "\ufe0f", "\ue000", "\u3164 \u2800 \u0301", "\uffa0"} {
		if got := chainFX([]dawport.FXSlot{{Name: raw}})[0].Name; got != unnamedFX {
			t.Errorf("plug-in %q = %q, want %q", raw, got, unnamedFX)
		}
		if got := trackName(raw); got != "Track" {
			t.Errorf("track %q = %q, want Track", raw, got)
		}
	}
	for raw, want := range map[string]string{"e\u0301t\u00e9": "e\u0301t\u00e9", "\U0001F50A Loud": "\U0001F50A Loud", "\u2800x": "\u2800x"} {
		if got := chainFX([]dawport.FXSlot{{Name: raw}})[0].Name; got != want {
			t.Errorf("plug-in %q = %q, want it kept", raw, got)
		}
	}
}
