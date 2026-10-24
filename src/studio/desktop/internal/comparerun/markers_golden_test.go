package comparerun

import (
	"os"
	"path/filepath"
	"sort"
	"testing"

	"desktop/internal/compare"
)

// The markers, covered range and opcodes for every recording-coverage case, pinned in
// src/studio/sidecars/transcript-compare/tests/fixtures/coverage/markers.golden.json. compare.py's
// diff_and_build_markers wrote it before it was deleted; this port reproduces it unchanged. Each case is its chapter
// (the title, no subtitle, and the paragraphs) against the words of its items in ../coverage-words.golden.json, as
// they were rendered. Regenerate with UPDATE_CONTRACTS=1 only for an intended change, and say why in the PR.
func TestTheMarkersForTheCoverageCasesMatchTheGoldenFile(t *testing.T) {
	chapters, err := compare.LoadManuscriptChapters(filepath.Join(fixtures, "coverage", "manuscript.json"))
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]compare.Chapter{}
	for _, c := range chapters {
		byID[c.ID] = c
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
	tokenizer := compare.NewTokenizer(nil)
	rendered := compare.PyObject{}
	for _, id := range ids {
		c := byID[corpus.Cases[id].ChapterID]
		words := []compare.Word{}
		for _, item := range corpus.Cases[id].Items {
			heard, ok := parseWords(item.Words)
			if !ok {
				t.Fatalf("%s: malformed words", id)
			}
			words = append(words, heard...)
		}
		units := tokenizer.BuildChapterUnits(c.Title, c.Paragraphs)
		alignment := tokenizer.Align(units, words)
		markers, covered := Markers(alignment, units, words, MinWords)
		rows := []any{}
		for _, m := range markers {
			var gap any
			if m.TimingGap != nil {
				gap = *m.TimingGap
			}
			rows = append(rows, []any{m.Time, m.Kind, m.Name, m.Doc, m.Audio, m.Unit, m.I1, m.I2, m.J1, m.J2, m.Confidence, gap, m.RepeatOf})
		}
		var coveredRange any
		if covered != nil {
			coveredRange = []any{covered[0], covered[1]}
		}
		opcodes := []any{}
		for _, op := range alignment.Opcodes {
			opcodes = append(opcodes, []any{op.Tag, op.I1, op.I2, op.J1, op.J2})
		}
		rendered[id] = compare.PyObject{"markers": rows, "coveredRange": coveredRange, "opcodes": opcodes}
	}
	text := compare.DumpPyIndent(rendered, 1) + "\n"
	path := filepath.Join(fixtures, "coverage", "markers.golden.json")
	if os.Getenv("UPDATE_CONTRACTS") != "" {
		if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("no markers.golden.json: run with UPDATE_CONTRACTS=1 and commit it: %v", err)
	}
	if text != string(want) {
		t.Fatalf("the markers for the coverage cases differ from markers.golden.json; regenerate with UPDATE_CONTRACTS=1 only for an intended change.\ngot:\n%s", text[:min(len(text), 3000)])
	}
}
