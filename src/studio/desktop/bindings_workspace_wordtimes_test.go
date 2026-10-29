package main

import (
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/coverage"
	"desktop/internal/tracks"
)

func intp(n int) *int       { return &n }
func fp(f float64) *float64 { return &f }
func wordTokens() []coverage.TokenLine {
	return []coverage.TokenLine{
		{Index: 0, Word: 0, Text: "Call", Status: "read", Item: intp(0), Start: fp(1), End: fp(1.4)},
		{Index: 1, Word: 1, Text: "me", Status: "misread", Item: intp(0), Start: fp(2), End: fp(2.5)},
		{Index: 2, Word: 2, Text: "Ishmael", Status: "read", Item: intp(0), Start: fp(10), End: fp(10.6)},
		{Index: 3, Word: 3, Text: "gone", Status: "skip"},
	}
}

func wordTimesFixture() (coverage.AlignmentView, tracks.Project, bridge.TrackState) {
	view := coverage.AlignmentView{
		RecordID: "rec-1",
		Tokens:   wordTokens(),
		Items:    []coverage.AlignmentItem{{Index: 0, ItemGUID: "{A}", Live: true}},
	}
	saved := tracks.Project{Tracks: []tracks.Track{{GUID: "{T}", Items: []tracks.Item{{GUID: "{A}", SourceFile: "C:/Book/chapter.wav", Position: 100, Length: 40, PlayRate: 1}}}}}
	// Live: the narrator split at 5 s and deleted 3 s, closing the gap, so the right half starts at 105 playing from 8 s.
	state := bridge.TrackState{ChangeCount: 31, Items: []bridge.TrackItem{
		{ItemGUID: "{A}", SourceFile: "C:/Book/chapter.wav", Position: 100, Length: 5, PlayRate: 1},
		{ItemGUID: "{NEW}", SourceFile: "C:/Book/chapter.wav", Position: 105, Length: 35, SourceOffset: 8, PlayRate: 1},
	}}
	return view, saved, state
}

func TestWordTimesPutTheAlignmentThroughTheLiveItems(t *testing.T) {
	view, saved, state := wordTimesFixture()
	got := wordTimesIn(view, saved, state)
	if !got.Available || got.ChangeCount != 31 || got.Version != "rec-1@31" {
		t.Fatalf("answer = %+v", got)
	}
	want := []struct {
		state string
		start float64
		item  int
	}{{"placed", 101, 0}, {"placed", 102, 0}, {"placed", 107, 1}, {"not_heard", 0, -1}}
	for i, w := range want {
		row := got.Words[i]
		if row.State != w.state || row.Start != w.start || row.Item != w.item {
			t.Errorf("word %d = %+v, want %+v", i, row, w)
		}
	}
	if len(got.Items) != 2 || got.Items[0] != "{A}" || got.Items[1] != "{NEW}" {
		t.Errorf("items = %v", got.Items)
	}
	if !got.Words[1].Misread || got.Words[0].Misread {
		t.Errorf("misread flags = %v %v", got.Words[0].Misread, got.Words[1].Misread)
	}
}

func TestWordTimesOfAWordCutOutHaveNoTime(t *testing.T) {
	view, saved, state := wordTimesFixture()
	state.Items[1].SourceOffset = 12 // 5-12 s of the source are gone: the third word (10 s) is cut out
	row := wordTimesIn(view, saved, state).Words[2]
	if row.State != "not_in_project" || row.Start != 0 || row.End != 0 || row.Item != -1 {
		t.Fatalf("row = %+v", row)
	}
}

func TestWordTimesGoldens(t *testing.T) {
	view, saved, state := wordTimesFixture()
	contractfile.Check(t, "workspace-word-times", wordTimesIn(view, saved, state))
	contractfile.Check(t, "workspace-word-times-unavailable", unavailableWordTimes())
	contractfile.Check(t, "daw-project-edited", dawProjectEdited{ChangeCount: 31})
}
