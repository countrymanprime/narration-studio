package bridge

import (
	"context"
	"errors"
	"regexp"
	"strconv"
)

// The mastering port's DAW row reads the chain a render with FX would run before the
// narrator approves it: master_chain_read (src/studio/integrations/reaper/narration_master_render.lua). The render itself, render_with_fx,
// answers later through the client's fan-out (FX_RENDER_FILE, FX_RENDERED), so it is not one of Actions' requests.

// MasterTrackGUID is how master_chain_read names the master track in MASTER_CHAIN_FX.
const MasterTrackGUID = "master"

var (
	// ErrChainTooLong means REAPER listed only part of the project's FX or tracks, so the chain cannot be shown whole before a render is
	// approved.
	ErrChainTooLong = errors.New("this project has more FX than this app can list, so it cannot show you the whole chain before a render")
	// ErrChainFingerprint is a mix or parameter fingerprint that is not "<count>:<a>:<b>" in digits, or a mute or solo outside
	// REAPER's values, which the digest cannot bind.
	ErrChainFingerprint = errors.New("REAPER answered FX chain settings this app cannot read")
	// ErrChainTooManySettings means the script's settings budget ran out (MASTER_CHAIN_READ truncated 2): more plug-in parameters and
	// sends than one read takes, so the chain is refused rather than approved with some of them unbound (#2995).
	ErrChainTooManySettings = errors.New("this project has too many plug-in settings for this app to check before a render")
	// ErrChainIncomplete means the lines received do not match the counts MASTER_CHAIN_READ closed with (a line dropped as invalid, or
	// lost), so the chain the narrator would see is not the whole one.
	ErrChainIncomplete = errors.New("REAPER's answer about the FX chain was incomplete")
)

// fingerprintPattern is how master_chain_read writes a fingerprint: a count and two hashes, in digits.
var fingerprintPattern = regexp.MustCompile(`^[0-9]+:[0-9]+:[0-9]+$`)

// MasterChain is the FX a render with FX runs, in chain order: every track, with FX or not, then the master track's, with the
// master's own mix (#2995). SettingsUnread is true when the script in REAPER is older than #2995 and answered names and on/off
// only: the mixes and parameters are empty, and a consumer that binds them refuses the chain.
type MasterChain struct {
	Tracks         []TrackFX
	Master         []FXSlot
	MasterMix      TrackMix
	SettingsUnread bool
}

// TrackFX is one track's FX chain and its mix.
type TrackFX struct {
	TrackGUID string
	Name      string
	Mix       TrackMix
	FX        []FXSlot
}

// TrackMix is what a track does to the render besides its FX: muted, its solo state (I_SOLO, 0 when not soloed), and Mix, the
// fingerprint of its volume, pan, phase, parent send, folder depth, sends and receives (#2995).
type TrackMix struct {
	Mute bool
	Solo int
	Mix  string
}

// FXSlot is one plug-in in a chain, as REAPER names it, whether it is switched on, and Params, the fingerprint of its parameter
// values (#2995).
type FXSlot struct {
	Name    string
	Enabled bool
	Params  string
}

// ReadMasterChain lists every track, its mix and its FX, then the master track's. It changes nothing. A list REAPER cut short is
// ErrChainTooLong, and a fingerprint that is not digits is ErrChainFingerprint. A script older than #2995 answers no track lines
// and no parameters: its chain still reads (the Effects tab shows names), marked SettingsUnread.
func (a *Actions) ReadMasterChain(ctx context.Context) (MasterChain, error) {
	events, err := a.request(ctx, "master_chain_read", []string{"MASTER_CHAIN_READ"})
	if err != nil {
		return MasterChain{}, err
	}
	chain := MasterChain{Tracks: []TrackFX{}, Master: []FXSlot{}}
	masterListed := false
	trackLines, fxLines := 0, 0
	// The script lists each track once with its FX right after it, and the master last; seen holds the tracks listed so far, so
	// an answer out of that shape is refused even when its totals match (#3017 qa round 2, B2 and B3).
	seen := map[string]bool{}
	current := ""
	for _, event := range events {
		switch event.Tag {
		case "MASTER_CHAIN_TRACK":
			mix, err := trackMix(event.Fields[4:7])
			if err != nil {
				return MasterChain{}, err
			}
			trackLines++
			guid := event.Fields[2]
			if seen[guid] || masterListed {
				return MasterChain{}, ErrChainIncomplete
			}
			seen[guid], current = true, guid
			if guid == MasterTrackGUID {
				chain.MasterMix, masterListed = mix, true
				continue
			}
			chain.Tracks = append(chain.Tracks, TrackFX{TrackGUID: event.Fields[2], Name: event.Fields[3], Mix: mix, FX: []FXSlot{}})
		case "MASTER_CHAIN_FX":
			fxLines++
			guid, name := event.Fields[2], event.Fields[3]
			// An FX of a track listed earlier than the current one, or of the master before its line, is out of place.
			if guid != current && (seen[guid] || (guid == MasterTrackGUID && trackLines > 0)) {
				return MasterChain{}, ErrChainIncomplete
			}
			slot := FXSlot{Name: event.Fields[4], Enabled: event.Fields[5] == "1"}
			if len(event.Fields) > 6 && event.Fields[6] != "" {
				if !fingerprintPattern.MatchString(event.Fields[6]) {
					return MasterChain{}, ErrChainFingerprint
				}
				slot.Params = event.Fields[6]
			} else {
				chain.SettingsUnread = true
			}
			switch {
			case guid == MasterTrackGUID:
				chain.Master = append(chain.Master, slot)
			case len(chain.Tracks) > 0 && chain.Tracks[len(chain.Tracks)-1].TrackGUID == guid:
				last := &chain.Tracks[len(chain.Tracks)-1]
				last.FX = append(last.FX, slot)
			default:
				// An older script sends no track line: the FX opens its track, as it did before #2995.
				chain.Tracks = append(chain.Tracks, TrackFX{TrackGUID: guid, Name: name, FX: []FXSlot{slot}})
				chain.SettingsUnread = true
				seen[guid], current = true, guid
			}
		case "MASTER_CHAIN_READ":
			switch event.Fields[3] {
			case "0":
			case "1":
				return MasterChain{}, ErrChainTooLong
			case "2":
				return MasterChain{}, ErrChainTooManySettings
			default:
				// Only 0 is a whole answer: a code this app does not know is not read as one (#3017 qa round 2, B1).
				return MasterChain{}, ErrChainIncomplete
			}
			// The close counts the FX lines it sent and, since #2995, the track lines (the master's included): a line the host
			// did not receive leaves the chain incomplete.
			if event.Fields[2] != strconv.Itoa(fxLines) {
				return MasterChain{}, ErrChainIncomplete
			}
			if len(event.Fields) < 5 || event.Fields[4] == "" || !masterListed {
				chain.SettingsUnread = true
			} else if event.Fields[4] != strconv.Itoa(trackLines) {
				return MasterChain{}, ErrChainIncomplete
			}
		}
	}
	return chain, nil
}

// trackMix is a MASTER_CHAIN_TRACK line's mute (0 or 1), solo (I_SOLO, 0 to 6) and mix fingerprint.
func trackMix(fields []string) (TrackMix, error) {
	solo, err := strconv.Atoi(fields[1])
	if err != nil || solo < 0 || solo > maxSolo || (fields[0] != "0" && fields[0] != "1") || !fingerprintPattern.MatchString(fields[2]) {
		return TrackMix{}, ErrChainFingerprint
	}
	return TrackMix{Mute: fields[0] == "1", Solo: solo, Mix: fields[2]}, nil
}

// maxSolo is I_SOLO's highest value: 0 not soloed, 1 soloed, 2 soloed in place, 5 and 6 safe-soloed.
const maxSolo = 6
