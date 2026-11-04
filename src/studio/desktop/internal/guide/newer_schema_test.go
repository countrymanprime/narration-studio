package guide

import (
	"context"
	"os"
	"strings"
	"testing"
)

// A Story Bible a newer version of the app wrote is refused by the cue refresh and by Pronounce, as it is by every other host edit,
// and left byte for byte as it was (#2418). One with no schema_version is read as before.

const newerRefusal = "newer version of the app (schema 3, this one reads up to 2)"

func TestRefreshCuesRefusesANewerStoryBible(t *testing.T) {
	newer := map[string]any{"schema_version": 3, "entities": []any{}, "future_field": map[string]any{"keep": "me"}}
	s := cueProject(t, newer, [3]string{"c1", "p1", `"Hello," Ada said.`})
	before, _ := os.ReadFile(s.guidePath())
	_, err := s.RefreshCues(context.Background())
	if err == nil || !strings.Contains(err.Error(), newerRefusal) {
		t.Fatalf("newer file: %v", err)
	}
	if after, _ := os.ReadFile(s.guidePath()); string(after) != string(before) {
		t.Fatal("a refused refresh rewrote a newer Story Bible")
	}
}

func TestRefreshCuesReadsAStoryBibleWithNoSchemaVersion(t *testing.T) {
	s := cueProject(t, map[string]any{"entities": []any{}}, [3]string{"c1", "p1", `"Hello," Ada said.`})
	if _, err := s.RefreshCues(context.Background()); err != nil {
		t.Fatalf("no schema_version: %v", err)
	}
}

func TestPronounceRefusesANewerStoryBible(t *testing.T) {
	s, asked := pronounceService(t, wren+`}`, cmuAnswer)
	newer := `{"schema_version": 3, "future_field": {"keep": "me"}, "entities": [` + wren + `}]}`
	if err := os.WriteFile(s.guidePath(), []byte(newer), 0o600); err != nil {
		t.Fatal(err)
	}
	err := s.Pronounce("entity-1", nil, "cmu")
	if err == nil || !strings.Contains(err.Error(), newerRefusal) {
		t.Fatalf("newer file: %v", err)
	}
	if len(*asked) != 0 {
		t.Fatalf("asked the source %q of a newer file", *asked)
	}
	if after, _ := os.ReadFile(s.guidePath()); string(after) != newer {
		t.Fatal("a refused pronunciation rewrote a newer Story Bible")
	}
}

func TestPronounceReadsAStoryBibleWithNoSchemaVersion(t *testing.T) {
	s, _ := pronounceService(t, wren+`}`, cmuAnswer)
	if err := os.WriteFile(s.guidePath(), []byte(`{"entities": [`+wren+`}]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := s.Pronounce("entity-1", nil, "cmu"); err != nil {
		t.Fatalf("no schema_version: %v", err)
	}
}
