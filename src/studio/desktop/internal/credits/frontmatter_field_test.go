package credits

import (
	"os"
	"path/filepath"
	"testing"
)

func writeManuscriptJSON(t *testing.T, project, body string) {
	t.Helper()
	path := filepath.Join(project, "narration-studio", "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

// The import sets the front matter aside as `frontMatter` lines instead of a chapter, and the credits still read the title and author there.
func TestSuggestionsReadTheFrontMatterLinesSetAsideByTheImport(t *testing.T) {
	project := t.TempDir()
	writeManuscriptJSON(t, project, `{"schemaVersion":1,"documentId":"d","chapters":[{"id":"c-0001","title":"One","contentKind":"narration"}],"paragraphs":[{"chapterId":"c-0001","text":"Text.","index":0}],"frontMatter":["Alice's Adventures in Wonderland","by Lewis Carroll"]}`)
	got := SuggestFromManuscript(project)
	if got["Title"] != "Alice's Adventures in Wonderland" || got["Author"] != "Lewis Carroll" {
		t.Fatalf("suggestions = %v, want the title and author from the front matter lines", got)
	}
}

// A manuscript imported earlier holds its front matter as an "opening" chapter, which is read as before.
func TestSuggestionsStillReadALegacyOpeningChapter(t *testing.T) {
	project := t.TempDir()
	writeManuscriptJSON(t, project, `{"schemaVersion":1,"documentId":"d","chapters":[{"id":"c-0001","title":"Front","contentKind":"opening"},{"id":"c-0002","title":"One","contentKind":"narration"}],"paragraphs":[{"chapterId":"c-0001","text":"Alice's Adventures in Wonderland","index":0},{"chapterId":"c-0001","text":"by Lewis Carroll","index":1},{"chapterId":"c-0002","text":"Text.","index":2}]}`)
	got := SuggestFromManuscript(project)
	if got["Title"] != "Alice's Adventures in Wonderland" || got["Author"] != "Lewis Carroll" {
		t.Fatalf("suggestions = %v", got)
	}
}
