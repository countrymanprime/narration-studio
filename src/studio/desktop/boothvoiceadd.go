package main

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/tracks"
	"desktop/internal/voicetracks"
)

// "Who is in Num N?" (docs/prds/booth-voice-tracks.prd.md, phase 5): the Booth adds a voice track for characters that have none. The
// track goes inside the chapter's linked folder as its last direct child (track_create with a parent, narration_track_create.lua), the
// characters are added to the track's name in voice-tracks.json, and the Booth chooses it, so the next take records on it. Sent only
// from the dialog's Add track press, never during this app's take: the page stops the take first.

// The refusal reasons only an add answers; the others are BoothVoiceSet's and ChapterTrackCreate's words.
const (
	boothVoiceNoName    = "no_name"    // the name is blank once cleaned
	boothVoiceNameTaken = "name_taken" // the chapter's folder already has a voice of that name
	boothVoiceInvalid   = "invalid"    // the name or the characters break voice-tracks.json's limits
)

// BoothVoiceTrack is a voice the Booth added this session that the saved project does not hold yet: the page lists it with the
// folder's saved children until the narrator saves in the DAW.
type BoothVoiceTrack struct {
	GUID string `json:"guid"`
	Name string `json:"name"`
}

// BoothVoiceAdded is what BoothVoiceAdd did. Outcome "added": TrackGUID and Name are the new voice, chosen for the next take.
// "refused": Reason and Message say why, and nothing was added or assigned.
type BoothVoiceAdded struct {
	Outcome   string `json:"outcome"`
	Reason    string `json:"reason,omitempty"`
	Message   string `json:"message,omitempty"`
	TrackGUID string `json:"trackGuid,omitempty"`
	Name      string `json:"name,omitempty"`
}

func boothVoiceAddRefused(reason, message string) BoothVoiceAdded {
	return BoothVoiceAdded{Outcome: "refused", Reason: reason, Message: message}
}

// cleanTrackName is a name as REAPER will store it: one line, trimmed, runs of space as one.
func cleanTrackName(name string) string {
	return strings.Join(strings.Fields(name), " ")
}

// boothVoiceAddIn adds a voice named name for characterIDs to chapterID's folder with creator (support says why it is nil), then
// assigns the characters and chooses the voice. Everything it can check is checked before anything is sent.
func (h *Host) boothVoiceAddIn(ctx context.Context, svc hostServices, creator dawport.TrackCreator, support dawport.Support, chapterID, name string, characterIDs []string) (added BoothVoiceAdded, err error) {
	// One add at a time: the name check must see a track an add running now is making.
	svc.boothVoices.whileAdding(func() {
		added, err = h.boothVoiceAddOne(ctx, svc, creator, support, chapterID, name, characterIDs)
	})
	return added, err
}

// boothVoiceAddOne is boothVoiceAddIn's work, run while no other add runs.
func (h *Host) boothVoiceAddOne(ctx context.Context, svc hostServices, creator dawport.TrackCreator, support dawport.Support, chapterID, name string, characterIDs []string) (BoothVoiceAdded, error) {
	link, refused, err := readAloudTrackGUID(svc, chapterID)
	if err != nil {
		return BoothVoiceAdded{}, err
	}
	if refused != nil {
		return boothVoiceAddRefused(refused.Reason, refused.Message), nil
	}
	voices, folder, err := chapterVoices(svc, link)
	if err != nil {
		return BoothVoiceAdded{}, err
	}
	if !folder {
		return boothVoiceAddRefused(boothVoiceFlat, notAFolderSentence(svc,
			"This chapter records on one track. Voice tracks are added to a chapter linked to a folder of voices (the audio engine panel).",
			"This chapter is not linked to a folder of voices, so a voice track cannot be added to it. Link or create its folder first.")), nil
	}
	engine := readAloudAdapterName(svc)
	name = cleanTrackName(name)
	if name == "" {
		return boothVoiceAddRefused(boothVoiceNoName, "The new track needs a name."), nil
	}
	if err := voicetracks.CheckAssignment(name, characterIDs); err != nil {
		return boothVoiceAddRefused(boothVoiceInvalid, fmt.Sprintf("That track name or list of characters is too long (at most %d characters in a name and %d characters on a track).", voicetracks.MaxTrackName, voicetracks.MaxCharacters)), nil
	}
	for _, voice := range voices {
		if strings.EqualFold(cleanTrackName(voice.Name), name) {
			return boothVoiceAddRefused(boothVoiceNameTaken, fmt.Sprintf("This chapter already has a track named “%s”. Choose it, or give the new track another name.", cleanTrackName(voice.Name))), nil
		}
	}
	if h.readAloudRecordingActive() {
		return boothVoiceAddRefused(trackCreateRecording, fmt.Sprintf("%s is recording. Stop the take, then add the track.", engine)), nil
	}
	if creator == nil {
		unavailable := trackCreateUnavailable(engine, name, support, "track")
		return boothVoiceAddRefused(unavailable.Reason, unavailable.Message), nil
	}
	child, ok := creator.(dawport.ChildTrackCreator)
	if !ok {
		return boothVoiceAddRefused(trackCreateUnsupported, fmt.Sprintf("%s cannot add a track inside a folder from this app. Add a track named “%s” inside the chapter's folder in %s.", engine, name, engine)), nil
	}
	before := svc.boothVoices.For(chapterID)
	var created bridge.CreatedTrack
	adopted := false
	if svc.boothVoices.isPending(link, name) {
		// An earlier create of this name was not confirmed: look before sending another (#3645). The list is read again, never the cached one.
		svc.tracksCache.Invalidate()
		if found, ok := h.adoptCreatedVoice(svc, link, name, voices); ok {
			created, adopted = found, true
			svc.boothVoices.clearPending(link, name)
		} else {
			return boothVoiceAddRefused(refusedFailed, fmt.Sprintf("%s took an earlier request for a track named “%s” and has not confirmed it. Look in %s: it may already be there. If it is not, try again in a minute.", engine, name, engine)), nil
		}
	}
	if !adopted {
		created, err = child.CreateChildTrack(ctx, name, link)
		svc.tracksCache.Invalidate() // a create that timed out may still have made the track: the read-back below reads REAPER again
	}
	if errors.Is(err, bridge.ErrNoAnswer) || errors.Is(err, context.DeadlineExceeded) {
		// REAPER did not confirm in time (#3645; ErrAnswerLate: it had read the command): the track may well exist. Read the folder back and
		// adopt the voice that was not there before, so a slow answer is not an error and a second press does not make a second track.
		if found, ok := h.adoptCreatedVoice(svc, link, name, voices); ok {
			created, err = found, nil
		} else if errors.Is(err, bridge.ErrAnswerLate) {
			svc.boothVoices.markPending(link, name)
		}
	}
	var stale *bridge.TrackStaleError
	if errors.As(err, &stale) {
		return boothVoiceAddRefused(readAloudTrackMissing, fmt.Sprintf("This chapter's folder is no longer in the %s project. Link the chapter again in the audio engine panel.", engine)), nil
	}
	if err != nil {
		refusal := trackCreateError(engine, name, err, "track")
		return boothVoiceAddRefused(refusal.Reason, strings.Replace(refusal.Message, ", then link it.", " inside the chapter's folder.", 1)), nil
	}
	added := cleanTrackName(created.Name)
	if added == "" {
		added = name
	}
	svc.boothVoices.add(link, BoothVoiceTrack{GUID: created.GUID, Name: added})
	if _, err := voicetracks.New(voicetracks.Config{Project: svc.config.projectFolder, Reporter: h.persist}).AddTrackCharacters(added, characterIDs); err != nil {
		// The track is in the DAW: the narrator is told the assignment did not save, and the voice is still chosen.
		h.chooseAddedVoice(svc, chapterID, before, created.GUID)
		return BoothVoiceAdded{}, fmt.Errorf("the track “%s” was added, but its characters were not saved: %w", added, err)
	}
	h.chooseAddedVoice(svc, chapterID, before, created.GUID)
	return BoothVoiceAdded{Outcome: "added", TrackGUID: created.GUID, Name: added}, nil
}

// chooseAddedVoice chooses the voice just added unless something else moved while the create waited: a voice the narrator chose meanwhile
// or a take that started keeps its place, and the new voice is only listed (#3645: a late add must not steal the selection).
func (h *Host) chooseAddedVoice(svc hostServices, chapterID, before, guid string) {
	if svc.boothVoices.For(chapterID) != before || h.readAloudRecordingActive() || h.recordStarting() {
		return
	}
	svc.boothVoices.choose(chapterID, guid)
}

// adoptCreatedVoice reads chapter folder link back from REAPER and returns the voice named name that was not among before, the
// direct children the folder had when the add began.
func (h *Host) adoptCreatedVoice(svc hostServices, link, name string, before []tracks.Track) (bridge.CreatedTrack, bool) {
	known := map[string]bool{}
	for _, voice := range before {
		known[strings.ToLower(voice.GUID)] = true
	}
	now, folder, err := chapterVoices(svc, link)
	if err != nil || !folder {
		return bridge.CreatedTrack{}, false
	}
	for _, voice := range now {
		if !known[strings.ToLower(voice.GUID)] && strings.EqualFold(cleanTrackName(voice.Name), name) {
			return bridge.CreatedTrack{GUID: voice.GUID, Name: voice.Name}, true
		}
	}
	return bridge.CreatedTrack{}, false
}

// BoothVoiceAdd adds a voice track named name inside chapterID's linked folder, after its last child, assigns characterIDs (Story
// Bible ids) to it and chooses it for the next take. Sent only from the Booth's "Who is in Num N?" dialog, while no take of this app
// runs. The DAW's undo takes the track back; the project is not saved.
func (h *Host) BoothVoiceAdd(chapterID, name string, characterIDs []string) (string, error) {
	svc := h.services()
	creator, support := trackCreatorFrom(svc)
	ctx, cancel := context.WithTimeout(context.Background(), laneCommandTimeout)
	defer cancel()
	return encodeBinding(h.boothVoiceAddIn(ctx, svc, creator, support, chapterID, name, characterIDs))
}
