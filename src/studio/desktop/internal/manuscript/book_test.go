package manuscript

import (
	"testing"
	"time"

	"desktop/internal/filetest"
)

func firstParagraphText(t *testing.T, service *Service) string {
	t.Helper()
	book, err := service.Book()
	if err != nil {
		t.Fatal(err)
	}
	return text(objects(book.Data()["paragraphs"])[0], "text")
}

// The held parse is valid for the file's bytes, not for its size and modification time: a rewrite that keeps both is answered.
func TestAManuscriptRewrittenAtTheSameSizeAndTimeIsParsedAgain(t *testing.T) {
	project := t.TempDir()
	path := writeManuscript(t, project, []map[string]any{{"id": "p0", "chapterId": "c1", "index": 0, "text": "AAAAAAAAAAAAAA"}})
	service := New(project)
	if got := firstParagraphText(t, service); got != "AAAAAAAAAAAAAA" {
		t.Fatalf("first paragraph text = %q", got)
	}
	filetest.RewriteInPlace(t, path, "AAAAAAAAAAAAAA", "BBBBBBBBBBBBBB")
	parsed := Parses()
	if got := firstParagraphText(t, service); got != "BBBBBBBBBBBBBB" {
		t.Fatalf("after a rewrite at the same size and time the book answers %q, want the file's new text", got)
	}
	if got := Parses() - parsed; got != 1 {
		t.Fatalf("the rewritten file was parsed %d times, want 1", got)
	}
}

func TestAnUnchangedManuscriptIsReadButNotParsedAgain(t *testing.T) {
	project := t.TempDir()
	writeManuscript(t, project, []map[string]any{{"id": "p0", "chapterId": "c1", "index": 0, "text": "A"}})
	service := New(project)
	first, err := service.Book()
	if err != nil {
		t.Fatal(err)
	}
	read, parsed := Reads(), Parses()
	second, err := service.Book()
	if err != nil {
		t.Fatal(err)
	}
	if second != first || Parses() != parsed {
		t.Fatalf("an unchanged file was parsed again (%d parses)", Parses()-parsed)
	}
	if got := Reads() - read; got != 1 {
		t.Fatalf("the second load read the file %d times, want 1: every load compares the file's bytes", got)
	}
}

// A write hands the service the bytes it wrote, so the next load parses nothing; what is held is what the file reads.
func TestAWrittenManuscriptIsHeldAsItsFileReads(t *testing.T) {
	project := t.TempDir()
	service := New(project)
	heldAsTheFileReads := func(after string) *Book {
		t.Helper()
		parsed := Parses()
		book, err := service.Book()
		if err != nil {
			t.Fatal(err)
		}
		if Parses() != parsed {
			t.Fatalf("the load after %s parsed the manuscript again", after)
		}
		onDisk, err := New(project).Book()
		if err != nil {
			t.Fatal(err)
		}
		if book.digest != onDisk.digest || len(book.ChapterRefs()) != len(onDisk.ChapterRefs()) {
			t.Fatalf("after %s the held book is not what the file reads", after)
		}
		return book
	}
	importAlice(t, service, false)
	if len(heldAsTheFileReads("an import commit").ChapterRefs()) == 0 {
		t.Fatal("the committed book has no chapters")
	}
	if _, err := service.SetChapterKind("c-0002", "reference", time.Now()); err != nil {
		t.Fatal(err)
	}
	for _, ref := range heldAsTheFileReads("a chapter-kind change").ChapterRefs() {
		if ref.ID == "c-0002" && ref.ContentKind != "reference" {
			t.Fatalf("the held book says c-0002 is %q, want reference", ref.ContentKind)
		}
	}
}
