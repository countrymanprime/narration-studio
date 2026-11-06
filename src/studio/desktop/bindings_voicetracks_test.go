package main

import (
	"encoding/json"
	"testing"

	"desktop/internal/voicetracks"
)

func voiceTracksHost(t *testing.T) *Host {
	t.Helper()
	host, _ := bookmarksHost(t)
	return host
}

func decodeVoiceTracks(t *testing.T) func(string, error) voicetracks.State {
	return func(payload string, err error) voicetracks.State {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		var state voicetracks.State
		if err := json.Unmarshal([]byte(payload), &state); err != nil {
			t.Fatal(err)
		}
		return state
	}
}

// The goldens the UI's voice tracks schema is checked against: a project with nothing saved, and one switched to folders with a
// shared track and the Narrator voicing a character.
func TestVoiceTracksContractGoldens(t *testing.T) {
	host := voiceTracksHost(t)
	payload, err := host.VoiceTracksGet()
	checkBindingContract(t, "voice-tracks-empty", payload)
	if state := decodeVoiceTracks(t)(payload, err); state.Layout != "flat" || len(state.Tracks) != 0 {
		t.Fatalf("empty = %s", payload)
	}

	decodeVoiceTracks(t)(host.VoiceTracksSetLayout("folders"))
	decodeVoiceTracks(t)(host.VoiceTracksSetCharacters("Queen", []string{"queen-of-hearts"}))
	decodeVoiceTracks(t)(host.VoiceTracksSetCharacters(" Gardeners ", []string{"two", "five", "seven"}))
	payload, err = host.VoiceTracksSetNarrator("alice")
	checkBindingContract(t, "voice-tracks-set", payload)
	state := decodeVoiceTracks(t)(payload, err)
	if state.Layout != "folders" || state.NarratorCharacter != "alice" || len(state.Tracks) != 2 || state.Tracks[0].Track != "Gardeners" {
		t.Fatalf("set = %s", payload)
	}
}

func TestVoiceTracksRefuseAnUnknownLayoutAndABadTrackName(t *testing.T) {
	host := voiceTracksHost(t)
	if _, err := host.VoiceTracksSetLayout("nested"); err == nil {
		t.Fatal("an unknown layout was saved")
	}
	if _, err := host.VoiceTracksSetCharacters("a\nb", []string{"two"}); err == nil {
		t.Fatal("a track name with a line break was saved")
	}
	if state := decodeVoiceTracks(t)(host.VoiceTracksGet()); state.Layout != "flat" || len(state.Tracks) != 0 {
		t.Fatalf("a refused change was kept: %+v", state)
	}
}
