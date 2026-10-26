package main

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// "Create a track for this chapter and link it": offered when a chapter has no track to record on. The engine's half is the
// DAW port's track_create role (track_create in narration_track_create.lua and bridge.Actions.CreateTrack for REAPER,
// audacity.Session.CreateTrack for Audacity 3), harness- and fake-pipe-tested; this file is the caller. It is sent only from a
// click, with the chapter id, never a name from the UI: the track is named here, after the chapter's display title, the same
// rule chapterLinksFor and the name matcher use, so the new track also matches its chapter by name.

// The outcomes and the refusal reasons ChapterTrackCreate answers. standalone and not_running are the shared words
// (reaperStandalone, reaperNotRunning); the others are this action's own.
const (
	trackCreateCreated     = "created"
	trackCreateRefused     = "refused"
	trackCreateRecording   = "recording"
	trackCreateUnsupported = "unsupported"
)

// chapterTrackCreated is ChapterTrackCreate's answer when the track was added and linked: ChapterTrackSet's payload (the link
// as written, the link it displaced, which is always null for a new track, and every link that remains) and the new track.
type chapterTrackCreated struct {
	Outcome string `json:"outcome"`
	chapterTrackSetResult
	Track createdTrack `json:"track"`
}

// createdTrack is the track the engine added: its id (a GUID in REAPER), its name and its 0-based index in the project's tracks.
type createdTrack struct {
	GUID  string `json:"guid"`
	Name  string `json:"name"`
	Index int    `json:"index"`
}

// chapterTrackCreateRefusal is ChapterTrackCreate's answer when nothing was added: why, and a sentence for the narrator that names
// the engine (readAloudAdapterName), never a hard-coded one.
type chapterTrackCreateRefusal struct {
	Outcome string `json:"outcome"`
	Reason  string `json:"reason"`
	Message string `json:"message"`
}

func trackCreateRefusedWith(reason, message string) chapterTrackCreateRefusal {
	return chapterTrackCreateRefusal{Outcome: trackCreateRefused, Reason: reason, Message: message}
}

// trackCreatorFrom asks svc's DAW port resolver for the track_create role and says why when it is not available now. With no
// resolver the engine is not connected (standalone). A role that breaks its adapter's declaration (*dawport.RoleError) is a
// failure, not a refusal the narrator can act on.
func trackCreatorFrom(svc hostServices) (dawport.TrackCreator, dawport.Support) {
	if svc.dawPortResolver == nil {
		return nil, dawport.Support{Reason: dawport.ReasonStandalone}
	}
	creator, err := dawport.Role[dawport.TrackCreator](svc.dawPortResolver, dawport.CapTrackCreate)
	if err != nil {
		var notSupported *dawport.NotSupportedError
		if errors.As(err, &notSupported) {
			return nil, notSupported.Support
		}
		return nil, dawport.Support{Reason: dawport.ReasonFailed, Message: err.Error()}
	}
	return creator, dawport.Support{Available: true}
}

// trackCreateUnavailable words a track_create that the resolver refused, by its reason, in the engine's name.
func trackCreateUnavailable(name, title string, support dawport.Support) chapterTrackCreateRefusal {
	switch support.Reason {
	case dawport.ReasonStandalone:
		return trackCreateRefusedWith(reaperStandalone, fmt.Sprintf("%s is not connected to this app, so no track can be added. Start %s, then try again.", name, name))
	case dawport.ReasonNotRunning:
		return trackCreateRefusedWith(reaperNotRunning, fmt.Sprintf("%s is not answering, so no track can be added. Check that %s is open, then try again.", name, name))
	case dawport.ReasonNotYet, dawport.ReasonUnsupported:
		return trackCreateRefusedWith(trackCreateUnsupported, fmt.Sprintf("%s cannot add a track for a chapter from this app. Add a track named “%s” in %s, then link it.", name, title, name))
	default:
		return trackCreateRefusedWith(refusedFailed, trackCreateFailedSentence(name, title, support.Message))
	}
}

// trackCreateFailedSentence is the sentence for an add that failed: what went wrong, and how to do it by hand.
func trackCreateFailedSentence(name, title, why string) string {
	why = strings.TrimRight(strings.TrimSpace(why), ".")
	if why == "" {
		return fmt.Sprintf("%s could not add the track. Add a track named “%s” in %s, then link it.", name, title, name)
	}
	return fmt.Sprintf("%s could not add the track: %s. Add a track named “%s” in %s, then link it.", name, why, title, name)
}

// trackCreateError turns what CreateTrack answered into a refusal. A bridge that went away or stopped answering is the
// connection's own reason.
func trackCreateError(name, title string, err error) chapterTrackCreateRefusal {
	switch {
	case errors.Is(err, bridge.ErrRecording):
		return trackCreateRefusedWith(trackCreateRecording, fmt.Sprintf("%s is recording. Stop the take, then create the track.", name))
	case errors.Is(err, bridge.ErrUnavailable):
		return trackCreateUnavailable(name, title, dawport.Support{Reason: dawport.ReasonStandalone})
	case errors.Is(err, bridge.ErrNoAnswer):
		return trackCreateUnavailable(name, title, dawport.Support{Reason: dawport.ReasonNotRunning})
	}
	return trackCreateRefusedWith(refusedFailed, trackCreateFailedSentence(name, title, err.Error()))
}

// chapterTrackCreateIn adds a track named after chapterID's display title with creator and links the chapter to it with the same
// store call ChapterTrackSet makes. support is why creator is nil (trackCreatorFrom). A chapter the manuscript does not have is a
// hard error, as for ChapterTrackSet; the opening and closing credits count as chapters and name their track after their title.
// Anything that keeps the track from being added is a refusal, and then nothing is linked.
func chapterTrackCreateIn(ctx context.Context, svc hostServices, creator dawport.TrackCreator, support dawport.Support, chapterID string) (any, error) {
	documentID, store, err := mappingContext(svc)
	if err != nil {
		return nil, err
	}
	title, _, err := chapterLinksFor(svc, chapterID)
	if err != nil {
		return nil, err
	}
	storedTitle, ok, err := chapterTitle(svc, chapterID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("that chapter is not part of the current manuscript")
	}
	name := readAloudAdapterName(svc)
	if strings.TrimSpace(title) == "" {
		return trackCreateRefusedWith(refusedFailed, "This chapter has no title to name a track after. Give it a title in the manuscript, then try again."), nil
	}
	if creator == nil {
		return trackCreateUnavailable(name, title, support), nil
	}
	created, err := creator.CreateTrack(ctx, title)
	if err != nil {
		return trackCreateError(name, title, err), nil
	}
	set, err := store.SetChapter(documentID, chapterID, storedTitle, created.GUID)
	if err != nil {
		return nil, err
	}
	mappings, err := store.List(documentID)
	if err != nil {
		return nil, err
	}
	return chapterTrackCreated{
		Outcome:               trackCreateCreated,
		chapterTrackSetResult: chapterTrackSetResult{DocumentID: documentID, ChapterLinkSet: set, Mappings: mappings},
		Track:                 createdTrack{GUID: created.GUID, Name: created.Name, Index: created.Index},
	}, nil
}
