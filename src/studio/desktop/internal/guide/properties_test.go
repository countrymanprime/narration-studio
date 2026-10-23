package guide

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"desktop/internal/process"
	"desktop/internal/settings"
)

// Properties are an ordered list of {key, value} facts on an entity (a Story Bible entry's facts). The host decodes the file to
// map[string]any and re-marshals it, so a list is what keeps the narrator's order; an object would come back with its keys sorted.
func serviceWithRawGuide(t *testing.T, document string) *Service {
	t.Helper()
	root := t.TempDir()
	s := New(root, "unused", "", settings.New(root, root), process.NewSupervisor())
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(s.guidePath(), []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestEntitiesWithoutPropertiesReadAsAnEmptyList(t *testing.T) {
	for name, document := range map[string]string{
		"absent": `{"schema_version":2,"entities":[{"id":"one"}]}`,
		"null":   `{"schema_version":2,"entities":[{"id":"one","properties":null}]}`,
	} {
		t.Run(name, func(t *testing.T) {
			entities, err := serviceWithRawGuide(t, document).Entities()
			if err != nil || len(entities) != 1 {
				t.Fatalf("entities = %#v, %v", entities, err)
			}
			properties, ok := entities[0]["properties"].([]any)
			if !ok || len(properties) != 0 {
				t.Fatalf("properties = %#v, want an empty list", entities[0]["properties"])
			}
		})
	}
}

func TestEntitiesKeepThePropertiesInTheOrderTheyWereWritten(t *testing.T) {
	document := `{"schema_version":2,"entities":[{"id":"one","properties":[{"key":"Dossier","value":"Sealed."},{"key":"Abilities","value":"Flight"},{"key":"Codename","value":"Wren"}]}]}`
	entities, err := serviceWithRawGuide(t, document).Entities()
	if err != nil {
		t.Fatal(err)
	}
	bytes, err := json.Marshal(entities[0]["properties"])
	if err != nil {
		t.Fatal(err)
	}
	const want = `[{"key":"Dossier","value":"Sealed."},{"key":"Abilities","value":"Flight"},{"key":"Codename","value":"Wren"}]`
	if string(bytes) != want {
		t.Fatalf("properties = %s, want %s", bytes, want)
	}
}

func TestEntitiesRejectPropertiesThatAreNotAList(t *testing.T) {
	if _, err := serviceWithRawGuide(t, `{"schema_version":2,"entities":[{"id":"one","properties":{"Codename":"Wren"}}]}`).Entities(); err == nil {
		t.Fatal("properties as an object must be refused, not shown as if they were empty")
	}
}
