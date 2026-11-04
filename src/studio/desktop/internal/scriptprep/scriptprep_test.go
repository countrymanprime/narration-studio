package scriptprep

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/persist"
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

// The opening and closing credits are not manuscript chapters, but the Script page lists them with a prep state as the mock does: their
// two ids are kept like a chapter's, and listed after the chapters once one has been set.
func TestCreditsPrepState(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	for _, id := range []string{CreditsOpening, CreditsClosing} {
		chapter, err := svc.SetChapter(id, PrepProgress)
		if err != nil || chapter.ChapterID != id || chapter.State != PrepProgress {
			t.Fatalf("set %s = %+v, %v", id, chapter, err)
		}
	}
	if _, err := svc.SetChapter(CreditsClosing, PrepNone); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetChapter("credits:middle", PrepPrepped); err == nil {
		t.Fatal("an id that is neither a chapter nor the credits was saved")
	}
	list, err := service(t, project, &current).List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Chapters) != 3 || list.Chapters[2].ChapterID != CreditsOpening || list.Chapters[2].State != PrepProgress {
		t.Fatalf("chapters with the opening credits in progress = %+v", list.Chapters)
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

	newer := `{"schemaVersion":3,"chapters":{}}`
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
	if list, err := svc.List(); err != nil || list.Chapters[0].State != PrepNone {
		t.Fatalf("a file over the cap = %+v, %v", list, err)
	}
}

func TestNoProjectSavesNothing(t *testing.T) {
	current := book()
	svc := service(t, "", &current)
	if list, err := svc.List(); err != nil || len(list.Chapters) != 0 {
		t.Fatalf("list with no project = %+v, %v", list, err)
	}
	if _, err := svc.SetChapter("c-0001", PrepPrepped); err == nil {
		t.Fatal("a set with no project succeeded")
	}
	if words, err := svc.LegacyWords(); err != nil || len(words) != 0 {
		t.Fatalf("legacy words with no project = %+v, %v", words, err)
	}
	if err := svc.Backup(); err != nil {
		t.Fatal(err)
	}
	if err := svc.FinishMigration(); err != nil {
		t.Fatal(err)
	}
}
