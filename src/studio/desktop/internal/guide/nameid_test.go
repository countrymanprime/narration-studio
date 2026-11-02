package guide

import (
	"errors"
	"os"
	"slices"
	"testing"
)

// Names that differ only in letters normalizeName drops (other scripts, emoji, accents, nothing but punctuation) share a derived id;
// each is still its own entry, and a name the entry at that id has is still refused.
func TestNamesThatShareADerivedIDAreEachTheirOwnEntry(t *testing.T) {
	s, _ := createService(t)
	var ids []string
	for _, name := range []string{"日本", "שלום", "🦊", "...", "Zoë", "Zo"} {
		id, err := s.CreateFull(name, "Character", nil, "", nil)
		if err != nil {
			t.Fatalf("create %q: %v", name, err)
		}
		if slices.Contains(ids, id) {
			t.Fatalf("create %q gave the id %s a name before it has", name, id)
		}
		ids = append(ids, id)
	}
	if ids[0] != entityID("日本") || ids[4] != entityID("Zoë") {
		t.Errorf("the first name of a derived id did not keep it: %v", ids)
	}
	for _, name := range []string{"日本", "שלום", "zoë", " ZO "} {
		if _, err := s.CreateFull(name, "Character", nil, "", nil); !errors.Is(err, errNameTaken) {
			t.Errorf("create of the existing %q = %v, want a refusal", name, err)
		}
	}
	if _, err := s.CreateFull("Mira", "Character", nil, "", nil); err != nil {
		t.Fatal(err)
	}
	// The sidecar's rule for a name in other ASCII punctuation stays: it is the same name.
	if _, err := s.CreateFull("MIRA!", "Character", nil, "", nil); !errors.Is(err, errNameTaken) {
		t.Errorf("create of MIRA! = %v, want a refusal", err)
	}
}

func TestImportScriptWordsGivesEachNonASCIIWordItsOwnEntry(t *testing.T) {
	s, _ := createService(t)
	if err := os.WriteFile(s.guidePath(), []byte(scriptWordsBible), 0o600); err != nil {
		t.Fatal(err)
	}
	words := []ScriptWord{
		{Word: "日本", Name: "日本", Say: "nihon", Source: "manual"},
		{Word: "שלום", Name: "שלום", Say: "shalom", Source: "manual"},
		{Word: "...", Name: "...", Say: "dot dot dot", Source: "manual"},
		{Word: "🦊", Name: "🦊", Say: "fox", Source: "manual"},
	}
	result, err := s.ImportScriptWords(words)
	if err != nil {
		t.Fatal(err)
	}
	if result != (ScriptWordImport{Created: 4}) {
		t.Fatalf("result = %+v", result)
	}
	document := readBible(t, s)
	for _, word := range words {
		entry := namedEntry(t, document, word.Name)
		pronunciation := entry["pronunciation"].(map[string]any)
		if pronunciation["ipa"] != word.Say || pronunciation["note"] != nil {
			t.Errorf("%s: %v", word.Name, pronunciation)
		}
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
	if _, err := s.ImportScriptWords([]ScriptWord{{Word: "mary", Name: "Mary", Say: "MAIR-ee", Source: "manual"}}); err != nil {
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
