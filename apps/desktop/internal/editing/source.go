// Package editing is a read-only editing-chore scan for one chapter's
// confirmed track.
//
// This file turns a parsed tracks.Item into an analysis Source (its active
// take's file and played range, evidence.ItemPlayedRange) or a stable typed
// reason it cannot be analyzed at all - never a guess, never a silent skip
// that would later read as a false "done": the analysis says unknown or not
// done whenever it cannot be sure. Callers: decode.go, the empty-space
// composition (empty_space.go) and the scan job (scan.go, service.go).
package editing

import (
	"github.com/countrymanprime/narration-utils/shell/internal/evidence"
	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

// UnknownReason is a stable, typed reason one item's audio could not be
// analyzed. Each reason makes the item unknown. It is never
// set on an Excluded item: a muted or non-audio item is left out of the
// analysis entirely, not refused, so it never makes the chapter's signal
// unknown by itself.
type UnknownReason string

const (
	// ReasonPlayRateNotOne means the played take's rate is not 1 (the WAV-only
	// decoder and this analyzer's timeline math both assume playback at the
	// source's own rate, so this case always reads unknown).
	ReasonPlayRateNotOne UnknownReason = "playrate_not_one"
	// ReasonStretchMarkers means the take has one or more stretch markers, which
	// bend the mapping from source time to timeline time in a way this
	// analyzer does not model (tracks.Take.StretchMarkerCount is evidence
	// only, per its own doc comment - "not full stretch-marker semantics").
	ReasonStretchMarkers UnknownReason = "stretch_markers"
	// ReasonUnsupportedFormat means the source is not a WAV (MP3, FLAC, OGG, AIFF and WavPack are all "Supported" by the tracks
	// parser but none of them decodes through measure.NewWAVReader).
	ReasonUnsupportedFormat UnknownReason = "format_not_analyzable"
	// ReasonMultiChannel means the source has more than two channels; measure's
	// WAV reader refuses it (wav.go: "only mono and stereo are supported").
	ReasonMultiChannel UnknownReason = "multi_channel"
	// ReasonMissingFile means the take's source file is not available on disk
	// (tracks.Take.SourceAvailable is false, or the path is empty).
	ReasonMissingFile UnknownReason = "missing_file"
	// ReasonUnreadable means the source file could not be decoded for a reason
	// other than the ones above (a truncated or corrupt WAV header, for
	// example) - measure.NewWAVReader's own error, quoted in the evidence.
	ReasonUnreadable UnknownReason = "unreadable"
	// ReasonNoPlayedRange means the item's played range is empty or negative (a
	// zero-length item, or a malformed SOFFS/LENGTH pairing) - nothing to
	// decode.
	ReasonNoPlayedRange UnknownReason = "no_played_range"

	// ReasonReversedSource documents a known, undetected gap rather than a
	// real case Resolve ever returns (see its own doc comment below); it is
	// exported so a caller and this package's tests can name the gap by a
	// stable identifier instead of a magic string, without implying this
	// analyzer can tell a reversed take apart from a forward one.
	//
	// tracks.Item and tracks.Take carry no "reversed" or play-direction
	// field (apps/desktop/internal/tracks has no field for it). A take REAPER
	// plays backwards is therefore analyzed forwards, silently: its silence
	// runs and click/breath candidates are still reported, just against the
	// wrong direction of playback. This is a real, un-mitigated limitation,
	// and source_test.go pins that this reason has no UI-facing text, rather
	// than hiding the gap behind a reason that implies detection.
	ReasonReversedSource UnknownReason = "reversed_source_undetected"
)

// reasonText is a short, stable, human string for each reason. The stage
// signals' evidence and the findings this package writes show it verbatim, so it stays plain
// and specific rather than a generic "could not analyze".
var reasonText = map[UnknownReason]string{
	ReasonPlayRateNotOne:    "the item plays at a rate other than 1",
	ReasonStretchMarkers:    "the take has stretch markers",
	ReasonUnsupportedFormat: "the source format is not analyzable (WAV only)",
	ReasonMultiChannel:      "the source has more than two channels",
	ReasonMissingFile:       "the source file is missing",
	ReasonUnreadable:        "the source file could not be read",
	ReasonNoPlayedRange:     "the item plays no audio",
}

// Text is r's short human string, or r itself when it has none (a defensive
// fallback; every constant above has an entry, kept in sync by
// TestEveryReasonHasText).
func (r UnknownReason) Text() string {
	if text, ok := reasonText[r]; ok {
		return text
	}
	return string(r)
}

// Source is one item's audio input to the editing analysis: its active
// take's file and played range (evidence.ItemPlayedRange),
// SourceStart already folding in a <SOURCE SECTION> wrapper's own offset
// (tracks.Take.SourceStart), plus evidence about it (take or track FX-chain
// presence, stretch marker count).
type Source struct {
	ItemGUID           string
	TakeGUID           string
	File               string
	PlayedRange        evidence.PlayedRange
	HasFXChain         bool
	StretchMarkerCount int
}

// Resolution is what Resolve decided about one item: Excluded (a muted or
// non-audio item, never reported unknown), or a Source ready to decode, or -
// when neither - a stable Reason naming why it cannot be analyzed. Exactly
// one of Excluded, a usable Source, or Reason applies to a given Resolution.
type Resolution struct {
	Item     tracks.Item
	Excluded bool
	Source   Source
	Reason   UnknownReason // "" exactly when the item is analyzable
}

// Analyzable reports whether r can be decoded: neither excluded from the
// analysis nor refused for a typed reason.
func (r Resolution) Analyzable() bool { return !r.Excluded && r.Reason == "" }

// Resolve turns one parsed item into a Resolution. trackHasFXChain is the
// item's own track's <FXCHAIN> presence (tracks.Track.HasFXChain); it is
// folded into Source.HasFXChain alongside the take's own <TAKEFX>, since
// either can gate source dead air or mask a source click (the
// processed-audio caveat, signals.go) whether or not the narrator has looked at
// the chain. A muted item, or one the tracks parser could not resolve to a
// playable audio kind (Item.Supported false - MIDI, an unresolved source
// kind), is Excluded: it never contributes and never makes the chapter's
// signal read unknown by itself. Every other item is analyzable unless it hits one
// of the typed reasons above, checked in the order a narrator would find
// cheapest to fix first: the play rate and stretch markers are read straight
// off the take without touching the file system; the format, file presence
// and played range need only the parsed fields, still no disk access; the
// file itself is opened only by Decode (decode.go).
func Resolve(item tracks.Item, trackHasFXChain bool) Resolution {
	if item.Muted || !item.Supported {
		return Resolution{Item: item, Excluded: true}
	}
	take := item.Active()
	switch {
	case take.Rate() != 1:
		return Resolution{Item: item, Reason: ReasonPlayRateNotOne}
	case take.StretchMarkerCount > 0:
		return Resolution{Item: item, Reason: ReasonStretchMarkers}
	case take.SourceKind != "WAVE":
		return Resolution{Item: item, Reason: ReasonUnsupportedFormat}
	case !take.SourceAvailable || take.SourceFile == "":
		return Resolution{Item: item, Reason: ReasonMissingFile}
	}
	played := evidence.ItemPlayedRange(item)
	if played.End <= played.Start {
		return Resolution{Item: item, Reason: ReasonNoPlayedRange}
	}
	return Resolution{
		Item: item,
		Source: Source{
			ItemGUID: item.GUID, TakeGUID: take.GUID, File: take.SourceFile, PlayedRange: played,
			HasFXChain: take.HasFXChain || trackHasFXChain, StretchMarkerCount: take.StretchMarkerCount,
		},
	}
}

// ResolveTrack resolves every item of one track (the unmuted
// audio items on the chapter's confirmed track), in item order.
func ResolveTrack(track tracks.Track) []Resolution {
	resolutions := make([]Resolution, len(track.Items))
	for i, item := range track.Items {
		resolutions[i] = Resolve(item, track.HasFXChain)
	}
	return resolutions
}
