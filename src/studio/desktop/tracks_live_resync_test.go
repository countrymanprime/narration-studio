package main

import (
	"path/filepath"
	"testing"

	"desktop/internal/dawport"
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

func TestChapterVoicesAndFolderCheckSeeAVoiceDeletedInREAPERBeforeASave(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	rpp := filepath.Join(host.config.projectFolder, "Alice.rpp")
	lister := listerFor(rpp)
	// Chapter I becomes a folder holding one new, unsaved voice.
	lister.read.Tracks = []dawport.LiveTrack{
		{Index: 0, GUID: liveChapterI, Name: "Chapter I", FolderDelta: 1},
		{Index: 1, GUID: liveVoice, Name: "Narrator", FolderDelta: -1},
	}
	lister.read.Total = 2
	withLiveEngine(host, lister)
	if _, err := host.chapterTrackSet(ids[0], liveChapterI); err != nil {
		t.Fatal(err)
	}
	if got := readChapterFolderTrack(host.services(), ids[0]); got != liveChapterI {
		t.Fatalf("folder = %q, want the chapter's track recognised as a folder from REAPER's list", got)
	}
}
