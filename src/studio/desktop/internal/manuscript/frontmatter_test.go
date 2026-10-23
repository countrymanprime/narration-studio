package manuscript

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"desktop/internal/importer"
)

// Front matter is never a chapter. The import keeps its lines on the side, for the credits to read the title and author from, and writes
// the rest of the book without it.
func TestCanonicalizeKeepsFrontMatterLinesAndWritesNoChapterForIt(t *testing.T) {
	draft := importer.Draft{
		Format: "docx",
		Sections: []importer.DraftSection{
			{ID: "s1", Title: "Front Matter", ContentKind: "opening"},
			{ID: "s2", Title: "Chapter One", ContentKind: "narration"},
			{ID: "s3", Title: "Glossary", ContentKind: "reference"},
		},
		Paragraphs: []importer.Paragraph{
			{Chapter: "Front Matter", Text: "Alice's Adventures", SourceIndex: 0},
			{Chapter: "Front Matter", Text: "by Lewis Carroll", SourceIndex: 1},
			{Chapter: "Chapter One", Text: "Alice was beginning to get very tired.", SourceIndex: 2},
			{Chapter: "Glossary", Text: "Rabbit: a hurried animal.", SourceIndex: 3},
		},
	}
	canonical, err := canonicalize(draft, "alice.docx", "stored/alice.docx", "sha", nil)
	if err != nil {
		t.Fatal(err)
	}
	var titles []string
	for _, chapter := range canonical["chapters"].([]map[string]any) {
		if chapter["contentKind"] == "opening" {
			t.Fatalf("a chapter was written for the front matter: %#v", chapter)
		}
		titles = append(titles, chapter["title"].(string))
	}
	if !reflect.DeepEqual(titles, []string{"Chapter One", "Glossary"}) {
		t.Fatalf("chapters = %v, want the chapter and the reference section, renumbered from c-0001", titles)
	}
	if first := canonical["chapters"].([]map[string]any)[0]["id"]; first != "c-0001" {
		t.Fatalf("first chapter id = %v, want c-0001", first)
	}
	paragraphs := canonical["paragraphs"].([]map[string]any)
	if len(paragraphs) != 2 || paragraphs[0]["id"] != "p-000001" || paragraphs[0]["index"] != 0 {
		t.Fatalf("paragraphs = %#v, want only the book's, numbered from the start", paragraphs)
	}
	if got, want := canonical["frontMatter"], []string{"Alice's Adventures", "by Lewis Carroll"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("frontMatter = %#v, want %#v", got, want)
	}
}

// A book with nothing but front matter would be an empty manuscript; those sections are then written as the chapters they are.
func TestCanonicalizeNeverLeavesTheManuscriptWithoutChapters(t *testing.T) {
	draft := importer.Draft{
		Sections:   []importer.DraftSection{{ID: "s1", Title: "Only", ContentKind: "opening"}},
		Paragraphs: []importer.Paragraph{{Chapter: "Only", Text: "Words.", SourceIndex: 0}},
	}
	canonical, err := canonicalize(draft, "a.txt", "stored/a.txt", "sha", nil)
	if err != nil {
		t.Fatal(err)
	}
	chapters := canonical["chapters"].([]map[string]any)
	if len(chapters) != 1 || chapters[0]["contentKind"] != "narration" {
		t.Fatalf("chapters = %#v, want the one section as a narration chapter", chapters)
	}
	if _, has := canonical["frontMatter"]; has {
		t.Fatal("frontMatter was written although nothing was set aside")
	}
}

const legacyFrontMatterManuscript = `{"schemaVersion":1,"documentId":"doc-1","chapters":[{"id":"c-0001","title":"Front Matter","contentKind":"opening","index":0,"wordCount":3},{"id":"c-0002","title":"Chapter One","contentKind":"narration","index":1,"wordCount":3}],"paragraphs":[{"id":"p-000001","chapterId":"c-0001","chapterTitle":"Front Matter","index":0,"text":"Alice by Carroll"},{"id":"p-000002","chapterId":"c-0002","chapterTitle":"Chapter One","index":1,"text":"Alice was tired."}]}`

// A manuscript imported before this kept its front matter as a chapter. The data stays (the credits read it), but nothing lists it.
func TestAnImportedFrontMatterChapterIsNeverListed(t *testing.T) {
	project := t.TempDir()
	path := filepath.Join(project, "narration-studio", "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(legacyFrontMatterManuscript), 0o600); err != nil {
		t.Fatal(err)
	}
	service := New(project)

	for name, list := range map[string]func() ([]map[string]any, error){"Chapters": service.Chapters, "ChaptersUnmeasured": service.ChaptersUnmeasured} {
		chapters, err := list()
		if err != nil || len(chapters) != 1 || text(chapters[0], "title") != "Chapter One" {
			t.Fatalf("%s = %#v, %v, want only Chapter One", name, chapters, err)
		}
	}
	reader, err := service.Reader()
	if err != nil {
		t.Fatal(err)
	}
	if got := objects(reader["chapters"]); len(got) != 1 || text(got[0], "title") != "Chapter One" {
		t.Fatalf("reader chapters = %#v", got)
	}
	if got := objects(reader["paragraphs"]); len(got) != 1 || text(got[0], "id") != "p-000002" {
		t.Fatalf("reader paragraphs = %#v, want only the book's", got)
	}
	hits, err := service.Search("alice")
	if err != nil || len(hits) != 1 || hits[0]["chapterId"] != "c-0002" {
		t.Fatalf("search = %#v, %v, want the one hit in the book", hits, err)
	}
}
