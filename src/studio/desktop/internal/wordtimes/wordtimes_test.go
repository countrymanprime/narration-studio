package wordtimes

import (
	"math"
	"testing"
)

const file = "C:/Book/chapter.wav"

func words() []Word {
	// Four words in item 0's source: 1-1.4, 2-2.5, 10-10.4, 20-20.6.
	return []Word{
		{Index: 0, ItemIndex: 0, Start: 1, End: 1.4},
		{Index: 1, ItemIndex: 0, Start: 2, End: 2.5},
		{Index: 2, ItemIndex: 0, Start: 10, End: 10.4},
		{Index: 3, ItemIndex: 0, Start: 20, End: 20.6},
	}
}

var items = []Item{{Index: 0, GUID: "{A}", SourceFile: file}}

func live(guid string, position, length, sourceStart, rate float64) Live {
	return Live{GUID: guid, SourceFile: file, Position: position, Length: length, SourceStart: sourceStart, PlayRate: rate}
}

func near(t *testing.T, name string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-9 {
		t.Errorf("%s = %v, want %v", name, got, want)
	}
}

func TestWordsAreAtTheirSecondOfTheLiveItems(t *testing.T) {
	cases := []struct {
		name  string
		live  []Live
		want  []State
		start []float64 // project start of each placed word, 0 for others
	}{
		{"one item at 100 s", []Live{live("{A}", 100, 40, 0, 1)}, []State{Placed, Placed, Placed, Placed}, []float64{101, 102, 110, 120}},
		{"moved to 200 s", []Live{live("{A}", 200, 40, 0, 1)}, []State{Placed, Placed, Placed, Placed}, []float64{201, 202, 210, 220}},
		{"trimmed 5 s off the start", []Live{live("{A}", 100, 35, 5, 1)}, []State{NotInProject, NotInProject, Placed, Placed}, []float64{0, 0, 105, 115}},
		{"rate 2", []Live{live("{A}", 100, 20, 0, 2)}, []State{Placed, Placed, Placed, Placed}, []float64{100.5, 101, 105, 110}},
		{
			"split at 5 s, the right half has a GUID the alignment never saw",
			[]Live{live("{A}", 100, 5, 0, 1), live("{B}", 105, 35, 5, 1)},
			[]State{Placed, Placed, Placed, Placed}, []float64{101, 102, 110, 120},
		},
		{
			"6 s deleted at 5 s and closed up",
			[]Live{live("{A}", 100, 5, 0, 1), live("{B}", 105, 29, 11, 1)},
			[]State{Placed, Placed, NotInProject, Placed}, []float64{101, 102, 0, 114},
		},
		{"a muted item plays nothing", []Live{{GUID: "{A}", SourceFile: file, Position: 100, Length: 40, PlayRate: 1, Muted: true}}, []State{NotInProject, NotInProject, NotInProject, NotInProject}, []float64{0, 0, 0, 0}},
		{"another file", []Live{{GUID: "{A}", SourceFile: "C:/other.wav", Position: 100, Length: 40, PlayRate: 1}}, []State{NotInProject, NotInProject, NotInProject, NotInProject}, []float64{0, 0, 0, 0}},
		{"no items", nil, []State{NotInProject, NotInProject, NotInProject, NotInProject}, []float64{0, 0, 0, 0}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			table := Compute(Input{Words: words(), Items: items, Live: c.live})
			for i, row := range table.Rows {
				if row.State != c.want[i] {
					t.Fatalf("word %d state = %s, want %s", i, row.State, c.want[i])
				}
				if row.State == Placed {
					near(t, "start", row.Start, c.start[i])
				} else if row.Start != 0 || row.End != 0 || row.ItemGUID != "" {
					t.Errorf("word %d is %s and carries a time or item: %+v", i, row.State, row)
				}
			}
		})
	}
}

func TestAWordCutThroughByASplitIsClippedToTheItemThatPlaysItsStart(t *testing.T) {
	table := Compute(Input{
		Words: []Word{{Index: 0, ItemIndex: 0, Start: 4.8, End: 5.4}},
		Items: items,
		Live:  []Live{live("{A}", 100, 5, 0, 1), live("{B}", 200, 35, 5, 1)},
	})
	row := table.Rows[0]
	if row.State != Placed || !row.Clipped || row.ItemGUID != "{A}" {
		t.Fatalf("row = %+v", row)
	}
	near(t, "start", row.Start, 104.8)
	near(t, "end", row.End, 105)
}

func TestWhenItemsOverlapTheOneThatStartsLatestPlays(t *testing.T) {
	table := Compute(Input{Words: words()[:1], Items: items, Live: []Live{live("{A}", 100, 40, 0, 1), live("{B}", 300, 40, 0, 1)}})
	near(t, "start", table.Rows[0].Start, 301)
	if table.Rows[0].ItemGUID != "{B}" {
		t.Fatalf("item = %s", table.Rows[0].ItemGUID)
	}
}

func TestAMissingWordHasNoTime(t *testing.T) {
	table := Compute(Input{Words: []Word{{Index: 0, ItemIndex: -1}}, Items: items, Live: []Live{live("{A}", 100, 40, 0, 1)}})
	if table.Rows[0].State != NotHeard {
		t.Fatalf("row = %+v", table.Rows[0])
	}
}

func TestAnItemWhoseGUIDLeftTheSavedProjectIsFoundAmongTheLiveItems(t *testing.T) {
	// The alignment names the item {A} with no file (the saved project dropped it); the live left half still has {A}.
	table := Compute(Input{
		Words: words()[:1],
		Items: []Item{{Index: 0, GUID: "{a}"}},
		Live:  []Live{live("{A}", 100, 5, 0, 1), live("{B}", 105, 35, 5, 1)},
	})
	if table.Rows[0].State != Placed {
		t.Fatalf("row = %+v", table.Rows[0])
	}
}

func TestAnItemWithNoFileOnATrackOfOneFileTakesThatFile(t *testing.T) {
	table := Compute(Input{Words: words()[:1], Items: []Item{{Index: 0, GUID: "{GONE}"}}, Live: []Live{live("{B}", 100, 40, 0, 1)}})
	if table.Rows[0].State != Placed {
		t.Fatalf("row = %+v", table.Rows[0])
	}
}

func TestAnItemWithNoFileOnATrackOfSeveralIsNotGuessed(t *testing.T) {
	table := Compute(Input{
		Words: words()[:1],
		Items: []Item{{Index: 0, GUID: "{GONE}"}},
		Live:  []Live{live("{B}", 100, 40, 0, 1), {GUID: "{C}", SourceFile: "C:/other.wav", Position: 200, Length: 10, PlayRate: 1}},
	})
	if table.Rows[0].State != NotInProject {
		t.Fatalf("row = %+v", table.Rows[0])
	}
}

func TestAPathSpelledOtherwiseIsFoundByItsNameOnlyWhenNothingPlaysTheSpelling(t *testing.T) {
	spelled := Live{GUID: "{A}", SourceFile: `D:\Other\CHAPTER.wav`, Position: 100, Length: 40, PlayRate: 1}
	if got := Compute(Input{Words: words()[:1], Items: items, Live: []Live{spelled}}).Rows[0].State; got != Placed {
		t.Fatalf("by name: %s", got)
	}
	exact := Live{GUID: "{B}", SourceFile: `c:\book\CHAPTER.WAV`, Position: 500, Length: 40, PlayRate: 1}
	if got := Compute(Input{Words: words()[:1], Items: items, Live: []Live{spelled, exact}}).Rows[0]; got.ItemGUID != "{B}" {
		t.Fatalf("exact spelling should win over the name: %+v", got)
	}
}

func TestVersionChangesWithTheCountAndTheCheck(t *testing.T) {
	a := Compute(Input{ChangeCount: 4, RecordID: "r1"}).Version
	if a == Compute(Input{ChangeCount: 5, RecordID: "r1"}).Version || a == Compute(Input{ChangeCount: 4, RecordID: "r2"}).Version {
		t.Fatalf("version %q does not change", a)
	}
}

func TestEveryWordIsInTheTableOnceInOrder(t *testing.T) {
	table := Compute(Input{Words: words(), Items: items, Live: []Live{live("{A}", 100, 40, 0, 1)}})
	if len(table.Rows) != 4 {
		t.Fatalf("rows = %d", len(table.Rows))
	}
	for i, row := range table.Rows {
		if row.Index != i {
			t.Errorf("row %d has index %d", i, row.Index)
		}
	}
}
