package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// The file bindings (SN-B98): play a stretch of a file on disk and show a file in the DAW, the project unchanged. Master & QC
// measures rendered files that are not project items, so the Review page's navigation cannot reach them. The page sends a path
// it got from the host's own measurement result; the host plays or shows it only when the narrator picked it to measure in this
// session (measurePicked) and it is an absolute local path to an audio file that is there (bridge.CheckMediaFile), and the
// DAW's script checks it again (threat-model row 5r). Each answer is a DawResult (ADR 0810) with no undo step.

// fileActionTimeout bounds one file command: a defer tick or two of the bridge and the host's 150 ms dispatch loop.
const fileActionTimeout = 5 * time.Second

const (
	fileNotPickedSentence      = "Pick the file to measure again: only a file picked in this session can be played or shown."
	fileNotAudioSentence       = "That is not an audio file this app can play or show."
	fileGoneSentence           = "The file is not there any more."
	fileBadStretchSentence     = "The stretch to play is not a usable number of seconds (up to 60)."
	filePastEndSentence        = "The stretch starts after the end of the file."
	fileStoppedSentence        = "Stopped playing the file."
	fileNothingPlayingSentence = "Nothing was playing."
)

// DawPreviewFileRange plays length seconds of the file at path from start (the file's own seconds) through the DAW's preview,
// never through the project, stopping a preview this app started before. The resolver's file_preview sentence comes first,
// then the stretch, then the path; nothing is sent to the DAW on any refusal.
func (h *Host) DawPreviewFileRange(path string, start, length float64) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fileActionTimeout)
	defer cancel()
	clean, picked := h.pickedFile(path)
	return encodeBinding(dawPreviewFileIn(ctx, svc, resolver.Support(dawport.CapFilePreview), svc.filePreviewer, clean, picked, start, length), nil)
}

// DawStopFilePreview stops the preview this app started; with none playing it changes nothing.
func (h *Host) DawStopFilePreview() (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fileActionTimeout)
	defer cancel()
	return encodeBinding(dawStopFilePreviewIn(ctx, svc, resolver.Support(dawport.CapFilePreview), svc.filePreviewer), nil)
}

// DawRevealFile shows the file at path in the DAW's own file browser without importing or playing it. The resolver's
// file_reveal sentence comes first, then the path; nothing is sent to the DAW on any refusal.
func (h *Host) DawRevealFile(path string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), fileActionTimeout)
	defer cancel()
	clean, picked := h.pickedFile(path)
	return encodeBinding(dawRevealFileIn(ctx, svc, resolver.Support(dawport.CapFileReveal), svc.fileRevealer, clean, picked), nil)
}

// pickedFile is path cleaned, and whether the narrator picked it to measure in this session.
func (h *Host) pickedFile(path string) (string, bool) {
	if path == "" {
		return "", false
	}
	clean := filepath.Clean(path)
	h.mu.RLock()
	defer h.mu.RUnlock()
	return clean, filepath.IsAbs(clean) && h.measurePicked[clean]
}

func dawPreviewFileIn(ctx context.Context, svc hostServices, support dawport.Support, previewer dawport.FilePreviewer, path string, picked bool, start, length float64) dawport.Result {
	if !support.Available {
		return dawport.Refused(support.Message)
	}
	if !finiteSeconds(start) || !finiteSeconds(length) || start < 0 || length <= 0 || length > bridge.MaxPreviewSeconds {
		return dawport.Refused(fileBadStretchSentence)
	}
	if refused, ok := filePathRefusal(path, picked); !ok {
		return refused
	}
	name := readAloudAdapterName(svc)
	if previewer == nil {
		return dawport.Refused(fileStandaloneSentence(name))
	}
	started, err := previewer.PreviewFileRange(ctx, dawport.FilePreview{Path: path, Start: start, Length: length})
	if err != nil {
		return fileRefusal(name, err)
	}
	return dawport.OK(fmt.Sprintf("Playing %.1f s of %s from %.1f s.", started.Length, filepath.Base(path), started.Start), false)
}

func dawStopFilePreviewIn(ctx context.Context, svc hostServices, support dawport.Support, previewer dawport.FilePreviewer) dawport.Result {
	if !support.Available {
		return dawport.Refused(support.Message)
	}
	name := readAloudAdapterName(svc)
	if previewer == nil {
		return dawport.Refused(fileStandaloneSentence(name))
	}
	stopped, err := previewer.StopFilePreview(ctx)
	if err != nil {
		return fileRefusal(name, err)
	}
	if !stopped.Stopped {
		return dawport.OK(fileNothingPlayingSentence, false)
	}
	return dawport.OK(fileStoppedSentence, false)
}

func dawRevealFileIn(ctx context.Context, svc hostServices, support dawport.Support, revealer dawport.FileRevealer, path string, picked bool) dawport.Result {
	if !support.Available {
		return dawport.Refused(support.Message)
	}
	if refused, ok := filePathRefusal(path, picked); !ok {
		return refused
	}
	name := readAloudAdapterName(svc)
	if revealer == nil {
		return dawport.Refused(fileStandaloneSentence(name))
	}
	if _, err := revealer.RevealFile(ctx, path); err != nil {
		return fileRefusal(name, err)
	}
	return dawport.OK(fmt.Sprintf("Showing %s in %s.", filepath.Base(path), name), false)
}

// filePathRefusal refuses a path the narrator did not pick, then one bridge.CheckMediaFile refuses; ok is true for a usable path.
func filePathRefusal(path string, picked bool) (dawport.Result, bool) {
	if !picked {
		return dawport.Refused(fileNotPickedSentence), false
	}
	switch err := bridge.CheckMediaFile(path); {
	case errors.Is(err, bridge.ErrMediaFileGone):
		return dawport.Refused(fileGoneSentence), false
	case err != nil:
		return dawport.Refused(fileNotAudioSentence), false
	}
	return dawport.Result{}, true
}

func fileStandaloneSentence(name string) string {
	return fmt.Sprintf("%s is not connected to this app. Open this app from the Narration Utils action in %s.", name, name)
}

// fileRefusal words an error a file role returned, from name, the adapter's display name.
func fileRefusal(name string, err error) dawport.Result {
	if refused, ok := dawport.RefusedFrom(err); ok {
		return refused
	}
	switch {
	case errors.Is(err, bridge.ErrNoAnswer), errors.Is(err, context.DeadlineExceeded):
		return dawport.Refused(fmt.Sprintf("%s is not answering. Check that %s is open and the Narration Utils action is running, then try again.", name, name))
	case errors.Is(err, bridge.ErrUnavailable):
		return dawport.Refused(fileStandaloneSentence(name))
	case errors.Is(err, bridge.ErrScriptOutdated):
		return dawport.Refused(fmt.Sprintf("The Narration Utils script in %s is older than this app. Import it again from this app's %s folder.", name, name))
	case errors.Is(err, bridge.ErrRecording):
		return dawport.Refused(fmt.Sprintf("%s is recording. Stop recording first.", name))
	case errors.Is(err, bridge.ErrNotMediaFile):
		return dawport.Refused(fileNotAudioSentence)
	case errors.Is(err, bridge.ErrMediaFileGone):
		return dawport.Refused(fileGoneSentence)
	case errors.Is(err, bridge.ErrBadPreviewRange):
		return dawport.Refused(fileBadStretchSentence)
	case errors.Is(err, bridge.ErrPreviewPastEnd):
		return dawport.Refused(filePastEndSentence)
	case errors.Is(err, bridge.ErrPreviewUnsupported):
		// Only REAPER's bridge answers this, and the SWS extension is what it lacks.
		return dawport.Refused("Playing part of a file needs the SWS extension in REAPER.")
	case errors.Is(err, bridge.ErrMediaFileUnreadable):
		return dawport.Refused(fmt.Sprintf("%s could not open the file to play it.", name))
	case errors.Is(err, bridge.ErrRevealUnsupported):
		return dawport.Refused(fmt.Sprintf("This version of %s cannot show a file in its own file browser.", name))
	}
	return dawport.Refused(fmt.Sprintf("%s could not do that: %s.", name, err.Error()))
}

func finiteSeconds(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
