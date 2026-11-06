package wordtimes

import "testing"

func rows(rs ...Row) Table { return Table{Rows: rs} }

func placed(i int, item string, start, end float64) Row {
	return Row{Index: i, State: Placed, ItemGUID: item, Start: start, End: end}
}

var voices = map[string]string{"a": "NARRATOR", "b": "HERO", "c": "NARRATOR"}

func TestPunchTargetIsTheEarliestStartAndLatestEndOfThePassage(t *testing.T) {
	table := rows(placed(0, "a", 1, 2), placed(1, "a", 2, 3), placed(2, "c", 10, 11), placed(3, "a", 20, 21))
	got := PunchTarget(table, voices, 1, 2)
	if got.Outcome != PunchFound || got.Track != "NARRATOR" || got.Start != 2 || got.End != 11 {
		t.Fatalf("got %+v, want 2-11 on the narrator (two items, one voice, words outside the range left alone)", got)
	}
}

func TestPunchTargetOnAnotherVoiceIsThatVoicesTrack(t *testing.T) {
	got := PunchTarget(rows(placed(0, "b", 5, 6)), voices, 0, 0)
	if got.Outcome != PunchFound || got.Track != "HERO" {
		t.Fatalf("got %+v, want the hero's track, where the word was recorded", got)
	}
}

func TestPunchTargetSpanningSeveralVoicesIsRefused(t *testing.T) {
	got := PunchTarget(rows(placed(0, "a", 1, 2), placed(1, "b", 2, 3)), voices, 0, 1)
	if got.Outcome != PunchRefused || got.Reason != PunchSeveralVoices {
		t.Fatalf("got %+v", got)
	}
}

func TestPunchTargetNeverRecordedIsAContinue(t *testing.T) {
	got := PunchTarget(rows(Row{Index: 0, State: NotHeard}, Row{Index: 1, State: NotHeard}), voices, 0, 1)
	if got.Outcome != PunchNeverRecorded {
		t.Fatalf("got %+v", got)
	}
}

func TestPunchTargetWithAWordNoItemPlaysIsRefusedNotGuessed(t *testing.T) {
	got := PunchTarget(rows(placed(0, "a", 1, 2), Row{Index: 1, State: NotInProject}), voices, 0, 1)
	if got.Outcome != PunchRefused || got.Reason != PunchNotInProject {
		t.Fatalf("got %+v", got)
	}
}

func TestPunchTargetSkipsWordsTheCheckNeverHeardInsideAPlacedPassage(t *testing.T) {
	got := PunchTarget(rows(placed(0, "a", 1, 2), Row{Index: 1, State: NotHeard}, placed(2, "a", 4, 5)), voices, 0, 2)
	if got.Outcome != PunchFound || got.Start != 1 || got.End != 5 {
		t.Fatalf("got %+v", got)
	}
}

func TestPunchTargetOutsideTheTableOrBackwardsIsRefused(t *testing.T) {
	for _, r := range [][2]int{{5, 6}, {2, 1}, {-1, 0}} {
		if got := PunchTarget(rows(placed(0, "a", 1, 2)), voices, r[0], r[1]); got.Outcome != PunchRefused || got.Reason != PunchNoWords {
			t.Fatalf("range %v: got %+v", r, got)
		}
	}
}

func TestPunchTargetOfAnItemTheTrackMapDoesNotKnowIsRefused(t *testing.T) {
	if got := PunchTarget(rows(placed(0, "zzz", 1, 2)), voices, 0, 0); got.Outcome != PunchRefused {
		t.Fatalf("got %+v", got)
	}
}
