package comparerun

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"desktop/internal/compare"
)

// The --find-repeats output for every case in src/studio/sidecars/transcript-compare/tests/fixtures/repeats/repeat-cases.json,
// pinned in spans.golden.json beside it. compare.py's find_repeated_spans wrote it before the detector moved to the
// host; this port reproduces it unchanged. The cases are the seeded chapters
// and takes of compare/random-cases.json and the recording check's corpus, each split into whole reads, restarts,
// pickups, reads of nothing in the chapter, empty reads and exact copies, and a hand-made chapter picked by track name,
// by title, by a credits track, by an unknown title and by no match. Regenerate with UPDATE_CONTRACTS=1 only for an
// intended change, and say why in the PR.

type repeatsCase struct {
	ID             string          `json:"id"`
	Manuscript     json.RawMessage `json:"manuscript,omitempty"`
	ManuscriptFile string          `json:"manuscriptFile,omitempty"`
	Equivalences   *string         `json:"equivalences"`
	TrackName      string          `json:"trackName"`
	ChapterTitle   *string         `json:"chapterTitle"`
	MinSpanOverlap float64         `json:"minSpanOverlap"`
	MinWords       int             `json:"minWords"`
	Reads          []struct {
		ItemIndex   int      `json:"itemIndex"`
		SourceFile  string   `json:"sourceFile"`
		StartOffset float64  `json:"startOffset"`
		Length      float64  `json:"length"`
		ItemGUID    string   `json:"itemGuid"`
		TakeGUID    string   `json:"takeGuid"`
		Words       [][3]any `json:"words"`
	} `json:"reads"`
}

// scanCase lays the case out as a project, writes its manifest as the host does, and scans it as the host does: the
// chapter chosen first, then the reads' words grouped. A chapter error is ERROR and its sentence.
func scanCase(t *testing.T, c repeatsCase) string {
	t.Helper()
	text := []byte(c.Manuscript)
	if c.ManuscriptFile != "" {
		var err error
		if text, err = os.ReadFile(filepath.Join(fixtures, filepath.FromSlash(c.ManuscriptFile))); err != nil {
			t.Fatal(err)
		}
	}
	dir := t.TempDir()
	manuscript := filepath.Join(dir, "project", "app", "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(manuscript), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manuscript, text, 0o600); err != nil {
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
	var manifest strings.Builder
	heard := [][]compare.Word{}
	for _, r := range c.Reads {
		manifest.WriteString(strings.Join([]string{strconv.Itoa(r.ItemIndex), r.SourceFile, compare.PyFloatRepr(r.StartOffset), compare.PyFloatRepr(r.Length), r.ItemGUID, r.TakeGUID}, "|") + "\n")
		words, ok := parseWords(r.Words)
		if !ok {
			t.Fatalf("%s: malformed words", c.ID)
		}
		heard = append(heard, words)
	}
	manifestPath := filepath.Join(dir, "manifest.txt")
	if err := os.WriteFile(manifestPath, []byte(manifest.String()), 0o600); err != nil {
		t.Fatal(err)
	}
	title := ""
	if c.ChapterTitle != nil {
		title = *c.ChapterTitle
	}
	tokenizer, chapters, err := LoadChapters(manuscript)
	if err != nil {
		t.Fatalf("%s: %v", c.ID, err)
	}
	chapter, _, err := Choose(tokenizer, chapters, c.TrackName, title)
	var need NeedChapter
	if errors.As(err, &need) {
		return NeedChapterLine(need)
	}
	if err != nil {
		return "ERROR|" + err.Error()
	}
	reads, err := ReadRepeatManifest(manifestPath)
	if err != nil {
		t.Fatalf("%s: %v", c.ID, err)
	}
	return FindRepeats(tokenizer, chapter, reads, heard, c.MinWords, c.MinSpanOverlap)
}

func TestTheRepeatScanForTheCommittedCasesMatchesTheGoldenFile(t *testing.T) {
	var cases struct {
		Cases []repeatsCase `json:"cases"`
	}
	readJSON(t, filepath.Join(fixtures, "repeats", "repeat-cases.json"), &cases)
	if len(cases.Cases) != 42 {
		t.Fatalf("%d cases", len(cases.Cases))
	}
	rendered := compare.PyObject{}
	for _, c := range cases.Cases {
		rendered[c.ID] = scanCase(t, c)
	}
	text := compare.DumpPyIndent(rendered, 1) + "\n"
	path := filepath.Join(fixtures, "repeats", "spans.golden.json")
	if os.Getenv("UPDATE_CONTRACTS") != "" {
		if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("no spans.golden.json: run with UPDATE_CONTRACTS=1 and commit it: %v", err)
	}
	if text != string(want) {
		var golden map[string]string
		_ = json.Unmarshal(want, &golden)
		for _, c := range cases.Cases {
			if got := rendered[c.ID]; got != golden[c.ID] {
				t.Errorf("%s:\n got %q\nwant %q", c.ID, got, golden[c.ID])
			}
		}
		t.Fatal("the scan of the committed cases differs from spans.golden.json; regenerate with UPDATE_CONTRACTS=1 only for an intended change")
	}
}
