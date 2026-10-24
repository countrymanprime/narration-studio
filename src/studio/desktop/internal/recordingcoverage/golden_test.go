package recordingcoverage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"desktop/internal/compare"
)

// The results lines for every committed recording-coverage case at the shipped
// settings, pinned byte for byte in
// src/studio/sidecars/transcript-compare/tests/fixtures/coverage/results.golden.json.
// The lines were first written by the sidecar's Python coverage mode; this
// port reproduces them unchanged. The input is the words the sidecar's harness
// renders for each case (coverage-words.golden.json, pinned by
// tests/test_coverage_results_golden.py), laid out as the calibration's
// write_inputs lays them out. Regenerate with UPDATE_CONTRACTS=1 only when a
// change to the coverage output is intended, and say why in the PR. Only the
// measurement lines are pinned: the word alignment (COVERAGE_TOKEN,
// COVERAGE_EXTRA) is held by the alignment tests.

var fixtures = filepath.Join("..", "..", "..", "sidecars", "transcript-compare", "tests", "fixtures")

// The shipped thresholds (docs/utilities/recording-coverage.md), applied on read.
const (
	shippedMinParagraphPresent = 0.8
	shippedMaxMissingRun       = 3
)

const wordSeconds = 0.4 // coverage_harness.WORD_SECONDS

var measurementTags = map[string]bool{"COVERAGE": true, "COVERAGE_ITEM": true, "COVERAGE_PARAGRAPH": true, "COVERAGE_REGION": true}

type corpusItem struct {
	ID    string   `json:"id"`
	Words [][3]any `json:"words"` // [text, start, end]
}

type corpusWords struct {
	Cases map[string]struct {
		ChapterID string       `json:"chapterId"`
		Items     []corpusItem `json:"items"`
	} `json:"cases"`
}

// writeCaseInputs is coverage_calibration.write_inputs for a scripted case: a
// words file per item covering it from 0 to its last word's end plus a word,
// and the manifest.
func writeCaseInputs(t *testing.T, dir, caseID string, items []corpusItem) string {
	t.Helper()
	type manifestItem struct {
		Index       int     `json:"index"`
		ItemGUID    string  `json:"itemGuid"`
		SourceFile  string  `json:"sourceFile"`
		StartOffset float64 `json:"startOffset"`
		Length      float64 `json:"length"`
		WordsFile   string  `json:"wordsFile"`
		Muted       bool    `json:"muted"`
	}
	manifest := struct {
		SchemaVersion int            `json:"schemaVersion"`
		Items         []manifestItem `json:"items"`
	}{SchemaVersion: 1}
	for index, item := range items {
		name := fmt.Sprintf("%03d-%s.json", index, item.ID)
		last := 0.0
		for _, word := range item.Words {
			last = max(last, word[2].(float64))
		}
		length := last + wordSeconds
		file := map[string]any{
			"schemaVersion": 1, "sourceStart": 0.0, "sourceEnd": length, "words": item.Words,
			"transcription": map[string]any{"model": "scripted", "language": "en", "hotwordsHash": nil, "vadFilter": true},
		}
		encoded, _ := json.Marshal(file)
		if err := os.WriteFile(filepath.Join(dir, name), encoded, 0o600); err != nil {
			t.Fatal(err)
		}
		manifest.Items = append(manifest.Items, manifestItem{index, item.ID, caseID + "-" + item.ID + ".wav", 0, length, name, false})
	}
	encoded, _ := json.Marshal(manifest)
	path := filepath.Join(dir, "manifest.json")
	if err := os.WriteFile(path, encoded, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

// linesTextComplete applies the shipped thresholds to a results file's
// COVERAGE and COVERAGE_PARAGRAPH lines, as the host's recording signal does.
func linesTextComplete(t *testing.T, lines []string) bool {
	t.Helper()
	complete := true
	for _, line := range lines {
		tag, payload, _ := strings.Cut(line, "|")
		var fields struct {
			Tokens, Present, LongestMissingRun int
		}
		if err := json.Unmarshal([]byte(payload), &fields); err != nil {
			t.Fatal(err)
		}
		switch tag {
		case "COVERAGE":
			complete = complete && fields.LongestMissingRun <= shippedMaxMissingRun
		case "COVERAGE_PARAGRAPH":
			fraction := 1.0
			if fields.Tokens > 0 {
				fraction = float64(fields.Present) / float64(fields.Tokens)
			}
			complete = complete && fraction >= shippedMinParagraphPresent && fields.LongestMissingRun <= shippedMaxMissingRun
		}
	}
	return complete
}

func TestTheResultsForTheCommittedCasesMatchTheGoldenFile(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(fixtures, "coverage-words.golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	var corpus corpusWords
	if err := json.Unmarshal(raw, &corpus); err != nil || len(corpus.Cases) != 16 {
		t.Fatalf("the corpus words: %d cases, %v", len(corpus.Cases), err)
	}
	manuscript := filepath.Join(fixtures, "coverage", "manuscript.json")
	cases := compare.PyObject{}
	ids := make([]string, 0, len(corpus.Cases))
	for id := range corpus.Cases {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	labelsDiffer := []string{}
	verdicts := map[bool]bool{}
	for _, id := range ids {
		c := corpus.Cases[id]
		var spec struct {
			Split    string `json:"split"`
			Expected struct {
				TextComplete bool `json:"textComplete"`
			} `json:"expected"`
		}
		caseRaw, err := os.ReadFile(filepath.Join(fixtures, "coverage", "cases", id+".json"))
		if err != nil || json.Unmarshal(caseRaw, &spec) != nil {
			t.Fatalf("case %s: %v", id, err)
		}
		dir := t.TempDir()
		manifest := writeCaseInputs(t, dir, id, c.Items)
		out := filepath.Join(dir, "results.txt")
		if err := Run(Request{ManifestPath: manifest, WordsDir: dir, ManuscriptPath: manuscript, ChapterID: c.ChapterID, Out: out, Model: "scripted", Params: DefaultParams}); err != nil {
			t.Fatalf("case %s: %v", id, err)
		}
		results, _ := os.ReadFile(out)
		lines := []any{}
		measured := []string{}
		for _, line := range strings.Split(strings.TrimRight(string(results), "\n"), "\n") {
			if tag, _, _ := strings.Cut(line, "|"); measurementTags[tag] {
				lines, measured = append(lines, line), append(measured, line)
			}
		}
		analyzer := linesTextComplete(t, measured)
		verdicts[spec.Expected.TextComplete] = true
		if analyzer != spec.Expected.TextComplete {
			labelsDiffer = append(labelsDiffer, id)
		}
		cases[id] = compare.PyObject{"chapterId": c.ChapterID, "split": spec.Split, "textComplete": spec.Expected.TextComplete, "analyzerTextComplete": analyzer, "lines": lines}
	}
	settings := compare.PyObject{"minParagraphPresent": shippedMinParagraphPresent, "maxMissingRun": shippedMaxMissingRun, "maxMisreadRun": DefaultParams.MaxMisreadRun, "minAnchorRun": DefaultParams.MinAnchorRun}
	rendered := compare.DumpPyIndent(compare.PyObject{"schemaVersion": 1, "settings": settings, "cases": cases}, 1) + "\n"
	golden := filepath.Join(fixtures, "coverage", "results.golden.json")
	if os.Getenv("UPDATE_CONTRACTS") != "" {
		if err := os.WriteFile(golden, []byte(rendered), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("no results.golden.json: run with UPDATE_CONTRACTS=1 and commit it: %v", err)
	}
	if rendered != string(want) {
		t.Fatal("the results for the committed cases differ from results.golden.json; regenerate with UPDATE_CONTRACTS=1 only for an intended change")
	}
	// The stage recommendations (internal/coverage/corpus_test.go) assert the verdict against the label; this says why that can hold.
	if len(labelsDiffer) > 0 || len(verdicts) != 2 {
		t.Fatalf("the shipped analyzer disagrees with the label of %v (verdicts seen: %v)", labelsDiffer, verdicts)
	}
}
