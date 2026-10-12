package bridge

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Playing a stretch of a file on disk and showing a file, leaving the project unchanged (narration_media_file.lua). Master & QC
// measures rendered files that are not project items, so Navigator cannot reach them: these commands take the file's path.
// The host checks the path before it is sent and the script checks it again (threat-model row 5r).

// MaxPreviewSeconds is the longest stretch PreviewFileRange plays; the script refuses a longer one too.
const MaxPreviewSeconds = 60.0

// mediaExtensions are the audio files a narrator measures or renders, lower case with the dot; the script holds the same list.
var mediaExtensions = map[string]bool{
	".wav": true, ".wave": true, ".bwf": true, ".w64": true, ".flac": true, ".mp3": true, ".ogg": true, ".aif": true, ".aiff": true, ".wv": true,
}

// The refusals a file command tells apart. The script words the same ones itself (narration_media_file.lua); mediaRefusals
// maps its sentences to these.
var (
	// ErrNotMediaFile: the path is not an absolute local path to an audio file (a network share, a relative path, a `..`
	// segment, a folder or another kind of file).
	ErrNotMediaFile = errors.New("that is not an audio file this app can play or show")
	// ErrMediaFileGone: the file is not there any more.
	ErrMediaFileGone = errors.New("the file is not there any more")
	// ErrBadPreviewRange: the start is not 0 or more, or the length is not more than 0 and at most MaxPreviewSeconds.
	ErrBadPreviewRange = errors.New("the stretch to play is not a usable number of seconds")
	// ErrPreviewPastEnd: the stretch starts at or after the end of the file.
	ErrPreviewPastEnd = errors.New("the stretch starts after the end of the file")
	// ErrPreviewUnsupported: this REAPER has no SWS preview calls, so it cannot play a file without the project.
	ErrPreviewUnsupported = errors.New("playing part of a file needs the SWS extension in REAPER")
	// ErrMediaFileUnreadable: REAPER could not open the file as audio.
	ErrMediaFileUnreadable = errors.New("REAPER could not open the file to play it")
	// ErrRevealUnsupported: this REAPER has no OpenMediaExplorer.
	ErrRevealUnsupported = errors.New("this REAPER version cannot show a file in its Media Explorer")
)

// mediaRefusals are the script's sentences for the refusals above.
var mediaRefusals = map[string]error{
	"That is not an audio file this app can play or show.":          ErrNotMediaFile,
	"The file is not there any more.":                               ErrMediaFileGone,
	"The stretch to play is not a usable number of seconds.":        ErrBadPreviewRange,
	"The stretch starts after the end of the file.":                 ErrPreviewPastEnd,
	"Playing part of a file needs the SWS extension in REAPER.":     ErrPreviewUnsupported,
	"REAPER could not open the file to play it.":                    ErrMediaFileUnreadable,
	"This REAPER version cannot show a file in its Media Explorer.": ErrRevealUnsupported,
}

func init() {
	for sentence, known := range mediaRefusals {
		refusals[sentence] = known
	}
}

// FilePreview is a stretch of a file on disk: Length seconds from Start, in the file's own time.
type FilePreview struct {
	Path          string
	Start, Length float64
}

// FilePreviewStarted is the stretch REAPER plays: Length is shortened to the end of the file.
type FilePreviewStarted struct {
	Path          string
	Start, Length float64
}

// FilePreviewStopped says whether a preview this app started was playing when it was stopped.
type FilePreviewStopped struct{ Stopped bool }

// FileRevealed is the file REAPER shows.
type FileRevealed struct{ Path string }

// CheckMediaFile refuses a path that is not an absolute local path to an existing audio file: ErrNotMediaFile, or
// ErrMediaFileGone when it does not exist. A network share is refused because opening one sends the narrator's Windows
// credentials to its server.
func CheckMediaFile(path string) error {
	if path == "" || strings.HasPrefix(path, `\\`) || strings.HasPrefix(path, "//") || !filepath.IsAbs(path) {
		return ErrNotMediaFile
	}
	for _, segment := range strings.FieldsFunc(path, func(r rune) bool { return r == '/' || r == '\\' }) {
		if segment == ".." {
			return ErrNotMediaFile
		}
	}
	if !mediaExtensions[strings.ToLower(filepath.Ext(path))] {
		return ErrNotMediaFile
	}
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return ErrMediaFileGone
	}
	if err != nil || !info.Mode().IsRegular() {
		return ErrNotMediaFile
	}
	return nil
}

// PreviewFileRange plays a stretch of a file on disk through the engine's preview, never through the project: nothing is
// inserted, no undo point is made, and the project's transport is not touched. It stops a preview this app started before.
func (a *Actions) PreviewFileRange(ctx context.Context, preview FilePreview) (FilePreviewStarted, error) {
	if !finite(preview.Start) || !finite(preview.Length) || preview.Start < 0 || preview.Length <= 0 || preview.Length > MaxPreviewSeconds {
		return FilePreviewStarted{}, ErrBadPreviewRange
	}
	if err := CheckMediaFile(preview.Path); err != nil {
		return FilePreviewStarted{}, err
	}
	events, err := a.request(ctx, "preview_file_range", []string{"FILE_PREVIEW_STARTED"}, preview.Path, formatSeconds(preview.Start), formatSeconds(preview.Length))
	if err != nil {
		return FilePreviewStarted{}, err
	}
	for _, event := range events {
		if event.Tag == "FILE_PREVIEW_STARTED" {
			return FilePreviewStarted{Path: event.Fields[2], Start: numberAt(event.Fields, 3), Length: numberAt(event.Fields, 4)}, nil
		}
	}
	return FilePreviewStarted{}, fmt.Errorf("REAPER ended preview_file_range without answering it")
}

// StopFilePreview stops the preview this app started. With none playing it changes nothing.
func (a *Actions) StopFilePreview(ctx context.Context) (FilePreviewStopped, error) {
	events, err := a.request(ctx, "stop_file_preview", []string{"FILE_PREVIEW_STOPPED"})
	if err != nil {
		return FilePreviewStopped{}, err
	}
	for _, event := range events {
		if event.Tag == "FILE_PREVIEW_STOPPED" {
			return FilePreviewStopped{Stopped: event.Fields[2] == "1"}, nil
		}
	}
	return FilePreviewStopped{}, fmt.Errorf("REAPER ended stop_file_preview without answering it")
}

// RevealFile shows a file on disk in the engine's own file browser without importing or playing it.
func (a *Actions) RevealFile(ctx context.Context, path string) (FileRevealed, error) {
	if err := CheckMediaFile(path); err != nil {
		return FileRevealed{}, err
	}
	events, err := a.request(ctx, "reveal_file", []string{"FILE_REVEALED"}, path)
	if err != nil {
		return FileRevealed{}, err
	}
	for _, event := range events {
		if event.Tag == "FILE_REVEALED" {
			return FileRevealed{Path: event.Fields[2]}, nil
		}
	}
	return FileRevealed{}, fmt.Errorf("REAPER ended reveal_file without answering it")
}
