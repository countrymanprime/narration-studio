package coverage

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

func paras(spec ...any) []ParagraphLine {
	lines := []ParagraphLine{}
	for i := 0; i < len(spec); i += 2 {
		lines = append(lines, ParagraphLine{ID: spec[i].(string), Tokens: 4, Present: spec[i+1].(int)})
	}
	return lines
}

func region(kind string, count int, ids ...string) RegionLine {
	return RegionLine{Kind: kind, ParagraphIDs: ids, TokenCount: count, FirstWord: "a", LastWord: "z"}
}

func TestRegionKindsMapToGapKinds(t *testing.T) {
	rows := []struct {
		region string
		gap    GapKind
		isGap  bool
	}{
		{"skip", GapMissing, true},
		{"different_text", GapMisread, true},
		{"short_read", GapMisread, true},
		{"head", "", false},
		{"tail", "", false},
		{"future_kind", GapOther, true},
	}
	for _, row := range rows {
		kind, isGap := gapKindOf(row.region)
		if kind != row.gap || isGap != row.isGap {
			t.Errorf("%s = %q, %v; want %q, %v", row.region, kind, isGap, row.gap, row.isGap)
		}
	}
	// A region kind the table does not know is carried as other, never dropped.
	report := Report{Paragraphs: paras("p1", 4, "p2", 0, "p3", 4), Regions: []RegionLine{region("future_kind", 2, "p2")}}
	gaps, _ := ClassifyGaps(report)
	if len(gaps) != 1 || gaps[0].Kind != GapOther {
		t.Fatalf("gaps = %+v", gaps)
	}
}

func TestAnUnreadParagraphBetweenReadOnesIsMissing(t *testing.T) {
	report := Report{Paragraphs: paras("p1", 4, "p2", 0, "p3", 4), Regions: []RegionLine{region("skip", 4, "p2")}}
	gaps, unfinished := ClassifyGaps(report)
	if len(gaps) != 1 || gaps[0].Kind != GapMissing || !reflect.DeepEqual(gaps[0].ParagraphIDs, []string{"p2"}) || gaps[0].TokenCount != 4 {
		t.Fatalf("gaps = %+v", gaps)
	}
	if unfinished != (Unfinished{}) {
		t.Fatalf("unfinished = %+v", unfinished)
	}
}

func TestAnUnreadStartAndEndAreUnfinishedNeverGaps(t *testing.T) {
	report := Report{
		Paragraphs: paras("p1", 0, "p2", 0, "p3", 4, "p4", 4, "p5", 0),
		Regions:    []RegionLine{region("head", 8, "p1", "p2"), region("tail", 4, "p5")},
	}
	gaps, unfinished := ClassifyGaps(report)
	if len(gaps) != 0 {
		t.Fatalf("an unread start and end are not gaps: %+v", gaps)
	}
	if unfinished != (Unfinished{Start: 2, End: 1}) {
		t.Fatalf("unfinished = %+v", unfinished)
	}
	// Only the start, only the end.
	_, start := ClassifyGaps(Report{Paragraphs: paras("p1", 0, "p2", 4)})
	_, end := ClassifyGaps(Report{Paragraphs: paras("p1", 4, "p2", 0)})
	if start != (Unfinished{Start: 1}) || end != (Unfinished{End: 1}) {
		t.Fatalf("start = %+v, end = %+v", start, end)
	}
}

func TestNothingReadIsAllUnfinished(t *testing.T) {
	report := Report{Paragraphs: paras("p1", 0, "p2", 0, "p3", 0), Regions: []RegionLine{region("head", 12, "p1", "p2", "p3")}}
	gaps, unfinished := ClassifyGaps(report)
	if len(gaps) != 0 || unfinished != (Unfinished{Start: 3}) {
		t.Fatalf("gaps = %+v, unfinished = %+v", gaps, unfinished)
	}
	if gaps == nil {
		t.Fatal("gaps must be an empty list, never null")
	}
}

func tokenAt(i int, para, status string) TokenLine {
	return TokenLine{Index: i, ParagraphID: &para, Text: "w", Status: status}
}

func extraAfter(token int, text string) ExtraLine {
	return ExtraLine{Text: text, Tokens: len(strings.Fields(text)), AfterToken: &token}
}

func TestExtrasInsideTheReadPartAreExtraGaps(t *testing.T) {
	report := Report{
		Paragraphs: paras("p1", 4, "p2", 4),
		Tokens: []TokenLine{
			tokenAt(0, "p1", "read"), tokenAt(1, "p1", "read"), tokenAt(2, "p2", "read"), tokenAt(3, "p2", "misread"),
		},
		Extras: []ExtraLine{extraAfter(1, "um well"), extraAfter(3, "thank you")},
	}
	gaps, _ := ClassifyGaps(report)
	if len(gaps) != 1 {
		t.Fatalf("the extra after the last read word is not a pickup: %+v", gaps)
	}
	g := gaps[0]
	if g.Kind != GapExtra || g.Text == nil || *g.Text != "um well" || g.TokenCount != 2 || g.FirstWord != "um" || g.LastWord != "well" || !reflect.DeepEqual(g.ParagraphIDs, []string{"p1"}) {
		t.Fatalf("gap = %+v", g)
	}
	// Before anything was heard is outside too.
	before := Report{Paragraphs: paras("p1", 4), Tokens: []TokenLine{tokenAt(0, "p1", "read"), tokenAt(1, "p1", "read")}, Extras: []ExtraLine{{Text: "hm", Tokens: 1}}}
	if gaps, _ := ClassifyGaps(before); len(gaps) != 0 {
		t.Fatalf("gaps = %+v", gaps)
	}
}

func TestConfidenceIsNullWithAReason(t *testing.T) {
	report := Report{
		Paragraphs: paras("p1", 4, "p2", 0, "p3", 4),
		Regions:    []RegionLine{region("skip", 4, "p2"), region("different_text", 2, "p3")},
	}
	gaps, _ := ClassifyGaps(report)
	if len(gaps) != 2 {
		t.Fatalf("gaps = %+v", gaps)
	}
	for _, g := range gaps {
		if g.Confidence != nil || g.ConfReason != ConfNoWordScores {
			t.Errorf("gap %s: confidence %v, reason %q", g.ID, g.Confidence, g.ConfReason)
		}
	}
	raw, _ := json.Marshal(gaps[0])
	if !strings.Contains(string(raw), `"confidence":null`) || !strings.Contains(string(raw), `"confReason":"no_word_scores"`) {
		t.Fatalf("wire = %s", raw)
	}
}

// While the words file carries no Whisper probabilities there is nothing to score a gap by: a number would be made up.
func TestNoGapScoreExistsWhileTheWordsFileCarriesNoProbabilities(t *testing.T) {
	raw, err := os.ReadFile("../../../../sidecars/transcript-compare/core/coverage_mode.py")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "probability") {
		t.Fatal("the words file now carries probabilities: bump WORDS_SCHEMA_VERSION, invalidate the cache and score gaps (ADR 0830)")
	}
}

func TestGapsAreOrderedAndStable(t *testing.T) {
	report := Report{
		Paragraphs: paras("p1", 4, "p2", 0, "p3", 4, "p4", 4),
		Regions:    []RegionLine{region("different_text", 2, "p3"), region("skip", 4, "p2")},
		Tokens: []TokenLine{
			tokenAt(0, "p1", "read"), tokenAt(1, "p2", "skip"), tokenAt(2, "p3", "different_text"), tokenAt(3, "p3", "read"), tokenAt(4, "p4", "read"),
		},
		Extras: []ExtraLine{extraAfter(0, "uh")},
	}
	first, _ := ClassifyGaps(report)
	second, _ := ClassifyGaps(report)
	if !reflect.DeepEqual(first, second) {
		t.Fatal("the same input must give the same gaps")
	}
	kinds := []GapKind{}
	ids := map[string]bool{}
	for _, g := range first {
		kinds = append(kinds, g.Kind)
		ids[g.ID] = true
	}
	if !reflect.DeepEqual(kinds, []GapKind{GapExtra, GapMissing, GapMisread}) || len(ids) != 3 {
		t.Fatalf("kinds = %v, ids = %v", kinds, ids)
	}
	if first[1].ID != "missing:p2:1" {
		t.Fatalf("id = %q, want kind, first paragraph and first token", first[1].ID)
	}
}
