package manuscript

import (
	"desktop/internal/brand"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"unicode/utf16"

	"desktop/internal/layout"
)

func importReaderFixture(t *testing.T) (*Service, string, string) {
	t.Helper()
	project := t.TempDir()
	service := New(project)
	source := layout.RepoFile(layout.FixturesDir + "/alice.md")
	job := service.Begin(source)
	preview, err := service.Preview(job.ID, 1)
	if err != nil || preview.Phase != "ready" {
		t.Fatalf("preview = %#v, %v", preview, err)
	}
	completed, err := service.Commit(job.ID, false, Choices{})
	if err != nil || completed.Phase != "success" {
		t.Fatalf("commit = %#v, %v", completed, err)
	}
	data, err := service.Load()
	if err != nil {
		t.Fatal(err)
	}
	chapters := objects(data["chapters"])
	paragraphs := objects(data["paragraphs"])
	return service, text(chapters[0], "id"), text(paragraphs[0], "id")
}

func TestReaderStatusAndSearch(t *testing.T) {
	service, chapterID, _ := importReaderFixture(t)
	status, err := service.SetChapterStatus(chapterID, "recording")
	if err != nil || text(status, "status") != "recording" {
		t.Fatalf("status = %#v, %v", status, err)
	}
	found, err := service.Search("alice")
	if err != nil || len(found.Hits) == 0 {
		t.Fatalf("search = %#v, %v", found, err)
	}
}

// The reader search cache (keyed by the file's own mtime and size), the result cap, and the match
// offset the reader's windowing helper needs.

func TestSearchReturnsEveryMatchOffset(t *testing.T) {
	service, _, _ := importReaderFixture(t)
	found, err := service.Search("alice")
	if err != nil || len(found.Hits) == 0 {
		t.Fatalf("search = %#v, %v", found, err)
	}
	for _, hit := range found.Hits {
		// UTF-16 indices: the fixture's curly quotes and em dashes are one code unit each.
		units := utf16.Encode([]rune(hit.Excerpt))
		for _, match := range hit.Matches {
			if match.Start < 0 || match.End > len(units) || !strings.EqualFold(string(utf16.Decode(units[match.Start:match.End])), "alice") {
				t.Fatalf("match %v does not point at the term in %q", match, hit.Excerpt)
			}
		}
	}
}

func writeManuscript(t *testing.T, project string, paragraphs []map[string]any) string {
	t.Helper()
	dir := filepath.Join(project, brand.ProjectFolder, "manuscript")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "manuscript.json")
	bytes, err := json.Marshal(map[string]any{"schemaVersion": 1, "chapters": []any{}, "paragraphs": paragraphs})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, bytes, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestChapterIDByTitleAndParagraphIDResolveAgainstTheImportedManuscript(t *testing.T) {
	service, chapterID, paragraphID := importReaderFixture(t)
	data, err := service.Load()
	if err != nil {
		t.Fatal(err)
	}
	chapters := objects(data["chapters"])
	paragraphs := objects(data["paragraphs"])

	if id, ambiguous, ok := service.ChapterIDByTitle(text(chapters[0], "title")); !ok || ambiguous || id != chapterID {
		t.Fatalf("ChapterIDByTitle = %q, %v, %v; want %q, false, true", id, ambiguous, ok, chapterID)
	}
	if _, _, ok := service.ChapterIDByTitle("No Such Chapter"); ok {
		t.Fatal("an unknown title must not resolve")
	}

	index, _ := paragraphs[0]["index"].(float64)
	if id, ok := service.ParagraphID(chapterID, int(index)); !ok || id != paragraphID {
		t.Fatalf("ParagraphID = %q, %v; want %q, true", id, ok, paragraphID)
	}
	if _, ok := service.ParagraphID(chapterID, -1); ok {
		t.Fatal("an index no paragraph has must not resolve")
	}
	if _, ok := service.ParagraphID("not-a-chapter", int(index)); ok {
		t.Fatal("a paragraph of another chapter must not resolve")
	}
}

func TestChapterIDByTitleFlagsATitleSharedByTwoChapters(t *testing.T) {
	project := t.TempDir()
	dir := filepath.Join(project, brand.ProjectFolder, "manuscript")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(map[string]any{
		"schemaVersion": 1,
		"chapters":      []any{map[string]any{"id": "c-1", "title": "Interlude"}, map[string]any{"id": "c-2", "title": "Interlude"}},
		"paragraphs":    []any{},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "manuscript.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	if id, ambiguous, ok := New(project).ChapterIDByTitle("Interlude"); !ok || !ambiguous || id != "c-1" {
		t.Fatalf("ChapterIDByTitle = %q, %v, %v; want the first match, flagged ambiguous", id, ambiguous, ok)
	}
}

func TestChapterIDByTitleAndParagraphIDFailWithoutAManuscript(t *testing.T) {
	service := New(t.TempDir())
	if _, _, ok := service.ChapterIDByTitle("Anything"); ok {
		t.Fatal("no manuscript: nothing resolves")
	}
	if _, ok := service.ParagraphID("c-1", 0); ok {
		t.Fatal("no manuscript: nothing resolves")
	}
}

// docs/utilities/recording-coverage.md, src/studio/desktop/bindings_coverage.go: recordedFraction is set only from a measurement the provider
// gives, and absent for every other chapter, so the UI keeps its labeled status estimate.
func TestRecordedFractionComesOnlyFromTheMeasurementProvider(t *testing.T) {
	service, chapterID, _ := importReaderFixture(t)
	chapters, err := service.Chapters()
	if err != nil {
		t.Fatal(err)
	}
	for _, chapter := range chapters {
		if _, ok := chapter["recordedFraction"]; ok {
			t.Fatalf("with no provider no chapter may carry recordedFraction: %#v", chapter)
		}
	}

	calls := 0
	service.SetRecordedFractions(func() map[string]float64 {
		calls++
		return map[string]float64{chapterID: 0.8, "not-a-chapter": 1}
	})

	chapters, err = service.Chapters()
	if err != nil {
		t.Fatal(err)
	}
	status, err := service.SetChapterStatus(chapterID, "recording")
	if err != nil {
		t.Fatal(err)
	}
	for name, list := range map[string][]map[string]any{"Chapters": chapters} {
		for _, chapter := range list {
			fraction, ok := chapter["recordedFraction"]
			if text(chapter, "id") == chapterID {
				if fraction != 0.8 {
					t.Fatalf("%s: measured chapter = %#v", name, chapter)
				}
			} else if ok {
				t.Fatalf("%s: an unmeasured chapter must not carry recordedFraction: %#v", name, chapter)
			}
		}
	}
	if status["recordedFraction"] != 0.8 {
		t.Fatalf("SetChapterStatus payload = %#v", status)
	}
	if calls != 2 {
		t.Fatalf("the provider is asked once per payload, got %d calls", calls)
	}
}

func TestChaptersUnmeasuredKeepsTheStatusesAndNeverAsksForTheFractions(t *testing.T) {
	service, chapterID, _ := importReaderFixture(t)
	calls := 0
	service.SetRecordedFractions(func() map[string]float64 {
		calls++
		return map[string]float64{chapterID: 0.8}
	})
	if _, err := service.SetChapterStatus(chapterID, "recording"); err != nil {
		t.Fatal(err)
	}
	measured, err := service.Chapters()
	if err != nil {
		t.Fatal(err)
	}
	calls = 0

	chapters, err := service.ChaptersUnmeasured()

	if err != nil || calls != 0 || len(chapters) != len(measured) {
		t.Fatalf("chapters = %d of %d, err = %v, provider calls = %d", len(chapters), len(measured), err, calls)
	}
	for index, chapter := range chapters {
		delete(measured[index], "recordedFraction")
		if !reflect.DeepEqual(chapter, measured[index]) {
			t.Fatalf("chapter %d = %#v, want %#v", index, chapter, measured[index])
		}
	}
}

// TestRecordedSecondsComesOnlyFromTheRecordedLengthProvider pins that a chapter's recordedSeconds comes only from the recorded-length
// provider (the linked track's audio in the saved project), and a chapter the provider cannot answer carries the
// reason instead. The status never fills it, and ChaptersUnmeasured never asks.
func TestRecordedSecondsComesOnlyFromTheRecordedLengthProvider(t *testing.T) {
	service, chapterID, _ := importReaderFixture(t)
	chapters, err := service.Chapters()
	if err != nil {
		t.Fatal(err)
	}
	for _, chapter := range chapters {
		if _, ok := chapter["recordedSeconds"]; ok {
			t.Fatalf("with no provider no chapter may carry recordedSeconds: %#v", chapter)
		}
	}
	other := text(chapters[1], "id")
	calls := 0
	service.SetRecordedLengths(func() map[string]RecordedLength {
		calls++
		return map[string]RecordedLength{chapterID: {Seconds: 2520}, other: {Unavailable: RecordedUnlinked}}
	})
	if _, err := service.SetChapterStatus(chapterID, "recording"); err != nil {
		t.Fatal(err)
	}
	calls = 0
	chapters, err = service.Chapters()
	if err != nil || calls != 1 {
		t.Fatalf("Chapters: err = %v, provider calls = %d; want one call", err, calls)
	}
	for _, chapter := range chapters {
		seconds, hasSeconds := chapter["recordedSeconds"]
		reason, hasReason := chapter["recordedUnavailable"]
		switch text(chapter, "id") {
		case chapterID:
			if seconds != 2520.0 || hasReason {
				t.Fatalf("linked chapter = %#v, want 2520 s and no reason", chapter)
			}
		case other:
			if hasSeconds || reason != "unlinked" {
				t.Fatalf("unlinked chapter = %#v, want the reason and no seconds", chapter)
			}
		default:
			if hasSeconds || hasReason {
				t.Fatalf("a chapter the provider left out = %#v, want neither field", chapter)
			}
		}
	}
	calls = 0
	unmeasured, err := service.ChaptersUnmeasured()
	if err != nil || calls != 0 {
		t.Fatalf("ChaptersUnmeasured: err = %v, provider calls = %d; want none", err, calls)
	}
	for _, chapter := range unmeasured {
		if _, ok := chapter["recordedSeconds"]; ok {
			t.Fatalf("ChaptersUnmeasured chapter = %#v, want no recordedSeconds", chapter)
		}
	}
}

// ChapterTitle reads one entry of an index built once per parse: no chapter payload for any chapter (#3272), and the index follows the file.
func TestChapterTitleBuildsNoChapterPayloadAndFollowsTheFile(t *testing.T) {
	project := t.TempDir()
	write := func(chapters []map[string]any) {
		t.Helper()
		dir := filepath.Join(project, brand.ProjectFolder, "manuscript")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		bytes, err := json.Marshal(map[string]any{"schemaVersion": 1, "chapters": chapters, "paragraphs": []any{}})
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "manuscript.json"), bytes, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write([]map[string]any{
		{"id": "front", "title": "Title Page", "contentKind": "opening"},
		{"id": "c1", "title": "Chapter One"},
		{"id": "c2", "title": "Chapter Two", "contentKind": "narration"},
	})
	service := New(project)

	before := ChapterPayloadsBuilt()
	for id, want := range map[string]string{"c1": "Chapter One", "c2": "Chapter Two"} {
		if title, ok, err := service.ChapterTitle(id); err != nil || !ok || title != want {
			t.Fatalf("ChapterTitle(%q) = %q, %v, %v; want %q", id, title, ok, err, want)
		}
	}
	// Front matter and a chapter the book does not have are not chapters; the credits are the host's, not the manuscript's.
	for _, id := range []string{"front", "c3", "", "credits-opening"} {
		if title, ok, err := service.ChapterTitle(id); err != nil || ok {
			t.Fatalf("ChapterTitle(%q) = %q, %v, %v; want not a chapter", id, title, ok, err)
		}
	}
	if built := ChapterPayloadsBuilt() - before; built != 0 {
		t.Fatalf("ChapterTitle built %d chapter payloads, want none", built)
	}

	// The control: the chapter list builds one per chapter (front matter is not drawn).
	before = ChapterPayloadsBuilt()
	if _, err := service.ChaptersUnmeasured(); err != nil {
		t.Fatal(err)
	}
	if built := ChapterPayloadsBuilt() - before; built != 2 {
		t.Fatalf("ChaptersUnmeasured built %d chapter payloads for 2 chapters", built)
	}

	// A changed file is read again: the index is the parse's, not a copy that outlives it.
	write([]map[string]any{{"id": "c1", "title": "Chapter One, Revised"}})
	if title, ok, err := service.ChapterTitle("c1"); err != nil || !ok || title != "Chapter One, Revised" {
		t.Fatalf("ChapterTitle after a rewrite = %q, %v, %v", title, ok, err)
	}
	if _, ok, _ := service.ChapterTitle("c2"); ok {
		t.Fatal("a chapter the rewritten file no longer has is still found")
	}
	// No manuscript: the refusal is the loader's.
	if _, _, err := New(t.TempDir()).ChapterTitle("c1"); err == nil {
		t.Fatal("a project with no manuscript answered a title")
	}
}
