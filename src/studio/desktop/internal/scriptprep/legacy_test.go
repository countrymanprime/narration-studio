package scriptprep

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// legacyFile is a schema-1 script-prep.json as the app before #2595 wrote it: two chapter states, "knave" flagged twice (out of
// reading order) with a typed say-value, "the queen" flagged with a source's value, and "alice" flagged with no value.
const legacyFile = `{
  "schemaVersion": 1,
  "chapters": {"c-0001": "prepped", "credits:opening": "progress"},
  "flags": [
    {"id": "f3", "chapterId": "c-0002", "paragraphId": "p-000003", "start": 14, "end": 19, "quote": "knave", "word": "knave", "createdAt": "2026-10-01T10:00:00Z"},
    {"id": "f1", "chapterId": "c-0001", "paragraphId": "p-000002", "start": 4, "end": 9, "quote": "Knave", "word": "knave", "createdAt": "2026-10-01T11:00:00Z"},
    {"id": "f2", "chapterId": "c-0001", "paragraphId": "p-000001", "start": 21, "end": 30, "quote": "the Queen", "word": "the queen", "createdAt": "2026-10-01T09:00:00Z"},
    {"id": "f4", "chapterId": "c-0002", "paragraphId": "p-000003", "start": 0, "end": 5, "quote": "Alice", "word": "alice", "createdAt": "2026-10-01T09:00:00Z"}
  ],
  "says": {"knave": {"say": "NAYV", "source": "manual"}, "the queen": {"say": "kwiːn", "source": "cmu"}}
}`

func writeLegacy(t *testing.T, project, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(File(project)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(File(project), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

// A schema-1 file still reads its chapters, and gives its words for the migration: each key with its value and source and its flags
// in reading order, the words in reading order of their first flag.
func TestASchemaOneFileReadsItsChaptersAndItsWords(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	writeLegacy(t, project, legacyFile)
	list, err := svc.List()
	if err != nil {
		t.Fatal(err)
	}
	want := []Chapter{{"c-0001", PrepPrepped}, {"c-0002", PrepNone}, {CreditsOpening, PrepProgress}}
	if !reflect.DeepEqual(list.Chapters, want) {
		t.Fatalf("chapters = %+v", list.Chapters)
	}
	words, err := svc.LegacyWords()
	if err != nil {
		t.Fatal(err)
	}
	wantWords := []LegacyWord{
		{Word: "the queen", Say: "kwiːn", Source: "cmu", Flags: []LegacyFlag{{ChapterID: "c-0001", ParagraphID: "p-000001", Start: 21, End: 30, Quote: "the Queen"}}},
		{Word: "knave", Say: "NAYV", Source: "manual", Flags: []LegacyFlag{
			{ChapterID: "c-0001", ParagraphID: "p-000002", Start: 4, End: 9, Quote: "Knave"},
			{ChapterID: "c-0002", ParagraphID: "p-000003", Start: 14, End: 19, Quote: "knave"},
		}},
		{Word: "alice", Flags: []LegacyFlag{{ChapterID: "c-0002", ParagraphID: "p-000003", Start: 0, End: 5, Quote: "Alice"}}},
	}
	if !reflect.DeepEqual(words, wantWords) {
		t.Fatalf("words = %+v", words)
	}
}

// A flag whose line is gone sorts last, so the words still come back when the manuscript cannot be read.
func TestLegacyWordsWithoutAManuscript(t *testing.T) {
	project := t.TempDir()
	empty := Book{}
	writeLegacy(t, project, legacyFile)
	words, err := service(t, project, &empty).LegacyWords()
	if err != nil || len(words) != 3 {
		t.Fatalf("words = %+v, %v", words, err)
	}
}

// Until the migration has moved them, a chapter change on a schema-1 file keeps its words: nothing is lost before the backup.
func TestAChapterChangeOnASchemaOneFileKeepsItsWords(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	writeLegacy(t, project, legacyFile)
	if _, err := svc.SetChapter("c-0002", PrepProgress); err != nil {
		t.Fatal(err)
	}
	words, err := svc.LegacyWords()
	if err != nil || len(words) != 3 {
		t.Fatalf("words after a chapter change = %+v, %v", words, err)
	}
	list, _ := svc.List()
	if list.Chapters[1].State != PrepProgress {
		t.Fatalf("chapters = %+v", list.Chapters)
	}
}

// The migration's two file steps: the schema-1 file is copied to script-prep.v1.json once (an existing copy is never overwritten), then
// rewritten as schema 2 with its chapters and nothing else. Both are no-ops on a schema-2 file.
func TestFinishMigrationKeepsABackupAndWritesSchemaTwo(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	writeLegacy(t, project, legacyFile)
	if err := svc.Backup(); err != nil {
		t.Fatal(err)
	}
	if raw, _ := os.ReadFile(BackupFile(project)); string(raw) != legacyFile {
		t.Fatalf("backup = %s", raw)
	}
	if err := os.WriteFile(BackupFile(project), []byte("an earlier backup"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := svc.Backup(); err != nil {
		t.Fatal(err)
	}
	if raw, _ := os.ReadFile(BackupFile(project)); string(raw) != "an earlier backup" {
		t.Fatalf("an existing backup was overwritten: %s", raw)
	}
	if err := svc.FinishMigration(); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(File(project))
	if err != nil {
		t.Fatal(err)
	}
	var written map[string]any
	if err := json.Unmarshal(raw, &written); err != nil {
		t.Fatal(err)
	}
	wantFile := map[string]any{"schemaVersion": float64(2), "chapters": map[string]any{"c-0001": "prepped", "credits:opening": "progress"}}
	if !reflect.DeepEqual(written, wantFile) {
		t.Fatalf("schema 2 file = %s", raw)
	}
	if words, err := svc.LegacyWords(); err != nil || len(words) != 0 {
		t.Fatalf("words after the rewrite = %+v, %v", words, err)
	}
	before, _ := os.ReadFile(File(project))
	if err := svc.Backup(); err != nil {
		t.Fatal(err)
	}
	if err := svc.FinishMigration(); err != nil {
		t.Fatal(err)
	}
	if after, _ := os.ReadFile(File(project)); string(after) != string(before) {
		t.Fatalf("a second run changed the file: %s", after)
	}
	if raw, _ := os.ReadFile(BackupFile(project)); string(raw) != "an earlier backup" {
		t.Fatalf("a second run changed the backup: %s", raw)
	}
}

// A schema-2 file never takes words: one with flags or says breaks the file's rules and is kept aside like any corrupt file.
func TestASchemaTwoFileWithWordsIsKeptAside(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	writeLegacy(t, project, `{"schemaVersion":2,"chapters":{"c-0001":"prepped"},"says":{"x":{"say":"y","source":"manual"}}}`)
	if list, err := svc.List(); err != nil || list.Chapters[0].State != PrepNone {
		t.Fatalf("list = %+v, %v", list, err)
	}
	if aside, _ := filepath.Glob(File(project) + ".corrupt-*"); len(aside) != 1 {
		t.Fatalf("kept aside = %v", aside)
	}
}

// A schema-1 file whose words break the old rules is corrupt, as it was before: kept aside, never half-migrated.
func TestABrokenSchemaOneFileIsKeptAside(t *testing.T) {
	project := t.TempDir()
	current := book()
	svc := service(t, project, &current)
	writeLegacy(t, project, strings.Replace(legacyFile, `"word": "alice"`, `"word": "bob"`, 1))
	if words, err := svc.LegacyWords(); err != nil || len(words) != 0 {
		t.Fatalf("words = %+v, %v", words, err)
	}
	if aside, _ := filepath.Glob(File(project) + ".corrupt-*"); len(aside) != 1 {
		t.Fatalf("kept aside = %v", aside)
	}
}
