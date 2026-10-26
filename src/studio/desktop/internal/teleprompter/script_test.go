package teleprompter

import (
	"desktop/internal/brand"
	"desktop/internal/scripttrack"
	"path/filepath"
	"reflect"
	"testing"
)

// The host's copy of the sidecar's chapter script (chapter_script.load_chapter_script) and sentence bounds
// (locate.sentence_bounds).

const scriptManuscript = `{"documentId":"doc-1","chapters":[{"id":"c1","title":"Chapter One"},{"id":"c2","title":"Two"}],
"paragraphs":[{"id":"p1","chapterId":"c1","text":"She ran.  The door opened! \"Who?\""},{"id":"p2","chapterId":"c2","text":"Elsewhere."},
{"id":"p3","chapterId":"c1","text":"No end here\u001fat all"}]}`

func TestAChapterScriptIsTheTitleThenEachParagraphSplitOnWhitespace(t *testing.T) {
	project := t.TempDir()
	writeManuscript(t, project, scriptManuscript)

	script, ok := LoadChapterScript(project, "c1")

	if !ok {
		t.Fatal("chapter c1 was not found")
	}
	want := []string{"Chapter", "One", "She", "ran.", "The", "door", "opened!", `"Who?"`, "No", "end", "here", "at", "all"}
	if !reflect.DeepEqual(script.Tokens, want) {
		t.Fatalf("tokens = %q, want %q", script.Tokens, want)
	}
	// Python's str.split() also splits on the information separators (U+001C to U+001F): the index space must match.
	if !reflect.DeepEqual(script.Breaks, []int{0, 2, 8}) {
		t.Fatalf("breaks = %v", script.Breaks)
	}
	if _, ok := LoadChapterScript(project, "missing"); ok {
		t.Fatal("an unknown chapter loaded")
	}
	if _, ok := LoadChapterScript(t.TempDir(), "c1"); ok {
		t.Fatal("a project without a manuscript loaded")
	}
}

func TestSentenceAtEndsAtSentencePunctuationAndNeverCrossesAParagraph(t *testing.T) {
	project := t.TempDir()
	writeManuscript(t, project, scriptManuscript)
	script, _ := LoadChapterScript(project, "c1")

	for _, c := range []struct {
		index int
		want  Sentence
	}{
		{0, Sentence{Start: 0, End: 2, Text: "Chapter One"}},
		{3, Sentence{Start: 2, End: 4, Text: "She ran."}},
		{5, Sentence{Start: 4, End: 7, Text: "The door opened!"}},
		{7, Sentence{Start: 7, End: 8, Text: `"Who?"`}},
		{10, Sentence{Start: 8, End: 13, Text: "No end here at all"}},
	} {
		if got := script.SentenceAt(c.index); got != c.want {
			t.Fatalf("SentenceAt(%d) = %+v, want %+v", c.index, got, c.want)
		}
	}
}

func TestWordsLeftCountsOnlyTokensTheTrackerReads(t *testing.T) {
	script := ChapterScript{Tokens: []string{"The", "end.", "—", "*", "it's"}}
	for index, want := range map[int]bool{0: true, 2: true, 4: true, 5: false} {
		if got := script.WordsLeft(index); got != want {
			t.Fatalf("WordsLeft(%d) = %v, want %v", index, got, want)
		}
	}
	punctuationOnly := ChapterScript{Tokens: []string{"The", "end.", "—", "*"}}
	if punctuationOnly.WordsLeft(2) {
		t.Fatal("only punctuation is left, yet words were reported")
	}
}

// The resume verdict's script must be the tracker's and locate's (scripttrack, chapter_script.py): the heading is the
// title and then the subtitle. A script without the subtitle has fewer tokens, so Reconcile drops both places.
func TestAChapterScriptsHeadingIsTheTitleThenTheSubtitleAsTheTrackersIs(t *testing.T) {
	project := t.TempDir()
	writeManuscript(t, project, `{"schemaVersion":1,"documentId":"doc-1","chapters":[{"id":"c1","title":"Chapter 1","subtitle":"Down the Rabbit-Hole"}],
"paragraphs":[{"id":"p1","chapterId":"c1","text":"Alice was beginning to get very tired."},{"id":"p2","chapterId":"c1","text":"So she was considering."}]}`)

	script, ok := LoadChapterScript(project, "c1")

	if !ok {
		t.Fatal("chapter c1 was not found")
	}
	want := []string{"Chapter", "1", "Down", "the", "Rabbit-Hole", "Alice", "was", "beginning", "to", "get", "very", "tired.", "So", "she", "was", "considering."}
	if !reflect.DeepEqual(script.Tokens, want) {
		t.Fatalf("tokens = %q, want %q", script.Tokens, want)
	}
	if !reflect.DeepEqual(script.Breaks, []int{0, 5, 12}) {
		t.Fatalf("breaks = %v", script.Breaks)
	}
	tracked, err := scripttrack.LoadChapterScript(filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json"), "c1")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(script.Tokens, tracked.Tokens) {
		t.Fatalf("the resume script's tokens %q are not the tracker's %q", script.Tokens, tracked.Tokens)
	}
	// The verdict keeps a DAW place whose token count is the tracker's, and quotes the sentence it is in.
	word := 8
	verdict := Reconcile(&Located{Word: &word, Tokens: len(tracked.Tokens), Confident: true}, nil, script, ResumeTolerance)
	if verdict.Kind != VerdictDAWOnly || verdict.DAW == nil || verdict.DAW.Sentence.Text != "Alice was beginning to get very tired." {
		t.Fatalf("verdict = %+v, want daw_only quoting the first sentence", verdict)
	}
}
