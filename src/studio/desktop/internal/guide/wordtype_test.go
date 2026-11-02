package guide

import (
	"os"
	"slices"
	"strings"
	"testing"
)

// Word is the last default type: a word the narrator wants said one way that is no character, place or thing (#2595). It is teal
// and does not speak.
func TestWordIsADefaultType(t *testing.T) {
	types := DefaultTypes()
	if last := types[len(types)-1]; last != (Type{"Word", "teal", false}) {
		t.Fatalf("last default type = %+v", last)
	}
}

// A Story Bible with its own types list made before Word existed takes an entry of category Word: the create adds the Word type in
// the same write. Any other category the list lacks is refused, as before.
func TestCreatingAWordAddsTheWordType(t *testing.T) {
	s, _ := createService(t)
	stored := `{"schema_version": 2, "entities": [], "types": [{"name": "Character", "colour": "green", "speaks": true, "builtin": "Character"}]}`
	if err := os.WriteFile(s.guidePath(), []byte(stored), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create("Gryphon", "Beast", nil); err == nil || !strings.Contains(err.Error(), "Unknown category: Beast") {
		t.Fatalf("an unknown category = %v", err)
	}
	if _, err := s.Create("Tulgey", "Word", nil); err != nil {
		t.Fatal(err)
	}
	types, err := s.Types()
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(types, []Type{{"Character", "green", true}, {"Word", "teal", false}}) {
		t.Fatalf("types = %+v", types)
	}
	if _, err := s.Create("Frabjous", "Word", nil); err != nil {
		t.Fatal(err)
	}
	if again, _ := s.Types(); len(again) != 2 {
		t.Fatalf("a second Word entry added the type again: %+v", again)
	}
}
