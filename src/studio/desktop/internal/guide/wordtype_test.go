package guide

import (
	"os"
	"strings"
	"testing"
)

// The Story Bible holds story elements only (#2595): no default type is for a word, and a create of category Word on a types list
// without it is refused like any other category the list lacks.
func TestNoDefaultTypeIsForAWord(t *testing.T) {
	for _, row := range DefaultTypes() {
		if row.Name == "Word" {
			t.Fatalf("default types = %+v", DefaultTypes())
		}
	}
	s, _ := createService(t)
	stored := `{"schema_version": 2, "entities": [], "types": [{"name": "Character", "colour": "green", "speaks": true, "builtin": "Character"}]}`
	if err := os.WriteFile(s.guidePath(), []byte(stored), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create("Tulgey", "Word", nil); err == nil || !strings.Contains(err.Error(), "Unknown category: Word") {
		t.Fatalf("a create of a Word entry = %v, want a refusal", err)
	}
}
