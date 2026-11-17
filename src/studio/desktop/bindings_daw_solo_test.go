package main

import (
	"context"
	"errors"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/dawport"
)

// DawSoloChapter and DawSoloRestore (bindings_daw_solo.go). What REAPER does is narration_solo_chapter.lua's (solo_chapter_test.lua) and what the role
// sends is dawport/reaper's. These cover the host's wiring: the capability checked first, the chapter-track link, an engine without the role, and the
// sentence each refusal gets.

// fakeSoloer is a PlaceFollower that can also solo a chapter, as REAPER's role does.
type fakeSoloer struct {
	fakePlaceFollower
	soloed     []string
	restores   int
	soloErr    error
	restoreErr error
	answer     dawport.ChapterSoloed
	released   dawport.SoloReleased
}

func (f *fakeSoloer) SoloChapter(_ context.Context, trackID string) (dawport.ChapterSoloed, error) {
	f.soloed = append(f.soloed, trackID)
	return f.answer, f.soloErr
}

func (f *fakeSoloer) SoloRestore(context.Context) (dawport.SoloReleased, error) {
	f.restores++
	return f.released, f.restoreErr
}

func TestDawSoloChapterSolosTheChaptersLinkedTrackAndSaysWhetherItChangedAnything(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	role := &fakeSoloer{answer: dawport.ChapterSoloed{TrackGUID: readAloudTrack, Changed: true}}
	got, err := dawSoloChapterIn(t.Context(), host.services(), "REAPER", available(), role, ids[0])
	if err != nil || !got.OK || !got.Changed || got.Refused != "" || got.UndoSteps != 0 {
		t.Fatalf("solo = %+v, %v", got, err)
	}
	if len(role.soloed) != 1 || role.soloed[0] != readAloudTrack {
		t.Fatalf("soloed %v, want the chapter's linked track %s", role.soloed, readAloudTrack)
	}
	role.answer = dawport.ChapterSoloed{TrackGUID: readAloudTrack, Waiting: true}
	if got, err = dawSoloChapterIn(t.Context(), host.services(), "REAPER", available(), role, ids[0]); err != nil || !got.OK || got.Changed {
		t.Fatalf("waiting = %+v, %v; want done with nothing changed yet", got, err)
	}
}

func TestDawSoloChapterRefusesWithNothingSoloed(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	role := &fakeSoloer{}
	for _, c := range []struct {
		name    string
		support dawport.Support
		chapter string
		want    string
	}{
		{"capability refused", dawport.Support{Message: "Following is off."}, ids[0], "Following is off."},
		{"unlinked chapter", available(), ids[1], "no linked track"},
	} {
		got, err := dawSoloChapterIn(t.Context(), host.services(), "REAPER", c.support, role, c.chapter)
		if err != nil || got.OK || !strings.Contains(got.Refused, c.want) {
			t.Errorf("%s: %+v, %v; want a refusal containing %q", c.name, got, err, c.want)
		}
	}
	if len(role.soloed) != 0 {
		t.Fatalf("a track was soloed: %v", role.soloed)
	}
	if _, err := dawSoloChapterIn(t.Context(), host.services(), "REAPER", available(), role, "no-such-chapter"); err == nil {
		t.Error("a chapter the manuscript does not have must be an error")
	}
	got, _ := dawSoloChapterIn(t.Context(), host.services(), "REAPER", available(), nil, ids[0])
	if got.OK || !strings.Contains(got.Refused, "not connected") {
		t.Errorf("no adapter = %+v", got)
	}
}

func TestDawSoloChapterWordsTheErrorsTheRoleReturns(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	for _, c := range []struct {
		err  error
		want string
	}{
		{&bridge.TrackStaleError{GUID: readAloudTrack}, "no longer in the REAPER project"},
		{bridge.ErrNoAnswer, "not answering"},
		{context.DeadlineExceeded, "did not answer"},
		{errors.New("boom"), "could not quiet the other chapters: boom"},
	} {
		got, err := dawSoloChapterIn(t.Context(), host.services(), "REAPER", available(), &fakeSoloer{soloErr: c.err}, ids[0])
		if err != nil || got.OK || !strings.Contains(got.Refused, c.want) {
			t.Errorf("%v: %+v, %v; want a refusal containing %q", c.err, got, err, c.want)
		}
	}
}

func TestDawSoloChapterIsDoneWithNothingChangedForAnEngineWithoutTheRoleAndAScriptFromBefore(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	got, err := dawSoloChapterIn(t.Context(), host.services(), "Audacity", available(), &fakePlaceFollower{}, ids[0])
	if err != nil || !got.OK || got.Changed || got.Refused != "" {
		t.Fatalf("an engine without the role = %+v, %v", got, err)
	}
	got, err = dawSoloChapterIn(t.Context(), host.services(), "REAPER", available(), &fakeSoloer{soloErr: bridge.ErrScriptOutdated}, ids[0])
	if err != nil || !got.OK || got.Changed {
		t.Fatalf("a script from before = %+v, %v", got, err)
	}
	if got := dawSoloRestoreIn(t.Context(), "Audacity", &fakePlaceFollower{}); !got.OK || got.Changed {
		t.Fatalf("restore on an engine without the role = %+v", got)
	}
	if got := dawSoloRestoreIn(t.Context(), "REAPER", nil); !got.OK {
		t.Fatalf("restore with no adapter = %+v", got)
	}
}

func TestDawSoloRestorePutsBackAndNeverLooksAtTheSwitch(t *testing.T) {
	role := &fakeSoloer{released: dawport.SoloReleased{Restored: 1}}
	got := dawSoloRestoreIn(t.Context(), "REAPER", role)
	if !got.OK || !got.Changed || role.restores != 1 {
		t.Fatalf("restore = %+v after %d restores", got, role.restores)
	}
	role.released = dawport.SoloReleased{Waiting: true}
	if got := dawSoloRestoreIn(t.Context(), "REAPER", role); !got.OK || got.Changed {
		t.Fatalf("waiting restore = %+v", got)
	}
	role.restoreErr = bridge.ErrNoAnswer
	if got := dawSoloRestoreIn(t.Context(), "REAPER", role); got.OK || !strings.Contains(got.Refused, "not answering") {
		t.Fatalf("no answer = %+v", got)
	}
}

func TestRestoreSoloOnShutdownAsksTheRoleOnceAndDoesNothingWithoutOne(t *testing.T) {
	host, _ := newReadAloudReaperHost(t)
	host.restoreSoloOnShutdown()
	role := &fakeSoloer{}
	host.placeFollower = role
	host.restoreSoloOnShutdown()
	if role.restores != 1 {
		t.Fatalf("restores = %d, want 1", role.restores)
	}
}

// TestDawSoloContractGoldensAreCurrent pins the bindings' answers. UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-solo-*.json.
func TestDawSoloContractGoldensAreCurrent(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	svc := host.services()
	role := &fakeSoloer{answer: dawport.ChapterSoloed{TrackGUID: readAloudTrack, Changed: true}, released: dawport.SoloReleased{Restored: 1}}
	done, err := dawSoloChapterIn(t.Context(), svc, "REAPER", available(), role, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "daw-solo-chapter-done", done)
	refused, err := dawSoloChapterIn(t.Context(), svc, "REAPER", dawport.Support{Message: "REAPER is not answering. Check that REAPER is open, then try again."}, role, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "daw-solo-chapter-refused", refused)
	contractfile.Check(t, "daw-solo-restore-done", dawSoloRestoreIn(t.Context(), "REAPER", role))
}
