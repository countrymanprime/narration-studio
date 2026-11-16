package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

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
