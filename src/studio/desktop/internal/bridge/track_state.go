package bridge

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// TrackState is one read of REAPER's transport and of one track (chapter_track_state, narration_track_state.lua): what
// the resume prompt, the Read Aloud control bar and the teleprompter's input detection need. Times are seconds.
type TrackState struct {
	TrackGUID                  string // the track read, or "" when none was asked for
	PlayState                  int    // GetPlayState's bit field: 1 playing, 2 paused, 4 recording
	Playing, Paused, Recording bool
	EditCursor, PlayPosition   float64
	ProjectPath                string // the active project's .rpp, "" when never saved
	Unsaved                    bool
	ChangeCount                int         // GetProjectStateChangeCount: rises on every edit, restarts when the project opens
	TrackArmed                 bool        // the named track is armed for recording
	ArmedCount                 int         // tracks armed in the whole project
	RecordInput                *int        // the named track's I_RECINPUT as REAPER stores it; nil with no track
	InputDevice                string      // GetAudioDeviceInfo("IDENT_IN"); "" when REAPER has none open or cannot say
	OutputDevice               string      // GetAudioDeviceInfo("IDENT_OUT"); "" likewise, and from a script older than the field
	InputChannel               string      // REAPER's name for the channel(s) RecordInput records from ("In 1 / In 2"); "" when none
	Items                      []TrackItem // the named track's items, at most the bridge's limit
	ItemsTotal                 int         // how many items the track holds, listed or not
}

// TrackItem is one item on the track with its active take ("" TakeGUID and SourceFile when it has none). Muted is nil
// when the bridge script is older than the field. TrackGUID is the track the item is on, set only by ChapterFolderState
// (the one-track read leaves it "", since every item is on the track asked for).
type TrackItem struct {
	ItemGUID, TakeGUID                       string
	Position, Length, SourceOffset, PlayRate float64
	SourceFile                               string
	Muted                                    *bool
	TrackGUID                                string
}

// TrackStaleError reports a track GUID REAPER could not find; nothing was read for another track.
type TrackStaleError struct{ GUID string }

func (e *TrackStaleError) Error() string {
	return "this chapter's track is no longer in the REAPER project"
}
func (e *TrackStaleError) Is(target error) bool { return target == ErrStale }

// ChapterTrackState reads REAPER's transport and the track trackGUID names (or the transport and the arms only, when
// trackGUID is empty). It changes nothing in REAPER. A track that is gone is a *TrackStaleError.
func (a *Actions) ChapterTrackState(ctx context.Context, trackGUID string) (TrackState, error) {
	return a.chapterTrackState(ctx, trackGUID)
}

// ChapterFolderState reads like ChapterTrackState, with the items of the track trackGUID names and of every track inside it when it
// is a REAPER folder (a chapter linked to a folder of voices, docs/prds/booth-voice-tracks.prd.md), in track order, each with its
// TrackGUID. Items and ItemsTotal count the whole folder. On a track that is not a folder it reads that track's items. It changes
// nothing in REAPER.
func (a *Actions) ChapterFolderState(ctx context.Context, trackGUID string) (TrackState, error) {
	if normalizeGUID(trackGUID) == "" {
		return TrackState{}, fmt.Errorf("no track to read the folder of")
	}
	state, err := a.chapterTrackState(ctx, trackGUID, "children")
	if err != nil {
		return TrackState{}, err
	}
	// A bridge script older than the option ignores it and answers the one-track read, whose items carry no track: that is less
	// than was asked for, so it is an error, never a folder that looks empty.
	for _, item := range state.Items {
		if item.TrackGUID == "" {
			return TrackState{}, ErrFolderReadUnsupported
		}
	}
	return state, nil
}

// ErrFolderReadUnsupported is ChapterFolderState's answer when the REAPER bridge script predates the 'children' read: update the
// script (the launcher installs the one this app ships).
var ErrFolderReadUnsupported = errors.New("the REAPER bridge script is older than this app and cannot read a folder of voices")

func (a *Actions) chapterTrackState(ctx context.Context, trackGUID string, option ...string) (TrackState, error) {
	events, err := a.request(ctx, "chapter_track_state", []string{"TRACK_STATE_END", "TRACK_STALE"}, append([]string{trackGUID}, option...)...)
	if err != nil {
		return TrackState{}, err
	}
	var state TrackState
	seen := false
	for _, event := range events {
		switch event.Tag {
		case "TRACK_STALE":
			return TrackState{}, &TrackStaleError{GUID: event.Fields[2]}
		case "TRACK_STATE":
			state, seen = readTrackState(event.Fields), true
		case "TRACK_ITEM":
			state.Items = append(state.Items, readTrackItem(event.Fields))
		case "TRACK_STATE_END":
			state.ItemsTotal = int(numberAt(event.Fields, 3))
		}
	}
	if !seen {
		return TrackState{}, fmt.Errorf("REAPER ended the track state without reading it")
	}
	if state.TrackGUID != normalizeGUID(trackGUID) {
		return TrackState{}, fmt.Errorf("REAPER answered for another track than the one this app asked about")
	}
	return state, nil
}

// readTrackState reads a TRACK_STATE event wire.go has already checked.
func readTrackState(fields []string) TrackState {
	playState := int(numberAt(fields, 3))
	state := TrackState{
		TrackGUID:    fields[2],
		PlayState:    playState,
		Playing:      playState%2 == 1,
		Paused:       playState/2%2 == 1,
		Recording:    playState/4%2 == 1,
		EditCursor:   numberAt(fields, 4),
		PlayPosition: numberAt(fields, 5),
		ProjectPath:  fields[6],
		Unsaved:      fields[7] == "1",
		ChangeCount:  int(numberAt(fields, 8)),
		TrackArmed:   fields[9] == "1",
		ArmedCount:   int(numberAt(fields, 10)),
	}
	if len(fields) > 11 && fields[11] != "" {
		if input, err := strconv.Atoi(fields[11]); err == nil {
			state.RecordInput = &input
		}
	}
	if len(fields) > 12 {
		state.InputDevice = DeviceName(fields[12])
	}
	if len(fields) > 13 {
		state.OutputDevice = DeviceName(fields[13])
	}
	if len(fields) > 14 {
		state.InputChannel = DeviceName(fields[14])
	}
	return state
}

func readTrackItem(fields []string) TrackItem {
	var muted *bool
	if len(fields) > 9 && fields[9] != "" {
		value := fields[9] != "0"
		muted = &value
	}
	return TrackItem{
		ItemGUID:     fields[2],
		TakeGUID:     fields[3],
		Position:     numberAt(fields, 4),
		Length:       numberAt(fields, 5),
		SourceOffset: numberAt(fields, 6),
		PlayRate:     numberAt(fields, 7),
		SourceFile:   fields[8],
		Muted:        muted,
		TrackGUID:    guidAt(fields, 10),
	}
}

// guidAt is the GUID at fields[index] in braces and upper case, or "" past the end (an optional field an older script leaves off).
func guidAt(fields []string, index int) string {
	if index < len(fields) {
		return normalizeGUID(fields[index])
	}
	return ""
}

// maxDeviceName is the longest device or channel name kept, in runes. REAPER passes on what an audio driver calls itself,
// so the name is untrusted text: a driver that names itself at length must not flood a sentence or a settings row.
const maxDeviceName = 120

// DeviceName is a device or channel name REAPER reported, made safe to show: control and bidirectional-override characters dropped, spaces
// collapsed and the length bounded to maxDeviceName runes (an ellipsis marks a cut).
func DeviceName(raw string) string {
	clean := strings.Join(strings.Fields(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Bidi_Control, r) || r == utf8.RuneError {
			return ' '
		}
		return r
	}, raw)), " ")
	if runes := []rune(clean); len(runes) > maxDeviceName {
		return strings.TrimSpace(string(runes[:maxDeviceName-1])) + "…"
	}
	return clean
}
