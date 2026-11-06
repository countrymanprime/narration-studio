package main

import (
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/coverage"
	"desktop/internal/tracks"
	"desktop/internal/wordtimes"
)

const (
	punchFolder   = "{F0000000-0000-4000-8000-000000000001}"
	punchNarrator = "{A0000000-0000-4000-8000-000000000001}"
	punchHero     = "{B0000000-0000-4000-8000-000000000001}"
)

func punchPtr[T any](v T) *T { return &v }

// Four words of paragraph p1: words 0-1 heard in file n.wav (item 0, the narrator's), word 2 in h.wav (item 1, the hero's), word 3 never heard.
func punchView() coverage.AlignmentView {
	pid := punchPtr("p1")
	return coverage.AlignmentView{
		Items: []coverage.AlignmentItem{{Index: 0, ItemGUID: "n1"}, {Index: 1, ItemGUID: "h1"}},
		Tokens: []coverage.TokenLine{
			{Index: 0, ParagraphID: pid, Word: 0, Item: punchPtr(0), Start: punchPtr(1.0), End: punchPtr(1.5)},
			{Index: 1, ParagraphID: pid, Word: 1, Item: punchPtr(0), Start: punchPtr(1.5), End: punchPtr(2.0)},
			{Index: 2, ParagraphID: pid, Word: 2, Item: punchPtr(1), Start: punchPtr(0.0), End: punchPtr(0.5)},
			{Index: 3, ParagraphID: pid, Word: 3},
		},
	}
}

func punchProject() tracks.Project {
	return tracks.Project{Tracks: []tracks.Track{
		{GUID: punchFolder, Name: "Chapter 1", IsFolder: true},
		{GUID: punchNarrator, Name: "Narrator", Depth: 1, Items: []tracks.Item{{GUID: "n1", SourceFile: "n.wav"}}},
		{GUID: punchHero, Name: "Hero", Depth: 1, Items: []tracks.Item{{GUID: "h1", SourceFile: "h.wav"}}},
	}}
}

func punchState() bridge.TrackState {
	return bridge.TrackState{ChangeCount: 7, Items: []bridge.TrackItem{
		{ItemGUID: "n1", SourceFile: "n.wav", Position: 100, Length: 10, PlayRate: 1, TrackGUID: punchNarrator},
		{ItemGUID: "h1", SourceFile: "h.wav", Position: 300, Length: 5, PlayRate: 1, TrackGUID: punchHero},
	}}
}

func TestBoothPunchFindsTheSpanOnTheTrackThatRecordedIt(t *testing.T) {
	got := boothPunchFor(punchView(), punchProject(), punchState(), punchFolder, "p1", 0, 1)
	if got.Outcome != wordtimes.PunchFound || got.TrackGUID != punchNarrator || got.TrackName != "Narrator" || *got.Start != 101 || *got.End != 102 {
		t.Fatalf("got %+v, want 101-102 on the narrator", got)
	}
	hero := boothPunchFor(punchView(), punchProject(), punchState(), punchFolder, "p1", 2, 2)
	if hero.Outcome != wordtimes.PunchFound || hero.TrackGUID != punchHero || *hero.Start != 300 {
		t.Fatalf("got %+v, want the hero's track, where the word was recorded", hero)
	}
}

func TestBoothPunchOnAFlatChapterIsOnThatTrack(t *testing.T) {
	state := punchState()
	for i := range state.Items {
		state.Items[i].TrackGUID = ""
	}
	got := boothPunchFor(punchView(), punchProject(), state, punchNarrator, "p1", 0, 0)
	if got.Outcome != wordtimes.PunchFound || got.TrackGUID != punchNarrator {
		t.Fatalf("got %+v", got)
	}
}

func TestBoothPunchRefusesWithASentenceAndNeverGuesses(t *testing.T) {
	stale := punchView()
	stale.NeedsAlignAgain = true
	for name, tc := range map[string]struct {
		got    BoothPunch
		reason string
	}{
		"two voices":      {boothPunchFor(punchView(), punchProject(), punchState(), punchFolder, "p1", 1, 2), wordtimes.PunchSeveralVoices},
		"stale alignment": {boothPunchFor(stale, punchProject(), punchState(), punchFolder, "p1", 0, 0), boothPunchStale},
		"no alignment":    {boothPunchFor(coverage.AlignmentView{}, punchProject(), punchState(), punchFolder, "p1", 0, 0), boothPunchNoAlignment},
		"unknown words":   {boothPunchFor(punchView(), punchProject(), punchState(), punchFolder, "gone", 0, 1), wordtimes.PunchNoWords},
	} {
		if tc.got.Outcome != wordtimes.PunchRefused || tc.got.Reason != tc.reason || !strings.HasSuffix(tc.got.Message, ".") || tc.got.Start != nil {
			t.Errorf("%s: got %+v, want a refusal %q with a sentence", name, tc.got, tc.reason)
		}
	}
}

func TestBoothPunchOnAWordNobodyRecordedIsAContinue(t *testing.T) {
	got := boothPunchFor(punchView(), punchProject(), punchState(), punchFolder, "p1", 3, 3)
	if got.Outcome != wordtimes.PunchNeverRecorded || got.TrackGUID != "" {
		t.Fatalf("got %+v", got)
	}
}

func TestContractBoothPunch(t *testing.T) {
	stale := punchView()
	stale.NeedsAlignAgain = true
	contractfile.Check(t, "booth-punch", map[string]any{
		"found":          boothPunchFor(punchView(), punchProject(), punchState(), punchFolder, "p1", 0, 1),
		"never_recorded": boothPunchFor(punchView(), punchProject(), punchState(), punchFolder, "p1", 3, 3),
		"several_voices": boothPunchFor(punchView(), punchProject(), punchState(), punchFolder, "p1", 1, 2),
		"stale":          boothPunchFor(stale, punchProject(), punchState(), punchFolder, "p1", 0, 0),
		"no_alignment":   boothPunchFor(coverage.AlignmentView{}, punchProject(), punchState(), punchFolder, "p1", 0, 0),
		"no_words":       boothPunchFor(punchView(), punchProject(), punchState(), punchFolder, "gone", 0, 1),
		"no_daw":         boothPunchRefused(boothPunchNoDAW),
		"not_in_project": boothPunchRefused(wordtimes.PunchNotInProject),
	})
}
