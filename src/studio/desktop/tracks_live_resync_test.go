package main

import (
	"context"
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

// The chapter row's members and the Booth's voices apply one rule: for every layout and every case of a link's GUID, a member is a voice
// exactly when chapterVoices lists it (qa-breaker on #3335: the row said voice where the Booth left the track out).
func TestAMemberIsAVoiceExactlyWhenTheBoothListsIt(t *testing.T) {
	for _, layout := range []string{voicetracks.LayoutFlat, voicetracks.LayoutFolders} {
		for name, caseOf := range map[string]func(string) string{"upper": strings.ToUpper, "lower": strings.ToLower} {
			t.Run(layout+"/"+name, func(t *testing.T) {
				host, ids := newVoiceFolderHost(t, layout)
				linkChapter(t, host, ids[1], caseOf(voiceNarratorTrack))
				links, err := chapterTrackLinksIn(host.services())
				if err != nil {
					t.Fatal(err)
				}
				voices, _, err := chapterVoices(host.services(), voiceFolderTrack)
				if err != nil {
					t.Fatal(err)
				}
				listed := map[string]bool{}
				for _, voice := range voices {
					listed[strings.ToLower(voice.GUID)] = true
				}
				for _, row := range links.Chapters {
					if row.ChapterID != ids[0] {
						continue
					}
					if len(row.Members) == 0 {
						t.Fatal("chapter 1's row lists no members")
					}
					for _, member := range row.Members {
						if member.IsVoice != listed[strings.ToLower(member.GUID)] {
							t.Fatalf("member %+v: isVoice disagrees with the Booth's voices %+v", member, voices)
						}
					}
				}
			})
		}
	}
}

// An unlinked chapter has no folder of its own: its row lists no members, whatever its title matches by name.
func TestAnUnlinkedChaptersRowListsNoMembers(t *testing.T) {
	host, ids := newVoiceFolderHost(t, voicetracks.LayoutFolders)
	if _, err := host.chapterTrackUnlink(ids[0]); err != nil {
		t.Fatal(err)
	}
	links, err := chapterTrackLinksIn(host.services())
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range links.Chapters {
		if row.ChapterID == ids[0] && len(row.Members) != 0 {
			t.Fatalf("members = %+v, want none for a chapter with no confirmed link", row.Members)
		}
	}
}

// A voice choice naming another chapter's track is refused, and a record start never arms it (#3269, qa-breaker N3).
func TestChoosingAnotherChaptersTrackAsAVoiceIsRefused(t *testing.T) {
	for _, layout := range []string{voicetracks.LayoutFlat, voicetracks.LayoutFolders} {
		t.Run(layout, func(t *testing.T) {
			host, ids := newVoiceFolderHost(t, layout)
			linkChapter(t, host, ids[1], voiceNarratorTrack)
			got, err := host.boothVoiceSetIn(context.Background(), host.services(), nil, ids[0], voiceNarratorTrack)
			if err != nil {
				t.Fatal(err)
			}
			if got.Outcome != "refused" || got.Reason != boothVoiceNotAVoice {
				t.Fatalf("choice = %+v, want refused as not a voice", got)
			}
			if guid, _, err := recordTarget(host.services(), ids[0], voiceFolderTrack); err == nil && strings.EqualFold(guid, voiceNarratorTrack) {
				t.Fatalf("record target = %q, want chapter 2's track never armed for chapter 1", guid)
			}
		})
	}
}

// A chapter linked to a track REAPER no longer has gets one sentence in either layout (this exact text is also LINK_GONE in destination.ts and the Booth mock; destination.test.ts asserts it), the same the Engine panel's "Track missing" says
// (#3269 N1b): not "records on one track" under Flat and "not linked to a folder" under Voice folders.
func TestAVoiceKeyOnAChapterWhoseTrackWasDeletedSaysTheTrackIsGoneInEitherLayout(t *testing.T) {
	for _, layout := range []string{voicetracks.LayoutFlat, voicetracks.LayoutFolders} {
		t.Run(layout, func(t *testing.T) {
			host, ids := newTestHostForChapterMatch(t)
			rpp := filepath.Join(host.config.projectFolder, "Alice.rpp")
			if _, err := host.voiceTracks().SetLayout(layout); err != nil {
				t.Fatal(err)
			}
			if _, err := host.chapterTrackSet(ids[0], liveChapterI); err != nil {
				t.Fatal(err)
			}
			lister := listerFor(rpp)
			lister.read.Tracks = []dawport.LiveTrack{{Index: 0, GUID: liveChapterII, Name: "Other"}}
			lister.read.Total = 1
			withLiveEngine(host, lister)
			got, err := boothVoiceGetIn(host.services(), ids[0])
			if err != nil {
				t.Fatal(err)
			}
			if got.Outcome != "refused" || got.Reason != readAloudTrackMissing || got.Message != "The track linked to this chapter is no longer in the project, so there is no voice to choose. Link it again in the audio engine panel." {
				t.Fatalf("voice read = %+v, want refused as track_missing", got)
			}
			set, err := host.boothVoiceSetIn(context.Background(), host.services(), nil, ids[0], liveVoice)
			if err != nil {
				t.Fatal(err)
			}
			if set.Reason != readAloudTrackMissing {
				t.Fatalf("voice choice = %+v, want refused as track_missing", set)
			}
		})
	}
}

// #3269: a voice track renamed in REAPER keeps the characters assigned to it, and the Narrator track renamed stays the one a take records on.
func TestARenamedVoiceKeepsItsAssignmentAndARenamedNarratorStaysTheNarrator(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	rpp := filepath.Join(host.config.projectFolder, "Alice.rpp")
	if _, err := host.voiceTracks().SetLayout(voicetracks.LayoutFolders); err != nil {
		t.Fatal(err)
	}
	if _, err := host.voiceTracks().SetTrackCharacters("Lead", []string{"e-lead"}); err != nil {
		t.Fatal(err)
	}
	if _, err := host.chapterTrackSet(ids[0], liveChapterI); err != nil {
		t.Fatal(err)
	}
	lister := listerFor(rpp)
	withLiveEngine(host, lister)
	list := func(narrator, lead string) {
		lister.read.Tracks = []dawport.LiveTrack{
			{Index: 0, GUID: liveChapterI, Name: "Chapter I", FolderDelta: 1},
			{Index: 1, GUID: liveChapterII, Name: lead},
			{Index: 2, GUID: liveVoice, Name: narrator, FolderDelta: -1},
		}
		lister.read.Total = 3
	}

	// The tracks as first named: the project's tracks are read once, which is when the setup learns them.
	list("Narrator", "Lead")
	if _, err := host.tracksLive(); err != nil {
		t.Fatal(err)
	}

	// Both are renamed to names no assignment has.
	list("Storyteller", "Lead 2")
	if _, err := host.tracksLive(); err != nil {
		t.Fatal(err)
	}
	setup, err := host.voiceTracks().Get()
	if err != nil {
		t.Fatal(err)
	}
	if len(setup.Tracks) != 1 || len(setup.Tracks[0].GUIDs) != 1 || !strings.EqualFold(setup.Tracks[0].GUIDs[0], liveChapterII) {
		t.Fatalf("assignments = %+v, want Lead still holding the renamed track", setup.Tracks)
	}
	if !setup.IsNarrator(liveVoice, "Storyteller") {
		t.Fatalf("setup = %+v, want the renamed Narrator remembered", setup)
	}
	svc := host.services()
	if guid, refused, err := recordTarget(svc, ids[0], liveChapterI); err != nil || refused != nil || !strings.EqualFold(guid, liveVoice) {
		t.Fatalf("record target = %q %+v %v, want the renamed Narrator", guid, refused, err)
	}
}
