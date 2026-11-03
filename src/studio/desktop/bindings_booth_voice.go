package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/tracks"
	"desktop/internal/voicetracks"
)

// The Booth's voices (docs/prds/booth-voice-tracks.prd.md, phase 4): in a Voice folders project a chapter is linked to a REAPER
// folder whose direct children are its voices. Record arms the voice the Booth chose (the Narrator child until one is chosen), never
// the folder, and BoothVoiceSet chooses another, switching a take this app started live (switch_voice). The page names a voice by
// its track GUID, which the host accepts only when it is a direct child of the chapter's one linked folder in the saved project
// (threat-model row 5k).

const (
	boothVoiceFlat      = "flat"        // the project is flat, or the chapter is linked to a plain track
	boothVoiceNotAVoice = "not_a_voice" // the GUID is not a direct child of the chapter's folder
	boothVoiceNoVoices  = "no_voices"   // the chapter's folder has no tracks inside it
)

// BoothVoice is what BoothVoiceSet did. Outcome is "selected" (the next take records on TrackGUID), "switched" (the take this
// app started records on TrackGUID from At, project seconds) or "refused" (Reason and Message say why; nothing changed).
type BoothVoice struct {
	Outcome   string   `json:"outcome"`
	Reason    string   `json:"reason,omitempty"`
	Message   string   `json:"message,omitempty"`
	TrackGUID string   `json:"trackGuid,omitempty"`
	At        *float64 `json:"at,omitempty"`
	// Added is BoothVoiceGet's list of the voices the Booth added to the chapter's folder this session that the saved project does not
	// hold yet (BoothVoiceAdd): the page lists them after the folder's saved children.
	Added []BoothVoiceTrack `json:"added,omitempty"`
}

func boothVoiceRefused(reason, message string) BoothVoice {
	return BoothVoice{Outcome: "refused", Reason: reason, Message: message}
}

// chapterVoices is the voices of the chapter linked to link: the direct children of the folder link names, in REAPER's order, when
// the project's layout is Voice folders and link is a folder in the saved project; nil (record on link itself) otherwise.
func chapterVoices(svc hostServices, link string) ([]tracks.Track, bool, error) {
	setup, err := voicetracks.New(voicetracks.Config{Project: svc.config.projectFolder}).Get()
	if err != nil {
		return nil, false, err
	}
	if setup.Layout != voicetracks.LayoutFolders {
		return nil, false, nil
	}
	project, err := selectedProject(svc)
	if err != nil {
		return nil, false, err
	}
	members, ok := project.WithDescendants(link)
	if !ok || !members[0].IsFolder {
		return nil, false, nil
	}
	var voices []tracks.Track
	for _, member := range members[1:] {
		if member.Depth == members[0].Depth+1 {
			voices = append(voices, member)
		}
	}
	for _, added := range unsavedVoices(svc, project, link) {
		voices = append(voices, tracks.Track{GUID: added.GUID, Name: added.Name, Depth: members[0].Depth + 1})
	}
	return voices, true, nil
}

// unsavedVoices is the voices the Booth added to the folder link this session (BoothVoiceAdd) that project, as saved, does not hold:
// REAPER has them, and the narrator has not saved since. Once saved they are read from the project like any other track.
func unsavedVoices(svc hostServices, project tracks.Project, link string) []BoothVoiceTrack {
	var unsaved []BoothVoiceTrack
	for _, added := range svc.boothVoices.addedTo(link) {
		if _, saved := project.WithDescendants(added.GUID); !saved {
			unsaved = append(unsaved, added)
		}
	}
	return unsaved
}

// voiceFor is the voice a take records on: chosen when it is one of voices, else the first named Narrator (as the Engine panel's
// Voices card gives it key 0), else the first voice.
func voiceFor(voices []tracks.Track, chosen string) string {
	for _, voice := range voices {
		if chosen != "" && strings.EqualFold(voice.GUID, chosen) {
			return voice.GUID
		}
	}
	for _, voice := range voices {
		if strings.EqualFold(strings.TrimSpace(voice.Name), "narrator") {
			return voice.GUID
		}
	}
	return voices[0].GUID
}

// recordTarget is the track a record start for chapterID arms: its one linked track, or in a Voice folders chapter the Booth's voice
// (svc.boothVoices) among the folder's children. A folder with no children is refused before anything is armed.
func recordTarget(svc hostServices, chapterID, link string) (string, *ReadAloudRecording, error) {
	voices, folder, err := chapterVoices(svc, link)
	if err != nil {
		return "", nil, err
	}
	if !folder {
		return link, nil, nil
	}
	if len(voices) == 0 {
		title, _, err := chapterLinksFor(svc, chapterID)
		if err != nil {
			return "", nil, err
		}
		refused := readAloudRefused(boothVoiceNoVoices, fmt.Sprintf("%q is linked to a folder with no voice tracks in it. Add a track inside the folder in %s, and save.", title, readAloudAdapterName(svc)))
		return "", &refused, nil
	}
	return voiceFor(voices, svc.boothVoices.For(chapterID)), nil, nil
}

// boothVoiceChoices is the voice the Booth chose for each chapter of one project, by chapter id: the track its next record start
// arms, and the one a take switched to. It holds only GUIDs the host checked are voices of the chapter, for the session only. A nil
// one (a Host never configured) holds nothing.
type boothVoiceChoices struct {
	mu sync.Mutex
	// +checklocks:mu
	byChapter map[string]string
	// The voices BoothVoiceAdd added, by the folder's GUID (upper case), in the order added.
	// +checklocks:mu
	added map[string][]BoothVoiceTrack
}

func newBoothVoiceChoices() *boothVoiceChoices {
	return &boothVoiceChoices{byChapter: map[string]string{}, added: map[string][]BoothVoiceTrack{}}
}

// add remembers that the Booth added voice to the folder folderGUID.
func (c *boothVoiceChoices) add(folderGUID string, voice BoothVoiceTrack) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	key := strings.ToUpper(folderGUID)
	c.added[key] = append(c.added[key], voice)
}

// addedTo is the voices the Booth added to the folder folderGUID this session, oldest first.
func (c *boothVoiceChoices) addedTo(folderGUID string) []BoothVoiceTrack {
	if c == nil {
		return nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]BoothVoiceTrack(nil), c.added[strings.ToUpper(folderGUID)]...)
}

// For is the voice chosen for chapterID, "" when none was.
func (c *boothVoiceChoices) For(chapterID string) string {
	if c == nil {
		return ""
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.byChapter[chapterID]
}

func (c *boothVoiceChoices) choose(chapterID, guid string) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.byChapter[chapterID] = guid
}

func (h *Host) readAloudRecordingActive() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.readAloudRecordingChapter != ""
}

func (h *Host) readAloudRecordingFor(chapterID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return chapterID != "" && h.readAloudRecordingChapter == chapterID
}

// boothVoiceSetIn chooses the voice guid names for chapterID: while this app records the chapter it switches the take live with
// recorder, otherwise the next record start arms it. guid must be a direct child of the chapter's one linked folder.
func (h *Host) boothVoiceSetIn(ctx context.Context, svc hostServices, recorder dawport.Recorder, chapterID, guid string) (BoothVoice, error) {
	link, refused, err := readAloudTrackGUID(svc, chapterID)
	if err != nil {
		return BoothVoice{}, err
	}
	if refused != nil {
		return boothVoiceRefused(refused.Reason, refused.Message), nil
	}
	voices, folder, err := chapterVoices(svc, link)
	if err != nil {
		return BoothVoice{}, err
	}
	if !folder {
		return boothVoiceRefused(boothVoiceFlat, "This chapter records on one track. Voice keys choose a voice in a Voice folders project, for a chapter linked to a folder (the audio engine panel)."), nil
	}
	target := ""
	for _, voice := range voices {
		if strings.EqualFold(voice.GUID, guid) {
			target = voice.GUID
		}
	}
	if target == "" {
		return boothVoiceRefused(boothVoiceNotAVoice, "That track is not a voice of this chapter's folder. Its tracks may have changed in the saved project."), nil
	}
	if !h.readAloudRecordingFor(chapterID) {
		svc.boothVoices.choose(chapterID, target)
		return BoothVoice{Outcome: "selected", TrackGUID: target}, nil
	}
	name := readAloudAdapterName(svc)
	switcher, ok := recorder.(dawport.VoiceSwitcher)
	if recorder == nil || !ok {
		return boothVoiceRefused(readAloudUnsupported, fmt.Sprintf("%s cannot change the recording voice during a take from this app. Stop, then choose the voice.", name)), nil
	}
	switched, err := switcher.SwitchVoice(ctx, target)
	if errors.Is(err, bridge.ErrNotOurRecording) {
		// The take is over (the narrator stopped it in the DAW): the voice is the next take's.
		h.clearReadAloudRecording()
		svc.boothVoices.choose(chapterID, target)
		return BoothVoice{Outcome: "selected", TrackGUID: target}, nil
	}
	var stale *bridge.TrackStaleError
	if errors.As(err, &stale) {
		return boothVoiceRefused(readAloudTrackMissing, fmt.Sprintf("That voice track is no longer in the %s project. The take goes on with the voice it had.", name)), nil
	}
	if err != nil {
		refused := readAloudRecordRefusal(name, err)
		return boothVoiceRefused(refused.Reason, refused.Message), nil
	}
	svc.boothVoices.choose(chapterID, target)
	at := switched.At
	return BoothVoice{Outcome: "switched", TrackGUID: target, At: &at}, nil
}

// BoothVoiceSet chooses the voice the Booth records chapterID on, by the voice track's GUID, which must be a direct child of the
// chapter's one linked folder; during a take this app started it switches the take live. Sent only from a voice key or a press in
// the Booth's voice list.
func (h *Host) BoothVoiceSet(chapterID, trackGUID string) (string, error) {
	svc := h.services()
	ctx, cancel := context.WithTimeout(context.Background(), readAloudRecordStartTimeout)
	defer cancel()
	return encodeBinding(h.boothVoiceSetIn(ctx, svc, recorderFrom(svc), chapterID, trackGUID))
}

// boothVoiceGetIn is the voice the next take of chapterID records on, or the take this app records now: the one svc.boothVoices
// chose (svc.boothVoices) when it is still a voice of the chapter's folder, else the Narrator voice, as a record start resolves
// it. A flat chapter, an unlinked one and a folder with no voices are refused with the reason a record start would give.
func boothVoiceGetIn(svc hostServices, chapterID string) (BoothVoice, error) {
	link, refused, err := readAloudTrackGUID(svc, chapterID)
	if err != nil {
		return BoothVoice{}, err
	}
	if refused != nil {
		return boothVoiceRefused(refused.Reason, refused.Message), nil
	}
	_, folder, err := chapterVoices(svc, link)
	if err != nil {
		return BoothVoice{}, err
	}
	if !folder {
		return boothVoiceRefused(boothVoiceFlat, "This chapter records on one track."), nil
	}
	project, err := selectedProject(svc)
	if err != nil {
		return BoothVoice{}, err
	}
	added := unsavedVoices(svc, project, link)
	guid, refusedStart, err := recordTarget(svc, chapterID, link)
	if err != nil {
		return BoothVoice{}, err
	}
	if refusedStart != nil {
		return boothVoiceRefused(refusedStart.Reason, refusedStart.Message), nil
	}
	return BoothVoice{Outcome: "selected", TrackGUID: guid, Added: added}, nil
}

// BoothVoiceGet is the voice the Booth records chapterID on, as the host holds it: the page shows this, never a voice it assumed,
// so a choice made before the Booth was left, or one a refused switch kept, is what the record bar says.
func (h *Host) BoothVoiceGet(chapterID string) (string, error) {
	return encodeBinding(boothVoiceGetIn(h.services(), chapterID))
}
