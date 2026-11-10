package main

import (
	"context"
	"desktop/internal/voicetracks"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/dawport/audacity"
	"desktop/internal/tracks"
)

// The live track list (#2840): a track or folder the narrator adds in REAPER shows in Chapter links and the Link chapters dialog
// before the project is saved. The engine's half is the DAW port's tracks_read role (tracks_read in narration_tracks_read.lua and
// bridge.Actions.ReadTracks); this file is the caller. REAPER's list is used only when REAPER has the linked project open, and is
// laid over the saved .rpp: REAPER decides which tracks exist, their order, names and folders, and the saved file still gives each
// track's items, colour and regions (a track added since the save has no items yet). Otherwise the answer is the saved .rpp, with
// the reason the live list was not used.

// tracksLiveTimeout bounds one live read; a REAPER that does not answer in it is "not answering", and the saved project is shown.
const tracksLiveTimeout = 3 * time.Second

// Where TracksLive's tracks came from.
const (
	tracksSourceLive  = "live"
	tracksSourceSaved = "saved"
)

// Why TracksLive answered the saved project. standalone, not_running, unsupported and failed are the DAW port's reasons; the
// others are this read's own.
const (
	tracksReasonStandalone   = "standalone"
	tracksReasonNotRunning   = "not_running"
	tracksReasonUnsupported  = "unsupported"
	tracksReasonFailed       = "failed"
	tracksReasonOtherProject = "other_project"
	tracksReasonOutdated     = "outdated"
	tracksReasonTooMany      = "too_many"
)

// tracksLive is TracksLive's payload: the project's tracks in TracksList's shape, where they came from, and when they were read.
// Reason and Message are empty for a live read; for a saved one they say why, in the engine's name.
type tracksLive struct {
	Source  string         `json:"source"`
	Reason  string         `json:"reason"`
	Message string         `json:"message"`
	ReadAt  string         `json:"readAt"`
	Project tracks.Project `json:"project"`
}

func (h *Host) tracksLive() (tracksLive, error) {
	svc := h.services()
	lister, support := trackListerFrom(svc)
	ctx, cancel := context.WithTimeout(context.Background(), tracksLiveTimeout)
	defer cancel()
	return tracksLiveIn(ctx, svc, lister, support, time.Now())
}

// trackListerFrom asks svc's DAW port resolver for the tracks_read role and says why when it is not available now, as
// trackCreatorFrom does for track_create.
func trackListerFrom(svc hostServices) (dawport.TrackLister, dawport.Support) {
	if svc.dawPortResolver == nil {
		return nil, dawport.Support{Reason: dawport.ReasonStandalone}
	}
	lister, err := dawport.Role[dawport.TrackLister](svc.dawPortResolver, dawport.CapTracksRead)
	if err != nil {
		var notSupported *dawport.NotSupportedError
		if errors.As(err, &notSupported) {
			return nil, notSupported.Support
		}
		return nil, dawport.Support{Reason: dawport.ReasonFailed, Message: err.Error()}
	}
	return lister, dawport.Support{Available: true}
}

// tracksLiveIn reads the project's tracks from lister when the engine has the selected project file open, else from that file.
// support is why lister is nil. No selected file is tracksList's error, and nothing is asked of the engine; a saved file that
// cannot be read is tracksList's error only when the live list cannot be used either.
func tracksLiveIn(ctx context.Context, svc hostServices, lister dawport.TrackLister, support dawport.Support, now time.Time) (tracksLive, error) {
	selected, err := selectedProjectFile(svc.config.projectFolder, svc.settings)
	if err != nil {
		return tracksLive{}, err
	}
	saved, savedErr := readProject(selected)
	if savedErr != nil {
		savedErr = fmt.Errorf("could not read %s: %w", filepath.Base(selected), savedErr)
		saved = tracks.Project{Path: selected}
	}
	answer := tracksLive{Source: tracksSourceLive, ReadAt: now.UTC().Format(time.RFC3339)}
	project, reason, message := liveProject(ctx, readAloudAdapterName(svc), lister, support, selected, saved)
	if reason != "" {
		if savedErr != nil {
			return tracksLive{}, savedErr
		}
		answer.Source, answer.Reason, answer.Message = tracksSourceSaved, reason, message
	}
	answer.Project = project
	rememberVoiceTracks(svc, project)
	return answer, nil
}

// liveProject is saved with the engine's live track list laid over it (mergeLiveTracks), or saved itself with the reason the live
// list was not used and a sentence in the engine's name.
func liveProject(ctx context.Context, name string, lister dawport.TrackLister, support dawport.Support, selected string, saved tracks.Project) (tracks.Project, string, string) {
	fallback := func(reason, why string) (tracks.Project, string, string) {
		return saved, reason, why
	}
	notConnected := func() (tracks.Project, string, string) {
		return fallback(tracksReasonStandalone, fmt.Sprintf("%s is not connected to this app, so these are the tracks in the saved project.", name))
	}
	notAnswering := func() (tracks.Project, string, string) {
		return fallback(tracksReasonNotRunning, fmt.Sprintf("%s is not answering, so these are the tracks as of the last save.", name))
	}
	failed := func(why string) (tracks.Project, string, string) {
		why = strings.TrimRight(strings.TrimSpace(why), ".")
		return fallback(tracksReasonFailed, fmt.Sprintf("%s could not list its tracks (%s), so these are the tracks as of the last save.", name, why))
	}
	if audacity.IsSnapshot(selected) {
		// Audacity's tracks are already the ones it answered with: the snapshot is taken while it answers.
		return fallback(tracksReasonUnsupported, "")
	}
	if lister == nil {
		switch support.Reason {
		case dawport.ReasonStandalone:
			return notConnected()
		case dawport.ReasonNotRunning:
			return notAnswering()
		case dawport.ReasonNotYet, dawport.ReasonUnsupported:
			return fallback(tracksReasonUnsupported, fmt.Sprintf("%s cannot list its tracks to this app, so these are the tracks in the saved project.", name))
		default:
			return failed(support.Message)
		}
	}
	live, err := lister.ReadTracks(ctx)
	switch {
	case err == nil:
	case errors.Is(err, bridge.ErrUnavailable):
		return notConnected()
	case errors.Is(err, bridge.ErrNoAnswer), errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		return notAnswering()
	case errors.Is(err, bridge.ErrScriptOutdated):
		return fallback(tracksReasonOutdated, fmt.Sprintf("The %s script is older than this app, so these are the tracks as of the last save. Import the script again from this app's %s folder.", name, name))
	default:
		return failed(err.Error())
	}
	if live.Unsaved || !sameProjectFile(live.ProjectPath, selected) {
		return fallback(tracksReasonOtherProject, fmt.Sprintf("%s has another project open, so these are the tracks in the saved project.", name))
	}
	if live.Total > len(live.Tracks) {
		return fallback(tracksReasonTooMany, fmt.Sprintf("%s has more tracks than this app lists at once, so these are the tracks as of the last save.", name))
	}
	return mergeLiveTracks(saved, live), "", ""
}

// liveSelectedProject is the selected project as the engine has it now (liveProject), or the saved file when the engine is not
// answering, has another project open or cannot list: a track renamed, added or deleted in the engine and not yet saved is seen. It waits
// as long as the pages' own live read (tracksLiveTimeout), so the Booth page and the host decide from the same answer. The matcher, the
// folder check, the Booth's voices and the record target use it; chapter sync and chapterTrackLinksIn still read the saved file.
// Items, regions and colours are the saved file's (mergeLiveTracks). The error is selectedProject's.
func liveSelectedProject(svc hostServices) (tracks.Project, error) {
	saved, err := selectedProject(svc)
	if err != nil {
		return tracks.Project{}, err
	}
	lister, support := trackListerFrom(svc)
	ctx, cancel := context.WithTimeout(context.Background(), tracksLiveTimeout)
	defer cancel()
	project, _, _ := liveProject(ctx, readAloudAdapterName(svc), lister, support, saved.Path, saved)
	return project, nil
}

// sameProjectFile reports whether open, the project the engine has open, is the file selected: the same path ignoring case, as
// the heartbeat's Matches compares it, or the same file on disk reached another way.
func sameProjectFile(open, selected string) bool {
	if open == "" || selected == "" {
		return false
	}
	if strings.EqualFold(filepath.Clean(open), filepath.Clean(selected)) {
		return true
	}
	a, errA := os.Stat(open)
	b, errB := os.Stat(selected)
	return errA == nil && errB == nil && os.SameFile(a, b)
}

// mergeLiveTracks is saved with live's tracks: live decides which tracks exist, their order, names and folders (Depth and IsFolder
// from the folder depth changes, as tracks.Parse computes them from the .rpp); a track the saved file also has keeps its items,
// colour, mute and solo from there, and a track added since the save has none. Regions and markers stay the saved file's.
func mergeLiveTracks(saved tracks.Project, live dawport.LiveTracks) tracks.Project {
	byGUID := make(map[string]tracks.Track, len(saved.Tracks))
	for _, track := range saved.Tracks {
		byGUID[guidKey(track.GUID)] = track
	}
	merged := make([]tracks.Track, 0, len(live.Tracks))
	depth := 0
	for index, row := range live.Tracks {
		track, ok := byGUID[guidKey(row.GUID)]
		if !ok {
			track = tracks.Track{GUID: row.GUID}
		}
		track.Index, track.Name = index, row.Name
		track.Depth, track.IsFolder = depth, row.FolderDelta > 0
		depth = max(depth+row.FolderDelta, 0)
		merged = append(merged, track)
	}
	saved.Tracks = merged
	return saved
}

// guidKey is a GUID in the one spelling REAPER answers and the .rpp writes: upper case in braces.
func guidKey(guid string) string {
	bare := strings.ToUpper(strings.Trim(strings.TrimSpace(guid), "{}"))
	if bare == "" {
		return ""
	}
	return "{" + bare + "}"
}

// rememberVoiceTracks tells the voice setup which tracks the project has (voicetracks.Learn), so a track renamed in the engine keeps the
// characters assigned to it and the Narrator track stays key 0. It is best effort: a setup that cannot be written leaves the lookup by
// name, which is what it was before.
func rememberVoiceTracks(svc hostServices, project tracks.Project) {
	seen := make([]voicetracks.Seen, 0, len(project.Tracks))
	for _, track := range project.Tracks {
		seen = append(seen, voicetracks.Seen{GUID: track.GUID, Name: track.Name})
	}
	_, _ = voicetracks.New(voicetracks.Config{Project: svc.config.projectFolder}).Learn(seen)
}
