package main

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
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
	host.boothVoices = newBoothVoiceChoices()
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
	result, err := readAloudRecordStartIn(context.Background(), host.services(), recorder, nil, chapterID)
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
	host.services().boothVoices.choose(ids[1], voiceNarratorTrack) // another chapter's choice, as BoothVoiceSet stores it
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

func boothVoiceGet(t *testing.T, host *Host, chapterID string) BoothVoice {
	t.Helper()
	got, err := boothVoiceGetIn(host.services(), chapterID)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestTheBoothReadsTheVoiceTheHostRecordsOn(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	if got := boothVoiceGet(t, host, ids[0]); got.Outcome != "selected" || got.TrackGUID != voiceNarratorTrack {
		t.Fatalf("before a choice: got %+v, want the Narrator voice", got)
	}
	// A choice made, then the Booth left and opened again: the read is the choice, as the next record start arms it.
	boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], voiceQueenTrack)
	if got := boothVoiceGet(t, host, ids[0]); got.TrackGUID != voiceQueenTrack {
		t.Fatalf("after choosing Queen: got %+v", got)
	}
	fake := &fakeRecorder{}
	recordStartWithVoice(t, host, fake, ids[0])
	if fake.armGUID != voiceQueenTrack {
		t.Fatalf("the read said Queen, the start armed %q", fake.armGUID)
	}
	// A switch the DAW refused keeps the voice the take has, and the read says so.
	recording := &fakeVoiceRecorder{switchErr: &bridge.TrackStaleError{GUID: voiceNarratorTrack}}
	host.setReadAloudRecording(ids[0], recording)
	boothVoiceSet(t, host, recording, ids[0], voiceNarratorTrack)
	if got := boothVoiceGet(t, host, ids[0]); got.TrackGUID != voiceQueenTrack {
		t.Fatalf("after a refused switch: got %+v, want the take's Queen voice", got)
	}
	host.clearReadAloudRecording()
}

func TestTheVoiceReadRefusesWhatARecordStartWouldRefuse(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	if got := boothVoiceGet(t, host, ids[2]); got.Outcome != "refused" {
		t.Fatalf("unlinked chapter: got %+v", got)
	}
	linkChapter(t, host, ids[1], voiceEmptyFolder)
	if got := boothVoiceGet(t, host, ids[1]); got.Outcome != "refused" || got.Reason != boothVoiceNoVoices {
		t.Fatalf("empty folder: got %+v", got)
	}
	flat, flatIDs := newVoiceFolderHost(t, voicetracks.LayoutFlat)
	if got := boothVoiceGet(t, flat, flatIDs[0]); got.Outcome != "refused" || got.Reason != boothVoiceFlat {
		t.Fatalf("flat: got %+v", got)
	}
}

func TestBoothVoiceGetAnswersJSON(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	raw, err := host.BoothVoiceGet(ids[0])
	if err != nil || !strings.Contains(raw, voiceNarratorTrack) {
		t.Fatalf("raw %q, err %v", raw, err)
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
	answers["get_selected"] = boothVoiceGet(t, host, ids[0])
	answers["get_flat"] = boothVoiceGet(t, flat, flatIDs[0])
	contractfile.Check(t, "booth-voice", answers)
}

func TestREAPERsArmStateIsReadOnTheChaptersVoiceNotItsFolder(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	reader := &fakeTrackStates{state: bridge.TrackState{TrackArmed: true, ArmedCount: 1}}
	got, err := readAloudReaperStateIn(context.Background(), host.services(), reader, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if len(reader.asked) != 1 || reader.asked[0] != voiceNarratorTrack || got.TrackGUID != voiceNarratorTrack {
		t.Fatalf("asked %v, answered %+v; want the Narrator voice read, never the folder", reader.asked, got)
	}
	boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], voiceQueenTrack)
	reader.asked = nil
	got, err = readAloudReaperStateIn(context.Background(), host.services(), reader, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	if len(reader.asked) != 1 || reader.asked[0] != voiceQueenTrack || got.TrackGUID != voiceQueenTrack {
		t.Fatalf("asked %v, answered %+v; want the chosen Queen voice", reader.asked, got)
	}
}

func TestARollInAVoiceFolderRollsTheVoiceTheTakeRecordsOnNotTheFolder(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	client, err := bridge.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	role := &fakeRoller{answer: rolledFrom(40), position: recordingAt(52)}
	host.mu.Lock()
	host.config.daw = "REAPER"
	host.bridge = client
	host.reachability, host.puncher = liveReachability(), role
	host.mu.Unlock()
	host.boothVoices.choose(ids[0], voiceQueenTrack)

	decodeDawResult(t)(host.DawRoll(ids[0], 40, false))

	if want := []rollCall{{voiceQueenTrack, 40}}; !reflect.DeepEqual(role.rolled, want) {
		t.Fatalf("rolled %v, want the chosen voice %s (the track the bridge records on), never the folder", role.rolled, voiceQueenTrack)
	}
}
