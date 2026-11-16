package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/persist"
	"desktop/internal/voicetracks"
)

// #3557: a child of a linked folder marked as not a voice (a music bed) is not the chapter's audio either: the recorded length and the
// recorded end of the chapter row read the voices only, while the row still lists the bed as a member.

const narratorTrack = "{AAAAAAAA-0000-4000-8000-000000000020}"

// folderRppWithItems is folderRpp's project with an item on each child: (guid, name, position, length) per child.
func folderRppWithItems(children ...[4]string) string {
	var b strings.Builder
	b.WriteString("<REAPER_PROJECT 0.1 \"7.82/x64\" 1789000000\n")
	b.WriteString("  <TRACK " + voiceFolderTrack + "\n    NAME \"Chapter 1\"\n    ISBUS 1 1\n    TRACKID " + voiceFolderTrack + "\n  >\n")
	for index, child := range children {
		flag := "ISBUS 0 0"
		if index == len(children)-1 {
			flag = "ISBUS 2 -1"
		}
		fmt.Fprintf(&b, "  <TRACK %s\n    NAME \"%s\"\n    %s\n    TRACKID %s\n", child[0], child[1], flag, child[0])
		fmt.Fprintf(&b, "    <ITEM\n      POSITION %s\n      LENGTH %s\n      IGUID {%08d-0000-4000-8000-000000000000}\n      <SOURCE WAVE\n        FILE \"media/t%d.wav\"\n      >\n    >\n  >\n", child[2], child[3], index+1, index+1)
	}
	b.WriteString("  <TRACK {22222222-2222-4222-8222-222222222222}\n    NAME \"Chapter II\"\n    ISBUS 0 0\n    TRACKID {22222222-2222-4222-8222-222222222222}\n  >\n>\n")
	return b.String()
}

func narratorAndBed() string {
	return folderRppWithItems([4]string{narratorTrack, "Narrator", "0", "10"}, [4]string{musicBedTrack, "Music bed", "0", "300"})
}

func TestARecordedLengthDoesNotCountATrackMarkedAsNotAVoice(t *testing.T) {
	host, ids := newFolderHost(t, narratorAndBed(), voicetracks.LayoutFolders, musicBedTrack)
	if got := chapterRecorded(t, host)[ids[0]]["recordedSeconds"]; got != 10.0 {
		t.Fatalf("recorded seconds = %v, want the narrator's 10, not the music bed's 300", got)
	}
}

func TestAnUnmarkedBedStillCountsAndUnmarkingBringsItBack(t *testing.T) {
	host, ids := newFolderHost(t, narratorAndBed(), voicetracks.LayoutFolders)
	if got := chapterRecorded(t, host)[ids[0]]["recordedSeconds"]; got != 300.0 {
		t.Fatalf("recorded seconds = %v, want 300: a bed nobody marked is chapter audio", got)
	}
	service := voicetracks.New(voicetracks.Config{Project: host.config.projectFolder})
	if _, err := service.SetNotVoice(musicBedTrack, true); err != nil {
		t.Fatal(err)
	}
	if got := chapterRecorded(t, host)[ids[0]]["recordedSeconds"]; got != 10.0 {
		t.Fatalf("recorded seconds = %v after marking, want 10", got)
	}
	if _, err := service.SetNotVoice(musicBedTrack, false); err != nil {
		t.Fatal(err)
	}
	if got := chapterRecorded(t, host)[ids[0]]["recordedSeconds"]; got != 300.0 {
		t.Fatalf("recorded seconds = %v after unmarking, want 300", got)
	}
}

func TestTheChapterRowsRecordedEndIgnoresAMarkedTrackButStillListsIt(t *testing.T) {
	host, ids := newFolderHost(t, narratorAndBed(), voicetracks.LayoutFolders, musicBedTrack)
	links, err := host.chapterTrackLinks()
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range links.Chapters {
		if row.ChapterID != ids[0] {
			continue
		}
		if row.RecordedEnd == nil || row.RecordedEnd.ProjectTime != 10 {
			t.Fatalf("recorded end = %+v, want the narrator's item ending at 10, not the bed's at 300", row.RecordedEnd)
		}
		var sawBed bool
		for _, member := range row.Members {
			if strings.EqualFold(member.GUID, musicBedTrack) {
				sawBed = member.NotAVoice
			}
		}
		if !sawBed {
			t.Fatalf("members = %+v: the marked bed must still be listed, marked as not a voice", row.Members)
		}
		return
	}
	t.Fatal("the chapter row is missing")
}

func TestChapterAudioReadsNoMarksFromAFolderWithNone(t *testing.T) {
	host, _ := newFolderHost(t, narratorAndBed(), voicetracks.LayoutFolders)
	project, ok := readSelectedProject(host.config.projectFolder, host.settings)
	if !ok {
		t.Fatal("the project is not readable")
	}
	members, _ := chapterAudio(nil, host.config.projectFolder, project).ChapterMembers(voiceFolderTrack)
	if len(members) != 3 {
		t.Fatalf("members = %d, want the folder and both children when nothing is marked", len(members))
	}
}

// The class guard (#3557): the rule is applied at each caller, so a host call of a chapter-audio read that does not wrap its project in
// chapterAudio would count a marked bed again, and no behaviour test names it until someone writes one for that caller.
func TestEveryHostReadOfAChapterSAudioAppliesTheRule(t *testing.T) {
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	var seen int
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		raw, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		for number, line := range strings.Split(string(raw), "\n") {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "//") || strings.HasPrefix(trimmed, "func ") {
				continue
			}
			if !strings.Contains(line, "chaptermatch.RecordedEnd(") && !strings.Contains(line, "recordedLengthsFor(") {
				continue
			}
			seen++
			// A project ruled a few lines above in the same function (`ruled := chapterAudio(...)`) is as good as the call itself.
			ruledAbove := false
			if strings.Contains(line, "(ruled,") {
				lines := strings.Split(string(raw), "\n")
				for _, above := range lines[max(0, number-6):number] {
					ruledAbove = ruledAbove || strings.Contains(above, "ruled := chapterAudio(")
				}
			}
			if !strings.Contains(line, "chapterAudio(") && !strings.Contains(line, "chapterAudioFrom(") && !ruledAbove {
				t.Errorf("%s:%d reads a chapter's audio without chapterAudio: a track marked as not a voice would count: %s", file, number+1, trimmed)
			}
		}
	}
	if seen < 5 {
		t.Fatalf("found %d chapter-audio reads, want at least 5: the guard no longer finds them, update it", seen)
	}
}

// The recording check reads the rule through coverage.Config.ChapterAudio; the service test hands it a rule, so this guards the one line
// that gives the real service its own (a Config literal cannot be read back).
func TestTheHostGivesTheCoverageServiceTheChapterAudioRule(t *testing.T) {
	raw, err := os.ReadFile("app.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	start := strings.Index(text, "coverage.New(coverage.Config{")
	if start < 0 {
		t.Fatal("app.go no longer builds the coverage service with coverage.New(coverage.Config{: update this test")
	}
	end := strings.Index(text[start:], "}, ")
	if end < 0 {
		end = len(text) - start
	}
	block := text[start : start+min(end+2500, len(text)-start)]
	if !strings.Contains(block, "ChapterAudio:") || !strings.Contains(block, "chapterAudio(") {
		t.Fatal("the coverage service is built without ChapterAudio: the recording check would transcribe a bed marked as not a voice")
	}
}

// A voice-tracks.json that will not parse is the repo's usual bad narrator file (persist.Reporter): kept aside, and the narrator is told,
// not swallowed (#3557 review). Until it is fixed the children count as unmarked, so the bed counts.
func TestACorruptVoiceSetupIsKeptAsideAndReportedAndMarksNothing(t *testing.T) {
	host, ids := newFolderHost(t, narratorAndBed(), voicetracks.LayoutFolders, musicBedTrack)
	if got := chapterRecorded(t, host)[ids[0]]["recordedSeconds"]; got != 10.0 {
		t.Fatalf("recorded seconds = %v with the bed marked, want 10", got)
	}
	var told []string
	host.persist = &persist.Reporter{Notify: func(text string) { told = append(told, text) }}
	file := voicetracks.File(host.config.projectFolder)
	if err := os.WriteFile(file, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := chapterRecorded(t, host)[ids[0]]["recordedSeconds"]; got != 300.0 {
		t.Fatalf("recorded seconds = %v with the setup unreadable, want 300: nothing is marked until it is fixed", got)
	}
	if len(told) != 1 {
		t.Fatalf("the narrator was told %d times (%q), want once", len(told), told)
	}
	aside, _ := filepath.Glob(file + ".corrupt-*")
	if len(aside) != 1 {
		t.Fatalf("kept aside = %v, want the corrupt file kept beside the original", aside)
	}
	chapterRecorded(t, host)
	if len(told) != 1 {
		t.Fatalf("a second read told the narrator again: %q", told)
	}
}

// #3594: the owner's rule is that a chapter's folder and its children are one chapter's voices, except a track marked as not a voice. A
// track another chapter is linked to, inside the folder, is not marked, so its audio counts toward the outer chapter, while the Booth
// still never offers it as a voice to record on (a recording-target rule, chapterVoicesIn). These tests pin the audio half; a change that
// leaves a nested chapter's track out of the outer chapter's audio contradicts the rule and must come with the owner's new one.
func TestANestedChaptersLinkedTrackStillCountsInTheOuterChaptersRecordedLength(t *testing.T) {
	host, ids := newFolderHost(t, narratorAndBed(), voicetracks.LayoutFolders)
	linkChapter(t, host, ids[1], musicBedTrack)
	got := chapterRecorded(t, host)
	if seconds := got[ids[0]]["recordedSeconds"]; seconds != 300.0 {
		t.Fatalf("outer recorded seconds = %v, want 300: the nested chapter's track is one of the folder's voices", seconds)
	}
	if seconds := got[ids[1]]["recordedSeconds"]; seconds != 300.0 {
		t.Fatalf("nested recorded seconds = %v, want its own track's 300", seconds)
	}
}

func TestANestedChaptersLinkedTrackStillCountsInTheOuterChaptersRecordedEnd(t *testing.T) {
	host, ids := newFolderHost(t, narratorAndBed(), voicetracks.LayoutFolders)
	linkChapter(t, host, ids[1], musicBedTrack)
	links, err := host.chapterTrackLinks()
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range links.Chapters {
		if row.ChapterID == ids[0] {
			if row.RecordedEnd == nil || row.RecordedEnd.ProjectTime != 300 {
				t.Fatalf("outer recorded end = %+v, want 300: the nested track's item ends there", row.RecordedEnd)
			}
			return
		}
	}
	t.Fatal("the outer chapter's row is missing")
}

func TestAMarkedNestedChaptersTrackIsStillLeftOutOfTheOuterChaptersAudio(t *testing.T) {
	host, ids := newFolderHost(t, narratorAndBed(), voicetracks.LayoutFolders, musicBedTrack)
	linkChapter(t, host, ids[1], musicBedTrack)
	if seconds := chapterRecorded(t, host)[ids[0]]["recordedSeconds"]; seconds != 10.0 {
		t.Fatalf("outer recorded seconds = %v, want 10: a mark leaves the track out even when a chapter is linked to it", seconds)
	}
}
