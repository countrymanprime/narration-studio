package userdictionary

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"desktop/internal/brand"
	"desktop/internal/persist"
)

var testNow = time.Date(2026, 11, 3, 10, 0, 0, 0, time.UTC)

func service(project string) *Service {
	return New(Config{Project: project, Reporter: &persist.Reporter{}, Now: func() time.Time { return testNow }})
}

func TestFileSitsBesideTheScriptPrepFile(t *testing.T) {
	if got, want := File("/p"), filepath.Join("/p", brand.ProjectFolder, "user-dictionary.json"); got != want {
		t.Fatalf("File = %q, want %q", got, want)
	}
}

// Save keeps one record of the narrator's own for a word, replacing the earlier one; an imported Script value beside it is untouched.
func TestSaveReplacesTheNarratorsOwnRecordOnly(t *testing.T) {
	project := t.TempDir()
	dictionary := service(project)
	if added, err := dictionary.Import("Tulgey", "TUL-gee"); err != nil || !added {
		t.Fatalf("import = %v, %v", added, err)
	}
	if _, err := dictionary.Save("tulgey", "TULL-jee"); err != nil {
		t.Fatal(err)
	}
	entry, err := dictionary.Save("  TULGEY ", " TOOL-gay ")
	if err != nil {
		t.Fatal(err)
	}
	want := Entry{Word: "Tulgey", Records: []Record{
		{Say: "TUL-gee", Source: SourceScript, AddedAt: testNow},
		{Say: "TOOL-gay", Source: SourceUser, AddedAt: testNow},
	}}
	if !reflect.DeepEqual(entry, want) {
		t.Fatalf("entry = %+v, want %+v", entry, want)
	}
	records, err := service(project).Records("tulgey")
	if err != nil || !reflect.DeepEqual(records, want.Records) {
		t.Fatalf("records = %+v, %v", records, err)
	}
	list, err := service(project).List()
	if err != nil || !reflect.DeepEqual(list, Words{Words: []Entry{want}}) {
		t.Fatalf("list = %+v, %v", list, err)
	}
}

// Words fold as Story Bible names do: case-folded with surrounding space dropped, so "STRASSE" and "straße" are one word.
func TestWordsFoldLikeStoryBibleNames(t *testing.T) {
	dictionary := service(t.TempDir())
	if _, err := dictionary.Save("straße", "SHTRAH-seh"); err != nil {
		t.Fatal(err)
	}
	records, err := dictionary.Records(" STRASSE ")
	if err != nil || len(records) != 1 || records[0].Say != "SHTRAH-seh" {
		t.Fatalf("records = %+v, %v", records, err)
	}
	for _, word := range []string{"日本", "שלום", "🦊"} {
		if _, err := dictionary.Save(word, "x "+word); err != nil {
			t.Fatal(err)
		}
	}
	list, _ := dictionary.List()
	if len(list.Words) != 4 {
		t.Fatalf("list = %+v", list)
	}
}

// Import adds a Script value once: a second identical one is no change.
func TestImportDeduplicates(t *testing.T) {
	dictionary := service(t.TempDir())
	for i, want := range []bool{true, false} {
		added, err := dictionary.Import("Jabberwock", "JAB-er-wok")
		if err != nil || added != want {
			t.Fatalf("import %d = %v, %v", i, added, err)
		}
	}
	if added, _ := dictionary.Import("jabberwock", "JAB-ur-wok"); !added {
		t.Fatal("a second Script value was not added")
	}
	records, _ := dictionary.Records("Jabberwock")
	if len(records) != 2 {
		t.Fatalf("records = %+v", records)
	}
}

// Remove takes one record away; the word goes with its last one.
func TestRemoveTakesOneRecordAndTheWordWithItsLast(t *testing.T) {
	project := t.TempDir()
	dictionary := service(project)
	_, _ = dictionary.Import("Bandersnatch", "BAN-der")
	_, _ = dictionary.Save("Bandersnatch", "BAND-snatch")
	if _, err := dictionary.Remove("Bandersnatch", SourceUser, "BAN-der"); err == nil {
		t.Fatal("a record that is not there was removed")
	}
	if _, err := dictionary.Remove("Bandersnatch", "cmu", "BAN-der"); err == nil {
		t.Fatal("a source that is not the dictionary's was taken")
	}
	entry, err := dictionary.Remove("bandersnatch", SourceScript, "BAN-der")
	if err != nil || len(entry.Records) != 1 || entry.Records[0].Source != SourceUser {
		t.Fatalf("entry = %+v, %v", entry, err)
	}
	entry, err = dictionary.Remove("Bandersnatch", SourceUser, "BAND-snatch")
	if err != nil || entry.Word != "Bandersnatch" || entry.Records == nil || len(entry.Records) != 0 {
		t.Fatalf("entry = %+v, %v", entry, err)
	}
	if list, _ := dictionary.List(); len(list.Words) != 0 || list.Words == nil {
		t.Fatalf("list = %+v", list)
	}
	if _, err := dictionary.Remove("Bandersnatch", SourceUser, "BAND-snatch"); err == nil {
		t.Fatal("a word that is not there was removed")
	}
}

func TestWordAndSayLimits(t *testing.T) {
	dictionary := service(t.TempDir())
	refused := map[string][2]string{
		"empty word":        {"  ", "x"},
		"empty say":         {"word", " "},
		"long word":         {strings.Repeat("a", MaxWordUnits+1), "x"},
		"long emoji word":   {strings.Repeat("🦊", MaxWordUnits/2+1), "x"},
		"long say":          {"word", strings.Repeat("a", MaxSayUnits+1)},
		"two-line word":     {"one\ntwo", "x"},
		"two-line say":      {"word", "one\ntwo"},
		"control character": {"word", "a\x07b"},
	}
	for name, args := range refused {
		if _, err := dictionary.Save(args[0], args[1]); err == nil {
			t.Errorf("%s was saved", name)
		}
		if _, err := dictionary.Import(args[0], args[1]); err == nil {
			t.Errorf("%s was imported", name)
		}
	}
	if _, err := dictionary.Save(strings.Repeat("a", MaxWordUnits), strings.Repeat("b", MaxSayUnits)); err != nil {
		t.Fatalf("the longest word and say = %v", err)
	}
}

func TestTheFileIsSchemaOne(t *testing.T) {
	project := t.TempDir()
	if _, err := service(project).Save("Tulgey", "TUL-gee"); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(File(project))
	if err != nil {
		t.Fatal(err)
	}
	var file map[string]any
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"schemaVersion": float64(1), "words": map[string]any{"tulgey": map[string]any{"word": "Tulgey", "records": []any{
		map[string]any{"say": "TUL-gee", "source": "user_dictionary", "addedAt": "2026-11-03T10:00:00Z"},
	}}}}
	if !reflect.DeepEqual(file, want) {
		t.Fatalf("file = %s", raw)
	}
}

// The file is narrator data: a corrupt one, or one that breaks a rule, is kept aside and a fresh one started; one from a newer app is
// refused and never overwritten.
func TestFileIsNarratorData(t *testing.T) {
	broken := map[string]string{
		"not json":          `{`,
		"key not the fold":  `{"schemaVersion":1,"words":{"x":{"word":"Tulgey","records":[{"say":"a","source":"user_dictionary","addedAt":"2026-11-03T10:00:00Z"}]}}}`,
		"no records":        `{"schemaVersion":1,"words":{"tulgey":{"word":"Tulgey","records":[]}}}`,
		"unknown source":    `{"schemaVersion":1,"words":{"tulgey":{"word":"Tulgey","records":[{"say":"a","source":"cmu","addedAt":"2026-11-03T10:00:00Z"}]}}}`,
		"two user records":  `{"schemaVersion":1,"words":{"tulgey":{"word":"Tulgey","records":[{"say":"a","source":"user_dictionary","addedAt":"2026-11-03T10:00:00Z"},{"say":"b","source":"user_dictionary","addedAt":"2026-11-03T10:00:00Z"}]}}}`,
		"two-line say":      `{"schemaVersion":1,"words":{"tulgey":{"word":"Tulgey","records":[{"say":"a\nb","source":"user_dictionary","addedAt":"2026-11-03T10:00:00Z"}]}}}`,
		"untrimmed say":     `{"schemaVersion":1,"words":{"tulgey":{"word":"Tulgey","records":[{"say":" a","source":"user_dictionary","addedAt":"2026-11-03T10:00:00Z"}]}}}`,
		"no schema version": `{"words":{}}`,
	}
	for name, content := range broken {
		project := t.TempDir()
		path := File(project)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		list, err := service(project).List()
		if err != nil || len(list.Words) != 0 {
			t.Errorf("%s: list = %+v, %v", name, list, err)
		}
		kept, _ := filepath.Glob(path + ".corrupt-*")
		if len(kept) != 1 {
			t.Errorf("%s: kept aside = %v", name, kept)
		}
	}
	project := t.TempDir()
	path := File(project)
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	newer := `{"schemaVersion":2,"words":{}}`
	_ = os.WriteFile(path, []byte(newer), 0o600)
	if _, err := service(project).List(); err == nil || !strings.Contains(err.Error(), "newer version") {
		t.Fatalf("a newer file = %v", err)
	}
	if _, err := service(project).Save("Tulgey", "a"); err == nil {
		t.Fatal("a newer file was overwritten")
	}
	if raw, _ := os.ReadFile(path); string(raw) != newer {
		t.Fatalf("the newer file = %s", raw)
	}
}

func TestNoProjectSavesNothing(t *testing.T) {
	dictionary := service("")
	if list, err := dictionary.List(); err != nil || len(list.Words) != 0 || list.Words == nil {
		t.Fatalf("list = %+v, %v", list, err)
	}
	if records, err := dictionary.Records("x"); err != nil || len(records) != 0 {
		t.Fatalf("records = %+v, %v", records, err)
	}
	if _, err := dictionary.Save("x", "y"); err == nil {
		t.Fatal("saved without a project")
	}
	if _, err := dictionary.Import("x", "y"); err == nil {
		t.Fatal("imported without a project")
	}
}

func TestLabels(t *testing.T) {
	if Label(SourceUser) != "My dictionary" || Label(SourceScript) != "Script (imported)" || Label("cmu") != "" {
		t.Fatal("labels")
	}
}
