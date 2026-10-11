package bookmarks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// testBook is a stand-in manuscript a test edits between calls, the way a re-import changes what the host reads back.
type testBook struct{ book Book }

func (b *testBook) read() (Book, error) { return b.book, nil }

func sampleBook() *testBook {
	return &testBook{book: Book{
		Chapters: []string{"c1", "c2"},
		Lines: []Line{
			// The curly quotes are one UTF-16 unit each; the emoji is two (a surrogate pair) at units 10 and 11.
			{ChapterID: "c1", ID: "p1", Index: 0, Text: "“Look out 🎨 now!”"},
			{ChapterID: "c1", ID: "p2", Index: 1, Text: "The soldiers were silent."},
			{ChapterID: "c2", ID: "p9", Index: 2, Text: "An unrelated chapter."},
		},
	}}
}

func newTestService(t *testing.T, manuscript *testBook) (*Service, string) {
	t.Helper()
	project := t.TempDir()
	return New(Config{Project: project, Manuscript: manuscript.read}), project
}

func mustAdd(t *testing.T, service *Service, chapterID, paragraphID string, offset int) Resolved {
	t.Helper()
	bookmark, err := service.Add(chapterID, paragraphID, offset)
	if err != nil {
		t.Fatalf("Add(%s, %s, %d): %v", chapterID, paragraphID, offset, err)
	}
	return bookmark
}

func mustList(t *testing.T, service *Service) []Resolved {
	t.Helper()
	list, err := service.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	return list
}

func TestAddListUpdateRemoveRoundtrip(t *testing.T) {
	manuscript := sampleBook()
	service, project := newTestService(t, manuscript)
	added := mustAdd(t, service, "c1", "p2", 4)
	if added.ID == "" || added.ChapterID != "c1" || added.ParagraphID != "p2" || added.Offset != 4 || added.Label != "" || added.Note != "" || added.Stale {
		t.Fatalf("added = %+v", added)
	}
	if added.Paragraph == nil || *added.Paragraph != 1 || added.CreatedAt.IsZero() {
		t.Fatalf("added position = %+v", added)
	}
	// A new service over the same folder reads what the first one wrote.
	again := New(Config{Project: project, Manuscript: manuscript.read})
	if list := mustList(t, again); len(list) != 1 || list[0].ID != added.ID {
		t.Fatalf("list from a new service = %+v", list)
	}
	updated, err := again.Update(added.ID, "  Queen enters ", "Slow down here.\nThen breathe.")
	if err != nil {
		t.Fatal(err)
	}
	if updated.Label != "Queen enters" || updated.Note != "Slow down here.\nThen breathe." || updated.Offset != 4 {
		t.Fatalf("updated = %+v", updated)
	}
	if list := mustList(t, service); len(list) != 1 || list[0].Label != "Queen enters" || list[0].Note != updated.Note {
		t.Fatalf("list after update = %+v", list)
	}
	remaining, err := service.Remove(added.ID)
	if err != nil || len(remaining) != 0 {
		t.Fatalf("remove = %+v, %v", remaining, err)
	}
	if list := mustList(t, New(Config{Project: project, Manuscript: manuscript.read})); len(list) != 0 {
		t.Fatalf("list after remove = %+v", list)
	}
	// An id that is not there is not an error, and changes nothing.
	if remaining, err := service.Remove("gone"); err != nil || len(remaining) != 0 {
		t.Fatalf("remove of a missing id = %+v, %v", remaining, err)
	}
	if _, err := service.Update("gone", "x", ""); err == nil {
		t.Fatal("an update of a missing bookmark succeeded")
	}
}

func TestSpotIsValidatedAgainstTheManuscript(t *testing.T) {
	service, project := newTestService(t, sampleBook())
	for _, refused := range []struct {
		name, chapterID, paragraphID string
		offset                       int
		want                         string
	}{
		{"chapter the manuscript lacks", "c9", "p1", 0, "chapter"},
		{"paragraph not in that chapter", "c2", "p1", 0, "line"},
		{"paragraph nowhere", "c1", "p404", 0, "line"},
		{"offset past the end", "c1", "p2", 26, "place"},
		{"negative offset", "c1", "p2", -1, "place"},
		{"inside a surrogate pair", "c1", "p1", 11, "place"},
	} {
		if _, err := service.Add(refused.chapterID, refused.paragraphID, refused.offset); err == nil || !strings.Contains(err.Error(), refused.want) {
			t.Errorf("%s: err = %v, want a sentence naming the %s", refused.name, err, refused.want)
		}
	}
	if _, err := os.Stat(File(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused add wrote the file: %v", err)
	}
	// Either edge of a line is a spot, and so is either side of the emoji.
	mustAdd(t, service, "c1", "p2", 0)
	mustAdd(t, service, "c1", "p2", 25)
	mustAdd(t, service, "c1", "p1", 10)
	mustAdd(t, service, "c1", "p1", 12)
}

func TestLabelAndNoteAreBounded(t *testing.T) {
	service, _ := newTestService(t, sampleBook())
	added := mustAdd(t, service, "c1", "p2", 4)
	for _, refused := range []struct{ name, label, note string }{
		{"label over the limit", strings.Repeat("a", MaxLabelUnits+1), ""},
		{"note over the limit", "", strings.Repeat("a", MaxNoteUnits+1)},
		// A character outside the BMP is two UTF-16 units, the unit the UI's maxLength counts.
		{"label over the limit in UTF-16 units", strings.Repeat("🎨", MaxLabelUnits/2+1), ""},
		{"control character in a label", "a\x07b", ""},
		{"line break in a label", "a\nb", ""},
		{"control character in a note", "", "a\x1bb"},
	} {
		if _, err := service.Update(added.ID, refused.label, refused.note); err == nil {
			t.Errorf("%s was saved", refused.name)
		}
	}
	if list := mustList(t, service); list[0].Label != "" || list[0].Note != "" {
		t.Fatalf("a refused update changed the bookmark: %+v", list[0])
	}
	ok, err := service.Update(added.ID, strings.Repeat("a", MaxLabelUnits), strings.Repeat("b", MaxNoteUnits-2)+"\r\n")
	if err != nil {
		t.Fatalf("labels and notes at the limit: %v", err)
	}
	if strings.Contains(ok.Note, "\r") {
		t.Fatalf("a Windows line break was kept: %q", ok.Note)
	}
	// A tab or a line break is part of a note.
	if _, err := service.Update(added.ID, "", "one\ttwo\nthree"); err != nil {
		t.Fatalf("a note with a tab and a line break: %v", err)
	}
}

func TestSameSpotTwiceIsOneAndTheListIsInReadingOrder(t *testing.T) {
	service, _ := newTestService(t, sampleBook())
	later := mustAdd(t, service, "c2", "p9", 3)
	second := mustAdd(t, service, "c1", "p2", 10)
	first := mustAdd(t, service, "c1", "p2", 2)
	if _, err := service.Update(first.ID, "kept", ""); err != nil {
		t.Fatal(err)
	}
	again := mustAdd(t, service, "c1", "p2", 2)
	if again.ID != first.ID || again.Label != "kept" {
		t.Fatalf("the same spot again = %+v, want %+v", again, first)
	}
	list := mustList(t, service)
	if len(list) != 3 || list[0].ID != first.ID || list[1].ID != second.ID || list[2].ID != later.ID {
		t.Fatalf("list = %+v", list)
	}
}

func TestFileIsNarratorData(t *testing.T) {
	t.Run("a corrupt file is kept aside and an empty list starts", func(t *testing.T) {
		service, project := newTestService(t, sampleBook())
		writeFile(t, File(project), "{not json")
		if list := mustList(t, service); len(list) != 0 {
			t.Fatalf("list from a corrupt file = %+v", list)
		}
		if kept, _ := filepath.Glob(File(project) + ".corrupt-*"); len(kept) != 1 {
			t.Fatalf("corrupt copies = %v", kept)
		}
		mustAdd(t, service, "c1", "p2", 4)
	})
	t.Run("a file that breaks a rule is corrupt", func(t *testing.T) {
		service, project := newTestService(t, sampleBook())
		writeFile(t, File(project), `{"schemaVersion":1,"bookmarks":[{"id":"b1","chapterId":"c1","paragraphId":"p2","offset":-3,"label":"","note":"","createdAt":"2026-10-11T10:00:00Z"}]}`)
		if list := mustList(t, service); len(list) != 0 {
			t.Fatalf("list from a file with a negative offset = %+v", list)
		}
		if kept, _ := filepath.Glob(File(project) + ".corrupt-*"); len(kept) != 1 {
			t.Fatalf("corrupt copies = %v", kept)
		}
	})
	t.Run("a file from a newer app is refused and never overwritten", func(t *testing.T) {
		service, project := newTestService(t, sampleBook())
		newer := `{"schemaVersion": 99, "bookmarks": []}`
		writeFile(t, File(project), newer)
		if _, err := service.List(); err == nil || !strings.Contains(err.Error(), "newer version") {
			t.Fatalf("list of a newer file = %v", err)
		}
		if _, err := service.Add("c1", "p2", 4); err == nil {
			t.Fatal("an add over a newer file succeeded")
		}
		if _, err := service.Remove("x"); err == nil {
			t.Fatal("a remove over a newer file succeeded")
		}
		if raw, _ := os.ReadFile(File(project)); string(raw) != newer {
			t.Fatalf("the newer file was overwritten: %s", raw)
		}
	})
	t.Run("a write is a temporary file then a rename, and stores only what the narrator placed", func(t *testing.T) {
		service, project := newTestService(t, sampleBook())
		mustAdd(t, service, "c1", "p2", 4)
		if _, err := os.Stat(File(project) + ".tmp"); !os.IsNotExist(err) {
			t.Fatalf("the temporary file was left behind: %v", err)
		}
		raw, err := os.ReadFile(File(project))
		if err != nil {
			t.Fatal(err)
		}
		var stored struct {
			SchemaVersion int              `json:"schemaVersion"`
			Bookmarks     []map[string]any `json:"bookmarks"`
		}
		if err := json.Unmarshal(raw, &stored); err != nil {
			t.Fatal(err)
		}
		if stored.SchemaVersion != SchemaVersion || len(stored.Bookmarks) != 1 {
			t.Fatalf("stored = %s", raw)
		}
		for _, derived := range []string{"stale", "staleReason", "paragraph"} {
			if _, ok := stored.Bookmarks[0][derived]; ok {
				t.Errorf("%s was stored: %s", derived, raw)
			}
		}
	})
	t.Run("an error names the file, never its content", func(t *testing.T) {
		service, project := newTestService(t, sampleBook())
		writeFile(t, File(project), `{"schemaVersion": 7, "bookmarks": [{"note": "secret words"}]}`)
		if _, err := service.List(); err == nil || strings.Contains(err.Error(), "secret") {
			t.Fatalf("error = %v", err)
		}
	})
}

func TestStaleBookmarkIsReportedNotMoved(t *testing.T) {
	manuscript := sampleBook()
	service, _ := newTestService(t, manuscript)
	gone := mustAdd(t, service, "c2", "p9", 3)
	short := mustAdd(t, service, "c1", "p2", 20)
	split := mustAdd(t, service, "c1", "p1", 12)
	kept := mustAdd(t, service, "c1", "p2", 4)

	// The narrator re-imports without a reset: one line is gone, one is shorter, and one gained a character before the emoji.
	manuscript.book = Book{
		Chapters: []string{"c1"},
		Lines: []Line{
			{ChapterID: "c1", ID: "p1", Index: 0, Text: "“Look out!!🎨 now!”"},
			{ChapterID: "c1", ID: "p2", Index: 1, Text: "The soldiers."},
		},
	}
	list := mustList(t, service)
	byID := map[string]Resolved{}
	for _, bookmark := range list {
		byID[bookmark.ID] = bookmark
	}
	if b := byID[gone.ID]; !b.Stale || b.StaleReason != StaleParagraphMissing || b.Paragraph != nil || b.Offset != 3 || b.ChapterID != "c2" {
		t.Errorf("bookmark on a missing line = %+v", b)
	}
	if b := byID[short.ID]; !b.Stale || b.StaleReason != StaleOffsetOutOfRange || b.Paragraph == nil || b.Offset != 20 {
		t.Errorf("bookmark past the end of a shorter line = %+v", b)
	}
	if b := byID[split.ID]; !b.Stale || b.StaleReason != StaleOffsetOutOfRange || b.Offset != 12 {
		t.Errorf("bookmark now inside a surrogate pair = %+v", b)
	}
	if b := byID[kept.ID]; b.Stale || b.StaleReason != "" {
		t.Errorf("bookmark that still fits = %+v", b)
	}
	// Stale ones still sort by where they were: the line that is gone goes last.
	if list[len(list)-1].ID != gone.ID {
		t.Errorf("a bookmark on a missing line is not last: %+v", list)
	}
	// A stale bookmark can still be labelled and removed.
	if _, err := service.Update(gone.ID, "was here", ""); err != nil {
		t.Errorf("update of a stale bookmark: %v", err)
	}
	if remaining, err := service.Remove(gone.ID); err != nil || len(remaining) != 3 {
		t.Errorf("remove of a stale bookmark = %+v, %v", remaining, err)
	}
}

func TestPathShapedTextIsStoredAsTextAndNeverOpened(t *testing.T) {
	service, project := newTestService(t, sampleBook())
	added := mustAdd(t, service, "c1", "p2", 4)
	target := filepath.Join(project, "should-not-exist")
	label := "../../" + filepath.Base(target)
	updated, err := service.Update(added.ID, label, target)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Label != label || updated.Note != target {
		t.Fatalf("updated = %+v", updated)
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("a path-shaped note touched the file system: %v", err)
	}
	entries, err := os.ReadDir(project)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "narration-utils" {
		t.Fatalf("the project folder holds more than the bookmarks file: %v", entries)
	}
}

func TestWithNoProjectNothingIsSaved(t *testing.T) {
	service := New(Config{Manuscript: sampleBook().read})
	if _, err := service.Add("c1", "p2", 4); err == nil {
		t.Fatal("an add with no project succeeded")
	}
	if _, err := service.Update("x", "", ""); err == nil {
		t.Fatal("an update with no project succeeded")
	}
	if _, err := service.Remove("x"); err == nil {
		t.Fatal("a remove with no project succeeded")
	}
	if list, err := service.List(); err != nil || len(list) != 0 {
		t.Fatalf("list with no project = %+v, %v", list, err)
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}
