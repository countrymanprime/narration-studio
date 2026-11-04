package masteringport

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"

	"desktop/internal/dawport"
)

// The refusals of a master whose approval does not bind the chain it would run (threat model row 5o, #2932's review).
var (
	// ErrNoChainDigest: the approval does not say which chain the narrator was shown, so it binds nothing; refused, never assumed.
	ErrNoChainDigest = errors.New("this approval does not say which FX chain you were shown: approve the render again")
	// ErrChainChanged: the chain the render would run is not the one the narrator approved.
	ErrChainChanged = errors.New("the FX chain in your DAW changed after you approved it: approve the render again")
)

// maxChainName is the longest track or plug-in name kept, in runes, as bridge.DeviceName bounds REAPER's device names.
const maxChainName = 120

// chainName is a track or plug-in name from the narrator's project made safe to show, as bridge.DeviceName makes REAPER's device
// names: a control character (a newline, a tab) becomes a space and spaces collapse, a format character (a bidirectional override,
// a zero-width space or joiner, a byte-order mark) is dropped, so a name can neither reverse what it says nor look like another,
// and the length is bounded with an ellipsis (qa on #2932, B2). The digest is taken over the cleaned names.
func chainName(raw string) string {
	clean := strings.Join(strings.Fields(strings.Map(func(r rune) rune {
		switch {
		case unicode.Is(unicode.Cf, r):
			return -1
		case unicode.IsControl(r) || r == utf8.RuneError:
			return ' '
		}
		return r
	}, raw)), " ")
	if runes := []rune(clean); len(runes) > maxChainName {
		return strings.TrimSpace(string(runes[:maxChainName-1])) + "…"
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

// blankLooking are letters and symbols that draw nothing: the Hangul fillers and the braille blank.
var blankLooking = map[rune]bool{0x115F: true, 0x1160: true, 0x3164: true, 0xFFA0: true, 0x2800: true}

// readable reports whether a cleaned name has something a narrator can read: a letter, number, punctuation mark or symbol that is
// not blank-looking. A lone combining mark, a variation selector or a private-use character is not (qa round 2 on #2932, N2).
func readable(name string) bool {
	for _, r := range name {
		if (unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.IsPunct(r) || unicode.IsSymbol(r)) && !blankLooking[r] {
			return true
		}
	}
	return false
}

// trackName is a track's name as the narrator's report and the approval both say it: an unnamed track is "Track".
func trackName(name string) string {
	if clean := chainName(name); readable(clean) {
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
		if !readable(name) {
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
