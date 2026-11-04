package passagetakes

import (
	"strings"
	"testing"

	"desktop/internal/coverage"
	"desktop/internal/passagemap"
	"desktop/internal/retakelanes"
	"desktop/internal/tracks"
)

const (
	guidA = "{AAAAAAAA-0000-0000-0000-000000000001}"
	guidB = "{BBBBBBBB-0000-0000-0000-000000000002}"
	guidC = "{CCCCCCCC-0000-0000-0000-000000000003}"
	guidD = "{DDDDDDDD-0000-0000-0000-000000000004}"
	take1 = "{11111111-0000-0000-0000-000000000001}"
	take2 = "{22222222-0000-0000-0000-000000000002}"
	take3 = "{33333333-0000-0000-0000-000000000003}"
	take4 = "{44444444-0000-0000-0000-000000000004}"
	take5 = "{55555555-0000-0000-0000-000000000005}"
)

func take(guid, file string, soffs float64, active bool) tracks.Take {
	return tracks.Take{GUID: guid, Name: file, SourceKind: "WAVE", SourceFile: file, SourceAvailable: true, Supported: true, Active: active, SOFFS: soffs, PlayRate: 1}
}

// project: track "Chapter 1" holds item A (two takes, the first active), track "Lanes" is fixed-lane with the retakes
// B (lane 0, plays) and C (lane 1) of line-1, and item D (one take) sits on a plain track "Pickups".
func project() tracks.Project {
	a := tracks.Item{GUID: guidA, Name: "A", Position: 0, Length: 8, TakeGUID: take1, ActiveTake: 0, Supported: true,
		Takes: []tracks.Take{take("read-1.wav", "read-1.wav", 0, true), take("read-2.wav", "read-2.wav", 2, false)}}
	a.Takes[0].GUID, a.Takes[1].GUID = take1, take2
	b := tracks.Item{GUID: guidB, Name: "B", Position: 20, Length: 8, Lane: 0, TakeGUID: take3, Takes: []tracks.Take{take("lane-b.wav", "lane-b.wav", 0, true)},
		Ext: map[string]string{retakelanes.LineIDKey: "line-1"}}
	b.Takes[0].GUID = take3
	c := tracks.Item{GUID: guidC, Name: "C", Position: 20, Length: 8, Lane: 1, TakeGUID: take4, Takes: []tracks.Take{take("lane-c.wav", "lane-c.wav", 0, true)},
		Ext: map[string]string{retakelanes.LineIDKey: "line-1"}}
	c.Takes[0].GUID = take4
	d := tracks.Item{GUID: guidD, Name: "D", Position: 40, Length: 8, TakeGUID: take5, Takes: []tracks.Take{take("pickup.wav", "pickup.wav", 3, true)}}
	d.Takes[0].GUID = take5
	return tracks.Project{Path: "book.rpp", Tracks: []tracks.Track{
		{GUID: "{T1}", Name: "Chapter 1", Items: []tracks.Item{a}},
		{GUID: "{T2}", Name: "Lanes", FixedLanes: true, LaneCount: 2, PlayingLanes: []int{0}, Items: []tracks.Item{b, c}},
		{GUID: "{T3}", Name: "Pickups", Items: []tracks.Item{d}},
	}}
}

func strptr(s string) *string { return &s }
func intptr(i int) *int       { return &i }

// view: two paragraphs, six tokens; paragraph p-1 (tokens 0-2) was heard on item 0 (A), p-2 (tokens 3-5) on item 0 too,
// except token 5 which was not heard.
func view() coverage.AlignmentView {
	tokens := make([]coverage.TokenLine, 6)
	for i := range tokens {
		p := "p-1"
		if i >= 3 {
			p = "p-2"
		}
		tokens[i] = coverage.TokenLine{Index: i, ParagraphID: strptr(p), Word: i % 3, Text: "w", Status: "matched", Item: intptr(0)}
	}
	tokens[5].Item = nil
	return coverage.AlignmentView{
		ChapterID: "ch-1", State: "current",
		Paragraphs: []coverage.AlignmentParagraph{{ID: "p-1", Text: "one two three"}, {ID: "p-2", Text: "four five six"}},
		Tokens:     tokens,
		Items:      []coverage.AlignmentItem{{Index: 0, ItemGUID: guidA, Live: true, TakeGUID: take1}},
	}
}

func resolve(t *testing.T, mutate func(*Input)) Resolved {
	t.Helper()
	in := Input{ChapterID: "ch-1", View: view(), FirstToken: 1, LastToken: 2, Project: project()}
	if mutate != nil {
		mutate(&in)
	}
	resolved, err := Resolve(in)
	if err != nil {
		t.Fatal(err)
	}
	return resolved
}

func bySource(candidates []Candidate, source string) []Candidate {
	var out []Candidate
	for _, c := range candidates {
		if c.Source == source {
			out = append(out, c)
		}
	}
	return out
}

func TestAPassageSnapsOutToWholeParagraphsAndNamesTheItemMostOfItsWordsWereHeardOn(t *testing.T) {
	got := resolve(t, nil).View
	if got.FirstParagraph != 0 || got.LastParagraph != 0 || got.ItemGUID != guidA || got.PassageID == "" || got.Message != "" {
		t.Fatalf("view = %+v", got)
	}
	wide := resolve(t, func(in *Input) { in.FirstToken, in.LastToken = 2, 3 }).View
	if wide.FirstParagraph != 0 || wide.LastParagraph != 1 {
		t.Fatalf("a passage across two paragraphs: %+v", wide)
	}
	if wide.PassageID == got.PassageID {
		t.Error("two passages share one id")
	}
	if again := resolve(t, nil).View.PassageID; again != got.PassageID {
		t.Error("the same passage got another id")
	}
}

func TestEveryTakeOfTheItemIsOffered(t *testing.T) {
	got := resolve(t, nil).View.Candidates

	takes := bySource(got, SourceItemTake)
	if len(takes) != 2 || !takes[0].Active || takes[1].Active || takes[1].Action != ActionMakeActive || takes[1].TakeGUID != take2 {
		t.Fatalf("item takes = %+v", takes)
	}
	if takes[1].SourceFile != "read-2.wav" || takes[1].SourceStart != 2 || takes[1].SourceLength != 8 || !takes[1].Usable {
		t.Fatalf("second take's range = %+v", takes[1])
	}
	if lanes := bySource(got, SourceLaneRetake); len(lanes) != 0 {
		t.Fatalf("item A is not on a lane track, so its lane retakes are not offered: %+v", lanes)
	}
	if len(got) != 2 {
		t.Fatalf("only the item's own takes are offered: %+v", got)
	}
}

func TestALaneItemsOtherRetakesAreOfferedAsLanePicks(t *testing.T) {
	got := resolve(t, func(in *Input) {
		in.View.Items[0] = coverage.AlignmentItem{Index: 0, ItemGUID: guidB, Live: true, TakeGUID: take3}
	}).View.Candidates

	lanes := bySource(got, SourceLaneRetake)
	if len(lanes) != 1 || lanes[0].ItemGUID != guidC || lanes[0].Action != ActionPickLane || lanes[0].Active || lanes[0].TakeGUID != take4 {
		t.Fatalf("lane retakes = %+v", lanes)
	}
	if len(bySource(got, SourceItemTake)) != 0 {
		t.Fatalf("a one-take item offers no other take: %+v", got)
	}
}

func TestATakeWhoseFileIsMissingIsListedButNotUsable(t *testing.T) {
	got := resolve(t, func(in *Input) { in.Project.Tracks[0].Items[0].Takes[1].SourceAvailable = false }).View.Candidates
	takes := bySource(got, SourceItemTake)
	if takes[1].Usable || takes[1].Reason == "" {
		t.Fatalf("take = %+v", takes[1])
	}
}

func TestAPassageNothingWasHeardOnOffersNothingAndSaysWhy(t *testing.T) {
	got := resolve(t, func(in *Input) { in.FirstToken, in.LastToken = 5, 5 }).View
	if got.ItemGUID != "" || len(got.Candidates) != 0 || got.PassageID != "" || !strings.Contains(got.Message, "wasn't heard") {
		t.Fatalf("view = %+v", got)
	}
}

func TestAnItemNoLongerInTheSavedProjectOffersNothing(t *testing.T) {
	got := resolve(t, func(in *Input) { in.Project = tracks.Project{} }).View
	if len(got.Candidates) != 0 || !strings.Contains(got.Message, "no longer") {
		t.Fatalf("view = %+v", got)
	}
}

func TestATokenOutsideTheAlignmentIsTheCallersError(t *testing.T) {
	for _, r := range [][2]int{{-1, 1}, {0, 6}, {3, 1}} {
		if _, err := Resolve(Input{ChapterID: "ch-1", View: view(), FirstToken: r[0], LastToken: r[1], Project: project()}); err == nil {
			t.Errorf("tokens %v: no error", r)
		}
	}
}

func TestAChoiceIsFoundByIdAndOnlyAmongTheOfferedCandidates(t *testing.T) {
	resolved := resolve(t, nil)
	for _, c := range resolved.View.Candidates {
		choice, ok := resolved.Choice(c.ID)
		if !ok || choice.Candidate.ID != c.ID {
			t.Errorf("candidate %s not found", c.ID)
		}
	}
	if _, ok := resolved.Choice("take:" + guidA + ":" + take2 + "x"); ok {
		t.Error("an id nobody offered was accepted")
	}
	choice, _ := resolved.Choice(bySource(resolved.View.Candidates, SourceItemTake)[1].ID)
	if choice.TargetItemGUID != guidA || choice.Candidate.TakeGUID != take2 {
		t.Fatalf("choice = %+v", choice)
	}
}

// mark is one stored mark of the Booth's passage map, stamped with item and take.
func mark(run, kind, pid string, word int, sec float64, prev *passagemap.Place, item, take string) passagemap.Resolved {
	return passagemap.Resolved{Mark: passagemap.Mark{
		ID: run + "." + kind + pid, Run: run, ChapterID: "ch-1", PID: pid, Word: word, Sec: sec, Kind: kind, Prev: prev, ItemGUID: item, TakeGUID: take,
	}}
}

func place(pid string, word int) *passagemap.Place { return &passagemap.Place{PID: pid, Word: word} }

// boothRecorded: the Booth recorded paragraph p-1 whole as take on item A, from start to stop.
func boothRecorded(take string) func(*Input) {
	return func(in *Input) {
		in.Marks = []passagemap.Resolved{
			mark("ch-1.1", passagemap.KindStart, "p-1", 0, 0, nil, guidA, take),
			mark("ch-1.1", passagemap.KindStop, "p-1", 3, 9, place("p-1", 3), guidA, take),
		}
	}
}

// unheard is the view of a chapter the alignment heard none of: Editing has only the Booth's marks to go on.
func unheard(in *Input) {
	for i := range in.View.Tokens {
		in.View.Tokens[i].Item = nil
	}
}

// TK-1 part 2: passages worked out from the marks alone. Take 1 reads p-1 whole and the first word of p-2, then the
// narrator rolls back to the start of p-2 and take 2 reads it to the end: p-2 is covered by two takes, p-1 by one.
func TestAPassageNobodyAlignedComesFromTheMarks(t *testing.T) {
	rolledBack := func(in *Input) {
		unheard(in)
		in.Marks = []passagemap.Resolved{
			mark("ch-1.1", passagemap.KindStart, "p-1", 0, 0, nil, guidA, take1),
			mark("ch-1.1", passagemap.KindRoll, "p-2", 0, 12, place("p-2", 1), guidA, take2),
			mark("ch-1.1", passagemap.KindStop, "p-2", 3, 20, place("p-2", 3), guidA, take2),
		}
	}
	got := resolve(t, func(in *Input) { rolledBack(in); in.FirstToken, in.LastToken = 3, 5 })
	if got.View.Message != "" || got.View.ItemGUID != guidA || got.View.PassageID == "" {
		t.Fatalf("p-2 from the marks = %+v", got.View)
	}
	if takes := bySource(got.View.Candidates, SourceItemTake); len(takes) != 2 {
		t.Fatalf("p-2's takes = %+v", got.View.Candidates)
	}
	evidence := Evidence(got, nil)
	for _, take := range evidence.Takes[:2] {
		if take.Via != ViaMap {
			t.Errorf("%s is placed %q; both of item A's takes read p-2", take.ID, take.Via)
		}
	}

	nothing := resolve(t, func(in *Input) { unheard(in); in.FirstToken, in.LastToken = 3, 5 })
	if nothing.View.Message == "" || len(nothing.View.Candidates) != 0 {
		t.Fatalf("with no marks an unheard passage still has no takes: %+v", nothing.View)
	}
	stale := resolve(t, func(in *Input) {
		rolledBack(in)
		for i := range in.Marks {
			in.Marks[i].Stale = true
		}
		in.FirstToken, in.LastToken = 3, 5
	})
	if stale.View.Message == "" {
		t.Fatalf("stale marks placed a passage: %+v", stale.View)
	}
}

// The map wins over the alignment for a passage the Booth recorded (TK-1 part 2), and a later Booth recording of the same
// paragraph on another item keeps the passage on its first read, so what Editing keyed by the passage id (its stack, its
// retry mode, the take kept) still names it.
func TestALaterBoothRecordingKeepsThePassagesFirstRead(t *testing.T) {
	first := resolve(t, boothRecorded(take1))
	again := resolve(t, func(in *Input) {
		boothRecorded(take1)(in)
		in.Marks = append(in.Marks,
			mark("ch-1.2", passagemap.KindStart, "p-1", 0, 0, nil, guidD, take5),
			mark("ch-1.2", passagemap.KindStop, "p-1", 3, 9, place("p-1", 3), guidD, take5))
	})
	if first.View.PassageID == "" || again.View.PassageID != first.View.PassageID || again.View.ItemGUID != guidA {
		t.Fatalf("passage after a second recording = %q on %s, before %q", again.View.PassageID, again.View.ItemGUID, first.View.PassageID)
	}
	mapped := resolve(t, func(in *Input) {
		in.View.Items[0] = coverage.AlignmentItem{Index: 0, ItemGUID: guidB, Live: true, TakeGUID: take3}
		boothRecorded(take1)(in)
	})
	if mapped.View.ItemGUID != guidA {
		t.Fatalf("the alignment heard p-1 on B, the Booth recorded it on A: placed on %s", mapped.View.ItemGUID)
	}
}
