package main

import (
	"testing"

	"desktop/internal/contractfile"
)

// The chapter list names the project it was read from (#4040): the folder is the text Bootstrap sends as projectFolder, with no
// normalisation, and the golden pins the whole envelope (Service.Chapters is pinned by the manuscript-chapters* goldens).
func TestTheChapterListAnswerNamesItsProjectAndHoldsTheChapters(t *testing.T) {
	host := stagesHost(t, 5)
	raw, err := host.ManuscriptChapters()
	if err != nil {
		t.Fatal(err)
	}
	folder, chapters := decodeChapterList(t, raw)
	if bootstrap := host.Bootstrap()["projectFolder"]; folder == "" || folder != bootstrap {
		t.Fatalf("the list names %q, Bootstrap names %v", folder, bootstrap)
	}
	if len(chapters) != 3 {
		t.Fatalf("chapters = %v", chapters)
	}
	payload := decodeAnswer(t)(raw, nil)
	stable, err := contractfile.PortablePaths(payload, folder, "C:/Projects/Alice")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "manuscript-chapters-answer", stable)
}
