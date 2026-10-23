package editlog

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// aliceBook is a two-chapter manuscript: "Off with her head!" is words 0 to 3 of p-000001.
func aliceBook() Book {
	return Book{
		Chapters: []string{"c-0001", "c-0002"},
		Lines: []Line{
			{ChapterID: "c-0001", ID: "p-000001", Index: 0, Text: "“Off with her head!” the Queen shouted."},
			{ChapterID: "c-0001", ID: "p-000002", Index: 1, Text: "The soldiers were silent."},
			{ChapterID: "c-0002", ID: "p-000003", Index: 2, Text: "Alice was not a bit hurt."},
		},
	}
}

func newService(t *testing.T, project string, book *Book) *Service {
	t.Helper()
	service := New(Config{Project: project, Manuscript: func() (Book, error) { return *book, nil }, Reporter: &persist.Reporter{}})
	service.now = func() time.Time { return time.Date(2026, 10, 11, 10, 0, 0, 0, time.UTC) }
	return service
}

func keysOf(words []Accepted) []string {
	keys := make([]string, 0, len(words))
	for _, word := range words {
		keys = append(keys, word.Key)
	}
	return keys
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

// 1. accept-list-unaccept-roundtrip
func TestAcceptListUnacceptRoundtrip(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	change, err := service.Accept("c-0001", []string{"p-000002:3", "p-000001:5"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(change.Changed, ","); got != "p-000002:3,p-000001:5" {
		t.Fatalf("changed = %s", got)
	}
	// Reading order: by line, then ordinal.
	if got := strings.Join(keysOf(change.Words), ","); got != "p-000001:5,p-000002:3" {
		t.Fatalf("words = %s", got)
	}
	if change.Words[0].Text != "Queen" || change.Words[1].Text != "silent." || change.Words[0].Stale {
		t.Fatalf("words = %+v", change.Words)
	}
	reopened := newService(t, project, &book)
	list, err := reopened.List("c-0001")
	if err != nil || strings.Join(keysOf(list.Words), ",") != "p-000001:5,p-000002:3" {
		t.Fatalf("list from a new service = %+v, %v", list, err)
	}
	if other, _ := reopened.List("c-0002"); len(other.Words) != 0 {
		t.Fatalf("another chapter's list = %+v", other)
	}
	removed, err := reopened.Unaccept("c-0001", []string{"p-000001:5"})
	if err != nil || strings.Join(removed.Changed, ",") != "p-000001:5" || strings.Join(keysOf(removed.Words), ",") != "p-000002:3" {
		t.Fatalf("unaccept = %+v, %v", removed, err)
	}
	if list, _ := newService(t, project, &book).List("c-0001"); strings.Join(keysOf(list.Words), ",") != "p-000002:3" {
		t.Fatalf("list after unaccept = %+v", list)
	}
}

// 2. accepting-twice-is-one
func TestAcceptingTwiceIsOne(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if _, err := service.Accept("c-0001", []string{"p-000001:0"}); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(AcceptedFile(project))
	again, err := service.Accept("c-0001", []string{"p-000001:0", "p-000001:0"})
	if err != nil {
		t.Fatal(err)
	}
	if len(again.Changed) != 0 || len(again.Words) != 1 {
		t.Fatalf("accepting again = %+v", again)
	}
	if after, _ := os.ReadFile(AcceptedFile(project)); string(after) != string(before) {
		t.Fatalf("accepting again rewrote the file:\n%s\n%s", before, after)
	}
	// One call with the same key twice records it once.
	both, err := service.Accept("c-0001", []string{"p-000002:1", "p-000002:1"})
	if err != nil || strings.Join(both.Changed, ",") != "p-000002:1" || len(both.Words) != 2 {
		t.Fatalf("a key twice in one call = %+v, %v", both, err)
	}
	// Unaccepting a key that is not accepted changes nothing.
	none, err := service.Unaccept("c-0001", []string{"p-000002:0"})
	if err != nil || len(none.Changed) != 0 || len(none.Words) != 2 {
		t.Fatalf("unaccepting a word that was not accepted = %+v, %v", none, err)
	}
}

// 3. key-is-validated-against-the-manuscript
func TestKeyIsValidatedAgainstTheManuscript(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	for _, tc := range []struct {
		chapter string
		keys    []string
		want    string
	}{
		{"c-0009", []string{"p-000001:0"}, "not in the manuscript"},
		{"c-0002", []string{"p-000001:0"}, "not in this chapter"},
		{"c-0001", []string{"p-000002:4"}, "past the end of its line"},
		{"c-0001", []string{"p-000002:-1"}, "not a word"},
		{"c-0001", []string{"p-000002:01"}, "not a word"},
		{"c-0001", []string{"p-000002"}, "not a word"},
		{"c-0001", []string{}, "choose a word"},
		// One bad key refuses the whole call: the good one is not saved either.
		{"c-0001", []string{"p-000001:0", "p-000001:99"}, "past the end of its line"},
	} {
		_, err := service.Accept(tc.chapter, tc.keys)
		if err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("accept %s %v = %v, want %q", tc.chapter, tc.keys, err, tc.want)
		}
	}
	if _, err := os.Stat(AcceptedFile(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused accept wrote the file: %v", err)
	}
	if _, err := service.Unaccept("c-0001", []string{"../x"}); err == nil {
		t.Fatal("an unaccept of a malformed key succeeded")
	}
}

// 4. word-text-travels-with-the-key-and-stale-is-reported
func TestWordTextTravelsWithTheKeyAndStaleIsReported(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	if _, err := service.Accept("c-0001", []string{"p-000002:1", "p-000001:5", "p-000002:3"}); err != nil {
		t.Fatal(err)
	}
	// The narrator re-imports without a reset: "soldiers" became "guards" (same ordinal, other text), the Queen's line is
	// gone, and the soldiers' line is now three words long, so ordinal 3 is past its end.
	book.Lines = []Line{{ChapterID: "c-0001", ID: "p-000002", Index: 0, Text: "The guards were"}}
	list, err := service.List("c-0001")
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Words) != 3 {
		t.Fatalf("list = %+v", list)
	}
	byKey := map[string]Accepted{}
	for _, word := range list.Words {
		byKey[word.Key] = word
	}
	if w := byKey["p-000002:1"]; !w.Stale || w.StaleReason != StaleTextChanged || w.Text != "soldiers" || w.Paragraph == nil {
		t.Fatalf("changed word = %+v", w)
	}
	if w := byKey["p-000002:3"]; !w.Stale || w.StaleReason != StaleWordMissing || w.Text != "silent." {
		t.Fatalf("word past the end = %+v", w)
	}
	if w := byKey["p-000001:5"]; !w.Stale || w.StaleReason != StaleParagraphMissing || w.Paragraph != nil {
		t.Fatalf("word whose line is gone = %+v", w)
	}
	// The one whose line is gone goes last.
	if list.Words[2].Key != "p-000001:5" {
		t.Fatalf("order = %v", keysOf(list.Words))
	}
	// Never moved to a neighbour: nothing at ordinal 0 or 2 reads accepted, and the stored text is not rewritten.
	for _, word := range list.Words {
		if !word.Stale {
			t.Fatalf("a changed word was applied: %+v", word)
		}
	}
	raw, _ := os.ReadFile(AcceptedFile(project))
	if !strings.Contains(string(raw), `"soldiers"`) || strings.Contains(string(raw), `"guards"`) {
		t.Fatalf("the stored text moved: %s", raw)
	}
	// Accepting the new word records it with its new text beside the stale record; unaccepting the stale one removes it.
	fresh, err := service.Accept("c-0001", []string{"p-000002:1"})
	if err != nil || len(fresh.Changed) != 1 {
		t.Fatalf("accepting the changed word again = %+v, %v", fresh, err)
	}
	for _, word := range fresh.Words {
		if word.Key == "p-000002:1" && (word.Stale || word.Text != "guards") {
			t.Fatalf("re-accepted word = %+v", word)
		}
	}
	gone, err := service.Unaccept("c-0001", []string{"p-000001:5"})
	if err != nil || strings.Join(gone.Changed, ",") != "p-000001:5" {
		t.Fatalf("unaccepting a stale word = %+v, %v", gone, err)
	}
}

// 5. file-is-narrator-data
func TestAcceptedFileIsNarratorData(t *testing.T) {
	book := aliceBook()
	t.Run("a corrupt file is kept aside and an empty list starts", func(t *testing.T) {
		project := t.TempDir()
		writeFile(t, AcceptedFile(project), "{not json")
		list, err := newService(t, project, &book).List("c-0001")
		if err != nil || len(list.Words) != 0 {
			t.Fatalf("list from a corrupt file = %+v, %v", list, err)
		}
		if kept, _ := filepath.Glob(AcceptedFile(project) + ".corrupt-*"); len(kept) != 1 {
			t.Fatalf("corrupt copies = %v", kept)
		}
	})
	t.Run("a file that breaks a rule is corrupt", func(t *testing.T) {
		project := t.TempDir()
		writeFile(t, AcceptedFile(project), `{"schemaVersion":1,"words":[{"chapterId":"c-0001","paragraphId":"p-000001","ordinal":-2,"text":"x","acceptedAt":"2026-10-11T10:00:00Z"}]}`)
		if list, err := newService(t, project, &book).List("c-0001"); err != nil || len(list.Words) != 0 {
			t.Fatalf("list = %+v, %v", list, err)
		}
		if kept, _ := filepath.Glob(AcceptedFile(project) + ".corrupt-*"); len(kept) != 1 {
			t.Fatalf("corrupt copies = %v", kept)
		}
	})
	t.Run("a file from a newer app is refused and never overwritten", func(t *testing.T) {
		project := t.TempDir()
		newer := `{"schemaVersion": 99, "words": []}`
		writeFile(t, AcceptedFile(project), newer)
		service := newService(t, project, &book)
		if _, err := service.List("c-0001"); err == nil || !strings.Contains(err.Error(), "newer version") {
			t.Fatalf("list of a newer file = %v", err)
		}
		if _, err := service.Accept("c-0001", []string{"p-000001:0"}); err == nil {
			t.Fatal("an accept over a newer file succeeded")
		}
		if _, err := service.Unaccept("c-0001", []string{"p-000001:0"}); err == nil {
			t.Fatal("an unaccept over a newer file succeeded")
		}
		if raw, _ := os.ReadFile(AcceptedFile(project)); string(raw) != newer {
			t.Fatalf("the newer file was overwritten: %s", raw)
		}
	})
	t.Run("a write goes through a temporary file and a rename", func(t *testing.T) {
		project := t.TempDir()
		if _, err := newService(t, project, &book).Accept("c-0001", []string{"p-000001:0"}); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(AcceptedFile(project) + ".tmp"); !os.IsNotExist(err) {
			t.Fatalf("the temporary file was left behind: %v", err)
		}
		raw, err := os.ReadFile(AcceptedFile(project))
		if err != nil || !strings.Contains(string(raw), `"schemaVersion": 1`) {
			t.Fatalf("file = %s, %v", raw, err)
		}
	})
	t.Run("the file sits in the project's editing folder", func(t *testing.T) {
		if want := filepath.Join("p", "narration-utils", "editing", "accepted.json"); AcceptedFile("p") != want {
			t.Fatalf("AcceptedFile = %s, want %s", AcceptedFile("p"), want)
		}
	})
}

// 10. no-sneaked-path: a key is a paragraph id and an ordinal, checked against the manuscript; a path-shaped one is unknown
// and nothing at that path is opened or written.
func TestPathShapedKeyIsRefusedAsUnknown(t *testing.T) {
	project := t.TempDir()
	book := aliceBook()
	service := newService(t, project, &book)
	outside := filepath.Join(filepath.Dir(project), "accepted-target")
	for _, key := range []string{"../../../etc/passwd:0", outside + ":0", "p-000001/../x:0"} {
		if _, err := service.Accept("c-0001", []string{key}); err == nil || !strings.Contains(err.Error(), "not in this chapter") {
			t.Errorf("accept %q = %v", key, err)
		}
	}
	if _, err := service.Accept("../../etc", []string{"p-000001:0"}); err == nil {
		t.Error("a path-shaped chapter id was accepted")
	}
	if _, err := os.Stat(outside); !os.IsNotExist(err) {
		t.Fatalf("a path-shaped key touched the file system: %v", err)
	}
	if _, err := os.Stat(AcceptedFile(project)); !os.IsNotExist(err) {
		t.Fatalf("a refused key wrote the file: %v", err)
	}
}

func TestNoProject(t *testing.T) {
	book := aliceBook()
	service := newService(t, "", &book)
	if list, err := service.List("c-0001"); err != nil || len(list.Words) != 0 || list.ChapterID != "c-0001" {
		t.Fatalf("list with no project = %+v, %v", list, err)
	}
	if _, err := service.Accept("c-0001", []string{"p-000001:0"}); err == nil {
		t.Fatal("an accept with no project succeeded")
	}
	if _, err := service.Unaccept("c-0001", []string{"p-000001:0"}); err == nil {
		t.Fatal("an unaccept with no project succeeded")
	}
}

func TestWordsOfSplitsOnWhitespace(t *testing.T) {
	if got := strings.Join(wordsOf("  “Off  with\ther head!”\n"), "|"); got != "“Off|with|her|head!”" {
		t.Fatalf("wordsOf = %s", got)
	}
}
