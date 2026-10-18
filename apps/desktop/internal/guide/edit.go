package guide

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"slices"
	"strings"
	"unicode"

	"golang.org/x/text/cases"

	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// systemCategories are manuscript_guide.py SYSTEM_CATEGORIES: states a build or a create sets, never a type an edit can give.
var systemCategories = []string{"Needs Review", "Draft"}

// errNoGuide is the sidecar's refusal for a file that is missing or not a JSON object (load_json reads both as no file).
var errNoGuide = errors.New("Guide file does not exist; build it first.") //nolint:staticcheck // the sidecar's own words, shown to the narrator

// errNoFile is errNoGuide for a file that is not there or holds an empty object (or null): the two the sidecar's type commands start a
// new Story Bible for (typesInHost). A file that is there but is not a JSON object is errNoGuide alone.
var errNoFile = fmt.Errorf("%w", errNoGuide)

// editInHost is manuscript_guide.py `edit` for every field but "aliases" (locked, description, personality, context, properties,
// category, canonical_name; a new alias needs a pronunciation lookup and the manuscript, so that stays in the sidecar). Every field is
// applied to a copy of the entity, in name order (the order editArgs sends them to the sidecar); only when all of them are accepted does
// the copy replace the entity, marked reviewed, and the file get written, once. So a refused field leaves the file, and the held
// document, exactly as they were. A file from a newer schema is refused, never rewritten.
//
// Edits are serialized by editMu. A sidecar command that rewrites the file at the same time (a build) is not; the host sees what it
// wrote on the next edit (heldDocument), and an edit made while it runs can still be overwritten by it, as before this edit moved here.
func (s *Service) editInHost(id string, values map[string]string) error {
	s.editMu.Lock()
	defer s.editMu.Unlock()
	document, err := s.documentForEdit()
	if err != nil {
		return err
	}
	index, entity, err := findEntity(document, id)
	if err != nil {
		return err
	}
	categories, err := documentTypeNames(document)
	if err != nil {
		return err
	}
	fields := make([]string, 0, len(values))
	for field := range values {
		fields = append(fields, field)
	}
	slices.Sort(fields)
	changed, _ := deepCopy(entity).(map[string]any)
	for _, field := range fields {
		if err := applyEdit(changed, field, values[field], categories); err != nil {
			return err
		}
	}
	changed["review_state"] = "reviewed"
	document["entities"].([]any)[index] = changed
	written, err := writeDocument(s.guidePath(), document)
	if err != nil {
		// What is on disk is not known now, so the next edit reads it again.
		s.held = nil
		return err
	}
	s.held = &heldDocument{document: document, raw: written}
	return nil
}

// heldDocument is the Story Bible as the host last parsed or wrote it, and the file's bytes at that moment. An edit re-reads the bytes
// (a few milliseconds on a full-length book) and parses them again (fifty or more) only when they differ, which they do whenever any
// other writer touched the file: the sidecar, a build, another tool or the narrator. Size and modification time are not trusted for
// this, because a coarse file system (FAT32, some network drives) can report both unchanged after a write.
type heldDocument struct {
	document map[string]any
	raw      []byte
}

// documentForEdit is the held document when the file still holds the bytes it came from, otherwise the file parsed afresh.
//
// +checklocks:s.editMu
func (s *Service) documentForEdit() (map[string]any, error) {
	raw, err := os.ReadFile(s.guidePath())
	if err != nil {
		s.held = nil
		if errors.Is(err, fs.ErrNotExist) {
			return nil, errNoFile
		}
		return nil, errNoGuide
	}
	if s.held != nil && bytes.Equal(s.held.raw, raw) {
		return s.held.document, nil
	}
	s.held = nil
	document, err := parseForEdit(raw)
	if err != nil {
		return nil, err
	}
	s.parses.Add(1)
	s.held = &heldDocument{document: document, raw: raw}
	return document, nil
}

// parseForEdit reads the Story Bible the way manuscript_guide.py load_json does for an edit: numbers stay as their text
// (json.Number), so a value the edit does not touch is written back exactly as it was read, and the legacy shapes load_json normalizes
// (an alias stored as plain text, the old "user" pronunciation source) are normalized the same way, because the sidecar writes them back
// normalized on every edit.
func parseForEdit(raw []byte) (map[string]any, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var document map[string]any
	if err := decoder.Decode(&document); err != nil {
		return nil, errNoGuide
	}
	// An empty object, or null, is no file to the sidecar too (load_json's result is falsy).
	if len(document) == 0 {
		return nil, errNoFile
	}
	version, _ := document["schema_version"].(json.Number)
	found, _ := version.Int64()
	if err := persist.CheckVersion(int(found), schemaVersion, "Story Bible"); err != nil {
		return nil, err
	}
	entities, _ := document["entities"].([]any)
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
	return document, nil
}

// deepCopy copies a decoded JSON value: objects and lists are copied all the way down; strings, numbers, booleans and null are values.
func deepCopy(value any) any {
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, item := range v {
			out[key] = deepCopy(item)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for index, item := range v {
			out[index] = deepCopy(item)
		}
		return out
	}
	return value
}

// readPronunciationSource is manuscript_guide.py read_pronunciation_source: the legacy source "user" reads as "manual", in the value and
// in its alternate. Unlike readPronunciation (what the UI is sent) it keeps a stored status, as the sidecar does.
func readPronunciationSource(value map[string]any) {
	if value["source"] == legacyManualSource {
		value["source"] = ManualSource
	}
	if alternate, ok := value["alternate"].(map[string]any); ok {
		readPronunciationSource(alternate)
	}
}

// findEntity is the entity with the id and its place in the entities list.
func findEntity(document map[string]any, id string) (int, map[string]any, error) {
	entities, _ := document["entities"].([]any)
	for index, raw := range entities {
		if entity, ok := raw.(map[string]any); ok && entity["id"] == id {
			return index, entity, nil
		}
	}
	return 0, nil, errors.New("Entity not found.") //nolint:staticcheck // the sidecar's own words, shown to the narrator
}

// documentTypeNames is manuscript_guide.py type_names: the names of the types guideTypes reads.
func documentTypeNames(document map[string]any) ([]string, error) {
	types, err := guideTypes(document)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(types))
	for _, row := range types {
		names = append(names, row["name"].(string))
	}
	return names, nil
}

// applyEdit is manuscript_guide.py apply_edit for one field editInHost takes; any other field is refused, as the sidecar refuses it.
func applyEdit(entity map[string]any, field, value string, categories []string) error {
	if truthy(entity["locked"]) && field != "locked" {
		return errors.New("This entity is locked. Unlock it before editing.") //nolint:staticcheck // the sidecar's own words, shown to the narrator
	}
	switch field {
	case "locked":
		entity["locked"] = slices.Contains([]string{"1", "true", "yes", "on"}, strings.ToLower(pythonStrip(value)))
	case "description":
		description, ok := entity["description"].(map[string]any)
		if !ok {
			description = map[string]any{}
			entity["description"] = description
		}
		description["text"] = value
	case "personality":
		entity["personality_notes"] = []any{}
		if value != "" {
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
			return fmt.Errorf("Unknown or reserved category: %s", value) //nolint:staticcheck // the sidecar's own words, shown to the narrator
		}
		entity["category"] = value
	case "canonical_name":
		entity["canonical_name"] = value
	default:
		return errors.New("Unsupported editable field.") //nolint:staticcheck // the sidecar's own words, shown to the narrator
	}
	return nil
}

// parseProperties is manuscript_guide.py parse_properties and normalize_properties: empty text is no properties; otherwise a JSON list of
// {key, value} strings, each trimmed, in the order given, a key required and unique whatever its case. A refusal names the position.
func parseProperties(text string) ([]any, error) {
	if pythonStrip(text) == "" {
		return []any{}, nil
	}
	var raw any
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return nil, fmt.Errorf("The properties are not valid JSON (%v).", err) //nolint:staticcheck // the sidecar's own words, shown to the narrator
	}
	list, ok := raw.([]any)
	if !ok {
		return nil, errors.New("Properties must be a list of key and value pairs.") //nolint:staticcheck // the sidecar's own words, shown to the narrator
	}
	properties := make([]any, 0, len(list))
	seen := map[string]bool{}
	for index, item := range list {
		position := index + 1
		pair, isPair := item.(map[string]any)
		key, keyOK := pair["key"].(string)
		value, valueOK := pair["value"].(string)
		if !isPair || !keyOK || !valueOK {
			return nil, fmt.Errorf("Property %d must have a text key and a text value.", position) //nolint:staticcheck // the sidecar's own words, shown to the narrator
		}
		key, value = pythonStrip(key), pythonStrip(value)
		if key == "" {
			return nil, fmt.Errorf("Property %d has no name.", position) //nolint:staticcheck // the sidecar's own words, shown to the narrator
		}
		if seen[foldCase(key)] {
			return nil, fmt.Errorf("There are two properties named %s; give each a different name.", pythonRepr(key)) //nolint:staticcheck // the sidecar's own words, shown to the narrator
		}
		seen[foldCase(key)] = true
		properties = append(properties, map[string]any{"key": key, "value": value})
	}
	return properties, nil
}

// foldCase is the comparison the sidecar makes with str.casefold: Unicode full case folding, so "ß" matches "SS" and "ﬁ" matches "FI".
func foldCase(text string) string {
	return cases.Fold().String(text)
}

// pythonStrip is Python's str.strip() with no argument: Go's unicode.IsSpace plus the four information separators U+001C to U+001F,
// which Python counts as space and Go does not.
func pythonStrip(text string) string {
	return strings.TrimFunc(text, func(r rune) bool { return unicode.IsSpace(r) || (r >= 0x1c && r <= 0x1f) })
}

// truthy is Python's truth test of a decoded JSON value, which the sidecar's lock check (`entity.get("locked")`) makes: false, null, zero,
// and an empty string, list or object are false, anything else true.
func truthy(value any) bool {
	switch v := value.(type) {
	case nil:
		return false
	case bool:
		return v
	case json.Number:
		f, err := v.Float64()
		return err != nil || f != 0
	case string:
		return v != ""
	case []any:
		return len(v) > 0
	case map[string]any:
		return len(v) > 0
	}
	return true
}

// pythonRepr quotes text the way the sidecar's !r does in a message: single quotes, or double quotes when the text holds a single quote
// and no double one.
func pythonRepr(text string) string {
	if strings.Contains(text, "'") && !strings.Contains(text, `"`) {
		return `"` + strings.ReplaceAll(text, `\`, `\\`) + `"`
	}
	return "'" + strings.NewReplacer(`\`, `\\`, "'", `\'`).Replace(text) + "'"
}

// writeDocument is manuscript_guide.py write_json: two-space indented UTF-8 with non-ASCII text as itself and a trailing newline, written
// beside the file and renamed over it so a reader never sees half a file. Keys come out sorted (a Go map has no order) where the sidecar
// keeps the order it read; the content is the same, and the sidecar keeps whichever order it next reads. It returns the bytes written.
func writeDocument(path string, document map[string]any) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(document); err != nil {
		return nil, err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, buffer.Bytes(), 0o644); err != nil { //nolint:gosec // G306: the mode the sidecar writes the file with; it is the narrator's own data
		return nil, err
	}
	if err := os.Rename(temporary, path); err != nil {
		_ = os.Remove(temporary)
		return nil, err
	}
	return buffer.Bytes(), nil
}
