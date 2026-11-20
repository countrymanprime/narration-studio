package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/brand"
	"desktop/internal/coverage"
	"desktop/internal/manuscript"
	"desktop/internal/recordedthrough"
	"desktop/internal/teleprompter"
)

// Two chapters of two ten-word paragraphs each, after a one-word title: 21 script words a chapter.
const throughManuscript = `{"documentId":"doc-1","chapters":[{"id":"c1","title":"One"},{"id":"c2","title":"Two"},{"id":"c3","title":"Three"}],
"paragraphs":[{"id":"p1","chapterId":"c1","text":"a b c d e f g h i j"},{"id":"p2","chapterId":"c1","text":"k l m n o p q r s t"},
{"id":"p3","chapterId":"c2","text":"a b c d e f g h i j"},{"id":"p4","chapterId":"c2","text":"k l m n o p q r s t"},
{"id":"p5","chapterId":"c3","text":"a b c d e f g h i j"},{"id":"p6","chapterId":"c3","text":"k l m n o p q r s t"}]}`

func throughProject(t *testing.T, body string) string {
	t.Helper()
	project := t.TempDir()
	dir := filepath.Join(project, brand.ProjectFolder, "manuscript")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "manuscript.json"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return project
}

func TestEachChapterIsRecordedThroughWhatItsOwnSourcesSay(t *testing.T) {
	project := throughProject(t, throughManuscript)
	// c1: the Booth followed a take from the top to word 15 (p2's fifth word, index 4).
	if err := teleprompter.WriteReadingFrom(project, "c1", 0, 15, 21, "listening", time.Now()); err != nil {
		t.Fatal(err)
	}
	// c2: Proof heard all of p3 and none of p4; c3: only its track length is known, the whole chapter and more.
	proof := map[string][]coverage.ParagraphLine{"c2": {{ID: "p3", Tokens: 10, Present: 10}, {ID: "p4", Tokens: 10, Present: 0}}}
	lengths := map[string]manuscript.RecordedLength{"c1": {Unavailable: manuscript.RecordedUnlinked}, "c3": {Seconds: 600}}

	got := recordedThroughsFor(project, []string{"c1", "c2", "c3", "gone"}, proof, lengths)

	want := map[string]recordedthrough.Through{
		"c1": {ParagraphID: "p2", Paragraph: 2, Word: 3, Percent: 71, Source: recordedthrough.SourceBooth, Confident: true},
		"c2": {ParagraphID: "p3", Paragraph: 1, Word: 9, Percent: 52, Source: recordedthrough.SourceProof, Confident: true},
		"c3": {ParagraphID: "p6", Paragraph: 2, Word: 9, Percent: 100, Complete: true, Source: recordedthrough.SourceDAW},
	}
	if len(got) != len(want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
	for id, place := range want {
		if got[id] != place {
			t.Fatalf("%s = %+v, want %+v", id, got[id], place)
		}
	}
}

func TestAChapterEditedSinceItsTakesFallsBackToTheTrackLength(t *testing.T) {
	project := throughProject(t, throughManuscript)
	if err := teleprompter.WriteReadingFrom(project, "c1", 0, 20, 21, "listening", time.Now()); err != nil {
		t.Fatal(err)
	}
	edited := throughProject(t, strings.Replace(throughManuscript, "k l m n o p q r s t", "k l m n o p q r s t u v", 1))
	if err := os.Rename(filepath.Join(edited, brand.ProjectFolder, "manuscript", "manuscript.json"), filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json")); err != nil {
		t.Fatal(err)
	}
	half := 12.0 * 3600 / 9300 // 12 of the 23 words at the planning pace
	got := recordedThroughsFor(project, []string{"c1"}, nil, map[string]manuscript.RecordedLength{"c1": {Seconds: half}})
	if place := got["c1"]; place.Source != recordedthrough.SourceDAW || place.Confident || place.Complete || place.Percent != 52 {
		t.Fatalf("c1 = %+v, want an estimate of about half", place)
	}
	if got := recordedThroughsFor(project, []string{"c1"}, nil, nil); len(got) != 0 {
		t.Fatalf("with no track length the edited chapter says %+v, want nothing", got)
	}
}

func TestNoManuscriptGivesNoPlaces(t *testing.T) {
	if got := recordedThroughsFor(t.TempDir(), []string{"c1"}, nil, nil); len(got) != 0 {
		t.Fatalf("got %+v, want none", got)
	}
	if got, fractions := recordedThroughs("", nil, nil, nil)([]string{"c1"}, nil); got != nil || fractions != nil {
		t.Fatalf("with no project got %+v and %v, want nil", got, fractions)
	}
}

// The provider reads the manuscript the manuscript service already holds: with the file made unreadable behind the
// service's back (same size and time, so the service still answers from what it parsed), the chapters are still placed,
// where a read of the file itself places none (issue 3802).
func TestTheProviderReadsTheManuscriptTheServiceHolds(t *testing.T) {
	body := strings.Replace(throughManuscript, `{"documentId"`, `{"schemaVersion":1,"documentId"`, 1)
	project := throughProject(t, body)
	path := filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json")
	service := manuscript.New(project)
	if _, err := service.Load(); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(strings.Repeat("x", len(body))), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	lengths := map[string]manuscript.RecordedLength{"c3": {Seconds: 600}}
	if got, _ := recordedThroughs(project, nil, nil, service)([]string{"c3"}, lengths); len(got) != 1 {
		t.Fatalf("through the service's manuscript = %v, want c3 placed", got)
	}
	if got, _ := recordedThroughs(project, nil, nil, nil)([]string{"c3"}, lengths); len(got) != 0 {
		t.Fatalf("through the file = %v, want nothing: the fixture's file should not parse", got)
	}
}
