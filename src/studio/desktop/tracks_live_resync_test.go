package main

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/voicetracks"
)

// liveAdapter answers tracks_read with lister and nothing else, as a REAPER whose bridge is up.
type liveAdapter struct{ lister dawport.TrackLister }

func (liveAdapter) Kind() dawport.Kind { return dawport.KindREAPER }
func (liveAdapter) Declares() map[dawport.Capability]dawport.Level {
	return map[dawport.Capability]dawport.Level{dawport.CapTracksRead: dawport.Supported}
}
func (a liveAdapter) Role(c dawport.Capability) any {
	if c == dawport.CapTracksRead {
		return a.lister
	}
	return nil
}

func withLiveEngine(host *Host, lister dawport.TrackLister) {
	host.dawPortResolver = dawport.NewResolver(dawport.ResolverConfig{
		Adapter: liveAdapter{lister: lister},
		Runtime: func() dawport.Runtime { return dawport.Runtime{Bridge: true, Reachable: true} },
	})
}

// #3269: a track renamed or deleted in REAPER and not saved is what every reader that decides a chapter's tracks sees, so the
// narrator never has to delete the chapter folder and create it again.
func TestLiveSelectedProjectFollowsARenameAndADeleteBeforeASave(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	rpp := filepath.Join(host.config.projectFolder, "Alice.rpp")
	lister := listerFor(rpp)
	lister.read.Tracks = []dawport.LiveTrack{
		{Index: 0, GUID: liveChapterI, Name: "Chapter I (retitled)"}, // renamed, same GUID
		{Index: 1, GUID: liveChapterIIb, Name: "Chapter II"},         // the other track named Chapter II is deleted
	}
	lister.read.Total = 2
	withLiveEngine(host, lister)

	_, project, _, err := matchInputs(host.services())
	if err != nil {
		t.Fatal(err)
	}
	if len(project.Tracks) != 2 || project.Tracks[0].GUID != liveChapterI || project.Tracks[0].Name != "Chapter I (retitled)" || project.Tracks[1].GUID != liveChapterIIb {
		t.Fatalf("matcher project = %+v, want the renamed track by GUID and the deleted one gone", project.Tracks)
	}
	if len(project.Tracks[0].Items) == 0 {
		t.Fatal("a renamed track must keep its saved items")
	}

	// REAPER down: the saved file answers, as before.
	host.dawPortResolver = nil
	_, saved, _, err := matchInputs(host.services())
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.Tracks) != 3 || saved.Tracks[0].Name != "Chapter I" {
		t.Fatalf("saved project = %+v, want the saved file's three tracks", saved.Tracks)
	}
}

func TestChapterVoicesFollowAVoiceAddedOrDeletedInREAPERBeforeASave(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	rpp := filepath.Join(host.config.projectFolder, "Alice.rpp")
	if _, err := host.voiceTracks().SetLayout(voicetracks.LayoutFolders); err != nil {
		t.Fatal(err)
	}
	if _, err := host.chapterTrackSet(ids[0], liveChapterI); err != nil {
		t.Fatal(err)
	}
	lister := listerFor(rpp)
	// Chapter I becomes a folder holding one new, unsaved voice.
	lister.read.Tracks = []dawport.LiveTrack{
		{Index: 0, GUID: liveChapterI, Name: "Chapter I", FolderDelta: 1},
		{Index: 1, GUID: liveVoice, Name: "Narrator", FolderDelta: -1},
	}
	lister.read.Total = 2
	withLiveEngine(host, lister)
	svc := host.services()
	if got := readChapterFolderTrack(svc, ids[0]); got != liveChapterI {
		t.Fatalf("folder = %q, want the chapter's track recognised as a folder from REAPER's list", got)
	}
	voices, folder, err := chapterVoices(svc, liveChapterI)
	if err != nil || !folder || len(voices) != 1 || voices[0].GUID != liveVoice {
		t.Fatalf("voices = %+v folder = %v err = %v, want the one voice REAPER has", voices, folder, err)
	}
	if guid, refused, err := recordTarget(svc, ids[0], liveChapterI); err != nil || refused != nil || guid != liveVoice {
		t.Fatalf("record target = %q %+v %v, want the live voice", guid, refused, err)
	}

	// The voice is deleted in REAPER, unsaved: the folder has none, and a record start is refused instead of arming a stale track.
	lister.read.Tracks = []dawport.LiveTrack{{Index: 0, GUID: liveChapterI, Name: "Chapter I", FolderDelta: 1}, {Index: 1, GUID: liveChapterII, Name: "Other", FolderDelta: -1}}
	lister.read.Total = 2
	voices, _, err = chapterVoices(svc, liveChapterI)
	if err != nil || len(voices) != 1 || voices[0].GUID != liveChapterII {
		t.Fatalf("voices after the delete = %+v err = %v, want only what REAPER lists in the folder", voices, err)
	}
}

// Whenever REAPER cannot give the list, every reader gets the saved file's, unchanged.
func TestLiveSelectedProjectFallsBackToTheSavedFile(t *testing.T) {
	cases := map[string]func(*fakeLister, string){
		"no answer":       func(l *fakeLister, _ string) { l.err = bridge.ErrNoAnswer },
		"not connected":   func(l *fakeLister, _ string) { l.err = bridge.ErrUnavailable },
		"another project": func(l *fakeLister, _ string) { l.read.ProjectPath = "/elsewhere/Other.rpp" },
		"unsaved project": func(l *fakeLister, _ string) { l.read.ProjectPath = "" },
		"too many tracks": func(l *fakeLister, _ string) { l.read.Total = len(l.read.Tracks) + 1 },
		"script too old":  func(l *fakeLister, _ string) { l.err = bridge.ErrScriptOutdated },
		"engine failed":   func(l *fakeLister, _ string) { l.err = errors.New("boom") },
	}
	for name, spoil := range cases {
		t.Run(name, func(t *testing.T) {
			host, _ := newTestHostForChapterMatch(t)
			rpp := filepath.Join(host.config.projectFolder, "Alice.rpp")
			lister := listerFor(rpp)
			lister.read.Tracks[0].Name = "Renamed in REAPER"
			spoil(lister, rpp)
			withLiveEngine(host, lister)
			project, err := liveSelectedProject(host.services())
			if err != nil {
				t.Fatal(err)
			}
			if len(project.Tracks) != 3 || project.Tracks[0].Name != "Chapter I" || project.Path != rpp {
				t.Fatalf("project = %q %+v, want the saved file's tracks and its path", project.Path, project.Tracks)
			}
		})
	}
}

// Under the Flat toggle too, a child another chapter is linked to is not a voice: the chapter keeps the folder's other children, and a
// folder whose children are all other chapters' tracks (nested chapters) is not read as voices at all.
func TestAFolderHoldingAnotherChaptersTrackKeepsOnlyItsOwnVoices(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFlat)
	linkChapter(t, host, ids[1], voiceNarratorTrack)
	voices, folder, err := chapterVoices(host.services(), voiceFolderTrack)
	if err != nil || !folder || len(voices) != 1 || strings.EqualFold(voices[0].GUID, voiceNarratorTrack) {
		t.Fatalf("voices = %+v folder = %v err = %v, want the folder's other child only", voices, folder, err)
	}
	linkChapter(t, host, ids[2], voices[0].GUID)
	voices, folder, err = chapterVoices(host.services(), voiceFolderTrack)
	if err != nil || folder || len(voices) != 0 {
		t.Fatalf("voices = %+v folder = %v err = %v, want nested chapters not read as voices", voices, folder, err)
	}
}

// A call that resolves the chapter's voice reads REAPER's live list first: its context must outlast that wait and still leave the arm
// the full readAloudRecordStartTimeout (qa-breaker N9 on #3290).
func TestAVoiceCallsContextLeavesTheArmItsOwnBudgetAfterAFullListWait(t *testing.T) {
	if readAloudVoiceStartTimeout < tracksLiveTimeout+readAloudRecordStartTimeout {
		t.Fatalf("voice call budget %v leaves the arm less than %v after a %v list read", readAloudVoiceStartTimeout, readAloudRecordStartTimeout, tracksLiveTimeout)
	}
}

// The one answer every page reads (#3269): a chapter row lists its linked folder's direct children, and a child another chapter is linked to
// is a member but never a voice of this one.
func TestAChapterRowListsItsFoldersChildrenAndOnlyTheOnesNoOtherChapterOwns(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	links, err := chapterTrackLinksIn(host.services())
	if err != nil {
		t.Fatal(err)
	}
	var first chapterTrackLink
	for _, row := range links.Chapters {
		if row.ChapterID == ids[0] {
			first = row
		}
	}
	if len(first.Members) == 0 {
		t.Fatalf("members = %+v, want the folder's children", first.Members)
	}
	for _, member := range first.Members {
		if !member.IsVoice {
			t.Fatalf("member %+v is not a voice before any other chapter owns it", member)
		}
	}
	linkChapter(t, host, ids[1], voiceNarratorTrack)
	links, err = chapterTrackLinksIn(host.services())
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range links.Chapters {
		if row.ChapterID != ids[0] {
			continue
		}
		for _, member := range row.Members {
			if strings.EqualFold(member.GUID, voiceNarratorTrack) && member.IsVoice {
				t.Fatalf("member %+v is another chapter's track and must not be a voice", member)
			}
		}
	}
}

// Under Voice folders too, a child another chapter is linked to is not a voice of this chapter, and the others stay (qa-breaker N3 on
// #3290: chapter 1's record start armed chapter 2's own track).
func TestAChildAnotherChapterOwnsIsNeverAVoiceUnderVoiceFolders(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	linkChapter(t, host, ids[1], voiceNarratorTrack)
	voices, folder, err := chapterVoices(host.services(), voiceFolderTrack)
	if err != nil || !folder {
		t.Fatalf("folder = %v err = %v, want the folder still read as one", folder, err)
	}
	for _, voice := range voices {
		if strings.EqualFold(voice.GUID, voiceNarratorTrack) {
			t.Fatalf("voices = %+v, want chapter 2's track left out", voices)
		}
	}
}
