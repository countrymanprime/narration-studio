package main

import (
	"os"
	"path/filepath"
	"testing"

	"desktop/internal/brand"
	"desktop/internal/contractfile"
)

// The chapter list names the project it was read from (#4040): the folder is the text Bootstrap sends as projectFolder, with no
// normalisation, and the golden pins the whole envelope (Service.Chapters is pinned by the manuscript-chapters* goldens).
func TestTheChapterListAnswerNamesItsProjectAndHoldsTheChapters(t *testing.T) {
	host := newStressHost(t)
	project := t.TempDir()
	path := filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	// A chapter as an import writes it, with its index and word count.
	content := `{"schemaVersion": 1, "documentId": "d",
		"chapters": [{"id": "c-0001", "title": "Chapter One", "index": 1, "wordCount": 7, "contentKind": "narration"}],
		"paragraphs": [{"id": "p-000001", "index": 0, "chapterId": "c-0001", "chapterTitle": "Chapter One", "text": "Juno met Zeph. Juno is a friend."}]}`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := host.ProjectSwitch(project, ""); err != nil {
		t.Fatal(err)
	}
	raw, err := host.ManuscriptChapters()
	if err != nil {
		t.Fatal(err)
	}
	folder, chapters := decodeChapterList(t, raw)
	if bootstrap := host.Bootstrap()["projectFolder"]; folder != project || folder != bootstrap {
		t.Fatalf("the list names %q, Bootstrap names %v, the project is %q", folder, bootstrap, project)
	}
	if len(chapters) != 3 || chapters[1]["id"] != "c-0001" { // the credits come first and last
		t.Fatalf("chapters = %v", chapters)
	}
	payload := decodeAnswer(t)(raw, nil)
	stable, err := contractfile.PortablePaths(payload, folder, "C:/Projects/Alice")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "manuscript-chapters-answer", stable)
}
