package takedivergence

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The results for every committed take-divergence case, pinned byte for byte in
// src/studio/sidecars/transcript-compare/tests/fixtures/divergence/results.golden.txt. The file was first written by
// the sidecar's Python mode; this port reproduces it unchanged. The input is the words the sidecar's harness renders for
// each case, both timings (fixtures/divergence/words.golden.json, pinned by tests/test_divergence_words_golden.py), as two
// takes of one manifest. Regenerate with UPDATE_CONTRACTS=1 only for an intended change, and say why in the PR.

var fixtures = filepath.Join("..", "..", "..", "sidecars", "transcript-compare", "tests", "fixtures", "divergence")

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

func TestTheResultsForTheCommittedCasesMatchTheGoldenFile(t *testing.T) {
	var cases struct {
		Paragraphs []string `json:"paragraphs"`
		Cases      []struct {
			ID string `json:"id"`
		} `json:"cases"`
	}
	raw, err := os.ReadFile(filepath.Join(fixtures, "cases.json"))
	if err != nil || json.Unmarshal(raw, &cases) != nil {
		t.Fatalf("cases.json: %v", err)
	}
	var golden struct {
		Cases map[string]struct {
			Span  map[string]int `json:"span"`
			Takes []struct {
				Timing string   `json:"timing"`
				Words  [][3]any `json:"words"`
			} `json:"takes"`
		} `json:"cases"`
	}
	raw, err = os.ReadFile(filepath.Join(fixtures, "words.golden.json"))
	if err != nil || json.Unmarshal(raw, &golden) != nil || len(golden.Cases) == 0 {
		t.Fatalf("words.golden.json: %v", err)
	}
	dir := t.TempDir()
	manuscript := filepath.Join(dir, "p", "a", "manuscript.json")
	paras := []any{}
	for k, text := range cases.Paragraphs {
		paras = append(paras, map[string]any{"id": fmt.Sprintf("p-%06d", k), "chapterId": "c-0001", "index": k, "text": text})
	}
	writeJSON(t, manuscript, map[string]any{"schemaVersion": 1, "documentId": "d", "paragraphs": paras,
		"chapters": []any{map[string]any{"id": "c-0001", "title": "CHAPTER I.\nDown the Rabbit-Hole", "contentKind": "narration"}}})

	ids := []string{} // in the fixture's own order, as the words file lists them
	for _, c := range cases.Cases {
		ids = append(ids, c.ID)
	}
	if len(ids) != len(golden.Cases) {
		t.Fatalf("cases.json has %d cases, words.golden.json %d", len(ids), len(golden.Cases))
	}
	var out strings.Builder
	for _, id := range ids {
		c := golden.Cases[id]
		takes := []any{}
		var report strings.Builder
		report.WriteString(`TAKE_TRANSCRIPTION|{"language":"en","model":"small"}` + "\n")
		for k, take := range c.Takes {
			takes = append(takes, map[string]any{"itemGuid": "{ITEM-" + take.Timing + "}", "takeGuid": "{TAKE-" + take.Timing + "}",
				"sourceFile": id + "-" + take.Timing + ".wav", "startOffset": 5.0 * float64(k), "length": 60.0})
			words, _ := json.Marshal(take.Words)
			fmt.Fprintf(&report, `TAKE_WORDS|{"index":%d,"words":%s}`+"\n", k, words)
		}
		manifest := filepath.Join(dir, "manifest.json")
		writeJSON(t, manifest, map[string]any{"schemaVersion": 1, "chapterId": "c-0001", "span": c.Span, "takes": takes})
		reportPath := filepath.Join(dir, "words-report.txt")
		if err := os.WriteFile(reportPath, []byte(report.String()), 0o600); err != nil {
			t.Fatal(err)
		}
		results := filepath.Join(dir, "results.txt")
		if err := Run(manifest, manuscript, reportPath, results); err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		text, _ := os.ReadFile(results)
		out.WriteString("CASE|" + id + "\n" + string(text))
	}
	path := filepath.Join(fixtures, "results.golden.txt")
	if os.Getenv("UPDATE_CONTRACTS") != "" {
		if err := os.WriteFile(path, []byte(out.String()), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("no results.golden.txt: run with UPDATE_CONTRACTS=1 and commit it: %v", err)
	}
	if out.String() != string(want) {
		t.Fatal("the results for the committed cases differ from results.golden.txt; regenerate with UPDATE_CONTRACTS=1 only for an intended change")
	}
}
