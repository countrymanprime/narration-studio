//go:build spike

package guidemutation

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

// ErrNeedsPython is returned for an edit that has to ask a pronunciation source (an alias edit generates the new alias's
// pronunciation), which stays in the sidecar.
var ErrNeedsPython = errors.New("this edit needs the sidecar")

// validCategories and systemCategories mirror manuscript_guide.py VALID_CATEGORIES and SYSTEM_CATEGORIES; defaultTypeNames are the
// names of DEFAULT_TYPES, the categories of a file without a types list.
var (
	systemCategories = []string{"Needs Review", "Draft"}
	defaultTypeNames = []string{"Character", "Place", "Organization", "Lore", "Item", "Event"}
)

// Edit is manuscript_guide.py `edit` for every field except "aliases": it applies every field to the entity in memory, marks it
// reviewed and writes the file once, so a refused field leaves the file as it was. setLocked is Edit(path, id, {"locked": ...}).
// fields are applied in name order, the order guide.Service.editArgs sends them.
func Edit(path, entityID string, fields map[string]string) error {
	if _, ok := fields["aliases"]; ok {
		return ErrNeedsPython
	}
	guide, err := load(path)
	if err != nil {
		return err
	}
	entity, err := findEntity(guide, entityID)
	if err != nil {
		return err
	}
	categories, err := typeNames(guide)
	if err != nil {
		return err
	}
	names := make([]string, 0, len(fields))
	for name := range fields {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		if err := applyEdit(entity, name, fields[name], categories); err != nil {
			return err
		}
	}
	entity["review_state"] = "reviewed"
	return write(path, guide)
}

// applyEdit is manuscript_guide.py apply_edit without the "aliases" branch.
func applyEdit(entity map[string]any, field, value string, categories []string) error {
	if locked, _ := entity["locked"].(bool); locked && field != "locked" {
		return fmt.Errorf("This entity is locked. Unlock it before editing.") //nolint:staticcheck // the sidecar's own message
	}
	switch field {
	case "locked":
		entity["locked"] = slices.Contains([]string{"1", "true", "yes", "on"}, strings.ToLower(strings.TrimSpace(value)))
	case "description":
		description, ok := entity["description"].(map[string]any)
		if !ok {
			description = map[string]any{}
			entity["description"] = description
		}
		description["text"] = value
	case "personality":
		if value == "" {
			entity["personality_notes"] = []any{}
		} else {
			entity["personality_notes"] = []any{map[string]any{"text": value, "evidence": map[string]any{"chapter": "User edit", "excerpt": "User-authored note."}}}
		}
	case "context":
		entity["context"] = value
	case "properties":
		properties, err := parseProperties(value)
		if err != nil {
			return err
		}
		entity["properties"] = properties
	case "category":
		if slices.Contains(systemCategories, value) || !slices.Contains(categories, value) {
			return fmt.Errorf("Unknown or reserved category: %s", value) //nolint:staticcheck // the sidecar's own message
		}
		entity["category"] = value
	case "canonical_name":
		entity["canonical_name"] = value
	default:
		return fmt.Errorf("Unsupported editable field.") //nolint:staticcheck // the sidecar's own message
	}
	return nil
}

// parseProperties is manuscript_guide.py parse_properties and normalize_properties: a JSON list of {key, value} strings, trimmed, a key
// required and unique whatever its case.
func parseProperties(text string) ([]any, error) {
	if strings.TrimSpace(text) == "" {
		return []any{}, nil
	}
	var raw []map[string]any
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return nil, fmt.Errorf("The properties are not valid JSON (%v).", err) //nolint:staticcheck // the sidecar's own message
	}
	out := make([]any, 0, len(raw))
	seen := map[string]bool{}
	for position, item := range raw {
		key, keyOK := item["key"].(string)
		value, valueOK := item["value"].(string)
		if !keyOK || !valueOK {
			return nil, fmt.Errorf("Property %d must have a text key and a text value.", position+1) //nolint:staticcheck // the sidecar's own message
		}
		key, value = strings.TrimSpace(key), strings.TrimSpace(value)
		if key == "" {
			return nil, fmt.Errorf("Property %d has no name.", position+1) //nolint:staticcheck // the sidecar's own message
		}
		// Python's str.casefold and Go's ToLower differ for a few letters (ß); the spike accepts that, a port could not.
		if seen[strings.ToLower(key)] {
			return nil, fmt.Errorf("There are two properties named %q; give each a different name.", key) //nolint:staticcheck // the sidecar's own message
		}
		seen[strings.ToLower(key)] = true
		out = append(out, map[string]any{"key": key, "value": value})
	}
	return out, nil
}

// typeNames is manuscript_guide.py type_names: the names of the stored types, or of the default types for a file without a list.
func typeNames(guide map[string]any) ([]string, error) {
	stored, present := guide["types"]
	if !present || stored == nil {
		return defaultTypeNames, nil
	}
	rows, ok := stored.([]any)
	if !ok || len(rows) == 0 {
		return nil, fmt.Errorf("The Story Bible types are invalid.") //nolint:staticcheck // the sidecar's own message
	}
	names := make([]string, 0, len(rows))
	for _, raw := range rows {
		row, ok := raw.(map[string]any)
		name, nameOK := row["name"].(string)
		if !ok || !nameOK || strings.TrimSpace(name) == "" {
			return nil, fmt.Errorf("The Story Bible types are invalid.") //nolint:staticcheck // the sidecar's own message
		}
		names = append(names, name)
	}
	return names, nil
}

func findEntity(guide map[string]any, id string) (map[string]any, error) {
	entities, _ := guide["entities"].([]any)
	for _, raw := range entities {
		if entity, ok := raw.(map[string]any); ok && entity["id"] == id {
			return entity, nil
		}
	}
	return nil, fmt.Errorf("Entity not found.") //nolint:staticcheck // the sidecar's own message
}

// load is manuscript_guide.py load_json for an edit: numbers stay as their text (json.Number) so a value the host does not touch is
// written back exactly as it was read, and the legacy shapes load_json normalizes are normalized the same way, because the sidecar
// writes them back normalized on every edit.
func load(path string) (map[string]any, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("Guide file does not exist; build it first.") //nolint:staticcheck // the sidecar's own message
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var guide map[string]any
	if err := decoder.Decode(&guide); err != nil || guide == nil {
		return nil, fmt.Errorf("Guide file does not exist; build it first.") //nolint:staticcheck // the sidecar's own message
	}
	entities, _ := guide["entities"].([]any)
	for _, raw := range entities {
		entity, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		holders := []map[string]any{entity}
		if aliases, ok := entity["aliases"].([]any); ok {
			for index, alias := range aliases {
				if text, isText := alias.(string); isText {
					aliases[index] = map[string]any{"text": text, "pronunciation": map[string]any{}, "occurrences": []any{}}
				}
				if holder, ok := aliases[index].(map[string]any); ok {
					holders = append(holders, holder)
				}
			}
		}
		for _, holder := range holders {
			if value, ok := holder["pronunciation"].(map[string]any); ok {
				readPronunciationSource(value)
			}
		}
	}
	return guide, nil
}

// readPronunciationSource is manuscript_guide.py read_pronunciation_source: the legacy source "user" reads as "manual", in the value and
// in its alternate.
func readPronunciationSource(value map[string]any) {
	if value["source"] == "user" {
		value["source"] = "manual"
	}
	if alternate, ok := value["alternate"].(map[string]any); ok {
		readPronunciationSource(alternate)
	}
}

// write is manuscript_guide.py write_json: two-space indented UTF-8 with a trailing newline, written beside the file and renamed over
// it. Keys come out sorted (Go maps have no order) where the sidecar keeps insertion order; the content is the same.
func write(path string, guide map[string]any) error {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(guide); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, buffer.Bytes(), 0o644); err != nil { //nolint:gosec // the mode manuscript_guide.py writes the file with
		return err
	}
	return os.Rename(temporary, path)
}

// Document is Edit for a host that keeps the Story Bible in memory: the file is parsed once and again only when its size or
// modification time shows another writer (a build run as its own process), and each edit writes it back unindented.
type Document struct {
	path    string
	guide   map[string]any
	size    int64
	modTime int64
}

// Open returns a Document for the file at path; nothing is read until the first Edit.
func Open(path string) *Document { return &Document{path: path} }

// Edit is the package's Edit against the held document. A refused field leaves both the file and the held copy as they were.
func (d *Document) Edit(entityID string, fields map[string]string) error {
	if _, ok := fields["aliases"]; ok {
		return ErrNeedsPython
	}
	info, err := os.Stat(d.path)
	if err != nil {
		return fmt.Errorf("Guide file does not exist; build it first.") //nolint:staticcheck // the sidecar's own message
	}
	if d.guide == nil || info.Size() != d.size || info.ModTime().UnixNano() != d.modTime {
		if d.guide, err = load(d.path); err != nil {
			return err
		}
	}
	entity, err := findEntity(d.guide, entityID)
	if err != nil {
		return err
	}
	categories, err := typeNames(d.guide)
	if err != nil {
		return err
	}
	// Applied to a copy of the entry, so a refused field does not leave the held document half-changed.
	encoded, err := json.Marshal(entity)
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.UseNumber()
	var changed map[string]any
	if err := decoder.Decode(&changed); err != nil {
		return err
	}
	names := make([]string, 0, len(fields))
	for name := range fields {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		if err := applyEdit(changed, name, fields[name], categories); err != nil {
			return err
		}
	}
	changed["review_state"] = "reviewed"
	for key := range entity {
		delete(entity, key)
	}
	for key, value := range changed {
		entity[key] = value
	}
	raw, err := json.Marshal(d.guide)
	if err != nil {
		return err
	}
	temporary := d.path + ".tmp"
	if err := os.WriteFile(temporary, append(raw, '\n'), 0o644); err != nil { //nolint:gosec // the mode manuscript_guide.py writes the file with
		return err
	}
	if err := os.Rename(temporary, d.path); err != nil {
		return err
	}
	if info, err = os.Stat(d.path); err == nil {
		d.size, d.modTime = info.Size(), info.ModTime().UnixNano()
	}
	return nil
}
