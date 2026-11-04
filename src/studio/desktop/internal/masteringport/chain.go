package masteringport

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"

	"desktop/internal/dawport"
)

// The refusals of a master whose approval does not bind the chain it would run (threat model row 5o, #2932's review).
var (
	// ErrNoChainDigest: the approval does not say which chain the narrator was shown, so it binds nothing; refused, never assumed.
	ErrNoChainDigest = errors.New("this approval does not say which FX chain you were shown: approve the render again")
	// ErrChainChanged: the chain the render would run is not the one the narrator approved.
	ErrChainChanged = errors.New("the FX chain in your DAW changed after you approved it: approve the render again")
	// ErrChainNoAnswer: REAPER did not answer the chain read a render makes first, within renderChainWait or the bridge's own wait.
	ErrChainNoAnswer = errors.New("REAPER didn't answer when the app read the FX chain again before rendering this file")
)

// chainNoAnswer is ErrChainNoAnswer over the read's own deadline or the bridge's ErrNoAnswer, so errors.Is finds either.
type chainNoAnswer struct{ cause error }

func (e chainNoAnswer) Error() string        { return ErrChainNoAnswer.Error() }
func (e chainNoAnswer) Is(target error) bool { return target == ErrChainNoAnswer }
func (e chainNoAnswer) Unwrap() error        { return e.cause }

// maxChainName is the longest track or plug-in name kept, in runes, as bridge.DeviceName bounds REAPER's device names.
const maxChainName = 120

// chainName is a track or plug-in name from the narrator's project made safe to show, as bridge.DeviceName makes REAPER's device
// names: a control character (a newline, a tab) becomes a space and spaces collapse, a format character (a bidirectional override,
// a zero-width space or joiner, a byte-order mark) is dropped, so a name can neither reverse what it says nor look like another,
// and the length is bounded with an ellipsis (qa on #2932, B2). The digest is taken over the cleaned names.
//
// Default-ignorable characters (ignorable) are dropped anywhere, except the Hangul fillers (hangulFiller), so two names of the same
// characters digest alike (round 5, B1): most draw nothing, and a variation selector only picks another glyph for the same
// character ("❤︎" and "❤️" are one name). The name is then NFC, so a precomposed and a decomposed accent are one name too (round 6,
// qa B3); it runs after the drop, since a dropped grapheme joiner would otherwise have blocked the composition. Blank-looking
// symbols (the Hangul fillers among them), which draw a gap inside a name, private-use characters and spaces are trimmed at
// either end (edgeBlank), so a name cannot differ from another only by them (round 3, M3; round 4, N7), also where the cut lands
// before its "…" (round 4, N6). A name with nothing readable is "" before any cut, so a long blank name is not saved by the cut's
// "…" (round 3). Callers name "" ("Track", "(unnamed)"). Letters that look alike from different scripts (Latin A, Greek Alpha)
// stay different names: no cleaning can tell them apart from what the narrator meant.
func chainName(raw string) string {
	clean := strings.Join(strings.Fields(strings.Map(func(r rune) rune {
		switch {
		// A default-ignorable character goes from inside a name too (round 5, B1); a Hangul filler draws a blank there and stays.
		case unicode.Is(unicode.Cf, r) || (ignorable(r) && !hangulFiller[r]):
			return -1
		case unicode.IsControl(r) || r == utf8.RuneError:
			return ' '
		}
		return r
	}, raw)), " ")
	clean = strings.TrimFunc(norm.NFC.String(clean), edgeBlank)
	if !readable(clean) {
		return ""
	}
	if runes := []rune(clean); len(runes) > maxChainName {
		return strings.TrimRightFunc(string(runes[:maxChainName-1]), edgeBlank) + "…"
	}
	return clean
}

// listedChain is the DAW port's chain as a row lists it: each track with FX in order, then the master, the names cleaned and an
// unnamed track called "Track".
func listedChain(chain dawport.MasterChain) []ChainTrack {
	out := make([]ChainTrack, 0, len(chain.Tracks)+1)
	for _, track := range chain.Tracks {
		out = append(out, ChainTrack{Name: trackName(track.Name), FX: chainFX(track.FX)})
	}
	if len(chain.Master) > 0 {
		out = append(out, ChainTrack{Name: "Master", Master: true, FX: chainFX(chain.Master)})
	}
	return out
}

// hangulFiller are the Hangul fillers. Unicode calls them default-ignorable, but real fonts draw them as a blank: "E"+U+3164+"Q"
// shows as "E Q" in REAPER, so inside a name it is kept and does not digest like "EQ" (round 6 Go review).
var hangulFiller = map[rune]bool{0x115F: true, 0x1160: true, 0x3164: true, 0xFFA0: true}

// blankLooking are the characters that draw a blank, or only a placeholder box, trimmed at a name's ends but kept inside it: the
// Hangul fillers, the braille blank, the object replacement character, the musical null notehead (round 3, M2), the Tifinagh
// consonant joiner and the Khitan small script filler (round 4, N7).
var blankLooking = map[rune]bool{0x115F: true, 0x1160: true, 0x3164: true, 0xFFA0: true, 0x2800: true, 0xFFFC: true, 0x1D159: true,
	0x2D7F: true, 0x16FE4: true}

// ignorable reports Unicode's Default_Ignorable_Code_Point, which the unicode package has the parts of but not the property itself,
// derived as DerivedCoreProperties.txt derives it: Other_Default_Ignorable_Code_Point + Cf + Variation_Selector - White_Space -
// FFF9..FFFB (interlinear annotation) - 13430..1343F (Egyptian hieroglyph format controls) - Prepended_Concatenation_Mark. A
// renderer draws none of these when it has no glyph for them (round 4, N7). chain-names.json lists the ranges for the mock.
func ignorable(r rune) bool {
	if unicode.Is(unicode.White_Space, r) || (r >= 0xFFF9 && r <= 0xFFFB) || (r >= 0x13430 && r <= 0x1343F) ||
		unicode.Is(unicode.Prepended_Concatenation_Mark, r) {
		return false
	}
	return unicode.Is(unicode.Other_Default_Ignorable_Code_Point, r) || unicode.Is(unicode.Cf, r) || unicode.Is(unicode.Variation_Selector, r)
}

// edgeBlank reports a character trimmed from a name's ends: a space, a default-ignorable or blank-looking character, or a
// private-use one, which has no agreed glyph. A combining mark at the end is kept: it draws on the letter before it.
func edgeBlank(r rune) bool {
	return unicode.IsSpace(r) || ignorable(r) || blankLooking[r] || unicode.Is(unicode.Co, r)
}

// readable reports whether a cleaned name has something a narrator can read: a letter, number, punctuation mark or symbol that is
// neither default-ignorable nor blank-looking. A lone combining mark, a variation selector or a private-use character is not (qa
// round 2 on #2932, N2).
func readable(name string) bool {
	for _, r := range name {
		if (unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.IsPunct(r) || unicode.IsSymbol(r)) && !blankLooking[r] && !ignorable(r) {
			return true
		}
	}
	return false
}

// trackName is a track's name as the narrator's report and the approval both say it: an unnamed track is "Track".
func trackName(name string) string {
	if clean := chainName(name); clean != "" {
		return clean
	}
	return "Track"
}

// unnamedFX is a plug-in whose name has nothing readable left, so its row is never a blank (qa on #2932, B3).
const unnamedFX = "(unnamed)"

func chainFX(slots []dawport.FXSlot) []ChainFX {
	out := make([]ChainFX, 0, len(slots))
	for _, slot := range slots {
		name := chainName(slot.Name)
		if name == "" {
			name = unnamedFX
		}
		out = append(out, ChainFX{Name: name, Enabled: slot.Enabled})
	}
	return out
}

// ChainDigest is the canonical hash of a listed chain, "sha256:" and 64 hex digits: one line per track ("track", its master flag,
// its name) followed by one per plug-in ("fx", on or off, its name), tab-separated and newline-ended, in chain order. Names are
// cleaned first (chainName), so neither a tab nor a newline can appear inside one. ExportPlan answers it beside the chain, the
// approval sends it back, and each render refuses a chain whose digest differs. The UI's mock computes the same lines
// (src/studio/ui/src/api/masteringMock.ts), pinned by the export plan golden.
func ChainDigest(chain []ChainTrack) string {
	var lines strings.Builder
	flag := func(on bool) string {
		if on {
			return "1"
		}
		return "0"
	}
	for _, track := range chain {
		lines.WriteString("track\t" + flag(track.Master) + "\t" + track.Name + "\n")
		for _, fx := range track.FX {
			lines.WriteString("fx\t" + flag(fx.Enabled) + "\t" + fx.Name + "\n")
		}
	}
	sum := sha256.Sum256([]byte(lines.String()))
	return "sha256:" + hex.EncodeToString(sum[:])
}
