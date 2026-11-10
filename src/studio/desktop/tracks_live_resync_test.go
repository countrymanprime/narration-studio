package main

import (
	"errors"
	"path/filepath"
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

// Under the Flat toggle, a folder whose children are other chapters' tracks is nested chapters, not voices: the structure rule must not
// make a chapter record on a child that belongs to another chapter.
func TestAFolderHoldingAnotherChaptersTrackIsNotAVoiceFolder(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFlat)
	linkChapter(t, host, ids[1], voiceNarratorTrack)
	voices, folder, err := chapterVoices(host.services(), voiceFolderTrack)
	if err != nil || folder || len(voices) != 0 {
		t.Fatalf("voices = %+v folder = %v err = %v, want the folder not read as voices", voices, folder, err)
	}
}
