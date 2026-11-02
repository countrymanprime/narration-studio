package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/brand"
	"desktop/internal/scriptprep"
)

// scriptWordsV1 is a schema-1 script-prep.json over bookmarksManuscript: "Queen" (an entry with no pronunciation yet), "head" (the
// alias of an entry), "Alice" (an entry typed another way: the Script value from a source becomes its alternate), "soldiers" (an entry
// with its own value and alternate: the Script value goes in its note), "shouted" (no entry: a Word entry is made, named as flagged),
// "silent" (no entry and no value), and "hurt" (a locked entry).
const scriptWordsV1 = `{"schemaVersion":1,"chapters":{"c-0002":"prepped"},"flags":[
{"id":"f1","chapterId":"c-0001","paragraphId":"p-000001","start":25,"end":30,"quote":"Queen","word":"queen","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f2","chapterId":"c-0001","paragraphId":"p-000001","start":14,"end":18,"quote":"head","word":"head","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f3","chapterId":"c-0002","paragraphId":"p-000003","start":0,"end":5,"quote":"Alice","word":"alice","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f4","chapterId":"c-0001","paragraphId":"p-000002","start":4,"end":12,"quote":"soldiers","word":"soldiers","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f5","chapterId":"c-0001","paragraphId":"p-000001","start":31,"end":38,"quote":"Shouted","word":"shouted","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f6","chapterId":"c-0001","paragraphId":"p-000002","start":18,"end":24,"quote":"silent","word":"silent","createdAt":"2026-10-01T10:00:00Z"},
{"id":"f7","chapterId":"c-0002","paragraphId":"p-000003","start":20,"end":24,"quote":"hurt","word":"hurt","createdAt":"2026-10-01T10:00:00Z"}
],"says":{
"queen":{"say":"kwiːn","source":"cmu"},
"head":{"say":"HED","source":"manual"},
"alice":{"say":"ælɪs","source":"cmu"},
"soldiers":{"say":"SOLE-jers","source":"manual"},
"shouted":{"say":"SHOUT-id","source":"manual"},
"hurt":{"say":"HURT","source":"manual"}
}}`

const scriptWordsBibleV1 = `{"schema_version": 2, "entities": [
  {"id": "entity-queen", "canonical_name": "queen", "category": "Character", "pronunciation": {"ipa": "", "source": "not generated", "confidence": "unknown"}, "aliases": []},
  {"id": "entity-off", "canonical_name": "Off", "category": "Character", "pronunciation": {"ipa": "ɔf", "source": "cmu"}, "aliases": [{"text": "Head", "pronunciation": {}, "occurrences": []}]},
  {"id": "entity-alice", "canonical_name": "Alice", "category": "Character", "pronunciation": {"ipa": "AL-iss", "source": "manual", "chosen": true}, "aliases": []},
  {"id": "entity-soldiers", "canonical_name": "Soldiers", "category": "Character", "pronunciation": {"ipa": "soʊlʤɚz", "source": "cmu", "alternate": {"ipa": "SOLD-yers", "source": "manual"}}, "aliases": []},
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

// Opening a project whose script-prep.json is schema 1 moves its words into the Story Bible once: the file is kept as
// script-prep.v1.json, rewritten as schema 2 with its chapters, and a second open changes nothing.
func TestOpeningAProjectMovesTheScriptWordsIntoTheStoryBible(t *testing.T) {
	host, project := bookmarksHost(t)
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	writeNested(t, filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"), scriptWordsBibleV1)
	reopen := func() {
		t.Helper()
		next := host.config
		next.projectFolder = project
		if attached, reason := host.attachProjectLocked(next); !attached {
			t.Fatalf("attach failed: %s", reason)
		}
	}
	reopen()

	entries := storyBibleEntries(t, project)
	for name, want := range map[string]any{
		"queen":    map[string]any{"ipa": "kwiːn", "source": "cmu", "chosen": true},
		"Alice":    map[string]any{"ipa": "AL-iss", "source": "manual", "chosen": true, "alternate": map[string]any{"ipa": "ælɪs", "source": "cmu"}},
		"Soldiers": map[string]any{"ipa": "soʊlʤɚz", "source": "cmu", "note": "Script page: SOLE-jers (manual)", "alternate": map[string]any{"ipa": "SOLD-yers", "source": "manual"}},
		"Hurt":     map[string]any{"ipa": "", "source": "not generated"},
		"Shouted":  map[string]any{"ipa": "SHOUT-id", "source": "manual", "chosen": true},
		"silent":   map[string]any{"ipa": "", "source": "not generated", "confidence": "unknown"},
	} {
		entry, ok := entries[name]
		if !ok {
			t.Errorf("no entry %q", name)
			continue
		}
		if got := entry["pronunciation"]; !reflect.DeepEqual(got, want) {
			t.Errorf("%s: %v, want %v", name, got, want)
		}
	}
	if alias := entries["Off"]["aliases"].([]any)[0].(map[string]any)["pronunciation"]; !reflect.DeepEqual(alias, map[string]any{"ipa": "HED", "source": "manual", "chosen": true}) {
		t.Errorf("alias Head: %v", alias)
	}
	if shouted := entries["Shouted"]; shouted["category"] != "Word" || shouted["manual"] != true || len(entries) != 7 {
		t.Errorf("made %d entries; Shouted = %v", len(entries), shouted)
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

	bible, _ := os.ReadFile(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"))
	reopen()
	if again, _ := os.ReadFile(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")); string(again) != string(bible) {
		t.Fatal("a second open changed the Story Bible")
	}
	if again, _ := os.ReadFile(scriptprep.File(project)); string(again) != string(written) {
		t.Fatal("a second open changed script-prep.json")
	}
}

// A crash after the Story Bible was written and before script-prep.json was rewritten leaves a schema-1 file and a backup: the next open
// adds nothing to the Story Bible, keeps the first backup, and finishes the rewrite.
func TestAMigrationCutShortFinishesOnTheNextOpen(t *testing.T) {
	host, project := bookmarksHost(t)
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	writeNested(t, filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"), scriptWordsBibleV1)
	next := host.config
	next.projectFolder = project
	host.attachProjectLocked(next)
	bible, _ := os.ReadFile(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"))
	// The crash: the schema-1 file is back, the backup is the first one.
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	host.attachProjectLocked(next)
	if again, _ := os.ReadFile(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")); string(again) != string(bible) {
		t.Fatalf("the second run changed the Story Bible:\n%s", again)
	}
	if words, _ := host.scriptPrep().LegacyWords(); len(words) != 0 {
		t.Fatalf("the rewrite was not finished: %d words", len(words))
	}
}

// A run whose rewrite failed leaves the schema-1 file and its backup. If the narrator changes a migrated name's pronunciation before
// the next open, that open must not bring the old Script value back as the name's alternate or note: the words in the backup were
// imported already, so only the rewrite is retried.
func TestARetriedMigrationDoesNotImportTheWordsAgain(t *testing.T) {
	host, project := bookmarksHost(t)
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	writeNested(t, filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"), scriptWordsBibleV1)
	next := host.config
	next.projectFolder = project
	host.attachProjectLocked(next)
	// The rewrite failed: the schema-1 file is still there, beside the backup the run made.
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	guidePath := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	bible, _ := os.ReadFile(guidePath)
	edited := strings.Replace(string(bible), "kwiːn", "KWEEN", 1)
	if edited == string(bible) {
		t.Fatal("the migrated value is not in the Story Bible")
	}
	writeNested(t, guidePath, edited)
	host.attachProjectLocked(next)
	if again, _ := os.ReadFile(guidePath); string(again) != edited {
		t.Fatalf("the retry changed the Story Bible:\n%s", again)
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
	next := host.config
	next.projectFolder = project
	host.attachProjectLocked(next)
	if entries := storyBibleEntries(t, project); len(entries) != 7 {
		t.Fatalf("entries = %v", entries)
	}
	if raw, _ := os.ReadFile(filepath.Join(filepath.Dir(scriptprep.BackupFile(project)), "script-prep.v1-2.json")); string(raw) != scriptWordsV1 {
		t.Fatalf("second backup = %s", raw)
	}
	if words, _ := host.scriptPrep().LegacyWords(); len(words) != 0 {
		t.Fatalf("the rewrite was not finished: %d words", len(words))
	}
}

// A project with no Story Bible yet gets one with a Word entry per word, as a create would start it; a project with no script prep
// file, or a schema-2 one, is left as it is.
func TestTheMigrationStartsAStoryBible(t *testing.T) {
	host, project := bookmarksHost(t)
	writeNested(t, scriptprep.File(project), scriptWordsV1)
	next := host.config
	next.projectFolder = project
	host.attachProjectLocked(next)
	entries := storyBibleEntries(t, project)
	if len(entries) != 7 || entries["Queen"]["category"] != "Word" {
		t.Fatalf("entries = %v", entries)
	}
	if _, err := os.Stat(filepath.Join(project, brand.ProjectFolder, "script-prep.v1.json")); err != nil {
		t.Fatal(err)
	}
}
