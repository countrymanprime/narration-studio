package passagetakes

import (
	"reflect"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/passagemap"
	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

const (
	firstItem  = "{A0000001-0000-4000-8000-000000000001}"
	firstTake  = "{A0000002-0000-4000-8000-000000000002}"
	retryItem  = "{A0000003-0000-4000-8000-000000000003}"
	retryTake  = "{A0000004-0000-4000-8000-000000000004}"
	laterItem  = "{A0000005-0000-4000-8000-000000000005}"
	laterTake  = "{A0000006-0000-4000-8000-000000000006}"
	stackedOne = "{A0000007-0000-4000-8000-000000000007}"
)

// The chapter: p-1 (10 words) and p-2 (8 words). Run r1 read p-1 into firstItem and stopped; run r2 read p-1 again into
// retryItem; run r3 read p-2 into laterItem.
func stackLines() []passagemap.Line {
	return []passagemap.Line{{ChapterID: "ch-1", ID: "p-1", Words: 10}, {ChapterID: "ch-1", ID: "p-2", Words: 8}, {ChapterID: "ch-2", ID: "p-9", Words: 3}}
}

func runOf(run, item string, from, to passagemap.Place, start, end float64) []passagemap.Resolved {
	return []passagemap.Resolved{
		{Mark: passagemap.Mark{Run: run, ChapterID: "ch-1", PID: from.PID, Word: from.Word, Sec: start, Kind: passagemap.KindStart, ItemGUID: item}},
		{Mark: passagemap.Mark{Run: run, ChapterID: "ch-1", PID: to.PID, Word: to.Word, Sec: end, Kind: passagemap.KindStop, Prev: &to, ItemGUID: item}},
	}
}

func stackMarks() []passagemap.Resolved {
	var marks []passagemap.Resolved
	marks = append(marks, runOf("r1", firstItem, passagemap.Place{PID: "p-1"}, passagemap.Place{PID: "p-1", Word: 10}, 0, 6)...)
	marks = append(marks, runOf("r2", retryItem, passagemap.Place{PID: "p-1"}, passagemap.Place{PID: "p-1", Word: 10}, 10, 16)...)
	marks = append(marks, runOf("r3", laterItem, passagemap.Place{PID: "p-2"}, passagemap.Place{PID: "p-2", Word: 8}, 20, 25)...)
	return marks
}

func liveTrack() []dawport.TrackItem {
	return []dawport.TrackItem{
		{ItemGUID: firstItem, TakeGUID: firstTake, Position: 10, Length: 6},
		{ItemGUID: retryItem, TakeGUID: retryTake, Position: 16, Length: 4},
		{ItemGUID: laterItem, TakeGUID: laterTake, Position: 20, Length: 5},
	}
}

func stackInput(ids ...string) StackInput {
	return StackInput{ChapterID: "ch-1", PassageIDs: ids, Passages: StackPassages("ch-1", stackLines(), stackMarks()), Live: liveTrack(), DAW: "REAPER"}
}

// A paragraph two items read is a passage; one read once is not, and nor is another chapter's.
func TestStackPassagesAreParagraphsTwoOrMoreItemsRead(t *testing.T) {
	got := StackPassages("ch-1", stackLines(), stackMarks())
	want := []StackPassage{{ID: "pm-ch-1-p-1", Items: []string{firstItem, retryItem}}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("StackPassages = %+v, want %+v", got, want)
	}
	// A roll's takes are one item: two reads of p-1 on firstItem are not a passage to stack.
	rolled := append(runOf("r1", firstItem, passagemap.Place{PID: "p-1"}, passagemap.Place{PID: "p-1", Word: 10}, 0, 6),
		runOf("r4", firstItem, passagemap.Place{PID: "p-1"}, passagemap.Place{PID: "p-1", Word: 10}, 7, 12)...)
	if got := StackPassages("ch-1", stackLines(), rolled); len(got) != 0 {
		t.Fatalf("one item's reads = %+v", got)
	}
	// Stale marks and unstamped runs count for nothing; a read that covers no word of the paragraph neither.
	stale := stackMarks()
	stale[2].Stale = true
	if got := StackPassages("ch-1", stackLines(), stale); len(got) != 0 {
		t.Fatalf("with a stale mark = %+v", got)
	}
	empty := append(stackMarks()[:2], runOf("r2", retryItem, passagemap.Place{PID: "p-1", Word: 10}, passagemap.Place{PID: "p-2", Word: 3}, 10, 12)...)
	if got := StackPassages("ch-1", stackLines(), empty); len(got) != 0 {
		t.Fatalf("a read from p-1's end = %+v", got)
	}
}

// host-recomputes-the-plan: the first read stays, the retry moves from where REAPER has it now onto the first read's start,
// and the shift is what narration_takes.lua checks (the first read's end less the latest end).
func TestStackPlanMovesTheLaterReadsOntoTheFirstReadFromTheLiveTrack(t *testing.T) {
	got, refused := StackPlan(stackInput("pm-ch-1-p-1"))
	if refused != nil {
		t.Fatalf("refused %+v", refused)
	}
	want := dawport.StackRequest{
		ChapterID: "ch-1",
		Groups:    []dawport.StackGroup{{PassageID: "pm-ch-1-p-1", ItemGUID: firstItem, Base: firstTake, Moves: []dawport.StackMove{{TakeID: retryTake, From: 16, To: 10, Len: 4}}}},
		Shift:     -4,
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("StackPlan = %+v, want %+v", got, want)
	}
	// The first read is the one that starts first on the track now, whatever order the runs were recorded in.
	in := stackInput("pm-ch-1-p-1", "pm-ch-1-p-1")
	in.Live[0].Position, in.Live[1].Position = 30, 2
	got, _ = StackPlan(in)
	if group := got.Groups[0]; group.ItemGUID != retryItem || group.Base != retryTake || group.Moves[0] != (dawport.StackMove{TakeID: firstTake, From: 30, To: 2, Len: 6}) || got.Shift != -(30+6-(2+4)) {
		t.Fatalf("named twice, reversed = %+v", got)
	}
}

func TestStackPlanRefusals(t *testing.T) {
	for name, c := range map[string]struct {
		in    func(StackInput) StackInput
		want  dawport.Result
		stale bool
	}{
		"an id the chapter does not list": {func(in StackInput) StackInput { in.PassageIDs = []string{firstItem}; return in }, dawport.RefusedStale(stackNotAPassageSentence), true},
		"no id":                           {func(in StackInput) StackInput { in.PassageIDs = nil; return in }, dawport.Refused("There are no retries to move in REAPER."), false},
		"a kept take": {func(in StackInput) StackInput {
			muted := true
			in.Live[1].Muted = &muted
			return in
		}, dawport.Refused(stackKeptSentence), false},
		"already on the first read's spot": {func(in StackInput) StackInput {
			in.Live[1].Position = 10.04
			return in
		}, dawport.Refused("There are no retries to move in REAPER."), false},
		"the retry is gone from the track": {func(in StackInput) StackInput { in.Live = in.Live[:1]; return in }, dawport.Refused("There are no retries to move in REAPER."), false},
	} {
		t.Run(name, func(t *testing.T) {
			got, refused := StackPlan(c.in(stackInput("pm-ch-1-p-1")))
			if refused == nil || !reflect.DeepEqual(*refused, c.want) || len(got.Groups) != 0 {
				t.Fatalf("StackPlan = %+v, %+v; want %+v", got, refused, c.want)
			}
		})
	}
}

// Passages that share a first read are one group; a read under two first reads is refused.
func TestStackPlanMergesPassagesThatShareAFirstRead(t *testing.T) {
	passages := []StackPassage{{ID: "a", Items: []string{firstItem, retryItem}}, {ID: "b", Items: []string{retryItem, firstItem}}}
	got, refused := StackPlan(StackInput{ChapterID: "ch-1", PassageIDs: []string{"a", "b"}, Passages: passages, Live: liveTrack(), DAW: "REAPER"})
	if refused != nil || len(got.Groups) != 1 || len(got.Groups[0].Moves) != 1 || got.Shift != -4 {
		t.Fatalf("shared first read = %+v, %+v", got, refused)
	}
	passages = []StackPassage{{ID: "a", Items: []string{firstItem, retryItem}}, {ID: "b", Items: []string{retryItem, laterItem}}}
	if _, refused := StackPlan(StackInput{ChapterID: "ch-1", PassageIDs: []string{"a", "b"}, Passages: passages, Live: liveTrack(), DAW: "REAPER"}); refused == nil || refused.Refused != stackSharedSentence {
		t.Fatalf("a read under two first reads = %+v", refused)
	}
}

// After a stack the retry's item is on the Cuts track and the first read's item carries its take, recorded with its offset:
// moving back goes from the first read's start to that start plus the offset, for the read item's length.
func savedAfterStack(offset string) tracks.Project {
	return tracks.Project{Tracks: []tracks.Track{
		{Name: "Chapter 1", Items: []tracks.Item{{GUID: firstItem, Position: 10, Length: 6, Takes: []tracks.Take{
			{GUID: firstTake},
			{GUID: stackedOne, Ext: map[string]string{StackedFromKey: retryItem + "|" + retryTake + "|{T}|16.000000|" + offset}},
		}}}},
		{Name: "Cuts", Items: []tracks.Item{{GUID: retryItem, Position: 16, Length: 4, Takes: []tracks.Take{{GUID: retryTake}}}}},
	}}
}

func TestUnstackPlanMovesStackedTakesBackByTheOffsetTheyRecorded(t *testing.T) {
	in := stackInput("pm-ch-1-p-1")
	in.Live = []dawport.TrackItem{{ItemGUID: firstItem, TakeGUID: firstTake, Position: 10, Length: 6}, {ItemGUID: laterItem, TakeGUID: laterTake, Position: 16, Length: 5}}
	in.Saved = savedAfterStack("6.000000")
	got, refused := UnstackPlan(in)
	want := dawport.StackRequest{
		ChapterID: "ch-1",
		Groups:    []dawport.StackGroup{{PassageID: "pm-ch-1-p-1", ItemGUID: firstItem, Base: firstTake, Moves: []dawport.StackMove{{TakeID: retryTake, From: 10, To: 16, Len: 4}}}},
		Shift:     4,
	}
	if refused != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("UnstackPlan = %+v, %+v; want %+v", got, refused, want)
	}

	notSaved := in
	notSaved.Saved = tracks.Project{Tracks: []tracks.Track{{Items: []tracks.Item{{GUID: firstItem, Takes: []tracks.Take{{GUID: firstTake}}}}}}}
	if _, refused := UnstackPlan(notSaved); refused == nil || refused.Code != "" || refused.Refused != "No take of these passages is stacked in the saved REAPER project, so nothing was moved back. Save the project in REAPER if you stacked them since, then try again." {
		t.Fatalf("nothing stacked in the saved project = %+v", refused)
	}
	gone := in
	gone.Saved = savedAfterStack("6.000000")
	gone.Saved.Tracks = gone.Saved.Tracks[:1]
	if _, refused := UnstackPlan(gone); refused == nil || refused.Code != dawport.CodeStale {
		t.Fatalf("the read's item gone = %+v", refused)
	}
	bad := in
	bad.Saved = savedAfterStack("-1")
	if _, refused := UnstackPlan(bad); refused == nil || refused.Code != "" {
		t.Fatalf("a record that is not readable = %+v", refused)
	}
	kept := in
	muted := true
	kept.Live[0].Muted = &muted
	if _, refused := UnstackPlan(kept); refused == nil || refused.Refused != stackKeptSentence {
		t.Fatalf("kept = %+v", refused)
	}
}
