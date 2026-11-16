package manuscript

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"desktop/internal/brand"
)

// bookOf writes a manuscript of chapters chapters with perChapter paragraphs each (the last chapter gets none) and returns its service.
func bookOf(t testing.TB, chapters, perChapter int) *Service {
	t.Helper()
	project := t.TempDir()
	dir := filepath.Join(project, brand.ProjectFolder, "manuscript")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	var chapterList, paragraphs []map[string]any
	for c := 0; c < chapters; c++ {
		id := fmt.Sprintf("c-%05d", c+1)
		chapterList = append(chapterList, map[string]any{"id": id, "title": fmt.Sprintf("Chapter %d", c+1), "index": c, "contentKind": "narration"})
		if c == chapters-1 {
			continue
		}
		for p := 0; p < perChapter; p++ {
			paragraphs = append(paragraphs, map[string]any{"id": fmt.Sprintf("%s-p%03d", id, p), "chapterId": id, "index": p})
		}
	}
	bytes, err := json.Marshal(map[string]any{"schemaVersion": 1, "chapters": chapterList, "paragraphs": paragraphs})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "manuscript.json"), bytes, 0o644); err != nil {
		t.Fatal(err)
	}
	return New(project)
}

func TestTheChapterListCarriesEachChaptersOwnParagraphIdsInOrder(t *testing.T) {
	list, err := bookOf(t, 4, 3).ChaptersUnmeasured()
	if err != nil {
		t.Fatal(err)
	}
	for i, chapter := range list {
		ids, _ := chapter["paragraphIds"].([]map[string]any)
		if i == len(list)-1 {
			if ids == nil || len(ids) != 0 {
				t.Fatalf("a chapter with no paragraphs carries %#v, want an empty list", chapter["paragraphIds"])
			}
			continue
		}
		var got []string
		for _, id := range ids {
			got = append(got, id["id"].(string))
		}
		want := []string{}
		for p := 0; p < 3; p++ {
			want = append(want, fmt.Sprintf("%s-p%03d", chapter["id"], p))
		}
		if !slices.Equal(got, want) {
			t.Fatalf("chapter %v paragraph ids = %v, want %v", chapter["id"], got, want)
		}
	}
}

// The chapter list used to scan every paragraph for every chapter, so quadrupling the book took about sixteen times as long (#3560). The
// median of several runs, against a limit between linear (4) and quadratic (16), so one slow run does not decide it.
func TestTheChapterListGrowsWithTheBookNotWithItsSquare(t *testing.T) {
	median := func(chapters int) time.Duration {
		service := bookOf(t, chapters, 5)
		if _, err := service.ChaptersUnmeasured(); err != nil { // loads the file once
			t.Fatal(err)
		}
		runs := make([]time.Duration, 7)
		for i := range runs {
			start := time.Now()
			if _, err := service.ChaptersUnmeasured(); err != nil {
				t.Fatal(err)
			}
			runs[i] = time.Since(start)
		}
		slices.Sort(runs)
		return runs[len(runs)/2]
	}
	small, large := median(1000), median(4000)
	if ratio := float64(large) / float64(small); ratio > 9 {
		t.Fatalf("4,000 chapters took %.1fx as long as 1,000 (%v vs %v); linear is about 4x, quadratic about 16x", ratio, large, small)
	}
}
