package main

import (
	"context"
	"errors"
	"math"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/dawport"
)

// DawPlace and DawGoToChapter. What REAPER does is narration_track_select.lua's (track_select_test.lua) and what the role answers is
// dawport/reaper's. These cover the host's wiring: the capability checked first, the chapter-track link in both directions, and the
// sentence each refusal gets.

type fakePlaceFollower struct {
	place    dawport.Place
	err      error
	moved    []string
	targets  []dawport.PlaceTarget
	moveErr  error
	readOnce int
}

func (f *fakePlaceFollower) ReadPlace(context.Context) (dawport.Place, error) {
	f.readOnce++
	return f.place, f.err
}

func (f *fakePlaceFollower) GoTo(_ context.Context, trackID string, target dawport.PlaceTarget) error {
	f.moved = append(f.moved, trackID)
	f.targets = append(f.targets, target)
	return f.moveErr
}

func TestDawPlaceNamesTheChapterOfTheSelectedTrack(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	role := &fakePlaceFollower{place: dawport.Place{TrackID: strings.ToLower(readAloudTrack), Selected: 1, Cursor: 12.5}}
	got := dawPlaceIn(t.Context(), host.services(), "REAPER", available(), role)
	if !got.OK || got.ChapterID != ids[0] || got.Cursor != 12.5 || got.Selected != 1 {
		t.Fatalf("place = %+v, want chapter %s", got, ids[0])
	}
}

func TestDawPlaceNamesNoChapterForNoTrackSeveralTracksOrAnUnlinkedTrack(t *testing.T) {
	host, _ := newReadAloudReaperHost(t)
	for name, place := range map[string]dawport.Place{
		"none":      {Selected: 0},
		"several":   {Selected: 2},
		"unlinked":  {TrackID: "{FFFFFFFF-0000-4000-8000-00000000FFFF}", Selected: 1},
		"empty-ids": {TrackID: "{}", Selected: 1},
	} {
		got := dawPlaceIn(t.Context(), host.services(), "REAPER", available(), &fakePlaceFollower{place: place})
		if !got.OK || got.ChapterID != "" {
			t.Errorf("%s: %+v, want ok with no chapter", name, got)
		}
	}
}

func TestDawPlaceRefusalsAreSentencesAndAskNothingWhenTheCapabilityIsRefused(t *testing.T) {
	host, _ := newReadAloudReaperHost(t)
	role := &fakePlaceFollower{}
	refused := dawPlaceIn(t.Context(), host.services(), "REAPER", dawport.Support{Message: "Following is off."}, role)
	if refused.OK || refused.Message != "Following is off." || role.readOnce != 0 {
		t.Fatalf("refused = %+v (reads %d)", refused, role.readOnce)
	}
	if got := dawPlaceIn(t.Context(), host.services(), "REAPER", available(), nil); got.OK || !strings.Contains(got.Message, "not connected") {
		t.Fatalf("no adapter = %+v", got)
	}
	for _, err := range []error{bridge.ErrNoAnswer, bridge.ErrUnavailable, context.DeadlineExceeded, errors.New("boom")} {
		got := dawPlaceIn(t.Context(), host.services(), "REAPER", available(), &fakePlaceFollower{err: err})
		if got.OK || got.Message == "" {
			t.Errorf("%v: %+v, want a refusal sentence", err, got)
		}
	}
}

func TestDawGoToChapterMovesToTheChaptersLinkedTrack(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	role := &fakePlaceFollower{}
	got, err := dawGoToChapterIn(t.Context(), host.services(), "REAPER", available(), role, ids[0], "end", 0)
	if err != nil || !got.OK || got.Refused != "" {
		t.Fatalf("end = %+v, %v", got, err)
	}
	if _, err := dawGoToChapterIn(t.Context(), host.services(), "REAPER", available(), role, ids[0], "at", 17.25); err != nil {
		t.Fatal(err)
	}
	if len(role.moved) != 2 || role.moved[0] != readAloudTrack || !role.targets[0].End || role.targets[1].End || role.targets[1].Seconds != 17.25 {
		t.Fatalf("moved %v to %+v", role.moved, role.targets)
	}
}

func TestDawGoToChapterRefusesWithNothingMoved(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	role := &fakePlaceFollower{}
	cases := []struct {
		name    string
		support dawport.Support
		chapter string
		where   string
		seconds float64
		want    string
	}{
		{"capability refused", dawport.Support{Message: "Following is off."}, ids[0], "end", 0, "Following is off."},
		{"negative", available(), ids[0], "at", -1, "usable number"},
		{"NaN", available(), ids[0], "at", math.NaN(), "usable number"},
		{"infinite", available(), ids[0], "at", math.Inf(1), "usable number"},
		{"unknown place", available(), ids[0], "sideways", 0, "must be"},
		{"unlinked chapter", available(), ids[1], "end", 0, "no linked track"},
	}
	for _, c := range cases {
		got, err := dawGoToChapterIn(t.Context(), host.services(), "REAPER", c.support, role, c.chapter, c.where, c.seconds)
		if err != nil || got.OK || !strings.Contains(got.Refused, c.want) {
			t.Errorf("%s: %+v, %v; want a refusal containing %q", c.name, got, err, c.want)
		}
	}
	if len(role.moved) != 0 {
		t.Fatalf("the DAW was moved: %v", role.moved)
	}
	if _, err := dawGoToChapterIn(t.Context(), host.services(), "REAPER", available(), role, "no-such-chapter", "end", 0); err == nil {
		t.Error("a chapter the manuscript does not have must be an error")
	}
}

func TestDawGoToChapterWordsAGoneTrackAndAnUnansweringDaw(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	got, _ := dawGoToChapterIn(t.Context(), host.services(), "REAPER", available(), &fakePlaceFollower{moveErr: &bridge.TrackStaleError{GUID: readAloudTrack}}, ids[0], "end", 0)
	if !strings.Contains(got.Refused, "no longer in the REAPER project") {
		t.Errorf("stale = %+v", got)
	}
	got, _ = dawGoToChapterIn(t.Context(), host.services(), "REAPER", available(), &fakePlaceFollower{moveErr: bridge.ErrNoAnswer}, ids[0], "end", 0)
	if !strings.Contains(got.Refused, "not answering") {
		t.Errorf("no answer = %+v", got)
	}
	got, _ = dawGoToChapterIn(t.Context(), host.services(), "REAPER", available(), nil, ids[0], "end", 0)
	if !strings.Contains(got.Refused, "not connected") {
		t.Errorf("no adapter = %+v", got)
	}
}

// TestDawPlaceContractGoldensAreCurrent pins the bindings' answers: where the narrator is, a refusal, and a move to a chapter.
// UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/daw-place-*.json and daw-go-to-chapter-*.json.
func TestDawPlaceContractGoldensAreCurrent(t *testing.T) {
	host, ids := newReadAloudReaperHost(t)
	svc := host.services()
	on := &fakePlaceFollower{place: dawport.Place{TrackID: readAloudTrack, Selected: 1, Cursor: 12.5}}
	contractfile.Check(t, "daw-place-ok", dawPlaceIn(t.Context(), svc, "REAPER", available(), on))
	contractfile.Check(t, "daw-place-refused", dawPlaceIn(t.Context(), svc, "REAPER", dawport.Support{Message: "Experimental DAW actions are off. Turn them on in Settings to follow the narrator's place."}, on))
	done, err := dawGoToChapterIn(t.Context(), svc, "REAPER", available(), on, ids[0], "end", 0)
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "daw-go-to-chapter-done", done)
	refused, err := dawGoToChapterIn(t.Context(), svc, "REAPER", available(), on, ids[0], "at", -1)
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "daw-go-to-chapter-refused", refused)
}
