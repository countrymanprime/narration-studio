package main

import "desktop/internal/voicetracks"

// The project's voice setup for recording each character on its own REAPER track (docs/prds/booth-voice-tracks.prd.md): the
// chapter layout, flat or folders of voices, the characters assigned to a voice track by its name, and the character the Narrator
// track also voices. Kept in <project>/<app>/voice-tracks.json (internal/voicetracks). Each binding answers the whole setup.

// VoiceTracksGet answers the project's voice setup: flat with no assignments when nothing was saved.
func (h *Host) VoiceTracksGet() (string, error) {
	return encodeBinding(h.voiceTracks().Get())
}

// VoiceTracksSetLayout sets the project's chapter layout, "flat" or "folders". It converts no chapter.
func (h *Host) VoiceTracksSetLayout(layout string) (string, error) {
	return encodeBinding(h.voiceTracks().SetLayout(layout))
}

// VoiceTracksSetCharacters replaces the characters assigned to the voice track named track (as REAPER shows it, trimmed); an empty
// list clears the assignment, so the track matches characters by name again. Character ids are the Story Bible's.
func (h *Host) VoiceTracksSetCharacters(track string, characterIDs []string) (string, error) {
	return encodeBinding(h.voiceTracks().SetTrackCharacters(track, characterIDs))
}

// VoiceTracksSetNarrator sets the character the Narrator track also voices (a first-person book), or clears it with "".
func (h *Host) VoiceTracksSetNarrator(characterID string) (string, error) {
	return encodeBinding(h.voiceTracks().SetNarratorCharacter(characterID))
}

// voiceTracks builds the store over one services() snapshot, so a project switch mid-call never mixes two projects.
func (h *Host) voiceTracks() *voicetracks.Service {
	svc := h.services()
	return voicetracks.New(voicetracks.Config{Project: svc.config.projectFolder, Reporter: h.persist})
}
