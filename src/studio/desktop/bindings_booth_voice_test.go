package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/dawport"
	"desktop/internal/voicetracks"
)

const (
	voiceFolderTrack   = "{AAAAAAAA-0000-4000-8000-000000000001}"
	voiceNarratorTrack = "{AAAAAAAA-0000-4000-8000-000000000002}"
	voiceQueenTrack    = "{AAAAAAAA-0000-4000-8000-000000000003}"
	voiceEmptyFolder   = "{AAAAAAAA-0000-4000-8000-000000000004}"
)

// A chapter folder whose voices are Queen then Narrator (the Narrator is the default wherever it sits), a flat chapter track, and a
// folder opened on the last track, so it has no tracks inside it.
const voiceFolderRpp = `<REAPER_PROJECT 0.1 "7.82/x64" 1789000000
  <TRACK ` + voiceFolderTrack + `
    NAME "Chapter 1"
    ISBUS 1 1
    TRACKID ` + voiceFolderTrack + `
  >
  <TRACK ` + voiceQueenTrack + `
    NAME "Queen"
    ISBUS 0 0
    TRACKID ` + voiceQueenTrack + `
  >
  <TRACK ` + voiceNarratorTrack + `
    NAME " narrator "
    ISBUS 2 -1
    TRACKID ` + voiceNarratorTrack + `
  >
  <TRACK {22222222-2222-4222-8222-222222222222}
    NAME "Chapter II"
    ISBUS 0 0
    TRACKID {22222222-2222-4222-8222-222222222222}
  >
  <TRACK ` + voiceEmptyFolder + `
    NAME "Chapter 2"
    ISBUS 1 1
    TRACKID ` + voiceEmptyFolder + `
  >
>
`

// newVoiceFolderHost is a Voice folders project whose first chapter is linked to its folder of voices.
func newVoiceFolderHost(t *testing.T, layout string) (*Host, []string) {
	t.Helper()
	host, ids := newTestHostForChapterMatch(t)
	folder := host.config.projectFolder
	if err := os.WriteFile(filepath.Join(folder, "Alice.rpp"), []byte(voiceFolderRpp), 0o600); err != nil {
		t.Fatal(err)
	}
	linkChapter(t, host, ids[0], voiceFolderTrack)
	if _, err := voicetracks.New(voicetracks.Config{Project: folder}).SetLayout(layout); err != nil {
		t.Fatal(err)
	}
	host.reachability = liveReachability()
	host.navigation = &findingNavigation{navigator: &fakeNavigator{}}
	return host, ids
}

// fakeVoiceRecorder is a Recorder that can also switch voice mid-take.
type fakeVoiceRecorder struct {
	fakeRecorder
	switched  []string
	switchErr error
}

var _ dawport.VoiceSwitcher = (*fakeVoiceRecorder)(nil)

func (f *fakeVoiceRecorder) SwitchVoice(_ context.Context, guid string) (dawport.VoiceSwitched, error) {
	f.calls = append(f.calls, "SwitchVoice")
	f.switched = append(f.switched, guid)
	if f.switchErr != nil {
		return dawport.VoiceSwitched{}, f.switchErr
	}
	return dawport.VoiceSwitched{TrackGUID: guid, At: 42.5}, nil
}

func boothVoiceSet(t *testing.T, host *Host, recorder dawport.Recorder, chapterID, guid string) BoothVoice {
	t.Helper()
	got, err := host.boothVoiceSetIn(context.Background(), host.services(), recorder, chapterID, guid)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func recordStartWithVoice(t *testing.T, host *Host, recorder dawport.Recorder, chapterID string) ReadAloudRecording {
	t.Helper()
	result, err := readAloudRecordStartIn(context.Background(), host.servicesForRecording(chapterID), recorder, nil, chapterID)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestARecordStartInAVoiceFolderArmsTheNarratorVoiceNotTheFolder(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	fake := &fakeRecorder{}
	result := recordStartWithVoice(t, host, fake, ids[0])
	if result.Outcome != "started" || fake.armGUID != voiceNarratorTrack || fake.startGUID != voiceNarratorTrack {
		t.Fatalf("result %+v, armed %q, started %q; want the Narrator voice, never the folder", result, fake.armGUID, fake.startGUID)
	}
}

func TestAVoiceChosenWhileStoppedIsTheOneTheNextTakeArms(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	got := boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], strings.ToLower(voiceQueenTrack))
	if got.Outcome != "selected" || got.TrackGUID != voiceQueenTrack {
		t.Fatalf("got %+v", got)
	}
	fake := &fakeRecorder{}
	recordStartWithVoice(t, host, fake, ids[0])
	if fake.armGUID != voiceQueenTrack {
		t.Fatalf("armed %q, want the chosen Queen voice", fake.armGUID)
	}
	if other := recordStartWithVoice(t, host, &fakeRecorder{}, ids[1]); other.Outcome == "started" {
		t.Fatalf("a choice for one chapter reached another: %+v", other)
	}
}

func TestEachChapterKeepsItsOwnVoice(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], voiceQueenTrack)
	host.chooseBoothVoice(ids[1], voiceNarratorTrack) // another chapter's choice, as BoothVoiceSet stores it
	fake := &fakeRecorder{}
	recordStartWithVoice(t, host, fake, ids[0])
	if fake.armGUID != voiceQueenTrack {
		t.Fatalf("armed %q: choosing a voice for another chapter forgot this one's", fake.armGUID)
	}
}

func TestOnlyAVoiceOfTheChaptersFolderCanBeChosen(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	for _, guid := range []string{voiceFolderTrack, voiceEmptyFolder, "{22222222-2222-4222-8222-222222222222}", "", "{not-a-guid}"} {
		got := boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], guid)
		if got.Outcome != "refused" || got.Reason != boothVoiceNotAVoice {
			t.Fatalf("%q: got %+v, want refused as not a voice", guid, got)
		}
	}
	fake := &fakeRecorder{}
	recordStartWithVoice(t, host, fake, ids[0])
	if fake.armGUID != voiceNarratorTrack {
		t.Fatalf("a refused choice changed the voice: armed %q", fake.armGUID)
	}
}

func TestAFlatProjectHasNoVoicesToChoose(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFlat)
	got := boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], voiceQueenTrack)
	if got.Outcome != "refused" || got.Reason != boothVoiceFlat || !strings.Contains(got.Message, "Voice folders") {
		t.Fatalf("got %+v", got)
	}
}

func TestAVoiceChosenDuringATakeSwitchesItLive(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	fake := &fakeVoiceRecorder{}
	host.setReadAloudRecording(ids[0], fake)
	got := boothVoiceSet(t, host, fake, ids[0], voiceQueenTrack)
	if got.Outcome != "switched" || got.TrackGUID != voiceQueenTrack || got.At == nil || *got.At != 42.5 {
		t.Fatalf("got %+v", got)
	}
	if len(fake.switched) != 1 || fake.switched[0] != voiceQueenTrack {
		t.Fatalf("switched %v", fake.switched)
	}
}

func TestASwitchAfterTheTakeEndedOnlyChoosesTheVoice(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	fake := &fakeVoiceRecorder{switchErr: bridge.ErrNotOurRecording}
	host.setReadAloudRecording(ids[0], fake)
	got := boothVoiceSet(t, host, fake, ids[0], voiceQueenTrack)
	if got.Outcome != "selected" || got.TrackGUID != voiceQueenTrack {
		t.Fatalf("got %+v", got)
	}
	if host.readAloudRecordingActive() {
		t.Fatal("the recording the DAW says is over is still remembered")
	}
}

func TestASwitchTheDAWRefusesSaysWhyAndKeepsTheVoice(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	fake := &fakeVoiceRecorder{switchErr: &bridge.TrackStaleError{GUID: voiceQueenTrack}}
	host.setReadAloudRecording(ids[0], fake)
	got := boothVoiceSet(t, host, fake, ids[0], voiceQueenTrack)
	if got.Outcome != "refused" || got.Message == "" {
		t.Fatalf("got %+v", got)
	}
	start := &fakeRecorder{}
	host.clearReadAloudRecording()
	recordStartWithVoice(t, host, start, ids[0])
	if start.armGUID != voiceNarratorTrack {
		t.Fatalf("a refused switch changed the voice: armed %q", start.armGUID)
	}
}

func TestADAWThatCannotSwitchMidTakeSaysSo(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	plain := &fakeRecorder{}
	host.setReadAloudRecording(ids[0], plain)
	got := boothVoiceSet(t, host, plain, ids[0], voiceQueenTrack)
	if got.Outcome != "refused" || got.Reason != readAloudUnsupported {
		t.Fatalf("got %+v", got)
	}
}

func TestAChapterFolderWithNoVoicesIsRefusedBeforeAnythingIsArmed(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	linkChapter(t, host, ids[1], voiceEmptyFolder)
	fake := &fakeRecorder{}
	result := recordStartWithVoice(t, host, fake, ids[1])
	if result.Outcome != "refused" || result.Reason != boothVoiceNoVoices || len(fake.calls) != 0 {
		t.Fatalf("result %+v, calls %v", result, fake.calls)
	}
}

func TestAPlainTrackLinkInAVoiceFoldersProjectRecordsOnThatTrack(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	linkChapter(t, host, ids[1], "{22222222-2222-4222-8222-222222222222}")
	fake := &fakeRecorder{}
	recordStartWithVoice(t, host, fake, ids[1])
	if fake.armGUID != "{22222222-2222-4222-8222-222222222222}" {
		t.Fatalf("armed %q", fake.armGUID)
	}
}

func TestBoothVoiceSetAnswersJSON(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFlat)
	raw, err := host.BoothVoiceSet(ids[0], voiceQueenTrack)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(raw, `"outcome":"refused"`) {
		t.Fatalf("raw = %s", raw)
	}
}

func TestContractBoothVoice(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	answers := map[string]any{}
	answers["selected"] = boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], voiceQueenTrack)
	answers["not_a_voice"] = boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], voiceFolderTrack)
	answers["unlinked"] = boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[2], voiceQueenTrack)
	recording := &fakeVoiceRecorder{}
	host.setReadAloudRecording(ids[0], recording)
	answers["switched"] = boothVoiceSet(t, host, recording, ids[0], voiceNarratorTrack)
	answers["unsupported"] = boothVoiceSet(t, host, &fakeRecorder{}, ids[0], voiceQueenTrack)
	answers["track_missing"] = boothVoiceSet(t, host, &fakeVoiceRecorder{switchErr: &bridge.TrackStaleError{GUID: voiceQueenTrack}}, ids[0], voiceQueenTrack)
	host.clearReadAloudRecording()
	linkChapter(t, host, ids[1], voiceEmptyFolder)
	answers["record_start_no_voices"] = recordStartWithVoice(t, host, &fakeRecorder{}, ids[1])
	flat, flatIDs := newVoiceFolderHost(t, voicetracks.LayoutFlat)
	answers["flat"] = boothVoiceSet(t, flat, &fakeVoiceRecorder{}, flatIDs[0], voiceQueenTrack)
	contractfile.Check(t, "booth-voice", answers)
}
