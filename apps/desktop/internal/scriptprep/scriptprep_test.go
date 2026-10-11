package scriptprep

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

func book() Book {
	return Book{
		Chapters: []string{"c-0001", "c-0002"},
		Lines: []Line{
			{ChapterID: "c-0001", ID: "p-000001", Index: 0, Text: "“Off with her head!” the Queen shouted."},
			{ChapterID: "c-0001", ID: "p-000002", Index: 1, Text: "The Knave of Hearts stole the tarts."},
			{ChapterID: "c-0002", ID: "p-000003", Index: 2, Text: "Alice met the knave again."},
		},
	}
}

func service(t *testing.T, project string, current *Book) *Service {
	t.Helper()
	return New(Config{
		Project:    project,
		Manuscript: func() (Book, error) { return *current, nil },
		Sources:    func() []string { return []string{"espeak", "wiktionary", ManualSource} },
		Reporter:   &persist.Reporter{},
	})
}

func TestChapterPrepStateRoundtrip(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	list, err := svc.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Chapters) != 2 || list.Chapters[0].State != PrepNone || list.Chapters[1].State != PrepNone {
		t.Fatalf("chapters of a new project = %+v", list.Chapters)
	}
	for _, state := range []string{PrepProgress, PrepPrepped, PrepNone, PrepPrepped} {
		chapter, err := svc.SetChapter("c-0002", state)
		if err != nil || chapter.ChapterID != "c-0002" || chapter.State != state {
			t.Fatalf("set %s = %+v, %v", state, chapter, err)
		}
	}
	if _, err := svc.SetChapter("c-0009", PrepPrepped); err == nil || !strings.Contains(err.Error(), "not in the manuscript") {
		t.Fatalf("a chapter the manuscript lacks = %v", err)
	}
	if _, err := svc.SetChapter("c-0001", "done"); err == nil {
		t.Fatal("an unknown state was saved")
	}
	again, err := service(t, project, &current).List()
	if err != nil {
		t.Fatal(err)
	}
	if again.Chapters[0].State != PrepNone || again.Chapters[1].State != PrepPrepped {
		t.Fatalf("after a new service = %+v", again.Chapters)
	}
}

func TestFlagAWordInTheText(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	// "Knave" in "The Knave of Hearts": UTF-16 offsets 4 to 9.
	word, err := svc.Flag("c-0001", "p-000002", 4, 9)
	if err != nil {
		t.Fatal(err)
	}
	if word.Word != "knave" || word.Status != StatusNotSet || len(word.Flags) != 1 || word.Flags[0].Quote != "Knave" || *word.Flags[0].Paragraph != 1 {
		t.Fatalf("flagged = %+v", word)
	}
	again, err := svc.Flag("c-0001", "p-000002", 4, 9)
	if err != nil || len(again.Flags) != 1 || again.Flags[0].ID != word.Flags[0].ID {
		t.Fatalf("the same range flagged twice = %+v, %v", again, err)
	}
	// "knave" in Alice's line, a different case: the same word.
	other, err := svc.Flag("c-0002", "p-000003", 14, 19)
	if err != nil || other.Word != "knave" || len(other.Flags) != 2 {
		t.Fatalf("the word in another chapter = %+v, %v", other, err)
	}
	// "the Queen" after the closing curly quote: the quote is one UTF-16 unit, so offsets 21 to 30.
	queen, err := svc.Flag("c-0001", "p-000001", 21, 30)
	if err != nil || queen.Word != "the queen" || queen.Flags[0].Quote != "the Queen" {
		t.Fatalf("a range after a curly quote = %+v, %v", queen, err)
	}
	for _, spot := range []struct {
		chapterID, paragraphID string
		start, end             int
	}{
		{"c-0009", "p-000001", 0, 3},
		{"c-0002", "p-000001", 0, 3},
		{"c-0001", "p-000002", 4, 4},
		{"c-0001", "p-000002", 30, 40},
		{"c-0001", "p-000002", 3, 4},
		{"c-0001", "p-000002", 0, 37},
	} {
		if _, err := svc.Flag(spot.chapterID, spot.paragraphID, spot.start, spot.end); err == nil {
			t.Errorf("a flag at %+v was saved", spot)
		}
	}
	list, err := svc.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Words) != 2 || list.Words[0].Word != "the queen" || list.Words[1].Word != "knave" {
		t.Fatalf("words in reading order = %+v", list.Words)
	}
}

func TestSayValueWithSource(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	if _, err := svc.Say("knave", "nayv", "espeak"); err == nil || !strings.Contains(err.Error(), "flag") {
		t.Fatalf("a say-value for a word never flagged = %v", err)
	}
	if _, err := svc.Flag("c-0001", "p-000002", 4, 9); err != nil {
		t.Fatal(err)
	}
	word, err := svc.Say("Knave", "  nayv  ", "wiktionary")
	if err != nil || word.Say != "nayv" || word.Source != "wiktionary" || word.Status != StatusSet {
		t.Fatalf("say = %+v, %v", word, err)
	}
	typed, err := svc.Say("knave", "NAYV", "")
	if err != nil || typed.Source != ManualSource {
		t.Fatalf("a typed say-value without a source = %+v, %v", typed, err)
	}
	cleared, err := svc.Say("knave", "", "")
	if err != nil || cleared.Say != "" || cleared.Source != "" || cleared.Status != StatusNotSet || len(cleared.Flags) != 1 {
		t.Fatalf("cleared = %+v, %v", cleared, err)
	}
	for _, bad := range []struct{ say, source string }{
		{strings.Repeat("a", MaxSayUnits+1), "espeak"},
		{"nay\nv", "espeak"},
		{"nay\x00v", "espeak"},
		{"nayv", "not-a-source"},
		{"nayv", "../espeak"},
	} {
		if _, err := svc.Say("knave", bad.say, bad.source); err == nil {
			t.Errorf("say %q from %q was saved", bad.say, bad.source)
		}
	}
	list, _ := svc.List()
	if list.Words[0].Say != "" {
		t.Fatalf("a refused say changed the word: %+v", list.Words[0])
	}
}

func TestUnflagRemovesTheFlagNotTheValue(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	first, _ := svc.Flag("c-0001", "p-000002", 4, 9)
	second, _ := svc.Flag("c-0002", "p-000003", 14, 19)
	if _, err := svc.Say("knave", "nayv", "espeak"); err != nil {
		t.Fatal(err)
	}
	left, err := svc.Unflag(first.Flags[0].ID)
	if err != nil || left.Say != "nayv" || left.Status != StatusSet || len(left.Flags) != 1 || left.Flags[0].ID != second.Flags[1].ID {
		t.Fatalf("after the first unflag = %+v, %v", left, err)
	}
	gone, err := svc.Unflag(left.Flags[0].ID)
	if err != nil || gone.Word != "knave" || gone.Say != "" || gone.Source != "" || gone.Status != StatusNotFlagged || len(gone.Flags) != 0 {
		t.Fatalf("after the last unflag = %+v, %v", gone, err)
	}
	if again, _ := svc.Flag("c-0001", "p-000002", 4, 9); again.Say != "" {
		t.Fatalf("the say-value came back with a new flag: %+v", again)
	}
	if _, err := svc.Unflag("missing"); err == nil {
		t.Fatal("an unknown flag was removed")
	}
}

func TestStatusIsDerivedForEveryWord(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	_, _ = svc.Flag("c-0001", "p-000002", 4, 9)
	_, _ = svc.Flag("c-0001", "p-000002", 20, 25)
	_, _ = svc.Say("stole", "stohl", ManualSource)
	list, _ := svc.List()
	got := map[string]string{}
	for _, word := range list.Words {
		got[word.Word] = word.Status
	}
	if got["knave"] != StatusNotSet || got["stole"] != StatusSet || len(got) != 2 {
		t.Fatalf("statuses = %v", got)
	}
}

func TestStaleFlagIsReportedNotMoved(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	_, _ = svc.Flag("c-0001", "p-000002", 4, 9)
	_, _ = svc.Flag("c-0001", "p-000002", 30, 36)
	_, _ = svc.Flag("c-0002", "p-000003", 0, 5)
	current.Lines[1].Text = "The Jack of Hearts took them."
	current.Lines = current.Lines[:2]
	list, err := svc.List()
	if err != nil {
		t.Fatal(err)
	}
	reasons := map[string]string{}
	for _, word := range list.Words {
		flag := word.Flags[0]
		if !flag.Stale {
			t.Fatalf("a flag on changed text is not stale: %+v", word)
		}
		reasons[word.Word] = flag.StaleReason
		if word.Word == "alice" && flag.Paragraph != nil {
			t.Fatalf("a flag whose line is gone has a paragraph: %+v", flag)
		}
	}
	if reasons["knave"] != StaleTextChanged || reasons["tarts."] != StaleRangeOutOfRange || reasons["alice"] != StaleParagraphMissing {
		t.Fatalf("stale reasons = %v", reasons)
	}
}

func TestFileIsNarratorData(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	if _, err := svc.SetChapter("c-0001", PrepProgress); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(File(project) + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("the temporary file was left behind: %v", err)
	}

	if err := os.WriteFile(File(project), []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	list, err := svc.List()
	if err != nil || list.Chapters[0].State != PrepNone {
		t.Fatalf("a corrupt file = %+v, %v", list, err)
	}
	aside, _ := filepath.Glob(File(project) + ".corrupt-*")
	if len(aside) != 1 {
		t.Fatalf("the corrupt file was not kept aside: %v", aside)
	}

	broken := `{"schemaVersion":1,"chapters":{"c-0001":"done"},"flags":[],"says":{}}`
	if err := os.WriteFile(File(project), []byte(broken), 0o600); err != nil {
		t.Fatal(err)
	}
	if list, err := svc.List(); err != nil || list.Chapters[0].State != PrepNone {
		t.Fatalf("a file that breaks a rule = %+v, %v", list, err)
	}

	newer := `{"schemaVersion":2,"chapters":{},"flags":[],"says":{}}`
	if err := os.WriteFile(File(project), []byte(newer), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetChapter("c-0001", PrepPrepped); err == nil {
		t.Fatal("a file from a newer app was overwritten")
	}
	if raw, _ := os.ReadFile(File(project)); string(raw) != newer {
		t.Fatalf("the newer file changed: %s", raw)
	}

	if err := os.WriteFile(File(project), []byte(`{"schemaVersion":1,"x":"`+strings.Repeat("a", MaxFileBytes)+`"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if list, err := svc.List(); err != nil || len(list.Words) != 0 {
		t.Fatalf("a file over the cap = %+v, %v", list, err)
	}
}

func TestNoProjectSavesNothing(t *testing.T) {
	current := book()
	svc := service(t, "", &current)
	if list, err := svc.List(); err != nil || len(list.Chapters) != 0 || len(list.Words) != 0 {
		t.Fatalf("list with no project = %+v, %v", list, err)
	}
	if _, err := svc.SetChapter("c-0001", PrepPrepped); err == nil {
		t.Fatal("a set with no project succeeded")
	}
	if _, err := svc.Flag("c-0001", "p-000002", 4, 9); err == nil {
		t.Fatal("a flag with no project succeeded")
	}
	if _, err := svc.Say("knave", "nayv", ""); err == nil {
		t.Fatal("a say with no project succeeded")
	}
	if _, err := svc.Unflag("x"); err == nil {
		t.Fatal("an unflag with no project succeeded")
	}
}
