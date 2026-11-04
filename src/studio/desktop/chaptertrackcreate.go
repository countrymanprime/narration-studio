package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/evidence"
	"desktop/internal/tracks"
	"desktop/internal/voicetracks"
)

// narratorVoice is the name of the one child a new chapter folder gets: the Booth's voice for key 0 (voiceFor).
const narratorVoice = "Narrator"

// "Create a track for this chapter and link it": offered when a chapter has no track to record on. The engine's half is the
// DAW port's track_create role (track_create in narration_track_create.lua and bridge.Actions.CreateTrack for REAPER,
// audacity.Session.CreateTrack for Audacity 3), harness- and fake-pipe-tested; this file is the caller. It is sent only from a
// click, with the chapter id, never a name from the UI: the track is named here, after the chapter's display title, the same
// rule chapterLinksFor and the name matcher use, so the new track also matches its chapter by name.
//
// In a Voice folders project (voice-tracks.json, docs/prds/booth-voice-tracks.prd.md) a chapter is a folder whose children are its voices,
// so on an engine with folder tracks (dawport.FolderTrackCreator) the press adds a folder named after the chapter holding one child named
// Narrator (key 0 in the Booth), and links the chapter to the folder (#2840, part 2). The layout is read at the press, so a switch made after
// the page drew its button decides; the answer's voice says a folder was made.

// The outcomes and the refusal reasons ChapterTrackCreate answers. standalone and not_running are the shared words
// (reaperStandalone, reaperNotRunning); the others are this action's own.
const (
	trackCreateCreated     = "created"
	trackCreateRefused     = "refused"
	trackCreateRecording   = "recording"
	trackCreateUnsupported = "unsupported"
	// The chapter already has a track the project has (or one this app just added): Change or Clear it instead (#2958, B2).
	trackCreateAlreadyLinked = "already_linked"
	// A track (or folder) already has the name the new one would get: link that one with the picker (#2958, F2).
	trackCreateNameTaken = "name_taken"
	// The engine added the track but the link could not be saved (#2958, B6): the sentence names the track to link by hand.
	trackCreateLinkFailed = "link_failed"
)

// chapterTrackCreates serialises ChapterTrackCreate across the app, so two presses for one chapter (a double click, a remount, two
// windows) add one track: the second runs after the first has linked the chapter and is refused as already_linked. made holds the
// tracks this app added this session, by GUID key, with their names: they are the chapter's even before the project is saved, when
// neither the saved file nor (with the engine not answering) the live list has them.
var chapterTrackCreates = &chapterTrackCreateLock{made: map[string]string{}}

// chapterTrackCreateLock is chapterTrackCreates' type: the lock every create holds, and the tracks made under it.
type chapterTrackCreateLock struct {
	mu sync.Mutex
	// +checklocks:mu
	made map[string]string
}

// setChapterLink writes the new track's link; a seam so a test can make the write fail after the engine added the track.
var setChapterLink = func(store *evidence.MappingStore, documentID, chapterID, chapterTitle, trackGUID string) (evidence.ChapterLinkSet, error) { // +checklocksignore: a test seam, called under the create lock by chance
	return store.SetChapter(documentID, chapterID, chapterTitle, trackGUID)
}

// chapterTrackCreated is ChapterTrackCreate's answer when the track was added and linked: ChapterTrackSet's payload (the link
// as written, the link it displaced, which is always null for a new track, and every link that remains) and the new track. Voice is the
// Narrator child when the track is a new chapter folder (Voice folders), absent for a plain track.
type chapterTrackCreated struct {
	Outcome string `json:"outcome"`
	chapterTrackSetResult
	Track createdTrack  `json:"track"`
	Voice *createdTrack `json:"voice,omitempty"`
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
	folders, err := voiceFoldersLayout(svc)
	if err != nil {
		return nil, err
	}
	chapterTrackCreates.mu.Lock()
	defer chapterTrackCreates.mu.Unlock()
	// Read after the lock: a create that held it may have linked this chapter.
	_, links, err := chapterLinksFor(svc, chapterID)
	if err != nil {
		return nil, err
	}
	present, known := projectTracksNow(ctx, svc)
	if refusal, refused := alreadyLinked(name, links, chapterTrackCreates.made, present, known); refused {
		return refusal, nil
	}
	if taken, ok := trackNamed(present, title); ok {
		kind := "track"
		if taken.IsFolder {
			kind = "folder"
		}
		return trackCreateRefusedWith(trackCreateNameTaken, fmt.Sprintf("%s already has a %s named “%s”. Link that one with the picker instead of adding another.", name, kind, strings.TrimSpace(taken.Name))), nil
	}
	if creator == nil {
		return trackCreateUnavailable(name, title, support), nil
	}
	created, voice, err := createChapterTrack(ctx, creator, title, folders)
	if err != nil {
		return trackCreateError(name, title, err), nil
	}
	chapterTrackCreates.made[guidKey(created.GUID)] = created.Name
	set, err := setChapterLink(store, documentID, chapterID, storedTitle, created.GUID)
	if err != nil {
		why := strings.TrimRight(strings.TrimSpace(err.Error()), ".")
		return trackCreateRefusedWith(trackCreateLinkFailed, fmt.Sprintf("%s added the track “%s”, but its link could not be saved: %s. Choose “%s” in the chapter's picker to link it.", name, created.Name, why, created.Name)), nil
	}
	mappings, err := store.List(documentID)
	if err != nil {
		return nil, err
	}
	return chapterTrackCreated{
		Outcome:               trackCreateCreated,
		chapterTrackSetResult: chapterTrackSetResult{DocumentID: documentID, ChapterLinkSet: set, Mappings: mappings},
		Track:                 createdTrack{GUID: created.GUID, Name: created.Name, Index: created.Index},
		Voice:                 voice,
	}, nil
}

// projectTracksNow is the project's tracks as the engine has them now, or the saved file's when it is not answering (tracksLiveIn);
// known is false when neither could be read.
func projectTracksNow(ctx context.Context, svc hostServices) ([]tracks.Track, bool) {
	lister, support := trackListerFrom(svc)
	ctx, cancel := context.WithTimeout(ctx, tracksLiveTimeout)
	defer cancel()
	answer, err := tracksLiveIn(ctx, svc, lister, support, time.Now())
	if err != nil {
		return nil, false
	}
	return answer.Project.Tracks, true
}

// alreadyLinked refuses a create for a chapter linked to a track the project has, or to one this app added (made, not saved yet), naming
// it. A link to a track that is gone ("Track missing") is not refused: a new track replaces it. With the tracks unknown, any link refuses.
// made is chapterTrackCreates.made, read by a caller that holds its lock.
func alreadyLinked(name string, links []string, made map[string]string, present []tracks.Track, known bool) (chapterTrackCreateRefusal, bool) {
	for _, link := range links {
		trackName, found := made[guidKey(link)]
		for _, track := range present {
			if guidKey(track.GUID) == guidKey(link) {
				trackName, found = track.Name, true
			}
		}
		if found || !known {
			named := "a track"
			if strings.TrimSpace(trackName) != "" {
				named = fmt.Sprintf("“%s”", strings.TrimSpace(trackName))
			}
			return trackCreateRefusedWith(trackCreateAlreadyLinked, fmt.Sprintf("This chapter is already linked to %s in %s. Change or clear that link instead of adding another track.", named, name)), true
		}
	}
	return chapterTrackCreateRefusal{}, false
}

// trackNamed is the first of present whose name is the one a new track named title would get (trimmed, a line break or tab as a space,
// ignoring case): a plain track or a folder.
func trackNamed(present []tracks.Track, title string) (tracks.Track, bool) {
	want := oneLineName(title)
	for _, track := range present {
		if strings.EqualFold(oneLineName(track.Name), want) {
			return track, true
		}
	}
	return tracks.Track{}, false
}

// oneLineName is a track name as track_create stores it: trimmed, with each run of line breaks and tabs as one space.
func oneLineName(text string) string {
	return strings.TrimSpace(strings.Join(strings.FieldsFunc(text, func(r rune) bool { return r == '\r' || r == '\n' || r == '\t' }), " "))
}

// voiceFoldersLayout says whether the open project's chapters are folders of voices (voice-tracks.json); a project with no file is flat.
func voiceFoldersLayout(svc hostServices) (bool, error) {
	setup, err := voicetracks.New(voicetracks.Config{Project: svc.config.projectFolder}).Get()
	if err != nil {
		return false, err
	}
	return setup.Layout == voicetracks.LayoutFolders, nil
}

// createChapterTrack adds the chapter's track named title: a folder with a Narrator child when folders is set and the engine has folder
// tracks, else one plain track. voice is the child, nil for a plain track (and for a folder request an older script answered with one).
func createChapterTrack(ctx context.Context, creator dawport.TrackCreator, title string, folders bool) (dawport.CreatedTrack, *createdTrack, error) {
	folderCreator, ok := creator.(dawport.FolderTrackCreator)
	if !folders || !ok {
		created, err := creator.CreateTrack(ctx, title)
		return created, nil, err
	}
	created, err := folderCreator.CreateFolderTrack(ctx, title, narratorVoice)
	if err != nil || created.Child.GUID == "" {
		return created.Folder, nil, err
	}
	return created.Folder, &createdTrack{GUID: created.Child.GUID, Name: created.Child.Name, Index: created.Child.Index}, nil
}
