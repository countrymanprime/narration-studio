package main

import (
	"context"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/dawport"
)

// fakeFolderRepairer answers chapter_folders as REAPER would for the owner's project: Chapter 4 (linked) and a voice track sit inside
// Chapter 3's folder.
type fakeFolderRepairer struct {
	calls []string
	sent  [][]string
	err   error
	plan  bridge.FolderPlan
}

func (f *fakeFolderRepairer) ChapterFolders(_ context.Context, apply bool, chapterGUIDs, expected []string) (bridge.FolderPlan, error) {
	mode := "preview"
	if apply {
		mode = "apply"
	}
	f.calls = append(f.calls, mode)
	f.sent = append(f.sent, append(append([]string{}, chapterGUIDs...), expected...))
	return f.plan, f.err
}

const (
	nestedChapter3 = "{33333333-0000-4000-8000-000000000003}"
	nestedChapter4 = "{44444444-0000-4000-8000-000000000004}"
	nestedVoice    = "{55555555-0000-4000-8000-000000000005}"
)

func nestedPlan() bridge.FolderPlan {
	return bridge.FolderPlan{Chapters: 1, Moves: []bridge.FolderMove{
		{GUID: nestedChapter4, Name: "Chapter 4", FromGUID: nestedChapter3, FromName: "Chapter 3"},
		{GUID: nestedVoice, Name: "Cuts", FromGUID: nestedChapter3, FromName: "Chapter 3"},
	}}
}

func nestedHost(t *testing.T) (*Host, []string) {
	t.Helper()
	host, ids := newTestHostForChapterMatch(t)
	linkChapter(t, host, ids[0], nestedChapter3)
	linkChapter(t, host, ids[1], nestedChapter4)
	return host, ids
}

func TestAChapterInsideAnotherChaptersFolderIsListedWithWhatWouldMoveAndNothingIsWritten(t *testing.T) {
	host, ids := nestedHost(t)
	repairer := &fakeFolderRepairer{plan: nestedPlan()}
	got, err := chapterFoldersIn(context.Background(), host.services(), repairer, dawport.Support{Available: true}, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Outcome != chapterFoldersNested || !reflect.DeepEqual(repairer.calls, []string{"preview"}) {
		t.Fatalf("got %+v after %v", got, repairer.calls)
	}
	if len(got.Moves) != 2 || got.Moves[0].ChapterID != ids[1] || got.Moves[1].ChapterID != "" {
		t.Fatalf("moves %+v: Chapter 4 is a chapter, the Cuts track is not", got.Moves)
	}
	if !reflect.DeepEqual(got.Expected, []string{nestedChapter4}) {
		t.Fatalf("expected %v, want only the chapter that moves", got.Expected)
	}
	if sent := repairer.sent[0]; len(sent) != 2 {
		t.Fatalf("sent %v, want the two linked chapter tracks", sent)
	}
}

func TestTheRepairSendsWhatTheNarratorConfirmed(t *testing.T) {
	host, _ := nestedHost(t)
	repairer := &fakeFolderRepairer{plan: nestedPlan()}
	got, err := chapterFoldersIn(context.Background(), host.services(), repairer, dawport.Support{Available: true}, true, []string{nestedChapter4})
	if err != nil || got.Outcome != chapterFoldersRepaired || repairer.calls[0] != "apply" {
		t.Fatalf("got %+v, %v after %v", got, err, repairer.calls)
	}
	if sent := repairer.sent[0]; sent[len(sent)-1] != nestedChapter4 {
		t.Fatalf("sent %v, want the confirmed chapter last", sent)
	}
}

func TestARepairOnAProjectThatChangedIsStaleAndSaysCheckAgain(t *testing.T) {
	host, _ := nestedHost(t)
	got, _ := chapterFoldersIn(context.Background(), host.services(), &fakeFolderRepairer{err: bridge.ErrFoldersStale}, dawport.Support{Available: true}, true, []string{nestedChapter4})
	if got.Outcome != chapterFoldersStale || got.Message == "" {
		t.Fatalf("got %+v", got)
	}
}

func TestTheRepairIsRefusedWhileRecordingAndWhenTheDAWIsNotThere(t *testing.T) {
	host, _ := nestedHost(t)
	recording, _ := chapterFoldersIn(context.Background(), host.services(), &fakeFolderRepairer{err: bridge.ErrRecording}, dawport.Support{Available: true}, true, nil)
	if recording.Outcome != chapterFoldersRefused || recording.Reason != trackCreateRecording {
		t.Fatalf("recording: %+v", recording)
	}
	standalone, _ := chapterFoldersIn(context.Background(), host.services(), nil, dawport.Support{Reason: dawport.ReasonStandalone}, false, nil)
	if standalone.Outcome != chapterFoldersRefused || standalone.Reason != reaperStandalone {
		t.Fatalf("standalone: %+v", standalone)
	}
	quiet, _ := chapterFoldersIn(context.Background(), host.services(), &fakeFolderRepairer{err: bridge.ErrNoAnswer}, dawport.Support{Available: true}, false, nil)
	if quiet.Outcome != chapterFoldersRefused || quiet.Reason != reaperNotRunning {
		t.Fatalf("not answering: %+v", quiet)
	}
}

func TestAProjectWithOneLinkedChapterIsCleanWithoutAskingTheDAW(t *testing.T) {
	host, ids := newTestHostForChapterMatch(t)
	linkChapter(t, host, ids[0], nestedChapter3)
	repairer := &fakeFolderRepairer{}
	got, _ := chapterFoldersIn(context.Background(), host.services(), repairer, dawport.Support{Available: true}, false, nil)
	if got.Outcome != chapterFoldersClean || len(repairer.calls) != 0 {
		t.Fatalf("got %+v after %v", got, repairer.calls)
	}
}

func TestAnEngineWithoutFoldersCannotRepairThem(t *testing.T) {
	host, _ := nestedHost(t)
	host.dawPortResolver = nil
	raw, err := host.ChapterFoldersCheck()
	if err != nil || !strings.Contains(raw, `"outcome":"refused"`) {
		t.Fatalf("raw %s, err %v", raw, err)
	}
}

func TestContractChapterFolders(t *testing.T) {
	host, _ := nestedHost(t)
	ok := dawport.Support{Available: true}
	answers := map[string]any{}
	answers["nested"], _ = chapterFoldersIn(context.Background(), host.services(), &fakeFolderRepairer{plan: nestedPlan()}, ok, false, nil)
	answers["clean"], _ = chapterFoldersIn(context.Background(), host.services(), &fakeFolderRepairer{}, ok, false, nil)
	answers["repaired"], _ = chapterFoldersIn(context.Background(), host.services(), &fakeFolderRepairer{plan: nestedPlan()}, ok, true, []string{nestedChapter4})
	answers["stale"], _ = chapterFoldersIn(context.Background(), host.services(), &fakeFolderRepairer{err: bridge.ErrFoldersStale}, ok, true, []string{nestedChapter4})
	answers["recording"], _ = chapterFoldersIn(context.Background(), host.services(), &fakeFolderRepairer{err: bridge.ErrRecording}, ok, true, nil)
	answers["standalone"], _ = chapterFoldersIn(context.Background(), host.services(), nil, dawport.Support{Reason: dawport.ReasonStandalone}, false, nil)
	contractfile.Check(t, "chapter-folders", answers)
}
