package comparerun

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/compare"
)

// The markers' own rules, ported from the sidecar's tests/test_compare.py and libs/python/tests/test_transcript_compare.py
// when compare.py's run tail moved here.

func said(text string) []compare.Word {
	words := []compare.Word{}
	for k, w := range strings.Fields(text) {
		words = append(words, compare.Word{Text: w, Start: float64(k) * 0.4, End: float64(k)*0.4 + 0.3})
	}
	return words
}

func w(text string, start, end float64) compare.Word {
	return compare.Word{Text: text, Start: start, End: end}
}

type kindText struct{ kind, doc, audio string }

func markersOf(t compare.Tokenizer, c compare.Chapter, text string) ([]kindText, *[2]int) {
	units := t.BuildChapterUnits(spokenHeading(c), c.Paragraphs)
	words := said(text)
	markers, covered := Markers(t.Align(units, words), units, words, MinWords)
	out := []kindText{}
	for _, m := range markers {
		out = append(out, kindText{m.Kind, m.Doc, m.Audio})
	}
	return out, covered
}

var paragraphs = []string{"Ada opened the ledger at the first page.", "She read the column twice.", "Then she closed the book."}

const bodySaid = "ada opened the ledger at the first page she read the column twice then she closed the book"

func chapter1(subtitle string) compare.Chapter {
	return compare.Chapter{Title: "Chapter 1", Subtitle: subtitle, Paragraphs: paragraphs}
}

func TestTimingConfidenceLabelsThePauseAroundAMarker(t *testing.T) {
	two := func(gap float64) []compare.Word { return []compare.Word{w("a", 0, 0.5), w("b", 0.5+gap, 1.0)} }
	for _, c := range []struct {
		words  []compare.Word
		j1, j2 int
		label  string
		gap    float64
	}{
		{two(pauseGapSeconds), 1, 1, "high", pauseGapSeconds},
		{two(tightGapSeconds / 2), 1, 1, "low", tightGapSeconds / 2},
		{two((tightGapSeconds + pauseGapSeconds) / 2), 1, 1, "medium", (tightGapSeconds + pauseGapSeconds) / 2},
		// a span uses the larger of its two boundary gaps
		{[]compare.Word{w("a", 0, 0.4), w("b", 0.4+tightGapSeconds/2, 0.8), w("c", 0.8+tightGapSeconds/2, 1.2), w("d", 1.2+pauseGapSeconds+0.1, 1.8)}, 1, 3, "high", pauseGapSeconds + 0.1},
		// overlapping words are no gap at all
		{[]compare.Word{w("a", 0, 0.5), w("b", 0.3, 1.0)}, 1, 1, "low", 0},
	} {
		label, gap := TimingConfidence(c.j1, c.j2, []int{0, 1, 2, 3}[:len(c.words)], c.words)
		if label != c.label || gap == nil || *gap-c.gap > 1e-9 || c.gap-*gap > 1e-9 {
			t.Errorf("%v [%d,%d): %s %v, want %s %v", c.words, c.j1, c.j2, label, gap, c.label, c.gap)
		}
	}
	if label, gap := TimingConfidence(0, 0, []int{0, 1}, two(0.6)); label != "unknown" || gap != nil {
		t.Errorf("at the edge: %s %v", label, gap)
	}
}

func TestAPartialRecordingMarksNoSkipsOutsideTheRecordedSpan(t *testing.T) {
	markers, covered := markersOf(compare.Tokenizer{}, chapter1(""), "she read the column twice")
	if len(markers) != 0 || covered == nil || *covered != [2]int{1, 1} {
		t.Fatalf("markers %v, covered %v", markers, covered)
	}
}

func TestASkipInsideTheRecordedSpanIsMarked(t *testing.T) {
	markers, _ := markersOf(compare.Tokenizer{}, chapter1(""), "ada opened the ledger at the first page then she closed the book")
	if !reflect.DeepEqual(markers, []kindText{{Skipped, "she read the column twice", ""}}) {
		t.Fatalf("markers %v", markers)
	}
}

func TestAnExtraNamesTheChapterTextItSaysAgainAndAnAsideNamesNothing(t *testing.T) {
	c := chapter1("")
	units := compare.Tokenizer{}.BuildChapterUnits(spokenHeading(c), c.Paragraphs)
	for text, want := range map[string][2]string{
		"ada opened the ledger at the first page she read the column twice she read the column twice then she closed the book": {"she read the column twice", "She read the column twice."},
		"ada opened the ledger at the first page what a lovely day she read the column twice then she closed the book":         {"what a lovely day", ""},
	} {
		words := said(text)
		markers, _ := Markers(compare.Tokenizer{}.Align(units, words), units, words, MinWords)
		if len(markers) != 1 || markers[0].Kind != Extra || markers[0].Audio != want[0] || markers[0].RepeatOf != want[1] {
			t.Errorf("%q: %+v", text, markers)
		}
	}
}

func TestNothingSaidInTheHeadingIsAMarker(t *testing.T) {
	for _, c := range []struct {
		title, subtitle, said string
	}{
		{"Chapter 1", "Down the Rabbit-Hole", "chapter one down the rabbit hole " + bodySaid},
		{"Chapter 1", "Down the Rabbit-Hole", "chapter one " + bodySaid},
		{"Chapter 1", "", "chapter won " + bodySaid},
		{"Chapter 12: The Storm Breaks", "", "chapter twelve " + bodySaid},
		{"Chapter 12", "", "chapter twelve the storm breaks " + bodySaid},
		{"Chapter 12", "", "chapter twelve part one " + bodySaid},
		{"Chapter 1", "", "chapter one " + bodySaid},
		{"Chapter 1", "", bodySaid},
	} {
		markers, _ := markersOf(compare.Tokenizer{}, compare.Chapter{Title: c.title, Subtitle: c.subtitle, Paragraphs: paragraphs}, c.said)
		if len(markers) != 0 {
			t.Errorf("%q / %q said %q: %v", c.title, c.subtitle, c.said, markers)
		}
	}
}

func TestAMisreadOfTheFirstLineAfterTheHeadingIsStillAMarker(t *testing.T) {
	markers, _ := markersOf(compare.Tokenizer{}, chapter1(""), "chapter one ida opened the ledger at the first page she read the column twice then she closed the book")
	if !reflect.DeepEqual(markers, []kindText{{Misread, "ada", "ida"}}) {
		t.Fatalf("markers %v", markers)
	}
}

func TestHomophonesSpokenNumbersAndSplitCompoundsAreNotMisreads(t *testing.T) {
	c := compare.Chapter{Title: "Chapter 1", Paragraphs: []string{"They're carrying 214 barrels and a notebook.", "It sailed in 1847, a well-known year."}}
	markers, _ := markersOf(compare.Tokenizer{}, c, "their carrying two hundred fourteen barrels and a note book it sailed in 1847 a well known year")
	if len(markers) != 0 {
		t.Fatalf("markers %v", markers)
	}
}

func TestAnInventedNameSpelledAnotherWayIsAMisreadUntilItHasAnEquivalence(t *testing.T) {
	c := compare.Chapter{Title: "Chapter 1", Paragraphs: []string{"At dawn Maelis opened the ledger."}}
	before, _ := markersOf(compare.Tokenizer{}, c, "at dawn maylis opened the ledger")
	after, _ := markersOf(compare.NewTokenizer([][]string{{"maelis", "maylis"}}), c, "at dawn maylis opened the ledger")
	if !reflect.DeepEqual(before, []kindText{{Misread, "maelis", "maylis"}}) || len(after) != 0 {
		t.Fatalf("before %v, after %v", before, after)
	}
}

func TestALongChangeIsSnippedAndAShortOneUnderMinWordsIsLeftOut(t *testing.T) {
	c := compare.Chapter{Title: "T", Paragraphs: []string{"red orange yellow green blue indigo violet pink grey brown end."}}
	units := compare.Tokenizer{}.BuildChapterUnits(spokenHeading(c), c.Paragraphs)
	words := said("t a b c d e f g h i j end")
	markers, _ := Markers(compare.Tokenizer{}.Align(units, words), units, words, MinWords)
	if len(markers) != 1 || markers[0].Doc != "red orange yellow green blue indigo violet pink ..." || markers[0].Audio != "a b c d e f g h ..." {
		t.Fatalf("markers %+v", markers)
	}
	if long, _ := Markers(compare.Tokenizer{}.Align(units, words), units, words, 11); len(long) != 0 {
		t.Fatalf("a change of 10 tokens must not pass minWords 11: %+v", long)
	}
}

// contextsOf aligns heard against script as one sentence (no heading) and answers each marker's context by kind and
// audio text.
func contextsOf(script, heard string) map[kindText][2]string {
	tokens, raw := compare.Tokenizer{}.TokenizeWithRaw(script)
	units := compare.ChapterUnits{Tokens: tokens, RawWords: raw, UnitIdx: make([]int, len(tokens))}
	words := []compare.Word{}
	for k, w := range strings.Fields(heard) {
		words = append(words, compare.Word{Text: w, Start: float64(k), End: float64(k) + 0.5})
	}
	a := compare.Tokenizer{}.Align(units, words)
	markers, _ := Markers(a, units, words, MinWords)
	out := map[kindText][2]string{}
	for _, m := range markers {
		s, h := MarkerContext(m, a, words)
		out[kindText{m.Kind, "", m.Audio}] = [2]string{s, h}
	}
	return out
}

func TestMarkerContextsAreCompactAndCenteredOnTheirOwnDifference(t *testing.T) {
	contexts := contextsOf(
		"amber birch cedar dogwood elm fir gingko hazel ivy juniper kapok linden looked sexier when you lit it like a strip club bathroom",
		"amber birch cedar dogwood elm fir gingko hazel ivy juniper kapok linden looks sexier when you lit it up like a strip club bathroom")
	if got := contexts[kindText{Misread, "", "looks"}]; got != [2]string{
		"... gingko hazel ivy juniper kapok linden looked sexier when you lit it like ...",
		"... gingko hazel ivy juniper kapok linden looks sexier when you lit it up like ...",
	} {
		t.Errorf("misread context %q", got)
	}
	if got := contexts[kindText{Extra, "", "up"}]; got != [2]string{
		"... looked sexier when you lit it like a strip club bathroom",
		"... looks sexier when you lit it up like a strip club bathroom",
	} {
		t.Errorf("extra context %q", got)
	}
}

func TestMarkerContextClipsAtSentenceEdgesWithoutEllipsis(t *testing.T) {
	contexts := contextsOf("looked bright amber birch cedar dogwood elm", "looks bright amber birch cedar dogwood elm")
	if got := contexts[kindText{Misread, "", "looks"}]; got != [2]string{"looked bright amber birch cedar dogwood elm", "looks bright amber birch cedar dogwood elm"} {
		t.Errorf("context %q", got)
	}
}

func TestAMarkerWithNoSentenceOfItsOwnHasNoContext(t *testing.T) {
	if s, h := MarkerContext(Marker{}, compare.Alignment{}, nil); s != "" || h != "" {
		t.Fatalf("%q %q", s, h)
	}
	a := compare.Alignment{UnitIdx: []int{compare.HeadingUnit}, ChapterIndexMap: []int{0}, ChapterRawWords: []string{"Chapter"}}
	if s, h := MarkerContext(Marker{I1: 0, I2: 1}, a, nil); s != "" || h != "" {
		t.Fatalf("heading: %q %q", s, h)
	}
}

func TestATimeMapsBackToItsItemAndSourcePosition(t *testing.T) {
	segments := []Segment{{ItemIndex: 3, StartOffset: 10, ConcatStart: 0}, {ItemIndex: 5, StartOffset: 100, ConcatStart: 4}}
	for at, want := range map[float64][2]float64{-1: {3, 10}, 0: {3, 10}, 3.5: {3, 13.5}, 4: {5, 100}, 9: {5, 105}} {
		if item, pos := locate(at, segments); item != int(want[0]) || pos != want[1] {
			t.Errorf("%v: %d %v, want %v", at, item, pos, want)
		}
	}
	if item, pos := locate(5, nil); item != 0 || pos != 0 {
		t.Errorf("no segments: %d %v", item, pos)
	}
}

func TestTheGlobalParagraphIsTheNearestOneWithAnIndex(t *testing.T) {
	s := func(v string) *string { return &v }
	c := compare.Chapter{ParagraphIndices: []*string{nil, s("7"), nil, nil, s("True")}}
	for local, want := range map[int]string{0: "7", 1: "7", 2: "7", 3: "True", 4: "True", 9: "True", -3: "7"} {
		if got := globalParagraph(c, local); got != want {
			t.Errorf("%d: %q, want %q", local, got, want)
		}
	}
	if globalParagraph(compare.Chapter{}, 0) != "0" || globalParagraph(compare.Chapter{ParagraphIndices: []*string{nil, nil}}, 1) != "0" {
		t.Error("no index is 0")
	}
}

func TestTheChaptersNameAndSpokenHeadingFollowPythonsRules(t *testing.T) {
	for _, c := range []struct{ title, subtitle, name, heading string }{
		{"Chapter One", "", "Chapter One", "Chapter One"},
		{"CHAPTER I.\nDown the Rabbit-Hole", "", "CHAPTER I.", "CHAPTER I.\nDown the Rabbit-Hole"},
		{"Chapter 12:", "The Storm", "Chapter 12 — The Storm", "Chapter 12: The Storm"},
		{"  Spaced \x1c  Title  ", "  Sub  title ", "Spaced Title — Sub title", "  Spaced \x1c  Title     Sub  title "},
		{"—", "Only", "Only", "— Only"},
		{"Title", "   ", "Title", "Title"},
	} {
		ch := compare.Chapter{Title: c.title, Subtitle: c.subtitle}
		if got := chapterName(ch); got != c.name {
			t.Errorf("name of %q/%q = %q, want %q", c.title, c.subtitle, got, c.name)
		}
		if got := spokenHeading(ch); got != c.heading {
			t.Errorf("heading of %q/%q = %q, want %q", c.title, c.subtitle, got, c.heading)
		}
	}
}

func TestTheDiffsSiblingFilesDropOnlyItsLastExtension(t *testing.T) {
	for path, want := range map[string]string{
		"a/run.diff": "a/run", "a/b.c/run": "a/b.c/run", "a/.diff": "a/.diff", "a/..diff": "a/..diff", "a/b..diff": "a/b.", "": "", "a/": "a/", "run.x.diff": "run.x",
	} {
		if got := splitextBase(path); got != want {
			t.Errorf("%q: %q, want %q", path, got, want)
		}
	}
}

func TestAWordsReportThatIsNotWhatTheSidecarWritesIsRefused(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "words.txt")
	for report, want := range map[string]string{
		"":                                  "incomplete",
		"NEED_CHAPTER|One|Two":              "unknown line",
		"COMPARE_CHAPTER|{}":                "malformed line 1",
		"COMPARE_CHAPTER|[":                 "malformed line 1",
		"COMPARE_SEGMENT|{\"itemIndex\":1}": "malformed line 1",
		"COMPARE_WORDS|{\"words\":[[\"a\",\"0\",1]]}": "malformed line 1",
		"COMPARE_WORDS|{}": "malformed line 1",
		`COMPARE_CHAPTER|{"chapterId":"c","score":1}` + "\n": "incomplete",
	} {
		if err := os.WriteFile(path, []byte(report), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := ReadWordsReport(path); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%q: %v, want %q", report, err, want)
		}
	}
	if _, err := ReadWordsReport(filepath.Join(dir, "missing.txt")); err == nil || !strings.Contains(err.Error(), "could not be read") {
		t.Errorf("missing: %v", err)
	}
}

func TestRunWritesTheDiffItsSiblingsAndTheResults(t *testing.T) {
	dir := t.TempDir()
	manuscript := filepath.Join(dir, "project", "app", "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(manuscript), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manuscript, []byte(`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": "One"}],
		"paragraphs": [{"id": "p", "chapterId": "c", "index": 0, "text": "Alpha bravo charlie."}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	words := filepath.Join(dir, "words.txt")
	if err := os.WriteFile(words, []byte(`COMPARE_CHAPTER|{"chapterId":"c","score":1.0}`+"\n"+`COMPARE_SEGMENT|{"itemIndex":0,"startOffset":0.0,"concatStart":0.0}`+"\n"+
		`COMPARE_WORDS|{"words":[["alpha",0.0,0.3],["delta",0.4,0.7],["charlie",0.8,1.1]]}`+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	req := Request{ManuscriptPath: manuscript, WordsReport: words, Out: filepath.Join(dir, "results.txt"), DiffOut: filepath.Join(dir, "run.diff")}
	markers, err := Run(req)
	if err != nil || markers != 1 {
		t.Fatalf("%d, %v", markers, err)
	}
	for name, want := range map[string]string{
		"run.diff":           "--- One (manuscript)" + lineEnd() + "+++ One (recorded)" + lineEnd() + "-Alpha bravo charlie." + lineEnd() + "+Alpha delta charlie." + lineEnd(),
		"run.manuscript.txt": "One" + lineEnd() + lineEnd() + "Alpha bravo charlie." + lineEnd(),
		// equal words keep the manuscript's own spelling; only the word misread is the one heard
		"run.recorded.txt": "One" + lineEnd() + lineEnd() + "Alpha delta charlie." + lineEnd(),
	} {
		if got, _ := os.ReadFile(filepath.Join(dir, name)); string(got) != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
	if results, _ := os.ReadFile(req.Out); !strings.HasPrefix(string(results), "SUMMARY|MATCH: 'One' (score 1.00) - 1 discrepancy marker(s)\nDIFF|"+req.DiffOut+"\nMARKER|0|0.400|MISREAD|") {
		t.Errorf("results = %q", results)
	}
	if _, err := os.Stat(req.Out + ".tmp"); !os.IsNotExist(err) {
		t.Errorf("the temporary results file is left: %v", err)
	}

	for name, broken := range map[string]Request{
		"no words":        {ManuscriptPath: manuscript, WordsReport: filepath.Join(dir, "none.txt"), Out: req.Out, DiffOut: req.DiffOut},
		"no manuscript":   {ManuscriptPath: filepath.Join(dir, "none.json"), WordsReport: words, Out: req.Out, DiffOut: req.DiffOut},
		"no diff folder":  {ManuscriptPath: manuscript, WordsReport: words, Out: req.Out, DiffOut: filepath.Join(dir, "missing", "run.diff")},
		"no results path": {ManuscriptPath: manuscript, WordsReport: words, Out: filepath.Join(dir, "missing", "results.txt"), DiffOut: req.DiffOut},
	} {
		if _, err := Run(broken); err == nil {
			t.Errorf("%s: Run succeeded", name)
		}
	}
}

// The words report the sidecar really writes, pinned by its tests/test_compare_run.py: the host must read it as the
// sidecar meant it.
func TestTheSidecarsWordsReportReadsAsWritten(t *testing.T) {
	report, err := ReadWordsReport(filepath.Join(fixtures, "compare", "words-report.golden.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if report.ChapterID != "c-1" || report.Score != 1.0 || !reflect.DeepEqual(report.Segments, []Segment{{1, 100.25, 0}, {3, 0.5, 8.123}}) {
		t.Fatalf("report = %+v", report)
	}
	if len(report.Words) != 9 || report.Words[8] != w("“naïve”", 9.5, 10.0) {
		t.Fatalf("words = %+v", report.Words)
	}
	c := compare.Chapter{Title: "Chapter One", Paragraphs: []string{"She had nothing to do."}, ParagraphIndices: []*string{new("0")}}
	out := Build(compare.Tokenizer{}, c, report, MinWords, "run.diff")
	// The second item starts 8.123 s into the joined audio, so a word heard at 9.0 s is 1.377 s into its source range
	// (from 0.5). The tokenizer keeps ASCII letters only ("caf"), and a word of two tokens is heard twice in the
	// context, as compare.py wrote both.
	want := "MARKER|1|102.950|MISREAD|MISREAD: 'to' as '2'|to|2|Chapter One|0|She had nothing to do.|She had nothing two do. Café “naïve” “naïve”|medium|0.100|\n" +
		"MARKER|3|1.377|EXTRA|EXTRA: 'caf na ve'||caf na ve|Chapter One|0|She had nothing to do.|She had nothing two do. Café “naïve” “naïve”|high|5.700|\n"
	if !strings.HasSuffix(out.Results, want) {
		t.Fatalf("results = %q", out.Results)
	}
}
