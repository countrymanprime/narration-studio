package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
	"desktop/internal/tracks"
	"desktop/internal/voicetracks"
)

// #3558: REAPER's live read of a chapter's folder lists the items of every track inside it. A track marked as not a voice (a music bed) is
// not the chapter's audio there either: Locate, resume-follow, the passage stamp and the word-times view read the voices only.

// bedLive answers the folder read the way the bridge does: one list, each item with its track.
type bedLive struct{ projectPath string }

func (f bedLive) ChapterTrackState(_ context.Context, guid string) (dawport.TrackState, error) {
	return dawport.TrackState{TrackGUID: guid, ProjectPath: f.projectPath}, nil
}

func (f bedLive) ChapterFolderState(_ context.Context, guid string) (dawport.TrackState, error) {
	return dawport.TrackState{TrackGUID: guid, ProjectPath: f.projectPath, ItemsTotal: 2, Items: []bridge.TrackItem{
		{ItemGUID: "n", TakeGUID: "nt", Position: 0, Length: 10, PlayRate: 1, SourceFile: "media/t1.wav", TrackGUID: narratorTrack},
		{ItemGUID: "b", TakeGUID: "bt", Position: 5, Length: 300, PlayRate: 1, SourceFile: "media/t2.wav", TrackGUID: musicBedTrack},
	}}, nil
}

func locateOnTheFolder(t *testing.T, marked bool) (teleprompterLocate, string) {
	t.Helper()
	f := newTestHostForLocate(t, true)
	folder := f.host.config.projectFolder
	rpp := filepath.Join(folder, "Alice.rpp")
	if err := os.WriteFile(rpp, []byte(narratorAndBed()), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(folder, "media"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"t1.wav", "t2.wav"} {
		if err := os.WriteFile(filepath.Join(folder, "media", name), []byte("RIFF"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	linkChapter(t, f.host, f.chapters[0], voiceFolderTrack)
	setup := voicetracks.New(voicetracks.Config{Project: folder})
	if _, err := setup.SetLayout(voicetracks.LayoutFolders); err != nil {
		t.Fatal(err)
	}
	if marked {
		if _, err := setup.SetNotVoice(musicBedTrack, true); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := f.host.teleprompterLocateWith(f.host.services(), bedLive{projectPath: rpp}, f.chapters[0], "", "")
	if err != nil {
		t.Fatal(err)
	}
	result, ok := raw.(teleprompterLocate)
	if !ok {
		t.Fatalf("locate answered %T, want a teleprompterLocate", raw)
	}
	var audio string
	for _, arg := range f.sidecarArgs(t) {
		if strings.HasSuffix(arg, ".wav") {
			audio = filepath.Base(arg)
		}
	}
	return result, audio
}

func TestLiveLocateReadsTheNarratorAndNotATrackMarkedAsNotAVoice(t *testing.T) {
	result, audio := locateOnTheFolder(t, true)
	if result.DAWSource != dawSourceLive || result.RecordedEnd == nil {
		t.Fatalf("locate = %+v, want a live read with a recorded end", result)
	}
	if result.RecordedEnd.ProjectTime != 10 || audio != "t1.wav" {
		t.Fatalf("recorded end at %v on %q, want the narrator's item ending at 10 on t1.wav, not the bed's", result.RecordedEnd.ProjectTime, audio)
	}
}

func TestLiveLocateStillReadsAnUnmarkedBed(t *testing.T) {
	result, audio := locateOnTheFolder(t, false)
	if result.RecordedEnd == nil || result.RecordedEnd.ProjectTime != 305 || audio != "t2.wav" {
		t.Fatalf("recorded end = %+v on %q, want the bed's item ending at 305 on t2.wav: nobody marked it", result.RecordedEnd, audio)
	}
}

func TestThePassageStampIsTheLastVoiceItemAndNotAMarkedBeds(t *testing.T) {
	host, _ := newFolderHost(t, narratorAndBed(), voicetracks.LayoutFolders, musicBedTrack)
	svc := host.services()
	saved, err := selectedProject(svc)
	if err != nil {
		t.Fatal(err)
	}
	reader := bedLive{projectPath: saved.Path}
	skip := chapterAudioSkip(host.persist, host.config.projectFolder, saved, voiceFolderTrack)
	stamp, err := stampFromChapter(t.Context(), reader, voiceFolderTrack, skip)
	if err != nil {
		t.Fatal(err)
	}
	if stamp.ItemGUID != "n" {
		t.Fatalf("stamp = %+v, want the narrator's item: the bed starts later but is not a voice", stamp)
	}
	if stamp, _ = stampFromChapter(t.Context(), reader, voiceFolderTrack, nil); stamp.ItemGUID != "b" {
		t.Fatalf("with no rule the stamp is %+v, want the bed's item (the item that starts last)", stamp)
	}
}

func TestTheLiveSkipNamesAMarkedTrackItsSubtreeAndNotTheChaptersOwnTrack(t *testing.T) {
	folder := t.TempDir()
	setup := voicetracks.New(voicetracks.Config{Project: folder})
	for _, guid := range []string{"{M}", "{X}", "{F}"} {
		if _, err := setup.SetNotVoice(guid, true); err != nil {
			t.Fatal(err)
		}
	}
	project := tracks.Project{Tracks: []tracks.Track{
		{GUID: "{F}", IsFolder: true},
		{GUID: "{N}", Depth: 1},
		{GUID: "{M}", Depth: 1, IsFolder: true},
		{GUID: "{M1}", Depth: 2},
		{GUID: "{H}", Depth: 1},
	}}
	skip := chapterAudioSkip(nil, folder, project, "{F}")
	for guid, want := range map[string]bool{"{M}": true, "{M1}": true, "{X}": true, "{N}": false, "{H}": false, "{F}": false} {
		if got := skip(guid); got != want {
			t.Errorf("skip(%s) = %v, want %v", guid, got, want)
		}
	}
	if chapterAudioSkip(nil, t.TempDir(), project, "{F}")("{M}") {
		t.Error("with nothing marked no track is skipped")
	}
}

// The class guard (#3558): a host reader of REAPER's live folder union that does not drop the skipped tracks' items would count a marked
// bed again. Every file that reads it names withoutSkippedTracks, or is listed here with why it may not.
func TestEveryLiveReaderOfAChaptersFolderDropsTheSkippedTracks(t *testing.T) {
	exceptions := map[string]string{
		"resumelive.go":         "defines readLiveTrack; its callers (teleprompterlocate.go, resumefollow.go) filter",
		"bindings_daw_stack.go": "the edit commands (stack, split, range gain, click repair) name an item by GUID: what they act on is the narrator's choice, not where the chapter's audio is read",
	}
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
		text := string(raw)
		reads := strings.Contains(text, "dawport.ChapterAudioState(") || strings.Contains(text, "readLiveTrack(")
		if !reads {
			continue
		}
		seen++
		if _, ok := exceptions[file]; ok {
			continue
		}
		if !strings.Contains(text, "withoutSkippedTracks(") {
			t.Errorf("%s reads REAPER's live folder union without withoutSkippedTracks: a track marked as not a voice would count", file)
		}
	}
	if seen < 5 {
		t.Fatalf("found %d live readers, want at least 5: the guard no longer finds them, update it", seen)
	}
}

// The ripple keeps every track of the chapter's folder, a marked one too (owner decision on #3558): "not a voice" means not recorded and not
// transcribed, not detached from the chapter's timeline, and a bed left behind by a ripple would be out of sync with its chapter.
func TestARippleStillNamesTheChaptersFolderWhenAChildIsMarkedAsNotAVoice(t *testing.T) {
	host, ids := newFolderHost(t, narratorAndBed(), voicetracks.LayoutFolders, musicBedTrack)
	if got := readChapterFolderTrack(host.services(), ids[0]); got != voiceFolderTrack {
		t.Fatalf("ripple folder = %q, want %q: a marked music bed moves with its chapter", got, voiceFolderTrack)
	}
	onlyBed, bedIDs := newFolderHost(t, folderRppWithItems([4]string{musicBedTrack, "Music bed", "0", "300"}), voicetracks.LayoutFolders, musicBedTrack)
	if got := readChapterFolderTrack(onlyBed.services(), bedIDs[0]); got != voiceFolderTrack {
		t.Fatalf("ripple folder = %q for a folder holding only a marked bed, want %q", got, voiceFolderTrack)
	}
}

// bedCursor answers the follow's itemless read with the edit cursor each tick is given, one after the other (the last one repeats), and the folder read
// (the items, read once the cursor has settled) with the cursor of the tick that asked.
type bedCursor struct {
	bedLive
	mu      sync.Mutex
	cursors []float64
	ticks   int
}

func (f *bedCursor) ChapterTrackStateNoItems(ctx context.Context, guid string) (dawport.TrackState, error) {
	state, err := f.bedLive.ChapterFolderState(ctx, guid)
	f.mu.Lock()
	defer f.mu.Unlock()
	state.EditCursor = f.cursors[min(f.ticks, len(f.cursors)-1)]
	f.ticks++
	state.Items = nil
	return state, err
}

func (f *bedCursor) ChapterFolderState(ctx context.Context, guid string) (dawport.TrackState, error) {
	state, err := f.bedLive.ChapterFolderState(ctx, guid)
	f.mu.Lock()
	defer f.mu.Unlock()
	state.EditCursor = f.cursors[max(min(f.ticks-1, len(f.cursors)-1), 0)]
	return state, err
}

// Following REAPER reports the cursor only when it settles on the chapter's recorded audio. A cursor parked inside a marked bed (here at 150 s,
// where only the bed plays) is not on the chapter's audio, so no event; with no rule it is (#3558).
func followEvents(t *testing.T, skip func(string) bool) []resumeFollowEvent {
	t.Helper()
	reader := &bedCursor{bedLive: bedLive{projectPath: "C:/p/Alice.rpp"}, cursors: []float64{20, 150, 150}}
	var mu sync.Mutex
	var events []resumeFollowEvent
	loop := resumeFollowLoop{
		reader:      reader,
		projectPath: "C:/p/Alice.rpp",
		trackGUID:   voiceFolderTrack,
		follower:    newResumeFollower("c-1", nil, nil, t.TempDir()),
		skip:        skip,
		sessionBusy: func() bool { return false },
		emit: func(event resumeFollowEvent) {
			mu.Lock()
			defer mu.Unlock()
			events = append(events, event)
		},
		interval: 2 * time.Millisecond,
		lifetime: 300 * time.Millisecond,
	}
	loop.run(t.Context())
	mu.Lock()
	defer mu.Unlock()
	return append([]resumeFollowEvent(nil), events...)
}

func TestFollowingReaperDoesNotReportACursorParkedInAMarkedBed(t *testing.T) {
	host, _ := newFolderHost(t, narratorAndBed(), voicetracks.LayoutFolders, musicBedTrack)
	saved, err := selectedProject(host.services())
	if err != nil {
		t.Fatal(err)
	}
	skip := chapterAudioSkip(host.persist, host.config.projectFolder, saved, voiceFolderTrack)
	if events := followEvents(t, skip); len(events) != 0 {
		t.Fatalf("events = %+v, want none: the cursor is at 150 s where only the marked bed plays", events)
	}
	if events := followEvents(t, nil); len(events) != 1 || events[0].Reason != followCursorMoved {
		t.Fatalf("with no rule events = %+v, want one cursor_moved (the bed counts as audio)", events)
	}
}

func TestDroppingASkippedTracksItemsKeepsTheItemCountsHonest(t *testing.T) {
	skipBed := func(guid string) bool { return guid == musicBedTrack }
	items := []dawport.TrackItem{{ItemGUID: "n", TrackGUID: narratorTrack}, {ItemGUID: "b", TrackGUID: musicBedTrack}, {ItemGUID: "x"}}
	whole := withoutSkippedTracks(dawport.TrackState{ItemsTotal: 3, Items: items}, skipBed)
	if len(whole.Items) != 2 || whole.ItemsTotal != 2 {
		t.Fatalf("a whole read: %d items, total %d; want 2 and 2 (an item with no track is kept)", len(whole.Items), whole.ItemsTotal)
	}
	truncated := withoutSkippedTracks(dawport.TrackState{ItemsTotal: 50, Items: items}, skipBed)
	if truncated.ItemsTotal <= len(truncated.Items) {
		t.Fatalf("a read that listed 3 of 50 items must stay cut short after dropping one: %d items, total %d", len(truncated.Items), truncated.ItemsTotal)
	}
	if same := withoutSkippedTracks(dawport.TrackState{ItemsTotal: 3, Items: items}, nil); len(same.Items) != 3 || same.ItemsTotal != 3 {
		t.Fatalf("no rule must change nothing: %+v", same)
	}
}

func TestTheLiveSkipNamesTheSubtreeWhateverSpellingTheLinkHas(t *testing.T) {
	folder := t.TempDir()
	if _, err := voicetracks.New(voicetracks.Config{Project: folder}).SetNotVoice("{M}", true); err != nil {
		t.Fatal(err)
	}
	project := tracks.Project{Tracks: []tracks.Track{
		{GUID: "{F}", IsFolder: true},
		{GUID: "{N}", Depth: 1},
		{GUID: "{M}", Depth: 1, IsFolder: true},
		{GUID: "{M1}", Depth: 2},
	}}
	for _, link := range []string{"{F}", "{f}", " {F} "} {
		skip := chapterAudioSkip(nil, folder, project, link)
		if !skip("{M}") || !skip("{M1}") || skip("{N}") || skip("{F}") {
			t.Errorf("link %q: skip({M})=%v skip({M1})=%v skip({N})=%v skip({F})=%v, want true true false false", link, skip("{M}"), skip("{M1}"), skip("{N}"), skip("{F}"))
		}
	}
}

func TestTheLiveSkipSeesAMarkedFolderAddedInReaperAndNotSavedYet(t *testing.T) {
	folder := t.TempDir()
	if _, err := voicetracks.New(voicetracks.Config{Project: folder}).SetNotVoice("{NEWF}", true); err != nil {
		t.Fatal(err)
	}
	live := tracks.Project{Tracks: []tracks.Track{
		{GUID: "{F}", IsFolder: true},
		{GUID: "{N}", Depth: 1},
		{GUID: "{NEWF}", Depth: 1, IsFolder: true},
		{GUID: "{NEWC}", Depth: 2},
	}}
	if !chapterAudioSkip(nil, folder, live, "{F}")("{NEWC}") {
		t.Fatal("a child of a marked folder the live list knows must be skipped")
	}
}

func TestWithoutSkippedTracksNeverLowersTheTotalBelowZero(t *testing.T) {
	skip := func(guid string) bool { return guid == musicBedTrack }
	state := withoutSkippedTracks(dawport.TrackState{ItemsTotal: 1, Items: []dawport.TrackItem{{TrackGUID: musicBedTrack}, {TrackGUID: musicBedTrack}, {TrackGUID: narratorTrack}}}, skip)
	if state.ItemsTotal != 0 || len(state.Items) != 1 {
		t.Fatalf("total %d with %d items, want 0 and 1", state.ItemsTotal, len(state.Items))
	}
}
