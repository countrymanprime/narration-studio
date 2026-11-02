package guide

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// scriptWordsBible holds one entry for each branch of the import: a name with nothing set, a name set the same, a typed name whose
// value differs and has no alternate (the Script value becomes the alternate), a source's name whose value differs and already has an
// alternate (it goes in the note), an alias, and a locked entry.
const scriptWordsBible = `{"schema_version": 2, "entities": [
  {"id": "e-empty", "canonical_name": "Knave", "category": "Character", "pronunciation": {"ipa": "", "source": "not generated", "confidence": "unknown", "note": "Ask."}, "aliases": []},
  {"id": "e-same", "canonical_name": "Dodo", "category": "Character", "pronunciation": {"ipa": "doʊdoʊ", "source": "cmu", "chosen": true}, "aliases": []},
  {"id": "e-alternate", "canonical_name": "Queen", "category": "Character", "pronunciation": {"ipa": "KWEEN", "source": "manual", "confidence": "narrator", "chosen": true}, "aliases": []},
  {"id": "e-note", "canonical_name": "Hatter", "category": "Character", "pronunciation": {"ipa": "hætɚ", "source": "cmu", "note": "Mad.", "alternate": {"ipa": "HAT-er", "source": "manual"}}, "aliases": []},
  {"id": "e-alias", "canonical_name": "Cheshire Cat", "category": "Character", "pronunciation": {"ipa": "x", "source": "cmu"}, "aliases": [{"text": " Cheshire ", "pronunciation": {}, "occurrences": []}]},
  {"id": "e-locked", "canonical_name": "Duchess", "category": "Character", "locked": true, "pronunciation": {"ipa": "", "source": "not generated"}, "aliases": []}
], "types": [{"name": "Character", "colour": "green", "speaks": true, "builtin": "Character"}]}`

var scriptWords = []ScriptWord{
	{Word: "knave", Name: "Knave", Say: "NAYV", Source: "manual"},
	{Word: "dodo", Name: "dodo", Say: "doʊdoʊ", Source: "cmu"},
	{Word: "queen", Name: "Queen", Say: "kwiːn", Source: "cmu"},
	{Word: "hatter", Name: "Hatter", Say: "HATTER", Source: "manual"},
	{Word: "cheshire", Name: "CHESHIRE", Say: "ʧɛʃɚ", Source: "espeak"},
	{Word: "duchess", Name: "Duchess", Say: "DUTCH-ess", Source: "manual"},
	{Word: "tulgey", Name: "Tulgey", Say: "TUL-gee", Source: "manual"},
	{Word: "frabjous", Name: "Frabjous", Say: "", Source: ""},
}

func readBible(t *testing.T, s *Service) map[string]any {
	t.Helper()
	raw, err := os.ReadFile(s.guidePath())
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	return document
}

func namedEntry(t *testing.T, document map[string]any, name string) map[string]any {
	t.Helper()
	for _, raw := range document["entities"].([]any) {
		if entity := raw.(map[string]any); entity["canonical_name"] == name {
			return entity
		}
	}
	t.Fatalf("no entry %q", name)
	return nil
}

func TestImportScriptWords(t *testing.T) {
	s, _ := createService(t)
	if err := os.WriteFile(s.guidePath(), []byte(scriptWordsBible), 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := s.ImportScriptWords(scriptWords)
	if err != nil {
		t.Fatal(err)
	}
	if want := (ScriptWordImport{Filled: 2, Same: 1, Alternates: 1, Notes: 1, Created: 2, Locked: 1}); result != want {
		t.Fatalf("result = %+v, want %+v", result, want)
	}
	document := readBible(t, s)
	pronunciation := func(name string) any { return namedEntry(t, document, name)["pronunciation"] }
	for name, want := range map[string]any{
		"Knave":   map[string]any{"ipa": "NAYV", "source": "manual", "chosen": true, "note": "Ask."},
		"Dodo":    map[string]any{"ipa": "doʊdoʊ", "source": "cmu", "chosen": true},
		"Queen":   map[string]any{"ipa": "KWEEN", "source": "manual", "confidence": "narrator", "chosen": true, "alternate": map[string]any{"ipa": "kwiːn", "source": "cmu"}},
		"Hatter":  map[string]any{"ipa": "hætɚ", "source": "cmu", "note": "Mad.\nScript page: HATTER (manual)", "alternate": map[string]any{"ipa": "HAT-er", "source": "manual"}},
		"Duchess": map[string]any{"ipa": "", "source": "not generated"},
		"Tulgey":  map[string]any{"ipa": "TUL-gee", "source": "manual", "chosen": true},
		// A word flagged with no value is an entry with nothing generated: the migration asks no source.
		"Frabjous": map[string]any{"ipa": "", "source": "not generated", "confidence": "unknown"},
	} {
		if got := pronunciation(name); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: %v, want %v", name, got, want)
		}
	}
	alias := namedEntry(t, document, "Cheshire Cat")["aliases"].([]any)[0].(map[string]any)["pronunciation"]
	if want := map[string]any{"ipa": "ʧɛʃɚ", "source": "espeak", "chosen": true}; !reflect.DeepEqual(alias, want) {
		t.Errorf("alias: %v", alias)
	}
	tulgey := namedEntry(t, document, "Tulgey")
	if tulgey["category"] != "Word" || tulgey["manual"] != true || tulgey["id"] != entityID("Tulgey") || len(tulgey["occurrences"].([]any)) != 1 {
		t.Errorf("created entry = %v", tulgey)
	}
	types, _ := s.Types()
	if len(types) != 2 || types[1].Name != "Word" {
		t.Errorf("types = %+v", types)
	}

	before, _ := os.ReadFile(s.guidePath())
	again, err := s.ImportScriptWords(scriptWords)
	if err != nil {
		t.Fatal(err)
	}
	if again.Filled+again.Alternates+again.Notes+again.Created != 0 {
		t.Errorf("a second import changed something: %+v", again)
	}
	if after, _ := os.ReadFile(s.guidePath()); string(after) != string(before) {
		t.Fatal("a second import wrote the file")
	}
}

// A project with no Story Bible yet gets one, as a create would start it.
func TestImportScriptWordsStartsAStoryBible(t *testing.T) {
	s, _ := createService(t)
	if err := os.RemoveAll(filepath.Dir(s.guidePath())); err != nil {
		t.Fatal(err)
	}
	result, err := s.ImportScriptWords([]ScriptWord{{Word: "tulgey", Name: "Tulgey", Say: "TUL-gee", Source: "manual"}})
	if err != nil || result.Created != 1 {
		t.Fatalf("result = %+v, %v", result, err)
	}
	if entry := namedEntry(t, readBible(t, s), "Tulgey"); entry["category"] != "Word" {
		t.Fatalf("entry = %v", entry)
	}
	if result, err := s.ImportScriptWords(nil); err != nil || result != (ScriptWordImport{}) {
		t.Fatalf("nothing to import = %+v, %v", result, err)
	}
}
