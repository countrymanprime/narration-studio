package bridge

import (
	"context"
	"fmt"
	"strings"
	"unicode"
)

// LiveTracks is one read of the open project's track list as REAPER has it now, saved or not (tracks_read,
// narration_tracks_read.lua). Total counts every track, listed or not: the script lists at most its limit.
type LiveTracks struct {
	ProjectPath string // the open project's .rpp, "" when never saved
	Unsaved     bool
	ChangeCount int // GetProjectStateChangeCount: rises on every edit, restarts when the project opens
	Tracks      []LiveTrack
	Total       int
}

// LiveTrack is one track: its 0-based index, GUID, name ("" for a track never named, as the saved .rpp has it) and
// FolderDelta, REAPER's I_FOLDERDEPTH (1 opens a folder, 0 none, -N closes N levels).
type LiveTrack struct {
	Index       int
	GUID        string
	Name        string
	FolderDelta int
}

// ReadTracks lists the open project's tracks in order. It changes nothing in REAPER.
func (a *Actions) ReadTracks(ctx context.Context) (LiveTracks, error) {
	events, err := a.request(ctx, "tracks_read", []string{"TRACKS_READ_END"})
	if err != nil {
		return LiveTracks{}, err
	}
	read := LiveTracks{Tracks: []LiveTrack{}}
	seen := false
	for _, event := range events {
		switch event.Tag {
		case "TRACKS_READ":
			read.ProjectPath, read.Unsaved, read.ChangeCount, seen = event.Fields[2], event.Fields[3] == "1", int(numberAt(event.Fields, 4)), true
		case "TRACKS_ROW":
			read.Tracks = append(read.Tracks, LiveTrack{
				Index:       int(numberAt(event.Fields, 2)),
				GUID:        normalizeGUID(event.Fields[3]),
				Name:        TrackName(event.Fields[4]),
				FolderDelta: int(numberAt(event.Fields, 5)),
			})
		case "TRACKS_READ_END":
			read.Total = int(numberAt(event.Fields, 3))
		}
	}
	if !seen {
		return LiveTracks{}, fmt.Errorf("REAPER ended the track list without reading the project")
	}
	return read, nil
}

// TrackName is a track name REAPER reported, made one line: a line break, tab or other control character becomes a space and
// the spaces around the name are trimmed. Anything else, emoji and right-to-left text included, is kept as the narrator typed it,
// so the name matches a chapter the way the saved .rpp's does.
func TrackName(raw string) string {
	return strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, raw))
}
