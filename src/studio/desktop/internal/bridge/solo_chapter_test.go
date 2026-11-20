package bridge

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestSoloChapterSendsTheTrackAndReadsWhatChangedAndWhetherItWaits(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	answer := [][]string{{"CHAPTER_SOLOED", "", testTrack, "1", "0"}}
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		answer[0][1] = run(command)
		return answer
	})
	got, err := actions.SoloChapter(context.Background(), testTrack)
	if err != nil || got != (ChapterSoloed{TrackGUID: testTrack, Changed: true}) {
		t.Fatalf("got %+v, %v", got, err)
	}
	if command := fake.commands()[0]; command[1] != "solo_chapter" || command[3] != testTrack || len(command) != 4 {
		t.Fatalf("command = %v", command)
	}
	if !Experimental("solo_chapter") || !Experimental("solo_restore") {
		t.Error("solo_chapter and solo_restore stay experimental until a real REAPER has run them on the narrator's machine")
	}
	answer = [][]string{{"CHAPTER_SOLOED", "", testTrack, "0", "1"}}
	if got, err = actions.SoloChapter(context.Background(), testTrack); err != nil || got != (ChapterSoloed{TrackGUID: testTrack, Waiting: true}) {
		t.Fatalf("waiting: got %+v, %v", got, err)
	}
}

func TestSoloChapterTellsAGoneTrackApart(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"TRACK_STALE", run(command), testTrack}}
	})
	var stale *TrackStaleError
	if _, err := actions.SoloChapter(context.Background(), testTrack); !errors.As(err, &stale) || stale.GUID != testTrack {
		t.Fatalf("err = %v, want a stale track", err)
	}
}

func TestSoloRestoreReadsWhatWasPutBackKeptAndWaiting(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	answer := [][]string{{"SOLO_RESTORED", "", "1", "2", "0"}}
	fake := startFakeReaper(t, client, dir, func(command []string) [][]string {
		answer[0][1] = run(command)
		return answer
	})
	got, err := actions.SoloRestore(context.Background())
	if err != nil || got != (SoloReleased{Restored: 1, Kept: 2}) {
		t.Fatalf("got %+v, %v", got, err)
	}
	if command := fake.commands()[0]; command[1] != "solo_restore" || len(command) != 3 {
		t.Fatalf("command = %v", command)
	}
	answer = [][]string{{"SOLO_RESTORED", "", "0", "0", "1"}}
	if got, err = actions.SoloRestore(context.Background()); err != nil || got != (SoloReleased{Waiting: true}) {
		t.Fatalf("waiting: got %+v, %v", got, err)
	}
}

func TestSoloChapterAndRestoreReturnTheErrorREAPERAnswers(t *testing.T) {
	actions, client, dir := newActionsSession(t, true)
	startFakeReaper(t, client, dir, func(command []string) [][]string {
		return [][]string{{"ERROR", run(command), "The chapter's track could not be soloed because REAPER's resource folder is not writable, so nothing was soloed."}}
	})
	if _, err := actions.SoloChapter(context.Background(), testTrack); err == nil || !strings.Contains(err.Error(), "not writable") {
		t.Fatalf("solo err = %v, want REAPER's sentence", err)
	}
	if _, err := actions.SoloRestore(context.Background()); err == nil || !strings.Contains(err.Error(), "not writable") {
		t.Fatalf("restore err = %v, want REAPER's sentence", err)
	}
}
