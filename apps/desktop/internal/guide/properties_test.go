package guide

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/process"
	"github.com/countrymanprime/narration-utils/shell/internal/settings"
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

// The host writes the properties itself, in the order they were given, and a value that starts with a dash is a value.
func TestEditWritesThePropertiesAsGivenAndCreateDoes(t *testing.T) {
	s := hostEditService(t)
	writeStart(t, s, `{"schema_version":2,"entities":[{"id":"entity-1","canonical_name":"Al","aliases":[],"category":"Character"}]}`)
	value := `[{"key":"Codename","value":"-Wren"},{"key":"Abilities","value":"Flight"}]`
	if err := s.Edit("entity-1", "properties", value); err != nil {
		t.Fatal(err)
	}
	writeManuscript(t, s, manuscriptOf("Juno sat."))
	s.lookup = func(names []string) ([]map[string]any, error) {
		values := make([]map[string]any, len(names))
		for index := range values {
			values[index] = map[string]any{"ipa": "", "source": "not generated", "confidence": "unknown"}
		}
		return values, nil
	}
	id, err := s.CreateFull("Juno", "Character", nil, "", []Property{{Key: "Codename", Value: "-Wren"}, {Key: "Abilities", Value: "Flight, sleight of hand"}})
	if err != nil {
		t.Fatal(err)
	}
	entities, err := s.Entities()
	if err != nil {
		t.Fatal(err)
	}
	for _, entity := range entities {
		encoded, _ := json.Marshal(entity["properties"])
		switch entity["id"] {
		case "entity-1":
			if string(encoded) != `[{"key":"Codename","value":"-Wren"},{"key":"Abilities","value":"Flight"}]` {
				t.Errorf("edited properties = %s", encoded)
			}
		case id:
			if string(encoded) != `[{"key":"Codename","value":"-Wren"},{"key":"Abilities","value":"Flight, sleight of hand"}]` {
				t.Errorf("created properties = %s", encoded)
			}
		}
	}
}
