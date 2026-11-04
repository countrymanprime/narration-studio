package guide

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// scriptWordsBible holds one entry for each branch of the import: a name with nothing set (its note kept), a name with a value of its
// own, a name with an empty alias, and a locked entry.
const scriptWordsBible = `{"schema_version": 2, "entities": [
  {"id": "e-empty", "canonical_name": "Knave", "category": "Character", "pronunciation": {"ipa": "", "source": "not generated", "confidence": "unknown", "note": "Ask."}, "aliases": []},
  {"id": "e-valued", "canonical_name": "Queen", "category": "Character", "pronunciation": {"ipa": "KWEEN", "source": "manual", "confidence": "narrator", "chosen": true}, "aliases": []},
  {"id": "e-alias", "canonical_name": "Cheshire Cat", "category": "Character", "pronunciation": {"ipa": "x", "source": "cmu"}, "aliases": [{"text": " Cheshire ", "pronunciation": {}, "occurrences": []}]},
  {"id": "e-locked", "canonical_name": "Duchess", "category": "Character", "locked": true, "pronunciation": {"ipa": "", "source": "not generated"}, "aliases": []}
], "types": [{"name": "Character", "colour": "green", "speaks": true, "builtin": "Character"}]}`

var scriptWords = []ScriptWord{
	{Word: "knave", Say: "NAYV"},
	{Word: "queen", Say: "kwiːn"},
	{Word: "CHESHIRE", Say: "ʧɛʃɚ"},
	{Word: "duchess", Say: "DUTCH-ess"},
	{Word: "tulgey", Say: "TUL-gee"},
	{Word: "frabjous", Say: ""},
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

// A Script value fills a name that has no pronunciation, as the narrator's chosen value from "script_imported"; a name with a value of
// its own, a locked entry and a word no name has are left as they are, and no entry is ever made (#2595). Running it again changes
// nothing.
func TestImportScriptWords(t *testing.T) {
	s, _ := createService(t)
	if err := os.WriteFile(s.guidePath(), []byte(scriptWordsBible), 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := s.ImportScriptWords(scriptWords)
	if err != nil {
		t.Fatal(err)
	}
	if want := (ScriptWordImport{Filled: 2, Kept: 1, Locked: 1, Unmatched: 2}); result != want {
		t.Fatalf("result = %+v, want %+v", result, want)
	}
	document := readBible(t, s)
	if entities := document["entities"].([]any); len(entities) != 4 {
		t.Fatalf("entries = %d, want the 4 there were", len(entities))
	}
	for name, want := range map[string]map[string]any{
		"Knave":   {"ipa": "NAYV", "source": "script_imported", "confidence": "narrator", "chosen": true, "note": "Ask."},
		"Queen":   {"ipa": "KWEEN", "source": "manual", "confidence": "narrator", "chosen": true},
		"Duchess": {"ipa": "", "source": "not generated"},
	} {
		if got := namedEntry(t, document, name)["pronunciation"]; !reflect.DeepEqual(got, any(want)) {
			t.Errorf("%s = %v, want %v", name, got, want)
		}
	}
	alias := namedEntry(t, document, "Cheshire Cat")["aliases"].([]any)[0].(map[string]any)
	if want := map[string]any{"ipa": "ʧɛʃɚ", "source": "script_imported", "confidence": "narrator", "chosen": true}; !reflect.DeepEqual(alias["pronunciation"], any(want)) {
		t.Errorf("alias = %v", alias["pronunciation"])
	}

	before, _ := os.ReadFile(s.guidePath())
	again, err := s.ImportScriptWords(scriptWords)
	if err != nil {
		t.Fatal(err)
	}
	if want := (ScriptWordImport{Kept: 3, Locked: 1, Unmatched: 2}); again != want {
		t.Fatalf("again = %+v, want %+v", again, want)
	}
	if after, _ := os.ReadFile(s.guidePath()); string(after) != string(before) {
		t.Fatal("a second import changed the Story Bible")
	}
}

// Without a Story Bible nothing matches and none is started.
func TestImportScriptWordsStartsNoStoryBible(t *testing.T) {
	s, _ := createService(t)
	if err := os.Remove(s.guidePath()); err != nil {
		t.Fatal(err)
	}
	result, err := s.ImportScriptWords(scriptWords)
	if err != nil {
		t.Fatal(err)
	}
	if result != (ScriptWordImport{Unmatched: 6}) {
		t.Fatalf("result = %+v", result)
	}
	if _, err := os.Stat(s.guidePath()); !os.IsNotExist(err) {
		t.Fatalf("a Story Bible was started: %v", err)
	}
}

// A name goes to the first entry in list order that has it, as its canonical name or an alias, as the Script page reads it.
func TestAScriptWordGoesToTheFirstEntryThatHasTheName(t *testing.T) {
	s, _ := createService(t)
	bible := `{"schema_version": 2, "entities": [
  {"id": "e-a", "canonical_name": "Marianne", "category": "Character", "pronunciation": {"ipa": "", "source": "not generated"}, "aliases": [{"text": "Mary", "pronunciation": {}, "occurrences": []}]},
  {"id": "e-b", "canonical_name": "Mary", "category": "Character", "pronunciation": {"ipa": "", "source": "not generated"}, "aliases": []}
], "types": [{"name": "Character", "colour": "green", "speaks": true, "builtin": "Character"}]}`
	if err := os.WriteFile(s.guidePath(), []byte(bible), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportScriptWords([]ScriptWord{{Word: "mary", Say: "MAIR-ee"}}); err != nil {
		t.Fatal(err)
	}
	document := readBible(t, s)
	alias := namedEntry(t, document, "Marianne")["aliases"].([]any)[0].(map[string]any)
	if alias["pronunciation"].(map[string]any)["ipa"] != "MAIR-ee" {
		t.Errorf("A's alias = %v", alias)
	}
	if ipa := namedEntry(t, document, "Mary")["pronunciation"].(map[string]any)["ipa"]; ipa != "" {
		t.Errorf("B took the word: %v", ipa)
	}
}
