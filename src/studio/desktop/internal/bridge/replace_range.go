package bridge

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Replace words with another narrator's audio, and put the narrator's audio back (docs/reference/daw/capabilities.md#replace_range;
// replace_range and restore_replacement in narration_replace.lua). Experimental (actions.go) until the owner's pass has run them.

// MaxReplaceGainDB is the largest level change replace_range sets on their stretch, either way.
const MaxReplaceGainDB = 24

// replacementID is what the script accepts as a replacement's id: it travels in a '|'-joined field and is stored in P_EXT.
var replacementID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// ErrBadReplacement is the refusal when an item, a range, the fade, the level change or the id is not usable, or their audio is
// the narrator's own item, so nothing was sent; the script answers it for the same reasons. Whatever only the script can read (a
// range outside an item, their audio on the narrator's track, words already replaced) is a *RefusalError in its words.
var ErrBadReplacement = errors.New("the replacement is not usable")

var badReplacement = map[string]bool{
	"The words to replace are not a usable pair of times.":           true,
	"The stretch of their audio is not a usable pair of times.":      true,
	"The fade must be a whole number of milliseconds from 0 to 500.": true,
	"The level change must be from -24 to 24 dB.":                    true,
	"The replacement has no usable name.":                            true,
}

// ReplaceRangeRequest names the narrator's words (project seconds Start..End of ItemGUID) and their stretch (project seconds
// SourceStart..SourceEnd of SourceGUID, an item on a track of its own). FadeMs (0 to MaxCutFadeMs) is the fade at each seam, GainDB
// the level change on their stretch, and ID the record the host keeps of the replacement, stamped on the new item.
type ReplaceRangeRequest struct {
	ItemGUID               string
	Start, End             float64
	SourceGUID             string
	SourceStart, SourceEnd float64
	FadeMs                 int
	GainDB                 float64
	ID                     string
}

// RangeReplaced is what replace_range did: the new item playing their stretch, the narrator's piece moved to the Cuts track (the
// item itself when the words began at its start), the left piece (the item itself, or empty), the seconds the later audio moved, and
// the undo points the command added (1).
type RangeReplaced struct {
	NewItemGUID  string
	CutItemGUID  string
	LeftItemGUID string
	Shift        float64
	UndoPoints   int
}

// ReplacementRestored is what restore_replacement did: the narrator's piece back on its track, the seconds the later audio moved
// and the undo points the command added (1).
type ReplacementRestored struct {
	ItemGUID   string
	Shift      float64
	UndoPoints int
}

func (r ReplaceRangeRequest) check() error {
	switch {
	case normalizeGUID(r.ItemGUID) == "" || normalizeGUID(r.SourceGUID) == "":
		return fmt.Errorf("%w: no item", ErrBadReplacement)
	case normalizeGUID(r.ItemGUID) == normalizeGUID(r.SourceGUID):
		return fmt.Errorf("%w: their audio is the narrator's own item", ErrBadReplacement)
	case !finite(r.Start) || !finite(r.End) || r.End <= r.Start:
		return fmt.Errorf("%w: words %v to %v", ErrBadReplacement, r.Start, r.End)
	case !finite(r.SourceStart) || !finite(r.SourceEnd) || r.SourceEnd <= r.SourceStart:
		return fmt.Errorf("%w: their stretch %v to %v", ErrBadReplacement, r.SourceStart, r.SourceEnd)
	case r.FadeMs < 0 || r.FadeMs > MaxCutFadeMs:
		return fmt.Errorf("%w: fade %d ms", ErrBadReplacement, r.FadeMs)
	case math.IsNaN(r.GainDB) || math.Abs(r.GainDB) > MaxReplaceGainDB:
		return fmt.Errorf("%w: level change %v dB", ErrBadReplacement, r.GainDB)
	case !replacementID.MatchString(r.ID):
		return fmt.Errorf("%w: id %q", ErrBadReplacement, r.ID)
	}
	return nil
}

// ReplaceRange puts their stretch in place of the narrator's words in one undo block: the narrator's item is split at both ends and
// the middle piece moved to the muted Cuts track, a new item on the narrator's track plays their file from the stretch at GainDB,
// and every later item on the track moves by their length less the words' length. Nothing is deleted. A GUID that is gone is a
// *StaleError (Reason "item" for the narrator's, "source" for theirs); nothing changes while REAPER records (ErrRecording);
// what only the script can check is a *RefusalError in its words.
func (a *Actions) ReplaceRange(ctx context.Context, request ReplaceRangeRequest) (RangeReplaced, error) {
	if err := request.check(); err != nil {
		return RangeReplaced{}, err
	}
	tail := fmt.Sprintf("%s|%s|%d|%s|%s", formatSeconds(request.SourceStart), formatSeconds(request.SourceEnd), request.FadeMs,
		strconv.FormatFloat(request.GainDB, 'f', 2, 64), request.ID)
	events, err := a.request(ctx, "replace_range", []string{"RANGE_REPLACED", "ITEM_STALE"}, request.ItemGUID, formatSeconds(request.Start),
		formatSeconds(request.End), request.SourceGUID, tail)
	if err := replacementRefusal(err); err != nil {
		return RangeReplaced{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return RangeReplaced{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	got := RangeReplaced{NewItemGUID: event.Fields[2], CutItemGUID: event.Fields[3], LeftItemGUID: event.Fields[4], Shift: numberAt(event.Fields, 5),
		UndoPoints: int(numberAt(event.Fields, 6))}
	asked := normalizeGUID(request.ItemGUID)
	if (got.LeftItemGUID != "" && got.LeftItemGUID != asked) || (got.LeftItemGUID == "" && got.CutItemGUID != asked) ||
		got.NewItemGUID == "" || got.NewItemGUID == asked {
		return RangeReplaced{}, fmt.Errorf("REAPER replaced audio in another item than the one this app asked for")
	}
	return got, nil
}

// RestoreReplacement puts the narrator's audio back in place of the replacement newItemGUID carries with id, in one undo block, and
// works after a save and reopen. A new item that is gone, carries another id, or whose parked piece left the Cuts track is a
// *StaleError (Reason "item", "replacement" or "cut").
func (a *Actions) RestoreReplacement(ctx context.Context, newItemGUID, id string) (ReplacementRestored, error) {
	if normalizeGUID(newItemGUID) == "" || !replacementID.MatchString(id) {
		return ReplacementRestored{}, fmt.Errorf("%w: item %q, id %q", ErrBadReplacement, newItemGUID, id)
	}
	events, err := a.request(ctx, "restore_replacement", []string{"REPLACEMENT_RESTORED", "ITEM_STALE"}, newItemGUID, id)
	if err := replacementRefusal(err); err != nil {
		return ReplacementRestored{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return ReplacementRestored{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	return ReplacementRestored{ItemGUID: event.Fields[2], Shift: numberAt(event.Fields, 3), UndoPoints: int(numberAt(event.Fields, 4))}, nil
}

func replacementRefusal(err error) error {
	var refusal *RefusalError
	if errors.As(err, &refusal) && badReplacement[refusal.Sentence] {
		return fmt.Errorf("%w: %s", ErrBadReplacement, refusal.Sentence)
	}
	return err
}

// AudioTrackAdded is what import_audio_track did: the new muted track holding the other narrator's file, its one item, the item's
// length in seconds (the file's) and the undo points the command added (1).
type AudioTrackAdded struct {
	TrackGUID  string
	ItemGUID   string
	Length     float64
	UndoPoints int
}

// MaxNarratorName is the longest other narrator's name import_audio_track takes, in characters.
const MaxNarratorName = 80

var badImport = map[string]bool{
	"Their name must be 1 to 80 characters with no bar or control character.": true,
	"Choose an audio file on this computer (WAV, FLAC, MP3, OGG or AIFF).":    true,
}

// ImportAudioTrack puts the file at path on a new muted track named name, one item from 0 for the file's length, in one undo block
// (import_audio_track). It is the one command that adds a path the host sent to the project, so the host sends only a file the
// narrator chose in this app's own file dialog. A name or path the script would refuse is ErrBadReplacement, and nothing is sent; a
// missing or unreadable file is a *RefusalError in the script's words.
func (a *Actions) ImportAudioTrack(ctx context.Context, name, path string) (AudioTrackAdded, error) {
	if !validNarratorName(name) {
		return AudioTrackAdded{}, fmt.Errorf("%w: their name", ErrBadReplacement)
	}
	if path == "" || strings.ContainsAny(path, "|\r\n\x00") {
		return AudioTrackAdded{}, fmt.Errorf("%w: the file's path", ErrBadReplacement)
	}
	events, err := a.request(ctx, "import_audio_track", []string{"AUDIO_TRACK_ADDED"}, name, path)
	var refusal *RefusalError
	if errors.As(err, &refusal) && badImport[refusal.Sentence] {
		return AudioTrackAdded{}, fmt.Errorf("%w: %s", ErrBadReplacement, refusal.Sentence)
	}
	if err != nil {
		return AudioTrackAdded{}, err
	}
	event := events[len(events)-1]
	got := AudioTrackAdded{TrackGUID: event.Fields[2], ItemGUID: event.Fields[3], Length: numberAt(event.Fields, 4), UndoPoints: int(numberAt(event.Fields, 5))}
	if normalizeGUID(got.TrackGUID) == "" || normalizeGUID(got.ItemGUID) == "" || !(got.Length > 0) {
		return AudioTrackAdded{}, fmt.Errorf("REAPER answered import_audio_track without a track, an item or a length")
	}
	return got, nil
}

// validNarratorName is import_audio_track's rule: 1 to MaxNarratorName characters, not all space, no bar or control character.
func validNarratorName(name string) bool {
	if strings.TrimSpace(name) == "" || utf8.RuneCountInString(name) > MaxNarratorName || !utf8.ValidString(name) {
		return false
	}
	for _, r := range name {
		if r == '|' || unicode.IsControl(r) {
			return false
		}
	}
	return true
}
