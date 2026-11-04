package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/dawport"
	"desktop/internal/dawport/dawporttest"
	"desktop/internal/voicetracks"
)

// #2838: the owner's chapters ended up nested in another chapter's folder after they relinked. Linking, relinking, unlinking, chapter
// sync, the layout switch and the Voices card's saves write only the app's own files: none of them may ask the DAW for anything that
// changes the project, and the saved project file stays byte-identical. Every DAW call goes through the DAW port's resolver, so a fake
// adapter that records each role call shows exactly what these paths can reach. A read the DAW answers without changing anything is
// allowed by name (readOnlyDAWCalls); every other call fails the test.
func TestLinkingRelinkingSyncingAndTheLayoutSwitchNeverChangeTheDAWProject(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	fake := dawporttest.NewFake(dawport.KindREAPER, dawporttest.Levels(dawport.Experimental))
	host.dawPortResolver = dawport.NewResolver(dawport.ResolverConfig{
		Adapter: fake,
		Runtime: func() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} },
	})
	rpp := filepath.Join(host.config.projectFolder, "Alice.rpp")
	before, err := os.ReadFile(rpp)
	if err != nil {
		t.Fatal(err)
	}
	const flat = "{22222222-2222-4222-8222-222222222222}"
	steps := []struct {
		name string
		call func() (string, error)
	}{
		{"link to a folder", func() (string, error) { return host.ChapterTrackSet(ids[1], voiceFolderTrack) }},
		{"relink to a flat track", func() (string, error) { return host.ChapterTrackSet(ids[1], flat) }},
		{"relink to a different folder", func() (string, error) { return host.ChapterTrackSet(ids[1], voiceEmptyFolder) }},
		{"unlink", func() (string, error) { return host.ChapterTrackUnlink(ids[1]) }},
		{"link again", func() (string, error) { return host.ChapterTrackSet(ids[1], voiceFolderTrack) }},
		{"unlink every chapter", func() (string, error) {
			for _, id := range ids {
				if _, err := host.ChapterTrackUnlink(id); err != nil {
					return "", err
				}
			}
			return "", nil
		}},
		{"relink every chapter", func() (string, error) {
			for i, id := range ids {
				target := []string{voiceFolderTrack, flat, voiceEmptyFolder}[i%3]
				if _, err := host.ChapterTrackSet(id, target); err != nil {
					return "", err
				}
			}
			return "", nil
		}},
		{"confirm a match", func() (string, error) { return host.ChapterTrackMapConfirm(flat, ids[2]) }},
		{"match a chapter", func() (string, error) { return host.ChapterTrackMatch(ids[0]) }},
		{"list the links", host.ChapterTrackLinks},
		{"list the map", host.ChapterTrackMapList},
		{"chapter sync on", func() (string, error) { return host.ChapterSyncSetEnabled(true) }},
		{"chapter sync state", host.ChapterSyncState},
		{"chapter sync preview", host.ChapterSyncPreview},
		{"chapter sync off", func() (string, error) { return host.ChapterSyncSetEnabled(false) }},
		{"layout flat", func() (string, error) { return host.VoiceTracksSetLayout(voicetracks.LayoutFlat) }},
		{"layout folders", func() (string, error) { return host.VoiceTracksSetLayout(voicetracks.LayoutFolders) }},
		{"assign characters", func() (string, error) { return host.VoiceTracksSetCharacters("Queen", []string{"queen"}) }},
		{"set the narrator", func() (string, error) { return host.VoiceTracksSetNarrator("") }},
		{"read the voice setup", host.VoiceTracksGet},
		{"read the booth voice", func() (string, error) { return host.BoothVoiceGet(ids[0]) }},
	}
	for _, step := range steps {
		if _, err := step.call(); err != nil {
			t.Logf("%s: %v (an error is fine; a write is not)", step.name, err)
		}
		if calls := dawWrites(fake.Calls()); len(calls) > 0 {
			t.Fatalf("%s asked the DAW for %v; linking, syncing and the voice setup may only read the DAW", step.name, calls)
		}
	}
	after, err := os.ReadFile(rpp)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(before, after) {
		t.Fatalf("the saved project changed:\nbefore:\n%s\nafter:\n%s", before, after)
	}
	if strings.Count(string(after), "<TRACK") != strings.Count(string(before), "<TRACK") {
		t.Fatal("the track count changed")
	}
	// The control: the one path that does change the project, the narrator's own "Create a new track" press, reaches the fake through the
	// same resolver, so an empty call list above means those paths asked for nothing, not that the fake records nothing.
	// (The fake's new track has no GUID, so the link that follows it fails; only the DAW call matters here.)
	_, _ = host.ChapterTrackCreate(ids[1])
	if calls := dawWrites(fake.Calls()); len(calls) != 1 || calls[0] != "track_create.CreateTrack" {
		t.Fatalf("the create press reached the DAW as %v, want one track_create.CreateTrack", calls)
	}
}

// readOnlyDAWCalls are the role calls the DAW answers without changing the project: listing the links reads REAPER's live track list
// (tracks_read, #2840), which opens no undo block and sets nothing (narration_tracks_read.lua, tracks_read_test.lua).
var readOnlyDAWCalls = map[string]bool{"tracks_read.ReadTracks": true}

// dawWrites is calls without the read-only ones, in order.
func dawWrites(calls []string) []string {
	var out []string
	for _, call := range calls {
		if !readOnlyDAWCalls[call] {
			out = append(out, call)
		}
	}
	return out
}
