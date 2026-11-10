package main

import (
	"context"
	"errors"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/voicetracks"
)

const createdVoiceGUID = "{00000004-0000-4000-8000-000000000004}"

// fakeFolderCreator is an engine with folder tracks (REAPER): it adds a plain track or a chapter folder with one child. older answers a
// folder request as a script older than the chapter folder does: a plain track and no child.
type fakeFolderCreator struct {
	fakeCreator
	folders [][2]string
	older   bool
}

var _ dawport.FolderTrackCreator = (*fakeFolderCreator)(nil)

func (f *fakeFolderCreator) CreateFolderTrack(_ context.Context, name, childName string) (dawport.CreatedFolder, error) {
	f.folders = append(f.folders, [2]string{name, childName})
	if f.err != nil {
		return dawport.CreatedFolder{}, f.err
	}
	folder := dawport.CreatedTrack{GUID: createdTrackGUID, Name: name, Index: f.index}
	if f.older {
		return dawport.CreatedFolder{Folder: folder}, nil
	}
	return dawport.CreatedFolder{Folder: folder, Child: dawport.CreatedTrack{GUID: createdVoiceGUID, Name: childName, Index: f.index + 1}}, nil
}

func setLayout(t *testing.T, host *Host, layout string) {
	t.Helper()
	if _, err := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder}).SetLayout(layout); err != nil {
		t.Fatal(err)
	}
}

func TestChapterTrackCreateInVoiceFoldersAddsAFolderWithANarratorAndLinksTheFolder(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	creator := &fakeFolderCreator{fakeCreator: fakeCreator{index: 4}}
	result := createTrack(t, host, creator, createAvailable(), ids[1])

	if len(creator.names) != 0 || len(creator.folders) != 1 || creator.folders[0] != [2]string{"Chapter II: The Pool of Tears", "Narrator"} {
		t.Fatalf("plain %q, folders %q: want one folder named after the chapter with a Narrator", creator.names, creator.folders)
	}
	if result["outcome"] != "created" {
		t.Fatalf("result = %v", result)
	}
	track, _ := result["track"].(map[string]any)
	if track["guid"] != createdTrackGUID || track["name"] != "Chapter II: The Pool of Tears" || track["index"] != float64(4) {
		t.Fatalf("track = %v", track)
	}
	voice, _ := result["voice"].(map[string]any)
	if voice["guid"] != createdVoiceGUID || voice["name"] != "Narrator" || voice["index"] != float64(5) {
		t.Fatalf("voice = %v", voice)
	}
	_, links, err := chapterLinksFor(host.services(), ids[1])
	if err != nil || len(links) != 1 || links[0] != createdTrackGUID {
		t.Fatalf("links = %v, %v: want the folder, never its Narrator", links, err)
	}
}

func TestChapterTrackCreateInAFlatProjectKeepsAddingAPlainTrack(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFlat)
	creator := &fakeFolderCreator{}
	result := createTrack(t, host, creator, createAvailable(), ids[0])
	if len(creator.names) != 1 || len(creator.folders) != 0 {
		t.Fatalf("plain %q, folders %q: a flat project adds one plain track", creator.names, creator.folders)
	}
	if _, present := result["voice"]; present {
		t.Fatalf("a plain track's answer carries a voice: %v", result)
	}
}

func TestChapterTrackCreateWithNoVoiceSetupIsFlat(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	creator := &fakeFolderCreator{}
	createTrack(t, host, creator, createAvailable(), ids[0])
	if len(creator.names) != 1 || len(creator.folders) != 0 {
		t.Fatalf("plain %q, folders %q: a project with no voice-tracks.json is flat", creator.names, creator.folders)
	}
}

func TestChapterTrackCreateInVoiceFoldersOnAnEngineWithoutFoldersAddsAPlainTrack(t *testing.T) {
	// Audacity has no folder tracks: its Engine panel is flat whatever the project's layout, so the chapter gets one track.
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	creator := &fakeCreator{}
	result := createTrack(t, host, creator, createAvailable(), ids[0])
	if len(creator.names) != 1 || result["outcome"] != "created" {
		t.Fatalf("names %q, result %v", creator.names, result)
	}
	if _, present := result["voice"]; present {
		t.Fatalf("a plain track's answer carries a voice: %v", result)
	}
}

func TestChapterTrackCreateFromAnOlderScriptLinksThePlainTrackItAdded(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	result := createTrack(t, host, &fakeFolderCreator{older: true}, createAvailable(), ids[0])
	if result["outcome"] != "created" {
		t.Fatalf("result = %v", result)
	}
	if _, present := result["voice"]; present {
		t.Fatalf("an older script's plain track is answered with a voice: %v", result)
	}
	if _, links, err := chapterLinksFor(host.services(), ids[0]); err != nil || len(links) != 1 || links[0] != createdTrackGUID {
		t.Fatalf("links = %v, %v", links, err)
	}
}

func TestChapterTrackCreateFolderRefusalsAreTheTracksAndLinkNothing(t *testing.T) {
	cases := []struct {
		err    error
		reason string
	}{
		{bridge.ErrRecording, "recording"},
		{bridge.ErrNoAnswer, "not_running"},
		{bridge.ErrUnavailable, "standalone"},
		{errors.New("boom"), "failed"},
	}
	for _, c := range cases {
		host, ids := newTestHostForChapterMatch(t)
		setLayout(t, host, voicetracks.LayoutFolders)
		result := createTrack(t, host, &fakeFolderCreator{fakeCreator: fakeCreator{err: c.err}}, createAvailable(), ids[0])
		if result["outcome"] != "refused" || result["reason"] != c.reason {
			t.Fatalf("%v: result = %v, want reason %q", c.err, result, c.reason)
		}
		if _, links, err := chapterLinksFor(host.services(), ids[0]); err != nil || len(links) != 0 {
			t.Fatalf("%v: a refusal linked the chapter: %v, %v", c.err, links, err)
		}
	}
}

func TestChapterTrackCreateReadsTheLayoutAtThePress(t *testing.T) {
	// The layout switched after the page drew its button: the host's layout at the press decides, and the answer says which was made.
	host, ids := newTestHostForChapterMatch(t)
	setLayout(t, host, voicetracks.LayoutFolders)
	creator := &fakeFolderCreator{}
	if result := createTrack(t, host, creator, createAvailable(), ids[0]); result["voice"] == nil {
		t.Fatalf("folders: %v", result)
	}
	setLayout(t, host, voicetracks.LayoutFlat)
	if result := createTrack(t, host, creator, createAvailable(), ids[1]); result["voice"] != nil {
		t.Fatalf("flat: %v", result)
	}
	if len(creator.folders) != 1 || len(creator.names) != 1 {
		t.Fatalf("folders %q, plain %q", creator.folders, creator.names)
	}
}

// The owner's flow (#3271): a Voice folders project whose chapter has no track, the narrator accepts "Create a new folder", and presses Record before
// saving. The folder and its Narrator are in the engine only, so the saved project cannot say which voice the chapter records on.
func TestARecordStartRightAfterCreatingAChapterFolderArmsItsNarratorNotTheFolder(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	createTrack(t, host, &fakeFolderCreator{fakeCreator: fakeCreator{index: 4}}, createAvailable(), ids[1])

	fake := &fakeRecorder{}
	result := recordStartWithVoice(t, host, fake, ids[1])
	if result.Outcome != "started" || fake.armGUID != createdVoiceGUID || fake.startGUID != createdVoiceGUID {
		t.Fatalf("result %+v, armed %q, started %q; want the new Narrator %s, never the folder %s", result, fake.armGUID, fake.startGUID, createdVoiceGUID, createdTrackGUID)
	}
	got, err := boothVoiceGetIn(host.services(), ids[1])
	if err != nil || len(got.Added) != 1 || got.Added[0].GUID != createdVoiceGUID {
		t.Fatalf("BoothVoiceGet = %+v, %v: want the Narrator the app made listed as added", got, err)
	}
}

func TestARecordStartAfterCreatingAPlainTrackArmsThatTrack(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFlat)
	createTrack(t, host, &fakeFolderCreator{}, createAvailable(), ids[1])

	fake := &fakeRecorder{}
	result := recordStartWithVoice(t, host, fake, ids[1])
	if result.Outcome != "started" || fake.armGUID != createdTrackGUID {
		t.Fatalf("result %+v, armed %q; a flat chapter records on its one track %s", result, fake.armGUID, createdTrackGUID)
	}
}
