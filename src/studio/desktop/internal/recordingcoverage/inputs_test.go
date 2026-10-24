package recordingcoverage

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/brand"
	"desktop/internal/compare"
)

// The files the check reads and the run around them: the manifest the host
// writes, the words files, the sidecar's words report and the manuscript.
// The manifest and words-file cases mirror the sidecar's own readers
// (tests/test_coverage_mode.py), which still read the same files.

const (
	title    = "Chapter One"
	subtitle = "The Pool"
	para1    = "Alice was beginning to get very tired of sitting by her sister on the bank."
	para2    = "Once or twice she had peeped into the book her sister was reading."
	para3    = "So she was considering in her own mind what she would do."
	wordGap  = 0.3
)

// project writes a canonical manuscript at the path the host uses and returns it.
func project(t *testing.T, dir string, withSubtitle bool) string {
	t.Helper()
	path := filepath.Join(dir, "project", brand.ProjectFolder, "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	chapter := map[string]any{"id": "c-0001", "title": title, "contentKind": "narration"}
	if withSubtitle {
		chapter["subtitle"] = subtitle
	}
	data := map[string]any{
		"schemaVersion": 1, "documentId": "doc-1",
		"chapters": []any{chapter, map[string]any{"id": "c-0002", "title": "Chapter Two", "contentKind": "narration"}},
		"paragraphs": []any{
			map[string]any{"id": "p-000001", "chapterId": "c-0001", "index": 0, "text": para1},
			map[string]any{"id": "p-000002", "chapterId": "c-0001", "index": 1, "text": para2},
			map[string]any{"id": "p-000003", "chapterId": "c-0001", "index": 2, "text": para3},
			map[string]any{"id": "p-000004", "chapterId": "c-0002", "index": 3, "text": "Down the rabbit hole."},
		},
	}
	writeJSON(t, path, data)
	return path
}

func writeJSON(t *testing.T, path string, value any) {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, encoded, 0o600); err != nil {
		t.Fatal(err)
	}
}

func item(index int, guid string, start, length float64, muted bool) map[string]any {
	return map[string]any{"index": index, "itemGuid": guid, "sourceFile": "a.wav", "startOffset": start, "length": length, "wordsFile": fmt.Sprintf("item-%d.json", index), "muted": muted}
}

// wordsFile writes a words file whose words are text's, one every wordGap seconds from start, each 0.25 s long.
func wordsFile(t *testing.T, path, text string, start, end float64, model string) {
	t.Helper()
	words := []any{}
	for n, word := range strings.Fields(text) {
		at := roundTo(start+float64(n)*wordGap, 3)
		words = append(words, []any{word, at, roundTo(start+float64(n)*wordGap+0.25, 3)})
	}
	writeJSON(t, path, map[string]any{"schemaVersion": 1, "sourceStart": start, "sourceEnd": end, "words": words,
		"transcription": map[string]any{"model": model, "language": "en", "hotwordsHash": nil, "vadFilter": true}})
}

func roundTo(x float64, n int) float64 {
	p := math.Pow(10, float64(n))
	return math.Round(x*p) / p
}

type run struct {
	dir, manuscript, manifest, words string
}

// cachedProject is the sidecar tests' fixture: title, subtitle and P1 on item 0; a muted item 1; P2 on item 2; P3 never read.
func cachedProject(t *testing.T) run {
	t.Helper()
	dir := t.TempDir()
	r := run{dir: dir, manuscript: project(t, dir, true), manifest: filepath.Join(dir, "manifest.json"), words: filepath.Join(dir, "words")}
	wordsFile(t, filepath.Join(r.words, "item-0.json"), title+" "+subtitle+" "+para1, 10, 20, "small")
	wordsFile(t, filepath.Join(r.words, "item-2.json"), para2, 0, 6, "small")
	writeJSON(t, r.manifest, map[string]any{"schemaVersion": 1, "items": []any{item(2, "{B}", 0, 6, false), item(0, "{A}", 10, 10, false), item(1, "{M}", 0, 4, true)}})
	return r
}

func (r run) request() Request {
	return Request{ManifestPath: r.manifest, WordsDir: r.words, ManuscriptPath: r.manuscript, ChapterID: "c-0001", Out: filepath.Join(r.dir, "out", "coverage.txt"), Model: "small", Params: DefaultParams}
}

func tagged(t *testing.T, path string) map[string][]map[string]any {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string][]map[string]any{}
	for _, line := range strings.Split(strings.TrimRight(string(raw), "\n"), "\n") {
		tag, payload, _ := strings.Cut(line, "|")
		var value map[string]any
		if err := json.Unmarshal([]byte(payload), &value); err != nil {
			t.Fatalf("%s: %v", line, err)
		}
		out[tag] = append(out[tag], value)
	}
	return out
}

func TestTheManifestIsReadInItemOrder(t *testing.T) {
	path := filepath.Join(t.TempDir(), "m.json")
	first := item(3, "{C}", 1.5, 2.25, false)
	writeJSON(t, path, map[string]any{"schemaVersion": 1, "items": []any{first, item(1, "{A}", 0, 10, true)}})
	items, err := ReadManifest(path)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, []int{items[0].Index, items[1].Index}, []int{1, 3})
	eq(t, items[1], ManifestItem{3, "{C}", "a.wav", 1.5, 2.25, "item-3.json", false})
	eq(t, items[1].End(), 3.75)
	eq(t, items[0].Muted, true)
}

func TestAMalformedManifestIsRefused(t *testing.T) {
	cases := []struct {
		change  func(map[string]any, map[string]any)
		message string
	}{
		{func(m, _ map[string]any) { m["schemaVersion"] = 2 }, "schema version"},
		{func(m, _ map[string]any) { m["items"] = []any{} }, "no items"},
		{func(m, _ map[string]any) { m["items"] = "x" }, "items"},
		{func(_, i map[string]any) { delete(i, "itemGuid") }, "itemGuid"},
		{func(_, i map[string]any) { i["extra"] = 1 }, "extra"},
		{func(_, i map[string]any) { i["index"] = true }, "index"},
		{func(_, i map[string]any) { i["index"] = -1 }, "index"},
		{func(_, i map[string]any) { i["index"] = 1.5 }, "index"},
		{func(m, _ map[string]any) { m["items"] = append(m["items"].([]any), item(0, "{Z}", 0, 10, false)) }, "twice"},
		{func(_, i map[string]any) { i["itemGuid"] = "" }, "itemGuid"},
		{func(_, i map[string]any) { i["sourceFile"] = nil }, "sourceFile"},
		{func(_, i map[string]any) { i["startOffset"] = -0.5 }, "startOffset"},
		{func(_, i map[string]any) { i["startOffset"] = "1" }, "startOffset"},
		{func(_, i map[string]any) { i["length"] = 0 }, "length"},
		{func(_, i map[string]any) { i["muted"] = "no" }, "muted"},
		{func(_, i map[string]any) { i["wordsFile"] = "../escape.json" }, "wordsFile"},
		{func(_, i map[string]any) { i["wordsFile"] = "sub/name.json" }, "wordsFile"},
		{func(_, i map[string]any) { i["wordsFile"] = `sub\name.json` }, "wordsFile"},
		{func(_, i map[string]any) { i["wordsFile"] = ".hidden" }, "wordsFile"},
		{func(_, i map[string]any) { i["wordsFile"] = "C:name.json" }, "wordsFile"},
		{func(_, i map[string]any) { i["wordsFile"] = strings.Repeat("x", 201) }, "wordsFile"},
	}
	for _, c := range cases {
		first := item(0, "{A}", 0, 10, false)
		manifest := map[string]any{"schemaVersion": 1, "items": []any{first}}
		c.change(manifest, first)
		path := filepath.Join(t.TempDir(), "m.json")
		writeJSON(t, path, manifest)
		if _, err := ReadManifest(path); err == nil || !strings.Contains(err.Error(), c.message) {
			t.Errorf("want an error naming %q, got %v", c.message, err)
		}
	}
	for _, content := range []string{"not json", "[1, 2]", `{"schemaVersion": 1, "items": [3]}`, `{"schemaVersion": 1, "items": []} trailing`} {
		path := filepath.Join(t.TempDir(), "m.json")
		_ = os.WriteFile(path, []byte(content), 0o600)
		if _, err := ReadManifest(path); err == nil {
			t.Errorf("%q must be refused", content)
		}
	}
	if _, err := ReadManifest(filepath.Join(t.TempDir(), "absent.json")); err == nil || !strings.Contains(err.Error(), "could not be read") {
		t.Errorf("a missing manifest: %v", err)
	}
}

func TestAnUnreadableWordsFileIsAMissNotAnError(t *testing.T) {
	for _, content := range []string{
		"{broken",
		`{"schemaVersion": 2, "sourceStart": 0, "sourceEnd": 1, "words": [], "transcription": {}}`,
		`{"schemaVersion": 1, "sourceStart": 0, "sourceEnd": 1, "words": [["a", 0]], "transcription": {"model": "small"}}`,
		`{"schemaVersion": 1, "sourceStart": 0, "sourceEnd": 1, "words": [], "transcription": {"model": 3}}`,
		`{"schemaVersion": 1, "sourceStart": 0, "sourceEnd": 1, "words": [], "transcription": {"model": null}}`,
		`{"schemaVersion": 1, "sourceStart": "0", "sourceEnd": 1, "words": [], "transcription": {"model": "small"}}`,
		`{"schemaVersion": 1, "sourceStart": 0, "sourceEnd": 1, "words": [[null, 0, 1]], "transcription": {"model": "small"}}`,
		`{"schemaVersion": 1, "sourceStart": 0, "sourceEnd": 1, "words": [["a", 0, 1, "x"]], "transcription": {"model": "small"}}`,
		`{"schemaVersion": 1, "sourceStart": 0, "sourceEnd": 1, "words": [], "transcription": {"model": "small"}, "spans": null}`,
		`{"schemaVersion": 1, "sourceStart": 0, "sourceEnd": 1, "words": [], "transcription": {"model": "small"}, "spans": [{"start": 0, "end": 1}]}`,
		"[]",
		"\xff\xfe",
	} {
		path := filepath.Join(t.TempDir(), "item.json")
		_ = os.WriteFile(path, []byte(content), 0o600)
		if words := ReadWordsFile(path); words != nil {
			t.Errorf("%q must be a miss, got %+v", content, words)
		}
	}
	if ReadWordsFile(filepath.Join(t.TempDir(), "absent.json")) != nil {
		t.Fatal("an absent words file is a miss")
	}
}

func TestAWordsFileWithScoresAndSpansIsRead(t *testing.T) {
	path := filepath.Join(t.TempDir(), "item.json")
	_ = os.WriteFile(path, []byte(`{"schemaVersion": 1.0, "sourceStart": 5, "sourceEnd": 9, "words": [["one", 5, 5.3, 0.9], ["two", 5.4, 5.7, null]],
		"transcription": {"model": "small", "language": null}, "spans": [{"start": 5, "end": 6, "model": "large"}]}`), 0o600)
	words := ReadWordsFile(path)
	if words == nil || len(words.Words) != 2 || words.Language != nil || words.Model != "small" || words.SourceStart != 5 {
		t.Fatalf("got %+v", words)
	}
}

func TestWordsCoverAnItemOnlyWhenTheirRangeContainsItsPlayedRange(t *testing.T) {
	words := &ItemWords{SourceStart: 10, SourceEnd: 20, Model: "small"}
	if !words.Covers(ManifestItem{StartOffset: 12, Length: 5}, "") || !words.Covers(ManifestItem{StartOffset: 12, Length: 5}, "small") {
		t.Fatal("a range inside the words is covered")
	}
	if words.Covers(ManifestItem{StartOffset: 8, Length: 5}, "") || words.Covers(ManifestItem{StartOffset: 16, Length: 5}, "") || words.Covers(ManifestItem{StartOffset: 12, Length: 5}, "large") {
		t.Fatal("a wider range, or another model's words, are not covered")
	}
	played := (&ItemWords{Words: []compare.Word{{Text: "before", Start: 9, End: 9.5}, {Text: "in", Start: 12, End: 12.4}, {Text: "edge", Start: 16.6, End: 17.2}, {Text: "after", Start: 18, End: 18.5}}}).Played(ManifestItem{StartOffset: 11, Length: 6})
	eq(t, []string{played[0].Text, played[1].Text, fmt.Sprint(len(played))}, []string{"in", "edge", "2"})
}

func TestTheCachedProjectGivesTheReport(t *testing.T) {
	r := cachedProject(t)
	request := r.request()
	if err := Run(request); err != nil {
		t.Fatal(err)
	}
	lines := tagged(t, request.Out)
	summary := lines["COVERAGE"][0]
	body := len(strings.Fields(para1)) + len(strings.Fields(para2)) + len(strings.Fields(para3))
	p3 := len(strings.Fields(para3))
	eq(t, []any{summary["bodyTokens"], summary["presentTokens"], summary["missingTokens"], summary["extraTokens"], summary["longestMissingRun"]},
		[]any{float64(body), float64(body - p3), float64(p3), 0.0, float64(p3)})
	eq(t, summary["items"], map[string]any{"analyzed": 2.0, "muted": 1.0, "playedSeconds": 16.0, "transcribed": 0.0, "reused": 2.0})
	eq(t, summary["analysis"], map[string]any{"model": "small", "language": nil, "equivalencesHash": nil})
	eq(t, len(lines["COVERAGE_ITEM"]), 3)
	eq(t, lines["COVERAGE_ITEM"][1], map[string]any{"index": 1.0, "itemGuid": "{M}", "status": "muted", "words": nil, "playedSeconds": 4.0, "wordCount": 0.0, "model": nil, "language": nil})
	region := lines["COVERAGE_REGION"][0]
	end := roundTo(float64(len(strings.Fields(para2))-1)*wordGap+0.25, 3)
	eq(t, region["position"], map[string]any{"itemIndex": 2.0, "itemGuid": "{B}", "sourceTime": end})
	eq(t, region["after"], nil)
}

func TestAWordsReportGivesEachItemsSourceAndCarriesItsLines(t *testing.T) {
	r := cachedProject(t)
	report := filepath.Join(r.dir, "words-report.txt")
	_ = os.WriteFile(report, []byte(`COVERAGE_WORDS|{"index":0,"itemGuid":"{A}","words":"transcribed"}
COVERAGE_WORDS|{"index":2,"itemGuid":"{B}","words":"reused"}
COVERAGE_UNSURE|{"end":11.0,"itemGuid":"{A}","itemIndex":0,"minScore":0.2,"start":10.0,"words":2}
COVERAGE_RECHECKED|{"itemGuid":"{A}","itemIndex":0,"seconds":1.5,"whole":false,"windows":1}
`), 0o600)
	request := r.request()
	request.WordsReport = report
	if err := Run(request); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(request.Out)
	text := string(raw)
	for _, want := range []string{
		`"transcribed":1`, `"reused":1`, `"words":"transcribed"`,
		"\nCOVERAGE_UNSURE|{\"end\":11.0,\"itemGuid\":\"{A}\",\"itemIndex\":0,\"minScore\":0.2,\"start\":10.0,\"words\":2}\n",
		"\nCOVERAGE_RECHECKED|{\"itemGuid\":\"{A}\",\"itemIndex\":0,\"seconds\":1.5,\"whole\":false,\"windows\":1}\nCOVERAGE_TOKEN|",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("the results lack %q", want)
		}
	}
}

func TestAMalformedWordsReportIsRefused(t *testing.T) {
	for _, content := range []string{
		"COVERAGE|{}\n", "COVERAGE_WORDS|not json\n", `COVERAGE_WORDS|{"index":0,"words":"guessed"}` + "\n",
		`COVERAGE_WORDS|{"words":"reused"}` + "\n", "no tag at all\n",
	} {
		path := filepath.Join(t.TempDir(), "report.txt")
		_ = os.WriteFile(path, []byte(content), 0o600)
		if _, err := ReadWordsReport(path); err == nil {
			t.Errorf("%q must be refused", content)
		}
	}
	if _, err := ReadWordsReport(filepath.Join(t.TempDir(), "absent.txt")); err == nil {
		t.Fatal("a missing words report is an error")
	}
	r := cachedProject(t)
	report := filepath.Join(r.dir, "words-report.txt")
	_ = os.WriteFile(report, []byte(`COVERAGE_WORDS|{"index":0,"itemGuid":"{A}","words":"reused"}`+"\n"), 0o600)
	request := r.request()
	request.WordsReport = report
	if err := Run(request); err == nil || !strings.Contains(err.Error(), "item 2") {
		t.Fatalf("an item the report does not name: %v", err)
	}
}

func TestAlignOnlyNeedsEveryItemsWordsByThisModelOrTheOneThatCheckedIt(t *testing.T) {
	r := cachedProject(t)
	request := r.request()
	request.Model = "large-v3-turbo"
	if err := Run(request); err == nil || !strings.Contains(err.Error(), "item 0") {
		t.Fatalf("another model's words do not serve an align-only pass: %v", err)
	}
	request.CheckedBy = "small"
	if err := Run(request); err != nil {
		t.Fatalf("words the larger model made serve it: %v", err)
	}
	_ = os.Remove(filepath.Join(r.words, "item-2.json"))
	if err := Run(r.request()); err == nil || !strings.Contains(err.Error(), "item 2") {
		t.Fatalf("a missing words file: %v", err)
	}
	if _, err := os.Stat(r.request().Out); !os.IsNotExist(err) {
		t.Fatal("a failed run must leave no results file")
	}
}

func TestAStaleResultsFileIsRemovedAndAnUnknownChapterRefused(t *testing.T) {
	r := cachedProject(t)
	request := r.request()
	request.ChapterID = "c-9999"
	writeJSON(t, request.Out, map[string]any{})
	if err := Run(request); err == nil || !strings.Contains(err.Error(), "c-9999") {
		t.Fatalf("got %v", err)
	}
	if _, err := os.Stat(request.Out); !os.IsNotExist(err) {
		t.Fatal("the stale results file must be gone")
	}
	request.ChapterID = "c-0002" // a chapter with paragraphs elsewhere in the manuscript is fine
	if err := Run(request); err != nil {
		t.Fatal(err)
	}
}

func TestParametersAreValidatedUsedAndReported(t *testing.T) {
	r := cachedProject(t)
	request := r.request()
	request.Params = AlignmentParams{MaxMisreadRun: 2, MinAnchorRun: 4}
	if err := Run(request); err != nil {
		t.Fatal(err)
	}
	eq(t, tagged(t, request.Out)["COVERAGE"][0]["alignment"], map[string]any{"maxMisreadRun": 2.0, "minAnchorRun": 4.0})
	request.Params.MinAnchorRun = 0
	if err := Run(request); err == nil || !strings.Contains(err.Error(), "min_anchor_run") {
		t.Fatalf("got %v", err)
	}
}

func TestProjectEquivalencesAreUsedAndTheirHashReported(t *testing.T) {
	dir := t.TempDir()
	manuscript := project(t, dir, true)
	_ = os.MkdirAll(filepath.Join(dir, "project", "TranscriptCompare"), 0o755)
	_ = os.WriteFile(filepath.Join(dir, "project", "TranscriptCompare", "equivalences.csv"), []byte("Alice, Alyce\n"), 0o600)
	words := filepath.Join(dir, "words")
	wordsFile(t, filepath.Join(words, "item-0.json"), strings.Replace(para1, "Alice", "Alyce", 1)+" "+para2+" "+para3, 0, 20, "small")
	manifest := filepath.Join(dir, "m.json")
	writeJSON(t, manifest, map[string]any{"schemaVersion": 1, "items": []any{item(0, "{A}", 0, 20, false)}})
	out := filepath.Join(dir, "out.txt")
	if err := Run(Request{ManifestPath: manifest, WordsDir: words, ManuscriptPath: manuscript, ChapterID: "c-0001", Out: out, Model: "small", Params: DefaultParams}); err != nil {
		t.Fatal(err)
	}
	summary := tagged(t, out)["COVERAGE"][0]
	hash, _ := summary["analysis"].(map[string]any)["equivalencesHash"].(string)
	if summary["missingTokens"] != 0.0 || summary["extraTokens"] != 0.0 || !strings.HasPrefix(hash, "sha256:") {
		t.Fatalf("summary = %v", summary)
	}
	_ = os.WriteFile(filepath.Join(dir, "project", "TranscriptCompare", "equivalences.csv"), []byte("\xff not text\n"), 0o600)
	if _, _, err := ProjectEquivalences(manuscript); err == nil {
		t.Fatal("an equivalences file that is not UTF-8 fails the run, as the sidecar's decode error did")
	}
}

func TestASubtitleTheManuscriptLacksIsNotExtraWhenReadBeforeTheFirstLine(t *testing.T) {
	// #2251 item 7: whatever is said before the chapter's first word is its heading, in the narrator's own words.
	r := cachedProject(t)
	request := r.request()
	request.ManuscriptPath = project(t, filepath.Join(r.dir, "other"), false)
	if err := Run(request); err != nil {
		t.Fatal(err)
	}
	eq(t, tagged(t, request.Out)["COVERAGE"][0]["extraTokens"], 0.0)
}

func TestTheManuscriptIsReadAsTheSidecarValidatesIt(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "manuscript.json")
	if _, err := LoadChapter(path, "c-0001"); err == nil || err.Error() != "Import a manuscript first." {
		t.Fatalf("a missing manuscript: %v", err)
	}
	for content, message := range map[string]string{
		"not json": "could not be read",
		`{"schemaVersion": 2, "documentId": "d", "chapters": [], "paragraphs": []}`:                                                                                                                                        "unsupported schema version",
		`{"schemaVersion": 1, "documentId": 3, "chapters": [], "paragraphs": []}`:                                                                                                                                          "is invalid",
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c"}], "paragraphs": [{"id": "p", "chapterId": "x", "text": "t"}]}`:                                                                                   "invalid paragraph records",
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c"}], "paragraphs": [{"id": "p", "chapterId": "c", "text": null}]}`:                                                                                  "invalid paragraph records",
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": "T"}], "paragraphs": [{"id": "p", "chapterId": "c", "text": "a", "index": 0}, {"id": "p", "chapterId": "c", "text": "b", "index": 1}]}`: "invalid paragraph records",
		`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": "T", "contentKind": "opening"}], "paragraphs": [{"id": "p", "chapterId": "c", "text": "a", "index": 0}]}`:                               "no narratable chapters",
		`{"schemaVersion": true, "documentId": "d", "chapters": [{"id": "c", "title": "T"}], "paragraphs": [{"id": "p", "chapterId": "c", "text": "a", "index": 0}]}`:                                                      "Chapter 'c-0001' is not",
	} {
		_ = os.WriteFile(path, []byte(content), 0o600)
		if _, err := LoadChapter(path, "c-0001"); err == nil || !strings.Contains(err.Error(), message) {
			t.Errorf("%s: want %q, got %v", content, message, err)
		}
	}
	_ = os.WriteFile(path, []byte(`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": "T", "subtitle": 5}], "paragraphs": [{"id": "p", "chapterId": "c", "text": "a", "index": 0}]}`), 0o600)
	chapter, err := LoadChapter(path, "c")
	if err != nil || chapter.Heading() != "T" || chapter.Subtitle != "" {
		t.Fatalf("a subtitle that is not text is no subtitle: %+v, %v", chapter, err)
	}
}

func TestTheChaptersWordsMustLineUpWithItsTokens(t *testing.T) {
	if err := matchWords([]tokenWord{{0, 0}}, []string{"a", "b"}); err == nil || !strings.Contains(err.Error(), "could not be matched") {
		t.Fatalf("got %v", err)
	}
	if err := matchWords(nil, nil); err != nil {
		t.Fatal(err)
	}
}

func TestTheSameInputsGiveTheSameBytes(t *testing.T) {
	r := cachedProject(t)
	first, second := r.request(), r.request()
	second.Out = filepath.Join(r.dir, "out", "again.txt")
	if Run(first) != nil || Run(second) != nil {
		t.Fatal("the runs failed")
	}
	a, _ := os.ReadFile(first.Out)
	b, _ := os.ReadFile(second.Out)
	if string(a) != string(b) {
		t.Fatal("the same inputs must give the same bytes")
	}
}

func TestAFileLargerThanTheBoundIsRefused(t *testing.T) {
	path := filepath.Join(t.TempDir(), "big.txt")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Truncate(compare.MaxInputBytes + 1); err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
	if _, err := ReadWordsReport(path); err == nil || !strings.Contains(err.Error(), "larger than") {
		t.Fatalf("got %v", err)
	}
	if ReadWordsFile(path) != nil {
		t.Fatal("an oversized words file is a miss")
	}
	if _, err := ReadManifest(path); err == nil {
		t.Fatal("an oversized manifest is refused")
	}
}

// The words report the sidecar really writes, pinned by its test_coverage_unsure.py: the host must read it as the sidecar meant it.
func TestTheSidecarsWordsReportReadsAsWritten(t *testing.T) {
	path := filepath.Join(fixtures, "coverage-words-report.golden.txt")
	report, err := ReadWordsReport(path)
	if err != nil {
		t.Fatal(err)
	}
	eq(t, report.Sources, map[int]string{0: SourceReused, 2: SourceTranscribed})
	raw, _ := os.ReadFile(path)
	lines := strings.Split(strings.TrimRight(string(raw), "\n"), "\n")
	eq(t, len(report.Unsure), 1)
	eq(t, "COVERAGE_UNSURE|"+string(report.Unsure[0]), lines[2])
	eq(t, len(report.Rechecked), 0)
}
