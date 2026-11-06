package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/scriptprep"
	"desktop/internal/userdictionary"
)

// scriptWordsV1 is a schema-1 script-prep.json over bookmarksManuscript: "Queen" (an entry with no pronunciation yet), "head" (the empty
// alias of an entry), "Alice" (an entry with a value of its own), "hurt" (a locked entry), "Shouted" (no entry), and "silent" (no entry
// and no value).
const scriptWordsV1 = `{"schemaVersion":1,"chapters":{"c-0002":"prepped"},"flags":[
{"id":"f1","chapterId":"c-0001","paragraphId":"p-000001","start":25,"end":30,"quote":"Queen","word":"queen","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f2","chapterId":"c-0001","paragraphId":"p-000001","start":14,"end":18,"quote":"head","word":"head","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f3","chapterId":"c-0002","paragraphId":"p-000003","start":0,"end":5,"quote":"Alice","word":"alice","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f5","chapterId":"c-0001","paragraphId":"p-000001","start":31,"end":38,"quote":"Shouted","word":"shouted","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f6","chapterId":"c-0001","paragraphId":"p-000002","start":18,"end":24,"quote":"silent","word":"silent","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f7","chapterId":"c-0002","paragraphId":"p-000003","start":20,"end":24,"quote":"hurt","word":"hurt","createdAt":"2026-10-01T10:00:00Z"}
],"says":{
"queen":{"say":"kwiːn","source":"cmu"},
"head":{"say":"HED","source":"manual"},
"alice":{"say":"ælɪs","source":"cmu"},
"shouted":{"say":"SHOUT-id","source":"manual"},
"hurt":{"say":"HURT","source":"manual"}
}}`

const scriptWordsBibleV1 = `{"schema_version": 2, "entities": [
  {"id": "entity-queen", "canonical_name": "queen", "category": "Character", "pronunciation": {"ipa": "", "source": "not generated", "confidence": "unknown"}, "aliases": []},
  {"id": "entity-off", "canonical_name": "Off", "category": "Character", "pronunciation": {"ipa": "ɔf", "source": "cmu"}, "aliases": [{"text": "Head", "pronunciation": {}, "occurrences": []}]},
  {"id": "entity-alice", "canonical_name": "Alice", "category": "Character", "pronunciation": {"ipa": "AL-iss", "source": "manual", "chosen": true}, "aliases": []},
  {"id": "entity-hurt", "canonical_name": "Hurt", "category": "Character", "locked": true, "pronunciation": {"ipa": "", "source": "not generated"}, "aliases": []}
]}`

func storyBibleEntries(t *testing.T, project string) map[string]map[string]any {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"))
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		Entities []map[string]any `json:"entities"`
	}
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	byName := map[string]map[string]any{}
	for _, entity := range document.Entities {
		byName[entity["canonical_name"].(string)] = entity
	}
	return byName
}

// dictionaryWords is the user dictionary as word -> the say-values of its records, each "<source>:<say>".
func dictionaryWords(t *testing.T, project string) map[string][]string {
	t.Helper()
	list, err := userdictionary.New(userdictionary.Config{Project: project}).List()
	if err != nil {
		t.Fatal(err)
	}
	words := map[string][]string{}
	for _, entry := range list.Words {
		for _, record := range entry.Records {
			words[entry.Word] = append(words[entry.Word], record.Source+":"+record.Say)
		}
	}
	return words
}

func reopenProject(t *testing.T, host *Host, project string) {
	t.Helper()
	next := host.config
	next.projectFolder = project
	if attached, reason := host.attachProjectLocked(next); !attached {
		t.Fatalf("attach failed: %s", reason)
	}
}

// Opening a project whose script-prep.json is schema 1 keeps every Script value in the user dictionary as "Script (imported)" and fills
// the Story Bible names that had none, once: an entry is never made, a name's own value and a locked entry are left alone, a word with no
// value is dropped. The file is kept as script-prep.v1.json and rewritten as schema 2 with its chapters; a second open changes nothing.
func TestOpeningAProjectMovesTheScriptWordsIntoTheUserDictionary(t *testing.T) {
	host, project := bookmarksHost(t)
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	guidePath := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	writeNested(t, guidePath, scriptWordsBibleV1)
	reopenProject(t, host, project)

	entries := storyBibleEntries(t, project)
	if len(entries) != 4 {
		t.Fatalf("entries = %v, want the 4 there were", entries)
	}
	imported := func(say string) any {
		return map[string]any{"ipa": say, "source": "script_imported", "confidence": "narrator", "chosen": true}
	}
	for name, want := range map[string]any{
		"queen": imported("kwiːn"),
		"Alice": map[string]any{"ipa": "AL-iss", "source": "manual", "chosen": true},
		"Hurt":  map[string]any{"ipa": "", "source": "not generated"},
		"Off":   map[string]any{"ipa": "ɔf", "source": "cmu"},
	} {
		if got := entries[name]["pronunciation"]; !reflect.DeepEqual(got, want) {
			t.Errorf("%s: %v, want %v", name, got, want)
		}
	}
	if alias := entries["Off"]["aliases"].([]any)[0].(map[string]any)["pronunciation"]; !reflect.DeepEqual(alias, imported("HED")) {
		t.Errorf("alias Head: %v", alias)
	}
	want := map[string][]string{
		"Queen":   {"script_imported:kwiːn"},
		"head":    {"script_imported:HED"},
		"Alice":   {"script_imported:ælɪs"},
		"hurt":    {"script_imported:HURT"},
		"Shouted": {"script_imported:SHOUT-id"},
	}
	if got := dictionaryWords(t, project); !reflect.DeepEqual(got, want) {
		t.Fatalf("dictionary = %v, want %v", got, want)
	}

	if raw, _ := os.ReadFile(scriptprep.BackupFile(project)); string(raw) != scriptWordsV1 {
		t.Fatalf("backup = %s", raw)
	}
	written, _ := os.ReadFile(scriptprep.File(project))
	var v2 map[string]any
	if err := json.Unmarshal(written, &v2); err != nil || !reflect.DeepEqual(v2, map[string]any{"schemaVersion": float64(2), "chapters": map[string]any{"c-0002": "prepped"}}) {
		t.Fatalf("script-prep.json = %s", written)
	}
	if list := decodeScriptPrep(t)(host.ScriptPrepList()); list.Chapters[1].State != "prepped" {
		t.Fatalf("list = %+v", list)
	}
	logged, _ := os.ReadFile(host.log.Path())
	if !strings.Contains(string(logged), "script_words_migrated") || strings.Contains(string(logged), "SHOUT") || strings.Contains(string(logged), "Shouted") {
		t.Fatalf("host log = %s", logged)
	}

	bible, _ := os.ReadFile(guidePath)
	dictionary, _ := os.ReadFile(userdictionary.File(project))
	reopenProject(t, host, project)
	if again, _ := os.ReadFile(guidePath); string(again) != string(bible) {
		t.Fatal("a second open changed the Story Bible")
	}
	if again, _ := os.ReadFile(userdictionary.File(project)); string(again) != string(dictionary) {
		t.Fatal("a second open changed the user dictionary")
	}
	if again, _ := os.ReadFile(scriptprep.File(project)); string(again) != string(written) {
		t.Fatal("a second open changed script-prep.json")
	}
}

// Running the import over the same words again (a run cut short before its backup) adds no record and changes no name: the dictionary
// keeps one Script record per value, and a filled name now has a value of its own.
func TestReimportingTheSameWordsChangesNothing(t *testing.T) {
	host, project := bookmarksHost(t)
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	guidePath := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	writeNested(t, guidePath, scriptWordsBibleV1)
	reopenProject(t, host, project)
	bible, _ := os.ReadFile(guidePath)
	dictionary, _ := os.ReadFile(userdictionary.File(project))
	// The backup is gone, as if the first run stopped before it: the words are imported again.
	for _, backup := range must(scriptprep.BackupFiles(project)) {
		_ = os.Remove(backup)
	}
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	reopenProject(t, host, project)
	if again, _ := os.ReadFile(guidePath); string(again) != string(bible) {
		t.Fatalf("the second import changed the Story Bible:\n%s", again)
	}
	if again, _ := os.ReadFile(userdictionary.File(project)); string(again) != string(dictionary) {
		t.Fatalf("the second import changed the user dictionary:\n%s", again)
	}
}

func must[T any](value T, err error) T {
	if err != nil {
		panic(err)
	}
	return value
}

// A crash after the import and before script-prep.json was rewritten leaves a schema-1 file and a backup: the next open imports
// nothing, keeps the first backup, and finishes the rewrite.
func TestAMigrationCutShortFinishesOnTheNextOpen(t *testing.T) {
	host, project := bookmarksHost(t)
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	writeNested(t, filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"), scriptWordsBibleV1)
	reopenProject(t, host, project)
	bible, _ := os.ReadFile(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"))
	// The crash: the schema-1 file is back, the backup is the first one.
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	reopenProject(t, host, project)
	if again, _ := os.ReadFile(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")); string(again) != string(bible) {
		t.Fatalf("the second run changed the Story Bible:\n%s", again)
	}
	if words, _ := host.scriptPrep().LegacyWords(); len(words) != 0 {
		t.Fatalf("the rewrite was not finished: %d words", len(words))
	}
}

// A run whose rewrite failed leaves the schema-1 file and its backup. If the narrator removes an imported value from the dictionary, or
// clears a filled name, before the next open, that open must not bring them back: the words in the backup were imported already, so only
// the rewrite is retried.
func TestARetriedMigrationDoesNotImportTheWordsAgain(t *testing.T) {
	host, project := bookmarksHost(t)
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	guidePath := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	writeNested(t, guidePath, scriptWordsBibleV1)
	reopenProject(t, host, project)
	// The rewrite failed: the schema-1 file is still there, beside the backup the run made.
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	bible, _ := os.ReadFile(guidePath)
	edited := strings.Replace(string(bible), "kwiːn", "", 1)
	if edited == string(bible) {
		t.Fatal("the migrated value is not in the Story Bible")
	}
	writeNested(t, guidePath, edited)
	if _, err := userdictionary.New(userdictionary.Config{Project: project}).Remove("Shouted", userdictionary.SourceScript, "SHOUT-id"); err != nil {
		t.Fatal(err)
	}
	reopenProject(t, host, project)
	if again, _ := os.ReadFile(guidePath); string(again) != edited {
		t.Fatalf("the retry changed the Story Bible:\n%s", again)
	}
	if _, ok := dictionaryWords(t, project)["Shouted"]; ok {
		t.Fatal("the retry brought a removed dictionary value back")
	}
	if words, _ := host.scriptPrep().LegacyWords(); len(words) != 0 {
		t.Fatalf("the rewrite was not finished: %d words", len(words))
	}
	if backups, _ := scriptprep.BackupFiles(project); len(backups) != 1 {
		t.Fatalf("backups = %v", backups)
	}
}

// A schema-1 file from a later cycle (other bytes than the backup an earlier migration kept) is imported, backed up beside the earlier
// backup and rewritten.
func TestALaterSchemaOneFileIsMigratedWithItsOwnBackup(t *testing.T) {
	host, project := bookmarksHost(t)
	writeNested(t, scriptprep.BackupFile(project), `{"schemaVersion":1,"chapters":{},"flags":[],"says":{}}`)
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	reopenProject(t, host, project)
	if words := dictionaryWords(t, project); len(words) != 5 {
		t.Fatalf("dictionary = %v", words)
	}
	if raw, _ := os.ReadFile(filepath.Join(filepath.Dir(scriptprep.BackupFile(project)), "script-prep.v1-2.json")); string(raw) != scriptWordsV1 {
		t.Fatalf("second backup = %s", raw)
	}
	if words, _ := host.scriptPrep().LegacyWords(); len(words) != 0 {
		t.Fatalf("the rewrite was not finished: %d words", len(words))
	}
}

// A project with no Story Bible gets none: every word with a value goes to the user dictionary only.
func TestTheMigrationStartsNoStoryBible(t *testing.T) {
	host, project := bookmarksHost(t)
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	reopenProject(t, host, project)
	if _, err := os.Stat(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")); !os.IsNotExist(err) {
		t.Fatalf("a Story Bible was started: %v", err)
	}
	if words := dictionaryWords(t, project); len(words) != 5 || words["silent"] != nil {
		t.Fatalf("dictionary = %v", words)
	}
	if _, err := os.Stat(scriptprep.BackupFile(project)); err != nil {
		t.Fatal(err)
	}
}

// One word the dictionary cannot take (a quote spanning a soft line break, a control character) never blocks the others: a spelling with
// white space inside is kept with single spaces, a word that still breaks the dictionary's rules is counted as refused and left in the
// backup, and the migration finishes on the first open (QA #2595: one odd quote kept every open failing).
func TestABadWordDoesNotBlockTheOthers(t *testing.T) {
	host, project := bookmarksHost(t)
	writeNested(t, scriptprep.File(project), `{"schemaVersion":1,"chapters":{},"flags":[
{"id":"f1","chapterId":"c-0001","paragraphId":"p-000001","start":31,"end":38,"quote":"Shouted","word":"shouted","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f2","chapterId":"c-0001","paragraphId":"p-000001","start":0,"end":9,"quote":"soft\tbreak","word":"soft\tbreak","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f3","chapterId":"c-0001","paragraphId":"p-000002","start":0,"end":4,"quote":"bad\u0007","word":"bad\u0007","createdAt":"2026-10-01T10:00:00Z"}
],"says":{"shouted":{"say":"SHOUT-id","source":"manual"},"soft\tbreak":{"say":"SOFT brayk","source":"manual"},"bad\u0007":{"say":"BAD","source":"manual"}}}`)
	reopenProject(t, host, project)

	words := dictionaryWords(t, project)
	if got := words["Shouted"]; len(got) != 1 || got[0] != "script_imported:SHOUT-id" {
		t.Fatalf("Shouted = %v (dictionary %v)", got, words)
	}
	if got := words["soft break"]; len(got) != 1 || got[0] != "script_imported:SOFT brayk" {
		t.Fatalf("soft break = %v (dictionary %v)", got, words)
	}
	if len(words) != 2 {
		t.Fatalf("dictionary = %v, want the two words it can take", words)
	}
	left, err := scriptprep.New(scriptprep.Config{Project: project}).LegacyWords()
	if err != nil || len(left) != 0 {
		t.Fatalf("legacy words left = %v, %v: the migration did not finish", left, err)
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(scriptprep.File(project)), "script-prep.v1.json")); err != nil {
		t.Fatalf("no backup: %v", err)
	}
}
