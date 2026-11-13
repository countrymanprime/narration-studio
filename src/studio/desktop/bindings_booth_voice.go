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

// The Booth's voices (docs/prds/booth-voice-tracks.prd.md, phase 4): a chapter linked to a REAPER folder whose direct children are
// its voices (whatever the layout toggle says, #3269). Record arms the voice the Booth chose (the Narrator child until one is chosen), never
// the folder, and BoothVoiceSet chooses another, switching a take this app started live (switch_voice). The page names a voice by
// its track GUID, which the host accepts only when it is a direct child of the chapter's one linked folder in the project as REAPER has it
// now, or the saved one when REAPER is not answering (threat-model row 5k).

const (
	boothVoiceFlat      = "flat"        // the project is flat, or the chapter is linked to a plain track
	boothVoiceNotAVoice = "not_a_voice" // the GUID is not a direct child of the chapter's folder
	boothVoiceNoVoices  = "no_voices"   // the chapter's folder has no tracks inside it
)

// BoothVoice is what BoothVoiceSet did. Outcome is "selected" (the next take records on TrackGUID), "switched" (the take this
// app started records on TrackGUID from At, project seconds) or "refused" (Reason and Message say why; nothing changed). A "selected"
// answer also says what happened in the DAW (#3429): Armed, the DAW's armed track is now the voice; or Reason and Message, the DAW
// refused to arm it (the Booth still records on the voice, but the DAW's arms are as they were); neither, the DAW was not asked
// (no DAW linked, or an engine with no armed tracks).
type BoothVoice struct {
	Outcome   string   `json:"outcome"`
	Reason    string   `json:"reason,omitempty"`
	Message   string   `json:"message,omitempty"`
	TrackGUID string   `json:"trackGuid,omitempty"`
	Armed     bool     `json:"armed,omitempty"`
	At        *float64 `json:"at,omitempty"`
	// Added is BoothVoiceGet's list of the voices the Booth added to the chapter's folder this session that the saved project does not
	// hold yet (BoothVoiceAdd): the page lists them after the folder's saved children.
	Added []BoothVoiceTrack `json:"added,omitempty"`
}

// linkGoneSentence is the one sentence a vanished link gets, in either layout, from the host, the Booth page (destination.ts) and the mock
// (boothVoiceMock.ts): the three must read the same.
const linkGoneSentence = "The track linked to this chapter is no longer in the project, so there is no voice to choose. Link it again in the audio engine panel."

// linkGoneRefusal is the refusal for a voice key or a voice read when the chapter's one link names a track the project no longer holds (as
// REAPER has it now), in either layout: one sentence, as the Engine panel's "Track missing" says it, not "records on one track" or "not
// linked to a folder". A folder this session made that the project does not hold yet is not gone (svc.boothVoices has its voices). Nil
// when the link is there.
func linkGoneRefusal(svc hostServices, link string, project *tracks.Project) *BoothVoice {
	if project == nil {
		read, err := liveSelectedProject(svc)
		if err != nil {
			return nil
		}
		project = &read
	}
	if _, ok := project.WithDescendants(link); ok || len(svc.boothVoices.addedTo(link)) > 0 {
		return nil
	}
	refused := boothVoiceRefused(readAloudTrackMissing, linkGoneSentence)
	return &refused
}

// noFolderForVoiceKeys is the refusal for a voice key in a Voice folders project whose chapter is not linked to a folder of voices.
const noFolderForVoiceKeys = "This chapter is not linked to a folder of voices, so there is no voice to choose. Link or create its folder first."

func boothVoiceRefused(reason, message string) BoothVoice {
	return BoothVoice{Outcome: "refused", Reason: reason, Message: message}
}

// chapterVoices is the voices of the chapter linked to link: the direct children of the folder link names, in REAPER's order, when
// link is a folder in the project as REAPER has it now (the saved one when REAPER is not answering); nil (record on link itself) otherwise.
func chapterVoices(svc hostServices, link string) ([]tracks.Track, bool, error) {
	return chapterVoicesIn(svc, link, nil)
}

// chapterVoicesIn is chapterVoices over project, one read of the live list a caller shares between its steps so they see one snapshot;
// nil reads it (liveSelectedProject).
func chapterVoicesIn(svc hostServices, link string, project *tracks.Project) ([]tracks.Track, bool, error) {
	setup, err := voicetracks.New(voicetracks.Config{Project: svc.config.projectFolder}).Get()
	if err != nil {
		return nil, false, err
	}
	if project == nil {
		read, err := liveSelectedProject(svc)
		if err != nil {
			return nil, false, err
		}
		project = &read
	}
	members, ok := project.WithDescendants(link)
	if !ok {
		// A folder this session made (ChapterTrackCreate) is not in the saved project until the narrator saves; its voices are the ones the app
		// added to it. Nothing added is a link to a track the project no longer has.
		var voices []tracks.Track
		for _, added := range svc.boothVoices.addedTo(link) {
			voices = append(voices, tracks.Track{GUID: added.GUID, Name: added.Name, Depth: 1})
		}
		return voices, len(voices) > 0, nil
	}
	if !members[0].IsFolder {
		return nil, false, nil
	}
	var voices []tracks.Track
	for _, member := range members[1:] {
		if member.Depth == members[0].Depth+1 {
			voices = append(voices, member)
		}
	}
	for _, added := range unsavedVoices(svc, *project, link) {
		voices = append(voices, tracks.Track{GUID: added.GUID, Name: added.Name, Depth: members[0].Depth + 1})
	}
	// A track some chapter is linked to is that chapter's own track (nested chapters), never a voice of this one, whatever the layout says:
	// a record start of this chapter must not arm another chapter's track (qa-breaker N3 on #3290). The chapter row's members
	// (chapterMember.IsVoice) apply the same rule through linkedTrackSet.
	voices = withoutLinkedElsewhere(svc, voices)
	// The folder's own structure decides, not the layout toggle: a chapter linked to a folder that holds tracks records on them whatever
	// the toggle says (#3269: the Engine page listed two voices and the Booth called the chapter single-track). A folder with none is a
	// voice folder only when the narrator switched Voice folders on, so a flat project's empty folder still records on itself.
	if len(voices) == 0 && setup.Layout != voicetracks.LayoutFolders {
		return nil, false, nil
	}
	return voices, true, nil
}

// withoutLinkedElsewhere is voices less the tracks some chapter is linked to.
func withoutLinkedElsewhere(svc hostServices, voices []tracks.Track) []tracks.Track {
	linked := linkedTrackGUIDs(svc)
	if len(linked) == 0 {
		return voices
	}
	kept := voices[:0:0]
	for _, voice := range voices {
		if !linked[strings.ToLower(voice.GUID)] {
			kept = append(kept, voice)
		}
	}
	return kept
}

// linkedTrackGUIDs is the set of every track some chapter is linked to (linkedTrackSet); empty when the links cannot be read.
func linkedTrackGUIDs(svc hostServices) map[string]bool {
	documentID, store, err := mappingContext(svc)
	if err != nil {
		return nil
	}
	mappings, err := store.List(documentID)
	if err != nil {
		return nil
	}
	return linkedTrackSet(mappings)
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

// voiceFor is the voice a take records on: chosen when it is one of voices, else the first Narrator track (named so, or renamed from it; as the Engine panel's
// Voices card gives it key 0), else the first voice.
func voiceFor(voices []tracks.Track, chosen string, setup voicetracks.State) string {
	for _, voice := range voices {
		if chosen != "" && strings.EqualFold(voice.GUID, chosen) {
			return voice.GUID
		}
	}
	for _, voice := range voices {
		if voicetracks.NamedNarrator(voice.Name) {
			return voice.GUID
		}
	}
	for _, voice := range voices {
		if setup.IsNarrator(voice.GUID, voice.Name) {
			return voice.GUID
		}
	}
	return voices[0].GUID
}

// recordTarget is the track a record start for chapterID arms: its one linked track, or in a Voice folders chapter the Booth's voice
// (svc.boothVoices) among the folder's children. A folder with no children is refused before anything is armed.
func recordTarget(svc hostServices, chapterID, link string) (string, *ReadAloudRecording, error) {
	return recordTargetIn(svc, chapterID, link, nil)
}

// recordTargetIn is recordTarget over project (see chapterVoicesIn).
func recordTargetIn(svc hostServices, chapterID, link string, project *tracks.Project) (string, *ReadAloudRecording, error) {
	voices, folder, err := chapterVoicesIn(svc, link, project)
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
	// A setup that cannot be read leaves the Narrator to be found by name, as before.
	setup, _ := voicetracks.New(voicetracks.Config{Project: svc.config.projectFolder}).Get()
	return voiceFor(voices, svc.boothVoices.For(chapterID), setup), nil, nil
}

// boothVoiceChoices is the voice the Booth chose for each chapter of one project, by chapter id: the track its next record start
// arms, and the one a take switched to. It holds only GUIDs the host checked are voices of the chapter, for the session only. A nil
// one (a Host never configured) holds nothing.
type boothVoiceChoices struct {
	// adding serialises BoothVoiceAdd from its checks to its answer, so two adds of one name cannot both pass the name check.
	adding sync.Mutex
	mu     sync.Mutex
	// +checklocks:mu
	byChapter map[string]string
	// The voices BoothVoiceAdd added, by the folder's GUID (upper case), in the order added.
	// +checklocks:mu
	added map[string][]BoothVoiceTrack
}

func newBoothVoiceChoices() *boothVoiceChoices {
	return &boothVoiceChoices{byChapter: map[string]string{}, added: map[string][]BoothVoiceTrack{}}
}

// whileAdding runs one add's checks, its track_create and its answer while no other add runs. A nil one runs it unguarded.
func (c *boothVoiceChoices) whileAdding(run func()) {
	if c == nil {
		run()
		return
	}
	c.adding.Lock()
	defer c.adding.Unlock()
	run()
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
	// One read of REAPER's list serves the voices and the vanished-link check, so they see one snapshot and one wait.
	project, err := liveSelectedProject(svc)
	if err != nil {
		return BoothVoice{}, err
	}
	voices, folder, err := chapterVoicesIn(svc, link, &project)
	if err != nil {
		return BoothVoice{}, err
	}
	if !folder {
		if gone := linkGoneRefusal(svc, link, &project); gone != nil {
			return *gone, nil
		}
		return boothVoiceRefused(boothVoiceFlat, notAFolderSentence(svc,
			"This chapter records on one track. Voice keys choose a voice for a chapter linked to a folder of voices (the audio engine panel).",
			noFolderForVoiceKeys)), nil
	}
	target := ""
	for _, voice := range voices {
		if strings.EqualFold(voice.GUID, guid) {
			target = voice.GUID
		}
	}
	if target == "" {
		return boothVoiceRefused(boothVoiceNotAVoice, "That track is not a voice of this chapter's folder. Its tracks may have changed in the DAW."), nil
	}
	name := readAloudAdapterName(svc)
	if !h.readAloudRecordingFor(chapterID) {
		if h.recordStarting() {
			// The take is arming and starting on the voice it had: arming another lane now would move it or drop the arms to put back.
			return boothVoiceRefused("starting", "A take is starting. Choose the voice once it has started."), nil
		}
		svc.boothVoices.choose(chapterID, target)
		chosen := armChosenLane(ctx, name, recorder, target)
		if status := reaperStatus(svc); recorder == nil && status.Connection == reaperNotRunning {
			// A linked DAW that is not answering cannot arm the lane: say so, the choice stands.
			chosen.Reason = reaperNotRunning
			chosen.Message = fmt.Sprintf("%s is not answering, so its armed track did not change. The Booth records on the voice you chose.", name)
		}
		return chosen, nil
	}
	switcher, ok := recorder.(dawport.VoiceSwitcher)
	if recorder == nil || !ok {
		return boothVoiceRefused(readAloudUnsupported, fmt.Sprintf("%s cannot change the recording voice during a take from this app. Stop, then choose the voice.", name)), nil
	}
	switched, err := switcher.SwitchVoice(ctx, target)
	if errors.Is(err, bridge.ErrNotOurRecording) {
		// The take is over (the narrator stopped it in the DAW): the voice is the next take's.
		h.clearReadAloudRecording()
		svc.boothVoices.choose(chapterID, target)
		return armChosenLane(ctx, name, recorder, target), nil
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

// armChosenLane makes the DAW's armed track the voice the Booth just chose, while no take runs, so the app and the DAW agree (#3429).
// The choice stands whatever the DAW answers: a refusal is in the answer's Reason and Message, never silent. A recorder that cannot arm
// a lane (none linked, or an engine without armed tracks) is not asked.
func armChosenLane(ctx context.Context, name string, recorder dawport.Recorder, target string) BoothVoice {
	chosen := BoothVoice{Outcome: "selected", TrackGUID: target}
	armer, ok := recorder.(dawport.LaneArmer)
	if recorder == nil || !ok {
		return chosen
	}
	if _, err := armer.ArmLane(ctx, target); err != nil {
		refusal := readAloudRecordRefusal(name, err)
		chosen.Reason = refusal.Reason
		switch refusal.Reason {
		case readAloudTrackMissing:
			chosen.Message = fmt.Sprintf("That voice track is no longer in the %s project, so it could not be armed. The Booth still records on it if it comes back.", name)
		case "timeout":
			chosen.Message = fmt.Sprintf("%s did not confirm within 3 seconds, so the armed track may not match the voice. The Booth records on the voice you chose.", name)
		default:
			chosen.Message = fmt.Sprintf("%s The Booth records on the voice you chose, but the armed track in %s did not change.", refusal.Message, name)
		}
		return chosen
	}
	chosen.Armed = true
	return chosen
}

// BoothVoiceSet chooses the voice the Booth records chapterID on, by the voice track's GUID, which must be a direct child of the
// chapter's one linked folder; during a take this app started it switches the take live. Sent only from a voice key or a press in
// the Booth's voice list.
func (h *Host) BoothVoiceSet(chapterID, trackGUID string) (string, error) {
	svc := h.services()
	ctx, cancel := context.WithTimeout(context.Background(), readAloudVoiceStartTimeout)
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
	// One read of REAPER's list serves all three steps, so they see one snapshot and one wait.
	project, err := liveSelectedProject(svc)
	if err != nil {
		return BoothVoice{}, err
	}
	_, folder, err := chapterVoicesIn(svc, link, &project)
	if err != nil {
		return BoothVoice{}, err
	}
	if !folder {
		if gone := linkGoneRefusal(svc, link, &project); gone != nil {
			return *gone, nil
		}
		return boothVoiceRefused(boothVoiceFlat, notAFolderSentence(svc, "This chapter records on one track.", noFolderForVoiceKeys)), nil
	}
	added := unsavedVoices(svc, project, link)
	guid, refusedStart, err := recordTargetIn(svc, chapterID, link, &project)
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
