package comparerun

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/compare"
)

// The chapter choice compare.py's run made before decoding, ported from its tests when it moved to the host.

var chooseChapters = []compare.Chapter{
	{ID: "c-1", Title: "Chapter One"},
	{ID: "c-2", Title: "Chapter Two\nThe Return"},
	{ID: "c-3", Title: "Arelian Road|West"},
}

func TestAnExplicitChapterTitleIsChosenByItsDisplayTitleAtAScoreOfOne(t *testing.T) {
	chapter, score, err := Choose(compare.Tokenizer{}, chooseChapters, "Something else", "Chapter Two: The Return")
	if err != nil || chapter.ID != "c-2" || score != 1.0 {
		t.Fatalf("%+v %v %v", chapter, score, err)
	}
	if _, _, err := Choose(compare.Tokenizer{}, chooseChapters, "Chapter One", "Chapter Nine"); err == nil || err.Error() != "Chapter title override 'Chapter Nine' not found in the document." {
		t.Fatalf("an unknown title: %v", err)
	}
}

func TestATrackNameIsMatchedWithTheProjectsEquivalences(t *testing.T) {
	for _, c := range []struct {
		groups [][]string
		track  string
		id     string
		score  float64
	}{
		{nil, "Chapter 1", "c-1", 1.0},
		{nil, "CH02", "c-2", 0.95},
		{nil, "Chapter 1 v2", "c-1", 0.9},
		{[][]string{{"arelian", "arelion"}}, "Arelion Road West", "c-3", 1.0},
	} {
		chapter, score, err := Choose(compare.NewTokenizer(c.groups), chooseChapters, c.track, "")
		if err != nil || chapter.ID != c.id || score != c.score {
			t.Errorf("%q: %s %v %v, want %s %v", c.track, chapter.ID, score, err, c.id, c.score)
		}
	}
}

func TestANameThatMatchesNoChapterAsksForOneByItsDisplayTitle(t *testing.T) {
	for _, track := range []string{"Appendix", "End Credits"} {
		_, _, err := Choose(compare.Tokenizer{}, chooseChapters, track, "")
		var need NeedChapter
		if !errors.As(err, &need) || !reflect.DeepEqual(need.Candidates, []string{"Chapter One", "Chapter Two: The Return", "Arelian Road/West"}) {
			t.Fatalf("%q: %v", track, err)
		}
		if err.Error() != "Choose the manuscript chapter." {
			t.Fatalf("%q: %q", track, err.Error())
		}
	}
}

func TestTheChaptersAreLoadedWithTheProjectsEquivalences(t *testing.T) {
	dir := t.TempDir()
	manuscript := filepath.Join(dir, "project", "app", "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(manuscript), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manuscript, []byte(`{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c", "title": "Arelian"}],
		"paragraphs": [{"id": "p", "chapterId": "c", "index": 0, "text": "Text."}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "project", "TranscriptCompare"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "project", "TranscriptCompare", "equivalences.csv"), []byte("arelian, arelion\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	tokenizer, chapters, err := LoadChapters(manuscript)
	if err != nil || len(chapters) != 1 {
		t.Fatalf("%v %v", chapters, err)
	}
	if chapter, _, err := Choose(tokenizer, chapters, "Arelion", ""); err != nil || chapter.ID != "c" {
		t.Fatalf("%+v %v", chapter, err)
	}
	if _, _, err := LoadChapters(filepath.Join(dir, "none.json")); err == nil || !strings.Contains(err.Error(), "Import a manuscript first.") {
		t.Fatalf("no manuscript: %v", err)
	}
}
