package comparerun

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"desktop/internal/compare"
)

// The results file and the three diff texts for every committed case, pinned byte for byte in
// src/studio/sidecars/transcript-compare/tests/fixtures/compare/results.golden.json. The file was written by the
// sidecar's compare.py run before its markers moved to the host; this port reproduces it unchanged. The cases are the
// recording check's corpus (coverage-words.golden.json over coverage/manuscript.json, each item one segment laid end
// to end), every take-divergence case in both timings (divergence/words.golden.json, one segment each) and seeded
// random chapters and takes (compare/random-cases.json). Regenerate with UPDATE_CONTRACTS=1 only for an intended
// change, and say why in the PR.

var fixtures = filepath.Join("..", "..", "..", "sidecars", "transcript-compare", "tests", "fixtures")

const wordSeconds = 0.4 // coverage_harness.WORD_SECONDS: the gap after an item's last word

type goldenCase struct {
	ID           string          `json:"id"`
	Manuscript   json.RawMessage `json:"manuscript"`
	Equivalences *string         `json:"equivalences"`
	ChapterID    string          `json:"chapterId"`
	Score        float64         `json:"score"`
	Segments     []struct {
		ItemIndex   int     `json:"itemIndex"`
		StartOffset float64 `json:"startOffset"`
		ConcatStart float64 `json:"concatStart"`
	} `json:"segments"`
	Words [][3]any `json:"words"`
}

func readJSON(t *testing.T, path string, value any) {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, value); err != nil {
		t.Fatalf("%s: %v", path, err)
	}
}

func coverageCases(t *testing.T) []goldenCase {
	manuscript, err := os.ReadFile(filepath.Join(fixtures, "coverage", "manuscript.json"))
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Cases map[string]struct {
			ChapterID string `json:"chapterId"`
			Items     []struct {
				Words [][3]any `json:"words"`
			} `json:"items"`
		} `json:"cases"`
	}
	readJSON(t, filepath.Join(fixtures, "coverage-words.golden.json"), &corpus)
	ids := make([]string, 0, len(corpus.Cases))
	for id := range corpus.Cases {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	cases := []goldenCase{}
	for _, id := range ids {
		c := goldenCase{ID: "coverage/" + id, Manuscript: manuscript, ChapterID: corpus.Cases[id].ChapterID, Score: 1.0}
		concat := 0.0
		for k, item := range corpus.Cases[id].Items {
			c.Segments = append(c.Segments, struct {
				ItemIndex   int     `json:"itemIndex"`
				StartOffset float64 `json:"startOffset"`
				ConcatStart float64 `json:"concatStart"`
			}{k, 0.0, concat})
			last := 0.0
			for _, w := range item.Words {
				c.Words = append(c.Words, [3]any{w[0], w[1].(float64) + concat, w[2].(float64) + concat})
				last = max(last, w[2].(float64))
			}
			concat += last + wordSeconds
		}
		cases = append(cases, c)
	}
	return cases
}

func divergenceCases(t *testing.T) []goldenCase {
	var spec struct {
		Paragraphs []string `json:"paragraphs"`
		Cases      []struct {
			ID string `json:"id"`
		} `json:"cases"`
	}
	readJSON(t, filepath.Join(fixtures, "divergence", "cases.json"), &spec)
	var golden struct {
		Cases map[string]struct {
			Takes []struct {
				Timing string   `json:"timing"`
				Words  [][3]any `json:"words"`
			} `json:"takes"`
		} `json:"cases"`
	}
	readJSON(t, filepath.Join(fixtures, "divergence", "words.golden.json"), &golden)
	paragraphs := []any{}
	for k, text := range spec.Paragraphs {
		paragraphs = append(paragraphs, map[string]any{"id": fmt.Sprintf("p-%06d", k), "chapterId": "c-0001", "index": k, "text": text})
	}
	manuscript, _ := json.Marshal(map[string]any{"schemaVersion": 1, "documentId": "d", "paragraphs": paragraphs,
		"chapters": []any{map[string]any{"id": "c-0001", "title": "CHAPTER I.\nDown the Rabbit-Hole", "contentKind": "narration"}}})
	cases := []goldenCase{}
	for _, c := range spec.Cases {
		for _, take := range golden.Cases[c.ID].Takes {
			g := goldenCase{ID: "divergence/" + c.ID + "/" + take.Timing, Manuscript: manuscript, ChapterID: "c-0001", Score: 1.0, Words: take.Words}
			g.Segments = append(g.Segments, struct {
				ItemIndex   int     `json:"itemIndex"`
				StartOffset float64 `json:"startOffset"`
				ConcatStart float64 `json:"concatStart"`
			}{0, 5.0, 0.0})
			cases = append(cases, g)
		}
	}
	return cases
}

// build lays a case out as a project (the manuscript under <project>/app/manuscript, the word lists under
// TranscriptCompare) and builds its output as a run does, the diff named run.diff.
func build(t *testing.T, c goldenCase) Output {
	t.Helper()
	dir := t.TempDir()
	manuscript := filepath.Join(dir, "project", "app", "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(manuscript), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manuscript, c.Manuscript, 0o600); err != nil {
		t.Fatal(err)
	}
	if c.Equivalences != nil {
		lists := filepath.Join(dir, "project", "TranscriptCompare")
		if err := os.MkdirAll(lists, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(lists, "equivalences.csv"), []byte(*c.Equivalences), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	tokenizer, chapter, err := Load(manuscript, c.ChapterID)
	if err != nil {
		t.Fatalf("%s: %v", c.ID, err)
	}
	words, ok := parseWords(c.Words)
	if !ok {
		t.Fatalf("%s: malformed words", c.ID)
	}
	report := WordsReport{ChapterID: c.ChapterID, Score: c.Score, Words: words}
	for _, s := range c.Segments {
		report.Segments = append(report.Segments, Segment{s.ItemIndex, s.StartOffset, s.ConcatStart})
	}
	return Build(tokenizer, chapter, report, MinWords, "run.diff")
}

func TestTheOutputForTheCommittedCasesMatchesTheGoldenFile(t *testing.T) {
	var random struct {
		Cases []goldenCase `json:"cases"`
	}
	readJSON(t, filepath.Join(fixtures, "compare", "random-cases.json"), &random)
	cases := append(append(coverageCases(t), divergenceCases(t)...), random.Cases...)
	if len(cases) != 64 {
		t.Fatalf("%d cases", len(cases))
	}
	rendered := compare.PyObject{}
	for _, c := range cases {
		out := build(t, c)
		rendered[c.ID] = compare.PyObject{"results": out.Results, "diff": out.Diff, "manuscript": out.Manuscript, "recorded": out.Recorded}
	}
	text := compare.DumpPyIndent(rendered, 1) + "\n"
	path := filepath.Join(fixtures, "compare", "results.golden.json")
	if os.Getenv("UPDATE_CONTRACTS") != "" {
		if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("no results.golden.json: run with UPDATE_CONTRACTS=1 and commit it: %v", err)
	}
	if text != string(want) {
		var golden map[string]map[string]string
		_ = json.Unmarshal(want, &golden)
		for _, c := range cases {
			got := rendered[c.ID].(compare.PyObject)
			for _, key := range []string{"results", "diff", "manuscript", "recorded"} {
				if got[key] != golden[c.ID][key] {
					t.Errorf("%s %s differs:\n got %q\nwant %q", c.ID, key, got[key], golden[c.ID][key])
				}
			}
		}
		t.Fatal("the output for the committed cases differs from results.golden.json; regenerate with UPDATE_CONTRACTS=1 only for an intended change")
	}
}
