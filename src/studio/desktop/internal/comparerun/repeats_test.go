package comparerun

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/compare"
)

func TestReadsOfTheSameSourceRangeAreExactCopies(t *testing.T) {
	for name, c := range map[string]struct {
		reads []Read
		want  map[int]string
	}{
		"the same range of one file": {[]Read{{SourceFile: "take_a.wav", Length: 4}, {SourceFile: "take_b.wav", Length: 4}, {SourceFile: "take_a.wav", Length: 4}}, map[int]string{0: "EC0", 2: "EC0"}},
		"other ranges of one file":   {[]Read{{SourceFile: "session.wav", Length: 4}, {SourceFile: "session.wav", StartOffset: 10, Length: 4}}, map[int]string{}},
		"every read unique":          {[]Read{{SourceFile: "a.wav", Length: 4}, {SourceFile: "b.wav", Length: 4}}, map[int]string{}},
		"the same range to the millisecond, the same path cleaned": {[]Read{
			{SourceFile: "audio/x/../a.wav", StartOffset: 2.0001, Length: 4}, {SourceFile: "b.wav"}, {SourceFile: "audio/a.wav", StartOffset: 2.0, Length: 4}, {SourceFile: "b.wav"},
		}, map[int]string{0: "EC0", 2: "EC0", 1: "EC1", 3: "EC1"}},
	} {
		if got := exactCopies(c.reads); !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: %v, want %v", name, got, c.want)
		}
	}
}

func span(first, last int) *[2]int { return &[2]int{first, last} }

func TestReadsCoveringTheSameSpanGroup(t *testing.T) {
	for name, c := range map[string]struct {
		covered []*[2]int
		want    []spanGroup
	}{
		// read 1 is a pickup of read 0's tail; read 2 is elsewhere
		"overlapping reads":     {[]*[2]int{span(0, 2), span(1, 2), span(9, 9)}, []spanGroup{{0, 2, []int{0, 1}}}},
		"spans touching at one": {[]*[2]int{span(0, 4), span(4, 8)}, []spanGroup{}},
		"a read with no span":   {[]*[2]int{span(0, 3), span(0, 3), nil}, []spanGroup{{0, 3, []int{0, 1}}}},
		"one read of each span": {[]*[2]int{span(0, 3), span(10, 12)}, []spanGroup{}},
		// (0,2) and (0,6) group; (5,9) overlaps the widened (0,6) by 2 of its 5 units, so it starts its own
		"in order of first unit": {[]*[2]int{span(5, 9), span(0, 6), span(0, 2)}, []spanGroup{{0, 6, []int{2, 1}}}},
	} {
		if got := groupRepeatedSpans(c.covered, 0.5); !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: %v, want %v", name, got, c.want)
		}
	}
}

func TestTheManifestsReadsAreReadInOrderAndAMalformedLineIsRefused(t *testing.T) {
	path := filepath.Join(t.TempDir(), "m.txt")
	write := func(text string) {
		if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write("1|C:/audio/b.wav|10.0|3.25|{ITEM-GUID-2}|{TAKE-GUID-2}\n\n0|C:/audio/a.wav|0.0|4.5|{ITEM-GUID-1}|{TAKE-GUID-1}\n")
	reads, err := ReadRepeatManifest(path)
	want := []Read{{1, "C:/audio/b.wav", 10, 3.25, "{ITEM-GUID-2}", "{TAKE-GUID-2}"}, {0, "C:/audio/a.wav", 0, 4.5, "{ITEM-GUID-1}", "{TAKE-GUID-1}"}}
	if err != nil || !reflect.DeepEqual(reads, want) {
		t.Fatalf("reads = %v, %v", reads, err)
	}
	for _, bad := range []string{"0|a.wav|0|4|g\n", "x|a.wav|0|4|g|t\n", "0|a.wav|zero|4|g|t\n"} {
		write(bad)
		if _, err := ReadRepeatManifest(path); err == nil {
			t.Errorf("%q was read", bad)
		}
	}
}

func TestTheWordsOfEachReadAreReadAndAReportThatDoesNotFitIsRefused(t *testing.T) {
	path := filepath.Join(t.TempDir(), "w.txt")
	report := `REPEAT_WORDS|{"words":[["Ada",0.0,0.4],["walked",0.5,0.9]]}` + "\n" + `REPEAT_WORDS|{"words":[]}` + "\n"
	if err := os.WriteFile(path, []byte(report), 0o600); err != nil {
		t.Fatal(err)
	}
	heard, err := ReadRepeatWords(path, 2)
	if err != nil || len(heard) != 2 || len(heard[0]) != 2 || heard[0][1] != (compare.Word{Text: "walked", Start: 0.5, End: 0.9}) || len(heard[1]) != 0 {
		t.Fatalf("heard = %v, %v", heard, err)
	}
	if _, err := ReadRepeatWords(path, 3); err == nil || !strings.Contains(err.Error(), "heard 2 read(s) of 3") {
		t.Errorf("a missing read: %v", err)
	}
	for _, bad := range []string{`SUMMARY|x`, `REPEAT_WORDS|{}`, `REPEAT_WORDS|{"words":[["a","0",1]]}`} {
		if err := os.WriteFile(path, []byte(bad+"\n"), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := ReadRepeatWords(path, 1); err == nil {
			t.Errorf("%q was read", bad)
		}
	}
	if _, err := ReadRepeatWords(filepath.Join(t.TempDir(), "none"), 0); err == nil {
		t.Error("a missing report was read")
	}
}

func TestARestartAPickupAndAnExactCopyGroupWithTheirCoverageAndQuality(t *testing.T) {
	chapter := compare.Chapter{Title: "Chapter One", Paragraphs: []string{"Ada walked into the quiet room. She closed the door behind her softly."}}
	timed := func(text string) []compare.Word {
		words := []compare.Word{}
		for k, w := range strings.Fields(text) {
			words = append(words, compare.Word{Text: w, Start: float64(k) * 0.5, End: float64(k)*0.5 + 0.4})
		}
		return words
	}
	whole := "ada walked into the quiet room she closed the door behind her softly"
	reads := []Read{
		{0, "C:/audio/take0.wav", 0, 7, "{ITEM-1}", "{TAKE-1}"},
		{1, "C:/audio/take1.wav", 0, 7, "{ITEM-1}", "{TAKE-2}"},
		{2, "C:/audio/take1.wav", 0, 7, "{ITEM-1}", "{TAKE-3}"},
		{3, "C:/audio/take3.wav", 0, 2, "{ITEM-1}", "{TAKE-4}"},
		{4, "C:/audio/other.wav", 0, 2, "{ITEM-2}", "{TAKE-5}"},
	}
	heard := [][]compare.Word{timed(whole), timed(whole), timed(whole), timed("she closed the door behind her softly"), timed("zebra piano")}

	got := FindRepeats(compare.NewTokenizer(nil), chapter, reads, heard, 1, 0.5)

	// Read 4 heard nothing of the chapter, yet its span is the whole chapter at quality 0, as compare.py's was: the
	// covered range runs over every opcode but a delete, so a replace of every unit covers them all.
	want := "SUMMARY|Found 1 repeated-span group(s) across 5 segment(s)\n" +
		"SPAN_GROUP|0|0|1|5\n" +
		"SPAN_MEMBER|0|0|{ITEM-1}|{TAKE-1}|C:/audio/take0.wav|0.000|7.000|0|1|1.000|0.867|\n" +
		"SPAN_MEMBER|0|1|{ITEM-1}|{TAKE-2}|C:/audio/take1.wav|0.000|7.000|0|1|1.000|0.867|EC0\n" +
		"SPAN_MEMBER|0|2|{ITEM-1}|{TAKE-3}|C:/audio/take1.wav|0.000|7.000|0|1|1.000|0.867|EC0\n" +
		"SPAN_MEMBER|0|4|{ITEM-2}|{TAKE-5}|C:/audio/other.wav|0.000|2.000|0|1|1.000|0.000|\n" +
		"SPAN_MEMBER|0|3|{ITEM-1}|{TAKE-4}|C:/audio/take3.wav|0.000|2.000|1|1|0.500|0.467|\n"
	if got != want {
		t.Fatalf("got:\n%s\nwant:\n%s", got, want)
	}
	if line := NeedChapterLine(NeedChapter{Candidates: []string{"Chapter One", "Two / Part"}}); line != "NEED_CHAPTER|Chapter One|Two / Part\n" {
		t.Errorf("line = %q", line)
	}
	if q := alignmentQuality(compare.Alignment{}); q != 0 {
		t.Errorf("an empty alignment's quality = %v", q)
	}
}
