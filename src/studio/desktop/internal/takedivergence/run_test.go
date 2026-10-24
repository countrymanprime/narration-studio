package takedivergence

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/contractfile"
)

// A run from the files the host writes and the sidecar's words report: the
// tests that were test_take_divergence_mode.py's, before the alignment moved
// out of the sidecar.

const chapterText = "Alice was beginning to get very tired. She had nothing to do. Once or twice she had peeped into the book."

var oneTake = map[string]any{"itemGuid": "{ITEM-1}", "takeGuid": "{TAKE-1}", "sourceFile": "take1.wav", "startOffset": 12.5, "length": 4.0}

// project lays a manuscript out as the host does, under <project>/<app>/manuscript, with a front-matter chapter
// before the narration chapter "ch-1" whose paragraphs are texts.
func project(t *testing.T, dir string, texts ...string) string {
	t.Helper()
	if len(texts) == 0 {
		texts = []string{chapterText}
	}
	paragraphs := []any{map[string]any{"id": "f-1", "chapterId": "front", "index": 0, "text": "Chapter One"}}
	for n, text := range texts {
		paragraphs = append(paragraphs, map[string]any{"id": fmt.Sprintf("p-%d", n+1), "chapterId": "ch-1", "index": n + 1, "text": text})
	}
	path := filepath.Join(dir, "project", "app", "manuscript", "manuscript.json")
	writeJSON(t, path, map[string]any{"schemaVersion": 1, "documentId": "doc", "paragraphs": paragraphs, "chapters": []any{
		map[string]any{"id": "front", "title": "Contents", "contentKind": "front-matter"},
		map[string]any{"id": "ch-1", "title": "Chapter One", "contentKind": "narration"},
	}})
	return path
}

func manifest(t *testing.T, dir string, span map[string]int, takes ...map[string]any) string {
	t.Helper()
	if len(takes) == 0 {
		takes = []map[string]any{oneTake}
	}
	path := filepath.Join(dir, "manifest.json")
	writeJSON(t, path, map[string]any{"schemaVersion": 1, "chapterId": "ch-1", "span": span, "takes": takes})
	return path
}

// wordsReport writes the sidecar's report for takes said as texts, in manifest order.
func wordsReport(t *testing.T, dir string, guids []string, texts ...string) string {
	t.Helper()
	var report strings.Builder
	report.WriteString(`TAKE_TRANSCRIPTION|{"language":"en","model":"small"}` + "\n")
	for k, text := range texts {
		words := [][3]any{}
		for _, w := range half(text) {
			words = append(words, [3]any{w.Text, w.Start, w.End})
		}
		payload, err := json.Marshal(map[string]any{"index": k, "takeGuid": guids[k], "words": words})
		if err != nil {
			t.Fatal(err)
		}
		report.WriteString("TAKE_WORDS|" + string(payload) + "\n")
	}
	path := filepath.Join(dir, "words-report.txt")
	if err := os.WriteFile(path, []byte(report.String()), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func run(t *testing.T, manifestPath, manuscriptPath, report string) []string {
	t.Helper()
	out := filepath.Join(filepath.Dir(report), "results.txt")
	if err := Run(manifestPath, manuscriptPath, report, out); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	return strings.Split(strings.TrimRight(string(raw), "\n"), "\n")
}

func payload(t *testing.T, line string) map[string]any {
	t.Helper()
	_, body, _ := strings.Cut(line, "|")
	var value map[string]any
	if err := json.Unmarshal([]byte(body), &value); err != nil {
		t.Fatalf("%s: %v", line, err)
	}
	return value
}

func TestEachTakeGetsItsWordsAndDivergencesInSourceSeconds(t *testing.T) {
	dir := t.TempDir()
	second := map[string]any{"itemGuid": "{ITEM-1}", "takeGuid": "{TAKE-2}", "sourceFile": "take2.wav", "startOffset": 3.0, "length": 4.0}
	lines := run(t, manifest(t, dir, map[string]int{"firstUnit": 1, "lastUnit": 1}, oneTake, second), project(t, dir),
		wordsReport(t, dir, []string{"{TAKE-1}", "{TAKE-2}"}, "She had nothing to do", "She had nothing two do"))

	if len(lines) != 4 || lines[0] != "SUMMARY|Aligned 2 take(s) to sentences 1-1 of 'Chapter One'" ||
		!strings.HasPrefix(lines[1], "DIVERGENCE_SPAN|") || !strings.HasPrefix(lines[2], "TAKE_DIVERGENCE|") {
		t.Fatalf("lines: %q", lines)
	}
	span := payload(t, lines[1])
	if span["chapterId"] != "ch-1" || span["model"] != "small" || span["language"] != "en" {
		t.Fatalf("span: %v", span)
	}
	first, second2 := payload(t, lines[2]), payload(t, lines[3])
	if first["takeGuid"] != "{TAKE-1}" || first["fidelity"] != 1.0 || len(first["divergences"].([]any)) != 0 {
		t.Fatalf("take 1: %v", first)
	}
	if word := first["words"].([]any)[2].(map[string]any); word["start"] != 13.5 || word["end"] != 13.9 || word["status"] != "matched" {
		t.Fatalf("take 1 word 2: %v", word)
	}
	want := `[{"audioText":"two","end":4.9,"firstWord":3,"kind":"misread","lastWord":3,"manuscriptText":"to","position":"within","start":4.5}]`
	if got, _ := json.Marshal(second2["divergences"]); string(got) != want {
		t.Fatalf("take 2 divergences: %s", got)
	}
}

func TestTheProjectEquivalencesApplyToTheSpan(t *testing.T) {
	dir := t.TempDir()
	manuscript := project(t, dir, "Arelian walked home.")
	lists := filepath.Join(dir, "project", "TranscriptCompare")
	if err := os.MkdirAll(lists, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(lists, "equivalences.csv"), []byte("arelian, arelion\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	lines := run(t, manifest(t, dir, map[string]int{"firstUnit": 0, "lastUnit": 0}), manuscript, wordsReport(t, dir, []string{"{TAKE-1}"}, "Arelion walked home"))

	if fidelity := payload(t, lines[2])["fidelity"]; fidelity != 1.0 {
		t.Fatalf("fidelity %v", fidelity)
	}
}

func TestAParagraphSpanAlignsEverySentenceOfThoseParagraphsAndSaysWhichItWas(t *testing.T) {
	dir := t.TempDir()
	manuscript := project(t, dir, "Alice was beginning to get very tired. She had nothing to do.", "Once or twice she had peeped into the book.", "Her sister was reading.")
	lines := run(t, manifest(t, dir, map[string]int{"firstParagraph": 1, "lastParagraph": 2}), manuscript,
		wordsReport(t, dir, []string{"{TAKE-1}"}, "Once or twice she had peeped into the book Her sister was reading"))

	span := payload(t, lines[1])["span"].(map[string]any)
	if span["firstParagraph"] != 1.0 || span["lastParagraph"] != 2.0 || span["firstUnit"] != 2.0 || span["lastUnit"] != 3.0 {
		t.Fatalf("span: %v", span)
	}
}

func TestAnUnknownChapterOrASpanPastItIsRefusedBeforeAnythingIsTranscribed(t *testing.T) {
	dir := t.TempDir()
	manuscript := project(t, dir)
	for _, c := range []struct {
		chapter string
		span    map[string]int
		want    string
	}{
		{"front", map[string]int{"firstUnit": 0, "lastUnit": 0}, "The manuscript has no narratable chapter with id 'front'"},
		{"ch-1", map[string]int{"firstUnit": 0, "lastUnit": 9}, "not within the chapter"},
		{"ch-1", map[string]int{"firstParagraph": 0, "lastParagraph": 5}, "not within the chapter"},
	} {
		path := filepath.Join(dir, "manifest.json")
		writeJSON(t, path, map[string]any{"schemaVersion": 1, "chapterId": c.chapter, "span": c.span, "takes": []any{oneTake}})
		if _, err := Prepare(path, manuscript); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Fatalf("%s %v: %v", c.chapter, c.span, err)
		}
	}
}

func TestAWordsReportThatDoesNotFitTheManifestIsRefused(t *testing.T) {
	dir := t.TempDir()
	manuscript := project(t, dir)
	manifestPath := manifest(t, dir, map[string]int{"firstUnit": 1, "lastUnit": 1})
	p, err := Prepare(manifestPath, manuscript)
	if err != nil {
		t.Fatal(err)
	}
	for name, c := range map[string]struct{ report, want string }{
		"no take":        {`TAKE_TRANSCRIPTION|{"model":"small","language":null}`, "no words for take 0"},
		"another take":   {`TAKE_TRANSCRIPTION|{"model":"small","language":"en"}` + "\n" + `TAKE_WORDS|{"index":0,"takeGuid":"{OTHER}","words":[]}`, "of take {OTHER}, not {TAKE-1}"},
		"no header":      {`TAKE_WORDS|{"index":0,"takeGuid":"{TAKE-1}","words":[]}`, "does not say how it transcribed"},
		"unknown tag":    {"COVERAGE_WORDS|{}", "unknown line"},
		"no model":       {`TAKE_TRANSCRIPTION|{"language":"en"}`, "malformed line 1"},
		"not JSON":       {"TAKE_TRANSCRIPTION|{", "malformed line 1"},
		"no index":       {`TAKE_TRANSCRIPTION|{"model":"m"}` + "\n" + `TAKE_WORDS|{"words":[]}`, "malformed line 2"},
		"a bad word":     {`TAKE_TRANSCRIPTION|{"model":"m"}` + "\n" + `TAKE_WORDS|{"index":0,"words":[["a","0",1]]}`, "malformed line 2"},
		"a missing file": {"", "could not be read"},
	} {
		path := filepath.Join(dir, "report.txt")
		_ = os.Remove(path)
		if name != "a missing file" {
			if err := os.WriteFile(path, []byte(c.report+"\n"), 0o600); err != nil {
				t.Fatal(err)
			}
		}
		report, err := ReadWordsReport(path)
		if err == nil {
			_, err = Results(p, report)
		}
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: %v, want %q", name, err, c.want)
		}
	}
}

func TestANullLanguageIsWrittenAsNull(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "report.txt")
	if err := os.WriteFile(path, []byte(`TAKE_TRANSCRIPTION|{"language":null,"model":"small"}`+"\n"+`TAKE_WORDS|{"index":0,"takeGuid":"{TAKE-1}","words":[]}`+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	lines := run(t, manifest(t, dir, map[string]int{"firstUnit": 1, "lastUnit": 1}), project(t, dir), path)
	if span := payload(t, lines[1]); span["language"] != nil {
		t.Fatalf("language %v", span["language"])
	}
}

// The results file the host's internal/takecompare parser and its comparison tests read
// (tests/fixtures/contracts/take-divergence-results.json): three takes of one span, read cleanly, with a misread
// and with a skipped word.
func TestTheResultsFileIsPinnedForTheHostThatReadsIt(t *testing.T) {
	dir := t.TempDir()
	take := func(letter string, offset float64) map[string]any {
		return map[string]any{"itemGuid": "{ITEM-" + letter + "}", "takeGuid": "{TAKE-" + letter + "}", "sourceFile": "read-" + strings.ToLower(letter) + ".wav", "startOffset": offset, "length": 8.0}
	}
	lines := run(t, manifest(t, dir, map[string]int{"firstUnit": 0, "lastUnit": 1}, take("A", 0), take("B", 1.5), take("C", 0)), project(t, dir),
		wordsReport(t, dir, []string{"{TAKE-A}", "{TAKE-B}", "{TAKE-C}"},
			"Alice was beginning to get very tired She had nothing to do",
			"Alice was beginning to get very tried She had nothing to do",
			"Alice was beginning to get tired She had nothing to do"))

	contractfile.Check(t, "take-divergence-results", map[string]any{"lines": lines})
}
