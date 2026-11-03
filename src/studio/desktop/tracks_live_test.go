package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/dawport"
	"desktop/internal/dawport/dawporttest"
)

// The tracks of chapterTracksRpp (chaptermatch_test.go) as REAPER lists them, and a track and a folder of voices added since
// the last save.
const (
	liveChapterI   = "{11111111-1111-4111-8111-111111111111}"
	liveChapterII  = "{22222222-2222-4222-8222-222222222222}"
	liveChapterIIb = "{33333333-3333-4333-8333-333333333333}"
	liveAdded      = "{44444444-4444-4444-8444-444444444444}"
	liveVoice      = "{55555555-5555-4555-8555-555555555555}"
)

// fakeLister stands in for the tracks_read role (bridge.Actions has its own tests, and the Lua harness the command).
type fakeLister struct {
	read  dawport.LiveTracks
	err   error
	calls int
}

var _ dawport.TrackLister = (*fakeLister)(nil)

func (f *fakeLister) ReadTracks(context.Context) (dawport.LiveTracks, error) {
	f.calls++
	return f.read, f.err
}

func listerFor(rpp string, added ...dawport.LiveTrack) *fakeLister {
	read := dawport.LiveTracks{ProjectPath: rpp, ChangeCount: 9, Tracks: []dawport.LiveTrack{
		{Index: 0, GUID: liveChapterI, Name: "Chapter I"},
		{Index: 1, GUID: liveChapterII, Name: "Chapter II"},
		{Index: 2, GUID: liveChapterIIb, Name: "Chapter II"},
	}}
	read.Tracks = append(read.Tracks, added...)
	read.Total = len(read.Tracks)
	return &fakeLister{read: read}
}

var liveAt = time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)

func readLive(t *testing.T, host *Host, lister dawport.TrackLister, support dawport.Support) tracksLive {
	t.Helper()
	got, err := tracksLiveIn(context.Background(), host.services(), lister, support, liveAt)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestTracksLiveListsATrackAndAFolderAddedInREAPERBeforeASave(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	rpp := filepath.Join(host.config.projectFolder, "Alice.rpp")
	lister := listerFor(rpp,
		dawport.LiveTrack{Index: 3, GUID: liveAdded, Name: "Chapter III 🌊 הים", FolderDelta: 1},
		dawport.LiveTrack{Index: 4, GUID: liveVoice, Name: "Guard", FolderDelta: -1},
	)
	got := readLive(t, host, lister, dawport.Support{Available: true})
	if got.Source != tracksSourceLive || got.Reason != "" || got.Message != "" || got.ReadAt != "2026-11-03T12:00:00Z" {
		t.Fatalf("got source %q reason %q message %q readAt %q, want a live read", got.Source, got.Reason, got.Message, got.ReadAt)
	}
	if got.Project.Path != rpp || len(got.Project.Tracks) != 5 {
		t.Fatalf("project = %+v, want the linked file's path and five tracks", got.Project)
	}
	first, added, voice := got.Project.Tracks[0], got.Project.Tracks[3], got.Project.Tracks[4]
	if first.GUID != liveChapterI || len(first.Items) != 2 {
		t.Fatalf("Chapter I = %+v, want its saved items kept", first)
	}
	if added.GUID != liveAdded || added.Name != "Chapter III 🌊 הים" || added.Index != 3 || !added.IsFolder || added.Depth != 0 || len(added.Items) != 0 {
		t.Fatalf("added = %+v, want a top-level folder with no items", added)
	}
	if voice.GUID != liveVoice || voice.Depth != 1 || voice.IsFolder {
		t.Fatalf("voice = %+v, want a track one level inside the folder", voice)
	}
}

func TestTracksLiveFollowsREAPERsOrderNamesAndDeletions(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	rpp := filepath.Join(host.config.projectFolder, "Alice.rpp")
	lister := &fakeLister{read: dawport.LiveTracks{ProjectPath: rpp, Total: 2, Tracks: []dawport.LiveTrack{
		{Index: 0, GUID: liveChapterIIb, Name: "Chapter Two (renamed)"},
		{Index: 1, GUID: liveChapterI, Name: "Chapter I"},
	}}}
	got := readLive(t, host, lister, dawport.Support{Available: true})
	if len(got.Project.Tracks) != 2 {
		t.Fatalf("tracks = %+v, want the deleted track gone", got.Project.Tracks)
	}
	if renamed := got.Project.Tracks[0]; renamed.GUID != liveChapterIIb || renamed.Name != "Chapter Two (renamed)" || renamed.Index != 0 {
		t.Fatalf("first = %+v, want the renamed track first", renamed)
	}
	if moved := got.Project.Tracks[1]; moved.GUID != liveChapterI || moved.Index != 1 || len(moved.Items) != 2 {
		t.Fatalf("second = %+v, want Chapter I second with its items", moved)
	}
}

func TestTracksLiveMatchesTheLinkedFileWhateverTheSpellingOfItsPath(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	rpp := filepath.Join(host.config.projectFolder, ".", "Alice.rpp")
	got := readLive(t, host, listerFor(rpp), dawport.Support{Available: true})
	if got.Source != tracksSourceLive {
		t.Fatalf("source = %q (%s), want live for the same file spelled another way", got.Source, got.Message)
	}
}

func TestTracksLiveFallsBackToTheSavedProjectAndSaysWhy(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	rpp := filepath.Join(host.config.projectFolder, "Alice.rpp")
	other := filepath.Join(t.TempDir(), "Other Book.rpp")
	cut := listerFor(rpp)
	cut.read.Total = 2003
	unsaved := listerFor("")
	unsaved.read.Unsaved = true
	for _, c := range []struct {
		name    string
		lister  dawport.TrackLister
		support dawport.Support
		reason  string
		message string
	}{
		{"no bridge", nil, dawport.Support{Reason: dawport.ReasonStandalone}, "standalone", "REAPER is not connected"},
		{"REAPER closed", nil, dawport.Support{Reason: dawport.ReasonNotRunning}, "not_running", "REAPER is not answering"},
		{"not built", nil, dawport.Support{Reason: dawport.ReasonNotYet}, "unsupported", "cannot list its tracks"},
		{"declaration broken", nil, dawport.Support{Reason: dawport.ReasonFailed, Message: "role missing"}, "failed", "role missing"},
		{"another project open", listerFor(other), dawport.Support{Available: true}, "other_project", "another project open"},
		{"an unsaved project open", unsaved, dawport.Support{Available: true}, "other_project", "another project open"},
		{"too many tracks", cut, dawport.Support{Available: true}, "too_many", "more tracks"},
		{"no answer", &fakeLister{err: bridge.ErrNoAnswer}, dawport.Support{Available: true}, "not_running", "REAPER is not answering"},
		{"bridge gone", &fakeLister{err: bridge.ErrUnavailable}, dawport.Support{Available: true}, "standalone", "REAPER is not connected"},
		{"old script", &fakeLister{err: bridge.ErrScriptOutdated}, dawport.Support{Available: true}, "outdated", "older than this app"},
		{"REAPER refused", &fakeLister{err: &bridge.RefusalError{Sentence: "This REAPER version cannot list its tracks."}}, dawport.Support{Available: true}, "failed", "This REAPER version cannot list its tracks"},
		{"cancelled", &fakeLister{err: context.DeadlineExceeded}, dawport.Support{Available: true}, "not_running", "REAPER is not answering"},
	} {
		t.Run(c.name, func(t *testing.T) {
			got := readLive(t, host, c.lister, c.support)
			if got.Source != tracksSourceSaved || got.Reason != c.reason || !strings.Contains(got.Message, c.message) {
				t.Fatalf("got source %q reason %q message %q, want saved, %q, a message with %q", got.Source, got.Reason, got.Message, c.reason, c.message)
			}
			if got.ReadAt != "2026-11-03T12:00:00Z" || got.Project.Path != rpp || len(got.Project.Tracks) != 3 || got.Project.Tracks[0].GUID != liveChapterI {
				t.Fatalf("project = %+v at %q, want the saved .rpp's three tracks", got.Project, got.ReadAt)
			}
		})
	}
}

func TestTracksLiveWithNoProjectFileIsTheSameErrorAsTracksList(t *testing.T) {
	host, _ := newTestHostForMapping(t)
	lister := listerFor("")
	_, err := tracksLiveIn(context.Background(), host.services(), lister, dawport.Support{Available: true}, liveAt)
	_, listErr := host.tracksList()
	if err == nil || listErr == nil || err.Error() != listErr.Error() {
		t.Fatalf("err = %v, want tracksList's %v", err, listErr)
	}
	if lister.calls != 0 {
		t.Fatal("REAPER was asked for its tracks with no project file to compare them with")
	}
}

func TestTracksLiveReadsREAPERWhenTheSavedFileCannotBeRead(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	rpp := filepath.Join(host.config.projectFolder, "Alice.rpp")
	if err := os.WriteFile(rpp, []byte("not a project"), 0o600); err != nil {
		t.Fatal(err)
	}
	got := readLive(t, host, listerFor(rpp), dawport.Support{Available: true})
	if got.Source != tracksSourceLive || len(got.Project.Tracks) != 3 || len(got.Project.Tracks[0].Items) != 0 {
		t.Fatalf("got %+v, want REAPER's three tracks with no saved items", got)
	}
	if _, err := tracksLiveIn(context.Background(), host.services(), nil, dawport.Support{Reason: dawport.ReasonNotRunning}, liveAt); err == nil {
		t.Fatal("with REAPER closed and the saved file unreadable there is nothing to show: want tracksList's error")
	}
}

func TestTrackListerFromSaysWhyThereIsNone(t *testing.T) {
	if lister, support := trackListerFrom(hostServices{}); lister != nil || support.Reason != dawport.ReasonStandalone {
		t.Fatalf("no resolver: lister = %v, support = %+v", lister, support)
	}
	fake := dawporttest.NewFake(dawport.KindREAPER, dawporttest.Levels(dawport.Experimental))
	down := dawport.NewResolver(dawport.ResolverConfig{Adapter: fake})
	if lister, support := trackListerFrom(hostServices{dawPortResolver: down}); lister != nil || support.Reason != dawport.ReasonStandalone {
		t.Fatalf("no bridge: lister = %v, support = %+v", lister, support)
	}
}

func TestChapterTrackLinksJudgesALinkAgainstREAPERsTracksWhenLive(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	rpp := filepath.Join(host.config.projectFolder, "Alice.rpp")
	if _, err := host.chapterTrackSet(ids[2], liveAdded); err != nil {
		t.Fatal(err)
	}
	row := func(links chapterTrackLinks) chapterTrackLink {
		for _, chapter := range links.Chapters {
			if chapter.ChapterID == ids[2] {
				return chapter
			}
		}
		t.Fatalf("no row for %s", ids[2])
		return chapterTrackLink{}
	}
	saved, err := chapterTrackLinksLive(context.Background(), host.services(), nil, dawport.Support{Reason: dawport.ReasonNotRunning})
	if err != nil {
		t.Fatal(err)
	}
	if got := row(saved); got.Status == "confirmed" || !hasWarning(got.Warnings, "confirmed-track-missing") {
		t.Fatalf("saved: %+v, want the link judged missing against the saved project", got.Result)
	}
	live, err := chapterTrackLinksLive(context.Background(), host.services(), listerFor(rpp, dawport.LiveTrack{Index: 3, GUID: liveAdded, Name: "Chapter III"}), dawport.Support{Available: true})
	if err != nil {
		t.Fatal(err)
	}
	if got := row(live); got.Status != "confirmed" || hasWarning(got.Warnings, "confirmed-track-missing") || got.Track == nil || got.Track.TrackGUID != liveAdded {
		t.Fatalf("live: %+v, want the link confirmed on the track REAPER has", got.Result)
	}
	if len(live.Tracks) != 4 || live.Tracks[3].GUID != liveAdded || live.Tracks[3].LinkedChapterID != ids[2] {
		t.Fatalf("tracks = %+v, want the added track listed and linked", live.Tracks)
	}
}

// Breaker 4: a chapter linked (by Chapter links, while REAPER answered) to a track REAPER has but the saved file does not, read again
// with REAPER down. The link is kept and listed, the chapter is not confirmed and carries the missing-track warning, no track is
// claimed for it, and no recorded end is made up: the saved project cannot see that track until it is saved in REAPER.
func TestChapterTrackLinksWithREAPERDownShowsALiveOnlyTrackAsMissing(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	if _, err := host.chapterTrackSet(ids[2], liveAdded); err != nil {
		t.Fatal(err)
	}
	links, err := chapterTrackLinksLive(context.Background(), host.services(), nil, dawport.Support{Reason: dawport.ReasonNotRunning})
	if err != nil {
		t.Fatal(err)
	}
	if links.Project != linksProjectReady || len(links.Tracks) != 3 {
		t.Fatalf("project %q with %d tracks, want the saved file's three", links.Project, len(links.Tracks))
	}
	for _, track := range links.Tracks {
		if track.GUID == liveAdded {
			t.Fatal("a track only REAPER has is listed from the saved file")
		}
	}
	var row *chapterTrackLink
	for i := range links.Chapters {
		if links.Chapters[i].ChapterID == ids[2] {
			row = &links.Chapters[i]
		}
	}
	if row == nil {
		t.Fatalf("no row for %s", ids[2])
	}
	if row.Status == "confirmed" || !hasWarning(row.Warnings, "confirmed-track-missing") || row.Track != nil || row.RecordedEnd != nil {
		t.Fatalf("row = %+v, want unconfirmed, the missing-track warning, no track and no recorded end", row.Result)
	}
	if len(row.Links) != 1 || row.Links[0].TrackGUID != liveAdded {
		t.Fatalf("links = %+v, want the narrator's link kept", row.Links)
	}
}

// go-goldens: UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/tracks-live-live.json and tracks-live-saved.json, the two shapes
// TracksLive answers.
func TestContractTracksLive(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	folder := host.config.projectFolder
	rpp := filepath.Join(folder, "Alice.rpp")
	pin := func(name string, answer tracksLive) {
		raw, err := encodeBinding(answer, nil)
		if err != nil {
			t.Fatal(err)
		}
		var payload any
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			t.Fatal(err)
		}
		stable, err := contractfile.PortablePaths(payload, folder, "C:/Projects/Alice")
		if err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, name, stable)
	}
	pin("tracks-live-live", readLive(t, host, listerFor(rpp, dawport.LiveTrack{Index: 3, GUID: liveAdded, Name: "Chapter III", FolderDelta: 1},
		dawport.LiveTrack{Index: 4, GUID: liveVoice, Name: "Guard", FolderDelta: -1}), dawport.Support{Available: true}))
	pin("tracks-live-saved", readLive(t, host, nil, dawport.Support{Reason: dawport.ReasonNotRunning}))
}

func TestTracksLiveBindingAnswersJSON(t *testing.T) {
	host, _ := newTestHostForChapterMatch(t)
	raw, err := host.TracksLive()
	if err != nil {
		t.Fatal(err)
	}
	got := decodeBinding(t, raw)
	if got["source"] != "saved" || got["reason"] != "standalone" {
		t.Fatalf("got %v, want the saved project with no bridge", got)
	}
	appData := t.TempDir()
	t.Setenv("APPDATA", appData)
	t.Setenv("USERPROFILE", appData)
	if _, err := newTestHost(t).TracksLive(); err == nil {
		t.Fatal("a host with no project must answer an error")
	}
}
