package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/contractfile"
	"desktop/internal/voicetracks"
)

// #3331: a child of a linked folder the narrator marked as not a voice (a music bed, room tone) is never a recording target and not a
// voice in the Booth; every other child stays a voice.

const (
	musicBedTrack   = "{AAAAAAAA-0000-4000-8000-000000000010}"
	roomToneTrack   = "{AAAAAAAA-0000-4000-8000-000000000011}"
	musicBedRenamed = "Score"
)

// folderRpp is a project of one chapter folder, "Chapter 1", holding the given children as (guid, name) pairs, then the flat chapter
// track the other fixtures use.
func folderRpp(children ...[2]string) string {
	var b strings.Builder
	b.WriteString("<REAPER_PROJECT 0.1 \"7.82/x64\" 1789000000\n")
	b.WriteString("  <TRACK " + voiceFolderTrack + "\n    NAME \"Chapter 1\"\n    ISBUS 1 1\n    TRACKID " + voiceFolderTrack + "\n  >\n")
	for index, child := range children {
		flag := "ISBUS 0 0"
		if index == len(children)-1 {
			flag = "ISBUS 2 -1"
		}
		b.WriteString("  <TRACK " + child[0] + "\n    NAME \"" + child[1] + "\"\n    " + flag + "\n    TRACKID " + child[0] + "\n  >\n")
	}
	b.WriteString("  <TRACK {22222222-2222-4222-8222-222222222222}\n    NAME \"Chapter II\"\n    ISBUS 0 0\n    TRACKID {22222222-2222-4222-8222-222222222222}\n  >\n>\n")
	return b.String()
}

// newFolderHost is a project whose first chapter is linked to the folder of rpp, in layout, with the tracks in notVoices marked.
func newFolderHost(t *testing.T, rpp, layout string, notVoices ...string) (*Host, []string) {
	t.Helper()
	host, ids := newTestHostForChapterMatch(t)
	folder := host.config.projectFolder
	if err := os.WriteFile(filepath.Join(folder, "Alice.rpp"), []byte(rpp), 0o600); err != nil {
		t.Fatal(err)
	}
	linkChapter(t, host, ids[0], voiceFolderTrack)
	service := voicetracks.New(voicetracks.Config{Project: folder})
	if _, err := service.SetLayout(layout); err != nil {
		t.Fatal(err)
	}
	for _, guid := range notVoices {
		if _, err := service.SetNotVoice(guid, true); err != nil {
			t.Fatal(err)
		}
	}
	host.reachability = liveReachability()
	host.navigation = &findingNavigation{navigator: &fakeNavigator{}}
	host.boothVoices = newBoothVoiceChoices()
	return host, ids
}

func armedOn(t *testing.T, host *Host, chapterID string) string {
	t.Helper()
	fake := &fakeRecorder{}
	recordStartWithVoice(t, host, fake, chapterID)
	return fake.armGUID
}

// The reproduction: a folder that holds only a music bed recorded on the music bed under Flat, because voiceFor falls back to voices[0].
func TestAFlatFolderWhoseEveryChildIsMarkedIsRefusedNotRecordedOnTheFolder(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}), voicetracks.LayoutFlat, musicBedTrack)
	fake := &fakeRecorder{}
	result := recordStartWithVoice(t, host, fake, ids[0])
	if result.Outcome != "refused" || result.Reason != boothVoiceNoVoices || len(fake.calls) != 0 {
		t.Fatalf("got %+v, calls %v, want refused with nothing armed (#3828: the owner chose a refusal over recording on the folder)", result, fake.calls)
	}
	if !strings.Contains(result.Message, "turned off as not a voice") || !strings.Contains(result.Message, "Voices card") || !strings.Contains(result.Message, "link the chapter to a track of its own") {
		t.Fatalf("message %q does not name the switch and the Flat fix", result.Message)
	}
	// The voice list says the same, so the Booth hides the control for a reason it can show.
	if got := boothVoiceGet(t, host, ids[0]); got.Outcome != "refused" || got.Reason != boothVoiceNoVoices {
		t.Fatalf("BoothVoiceGet gave %+v, want refused with no voices", got)
	}
}

func TestAFlatFolderWithAnUnmarkedChildStillRecordsOnIt(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}, [2]string{voiceQueenTrack, "Queen"}), voicetracks.LayoutFlat, musicBedTrack)
	if got := armedOn(t, host, ids[0]); got != voiceQueenTrack {
		t.Fatalf("armed %q, want the unmarked child %q", got, voiceQueenTrack)
	}
}

func TestAMusicBedNobodyMarkedStaysAVoice(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}), voicetracks.LayoutFlat)
	if got := armedOn(t, host, ids[0]); got != musicBedTrack {
		t.Fatalf("armed %q, want the unmarked child %q: every child is a voice by default", got, musicBedTrack)
	}
}

func TestAMarkedMusicBedNextToTheNarratorRecordsOnTheNarrator(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}, [2]string{voiceNarratorTrack, "Narrator"}), voicetracks.LayoutFolders, musicBedTrack)
	if got := armedOn(t, host, ids[0]); got != voiceNarratorTrack {
		t.Fatalf("armed %q, want the Narrator", got)
	}
}

// A marked first child must not be the fallback when there is no Narrator: the next voice is.
func TestAMarkedFirstChildIsNotTheFallbackVoice(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}, [2]string{voiceQueenTrack, "Queen"}), voicetracks.LayoutFlat, musicBedTrack)
	if got := armedOn(t, host, ids[0]); got != voiceQueenTrack {
		t.Fatalf("armed %q, want Queen, the only voice", got)
	}
}

func TestAMarkedChildCannotBeChosenAsTheVoice(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}, [2]string{voiceQueenTrack, "Queen"}, [2]string{voiceNarratorTrack, "Narrator"}), voicetracks.LayoutFolders, musicBedTrack)
	got := boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], musicBedTrack)
	if got.Outcome != "refused" || got.Reason != boothVoiceNotAVoice {
		t.Fatalf("got %+v, want the marked child refused as not a voice", got)
	}
	if got := boothVoiceSet(t, host, &fakeVoiceRecorder{}, ids[0], voiceQueenTrack); got.Outcome != "selected" {
		t.Fatalf("got %+v, want Queen still choosable", got)
	}
}

func TestAFolderWithOnlyMarkedChildrenIsRefusedUnderVoiceFolders(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}, [2]string{roomToneTrack, "Room tone"}), voicetracks.LayoutFolders, musicBedTrack, roomToneTrack)
	result := recordStartWithVoice(t, host, &fakeRecorder{}, ids[0])
	if result.Outcome != "refused" || result.Reason != boothVoiceNoVoices {
		t.Fatalf("got %+v, want refused with no voices, as an empty folder is", result)
	}
	// The sentence names the fix that works here (turn one back on), not the one for an empty folder (finding 5 of #3828).
	if !strings.Contains(result.Message, "turned off as not a voice") || !strings.Contains(result.Message, "Voices card") {
		t.Fatalf("message %q does not say every track is marked and where to turn one back on", result.Message)
	}
}

func TestUnmarkingMakesTheChildAVoiceAgain(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}), voicetracks.LayoutFlat, musicBedTrack)
	// Every child marked: Record is refused and nothing is armed (#3828; it used to record on the folder).
	if got := armedOn(t, host, ids[0]); got != "" {
		t.Fatalf("marked: armed %q, want nothing armed", got)
	}
	if _, err := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder}).SetNotVoice(musicBedTrack, false); err != nil {
		t.Fatal(err)
	}
	if got := armedOn(t, host, ids[0]); got != musicBedTrack {
		t.Fatalf("unmarked: armed %q, want the child again", got)
	}
}

// The mark follows the track's GUID, so a rename in the DAW keeps it.
func TestARenamedMarkedTrackStaysMarked(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}, [2]string{voiceQueenTrack, "Queen"}), voicetracks.LayoutFlat, musicBedTrack)
	renamed := folderRpp([2]string{musicBedTrack, musicBedRenamed}, [2]string{voiceQueenTrack, "Queen"})
	if err := os.WriteFile(filepath.Join(host.config.projectFolder, "Alice.rpp"), []byte(renamed), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := armedOn(t, host, ids[0]); got != voiceQueenTrack {
		t.Fatalf("armed %q after the rename, want Queen: the renamed track is still marked", got)
	}
}

func TestTheServiceMarksAndUnmarksAndRefusesABadGUID(t *testing.T) {
	service := voicetracks.New(voicetracks.Config{Project: t.TempDir()})
	state, err := service.SetNotVoice(strings.ToUpper(musicBedTrack), true)
	if err != nil || len(state.NotVoiceGUIDs) != 1 || state.NotVoiceGUIDs[0] != strings.ToLower(musicBedTrack) {
		t.Fatalf("marked state = %+v (%v), want the one GUID, lower case", state.NotVoiceGUIDs, err)
	}
	if state, _ = service.SetNotVoice(musicBedTrack, true); len(state.NotVoiceGUIDs) != 1 {
		t.Fatalf("marking twice kept %d GUIDs, want 1", len(state.NotVoiceGUIDs))
	}
	if _, err := service.SetNotVoice("bad\nguid", true); err == nil {
		t.Fatal("a GUID with a line break was saved")
	}
	if _, err := service.SetNotVoice("   ", true); err == nil {
		t.Fatal("a blank GUID was saved")
	}
	if state, err = service.SetNotVoice(musicBedTrack, false); err != nil || len(state.NotVoiceGUIDs) != 0 {
		t.Fatalf("unmarked state = %+v (%v), want none", state.NotVoiceGUIDs, err)
	}
	// What was marked is read back from the file by a service built afterwards (the host builds one per call).
	if _, err := service.SetNotVoice(roomToneTrack, true); err != nil {
		t.Fatal(err)
	}
	if again, _ := service.Get(); !again.IsNotVoice(roomToneTrack) || again.IsNotVoice(musicBedTrack) {
		t.Fatalf("read back %+v", again.NotVoiceGUIDs)
	}
}

// The chapter row's members say which child is not a voice, and agree with the Booth's voices.
func TestTheChapterRowsMembersSayWhichChildIsNotAVoice(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}, [2]string{voiceQueenTrack, "Queen"}), voicetracks.LayoutFlat, musicBedTrack)
	payload, err := host.ChapterTrackLinks()
	if err != nil {
		t.Fatal(err)
	}
	// The golden the UI's chapterTrackLinks schema is checked against, with a member marked as not a voice.
	var decoded any
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		t.Fatal(err)
	}
	stable, err := contractfile.PortablePaths(decoded, host.config.projectFolder, "C:/Projects/Alice")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "chapter-track-links-not-a-voice", stable)
	links, err := host.chapterTrackLinks()
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range links.Chapters {
		if row.ChapterID != ids[0] {
			continue
		}
		if len(row.Members) != 2 {
			t.Fatalf("members = %+v, want two", row.Members)
		}
		for _, member := range row.Members {
			wantBed := strings.EqualFold(member.GUID, musicBedTrack)
			if member.NotAVoice != wantBed || member.IsVoice == wantBed {
				t.Fatalf("member %+v: notAVoice and isVoice must follow the mark on %s", member, musicBedTrack)
			}
		}
		return
	}
	t.Fatal("the chapter row is missing")
}

// The binding the Voices card's switch calls: it marks, the Booth follows at once, and it unmarks; a bad GUID is refused and nothing is saved.
func TestTheBindingMarksAndUnmarksAChildAndRefusesABadGUID(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}), voicetracks.LayoutFlat)
	if got := armedOn(t, host, ids[0]); got != musicBedTrack {
		t.Fatalf("before marking: armed %q, want the music bed (every child is a voice by default)", got)
	}
	payload, err := host.VoiceTracksSetNotAVoice(strings.ToUpper(musicBedTrack), true)
	if err != nil {
		t.Fatal(err)
	}
	var state voicetracks.State
	if err := json.Unmarshal([]byte(payload), &state); err != nil || len(state.NotVoiceGUIDs) != 1 {
		t.Fatalf("marked answer = %s (%v), want the one GUID", payload, err)
	}
	if got := armedOn(t, host, ids[0]); got != "" {
		t.Fatalf("after marking: armed %q, want nothing armed (every child is marked, so Record is refused)", got)
	}
	if _, err := host.VoiceTracksSetNotAVoice(musicBedTrack, false); err != nil {
		t.Fatal(err)
	}
	if got := armedOn(t, host, ids[0]); got != musicBedTrack {
		t.Fatalf("after unmarking: armed %q, want the music bed again", got)
	}
	if _, err := host.VoiceTracksSetNotAVoice("bad\nguid", true); err == nil {
		t.Fatal("a GUID with a line break was saved")
	}
}

// #3559: the record start tells REAPER which tracks of the chapter's folder are marked, so the chapter's end leaves a music bed out.
func notVoiceSentOnStart(t *testing.T, host *Host, chapterID string) []string {
	t.Helper()
	fake := &fakeRecorder{}
	recordStartWithVoice(t, host, fake, chapterID)
	return fake.startOpts.NotVoice
}

func TestARecordStartSendsTheMarkedMusicBedWithTheChapterEndRule(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}, [2]string{voiceNarratorTrack, "Narrator"}), voicetracks.LayoutFolders, musicBedTrack)
	if got := notVoiceSentOnStart(t, host, ids[0]); len(got) != 1 || got[0] != musicBedTrack {
		t.Fatalf("sent %v, want only the marked music bed", got)
	}
}

func TestARecordStartSendsNothingWhenNoTrackIsMarked(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{musicBedTrack, "Music bed"}, [2]string{voiceNarratorTrack, "Narrator"}), voicetracks.LayoutFolders)
	if got := notVoiceSentOnStart(t, host, ids[0]); len(got) != 0 {
		t.Fatalf("sent %v, want none", got)
	}
}

func TestARecordStartDoesNotSendAMarkedTrackOutsideTheFolder(t *testing.T) {
	host, ids := newFolderHost(t, folderRpp([2]string{voiceNarratorTrack, "Narrator"}), voicetracks.LayoutFolders, roomToneTrack)
	if got := notVoiceSentOnStart(t, host, ids[0]); len(got) != 0 {
		t.Fatalf("sent %v, want none: the marked track is not in this folder", got)
	}
}
