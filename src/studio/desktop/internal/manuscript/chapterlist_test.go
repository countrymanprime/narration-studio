package manuscript

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sync"
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

func TestChaptersThatShareAnIdDoNotShareTheirParagraphIds(t *testing.T) {
	service := bookOf(t, 2, 1)
	list, err := service.ChaptersUnmeasured()
	if err != nil || len(list) != 2 {
		t.Fatalf("list = %v, %v", list, err)
	}
	// Two chapters with one id: the file below has the first chapter twice.
	dup := filepath.Join(service.project, brand.ProjectFolder, "manuscript", "manuscript.json")
	raw, _ := os.ReadFile(dup)
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	chapters := data["chapters"].([]any)
	data["chapters"] = append(chapters, chapters[0])
	raw, _ = json.Marshal(data)
	if err := os.WriteFile(dup, append(raw, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
	list, err = service.ChaptersUnmeasured()
	if err != nil {
		t.Fatal(err)
	}
	first := list[0]["paragraphIds"].([]map[string]any)
	last := list[len(list)-1]["paragraphIds"].([]map[string]any)
	first[0]["id"] = "CHANGED"
	if last[0]["id"] == "CHANGED" {
		t.Fatal("two chapters with one id share their paragraph-id entries")
	}
}

func TestAChaptersParagraphsAreThatChaptersOwnInFileOrder(t *testing.T) {
	service := bookOf(t, 4, 3)
	list, err := service.ChaptersUnmeasured()
	if err != nil {
		t.Fatal(err)
	}
	for i, chapter := range list {
		id := chapter["id"].(string)
		paragraphs, err := service.Paragraphs(id)
		if err != nil {
			t.Fatal(err)
		}
		if i == len(list)-1 {
			if paragraphs == nil || len(paragraphs) != 0 {
				t.Fatalf("a chapter with no paragraphs answers %#v, want an empty list", paragraphs)
			}
			continue
		}
		for p, paragraph := range paragraphs {
			if want := fmt.Sprintf("%s-p%03d", id, p); paragraph["id"] != want || paragraph["chapterId"] != id {
				t.Fatalf("chapter %s paragraph %d = %v, want %s", id, p, paragraph["id"], want)
			}
		}
		if len(paragraphs) != 3 {
			t.Fatalf("chapter %s has %d paragraphs, want 3", id, len(paragraphs))
		}
		if got, ok := service.ParagraphID(id, 1); !ok || got != fmt.Sprintf("%s-p001", id) {
			t.Fatalf("ParagraphID(%s, 1) = %q, %v", id, got, ok)
		}
	}
	if paragraphs, err := service.Paragraphs("no-such-chapter"); err != nil || paragraphs == nil || len(paragraphs) != 0 {
		t.Fatalf("an unknown chapter answers %#v, %v, want an empty list", paragraphs, err)
	}
}

// Asking for every chapter's paragraphs (the pickup list, the preview) walked every paragraph for each chapter, so quadrupling the book took
// about sixteen times as long (#3560). The median of several runs, against a limit between linear (4) and quadratic (16). The loop asks one
// Book: a Service.Paragraphs call is a read of the whole file, so calling it for every chapter is itself the square (#3896).
func TestReadingEveryChaptersParagraphsGrowsWithTheBookNotWithItsSquare(t *testing.T) {
	median := func(chapters int) time.Duration {
		service := bookOf(t, chapters, 5)
		list, err := service.ChaptersUnmeasured()
		if err != nil {
			t.Fatal(err)
		}
		runs := make([]time.Duration, 7)
		for i := range runs {
			start := time.Now()
			book, err := service.Book()
			if err != nil {
				t.Fatal(err)
			}
			for _, chapter := range list {
				book.Paragraphs(chapter["id"].(string))
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

// A kind change replaces the held book while readers are asking for paragraphs: each is answered from the book it took, never from one stored
// between its check and its read. Run under -race in CI.
func TestParagraphsAreAnsweredWhileAKindChangeDropsTheCache(t *testing.T) {
	service, chapterID, _ := importReaderFixture(t)
	stop := make(chan struct{})
	failures := make(chan string, 64)
	var readers sync.WaitGroup
	for range 4 {
		readers.Add(1)
		go func() {
			defer readers.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				if _, err := service.Paragraphs(chapterID); err != nil {
					select {
					case failures <- err.Error():
					default:
					}
					return
				}
				if _, ok := service.ParagraphID(chapterID, 0); !ok {
					select {
					case failures <- "ParagraphID found no paragraph":
					default:
					}
					return
				}
			}
		}()
	}
	when := time.Now()
	for i := 0; i < 40; i++ {
		kind := "reference"
		if i%2 == 1 {
			kind = "narration"
		}
		when = when.Add(time.Second)
		if _, err := service.SetChapterKind("c-0002", kind, when); err != nil {
			t.Fatal(err)
		}
	}
	close(stop)
	readers.Wait()
	select {
	case failure := <-failures:
		t.Fatalf("a reader failed during a kind change: %s", failure)
	default:
	}
}
