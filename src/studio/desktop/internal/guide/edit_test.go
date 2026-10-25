package guide

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/process"
	"desktop/internal/settings"
)

// hostEditService is a Service whose sidecar does not exist, so an edit that started a process would fail with "configure the
// Manuscript Guide executable": every edit these tests make succeeds or refuses in the host.
func hostEditService(t *testing.T) *Service {
	t.Helper()
	root := t.TempDir()
	s := New(root, filepath.Join(root, "no-such-python-executable"), "", settings.New(root, root), process.NewSupervisor())
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	return s
}

// decodeExactly decodes JSON keeping every number as its text, so a number that changed by a digit is a difference.
func decodeExactly(t *testing.T, raw []byte) any {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		t.Fatalf("not JSON: %v\n%s", err, raw)
	}
	return value
}

// sidecarText is the sidecar's write_json: two-space indent, non-ASCII as itself, a trailing newline.
func sidecarText(t *testing.T, value any) []byte {
	t.Helper()
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

// reasonOf is a refusal's text up to a parser's own detail in brackets, which Python's json module and Go's word differently.
func reasonOf(message string) string {
	if before, _, found := strings.Cut(message, " ("); found {
		return before
	}
	return message
}

// TestEditMatchesTheSidecarCases replays every case tests/fixtures/guide-edit/edit-parity.json recorded from the sidecar's own edit (frozen:
// #2251 deleted the Python command and its recorder, so nothing rewrites it): the same file after it, or the same reason with the file untouched.
func TestEditMatchesTheSidecarCases(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "..", "tests", "fixtures", "guide-edit", "edit-parity.json"))
	if err != nil {
		t.Fatal(err)
	}
	var recorded struct {
		Starts map[string]json.RawMessage `json:"starts"`
		Cases  []struct {
			Start    string            `json:"start"`
			EntityID string            `json:"entity_id"`
			Fields   map[string]string `json:"fields"`
			After    json.RawMessage   `json:"after"`
			Error    string            `json:"error"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &recorded); err != nil {
		t.Fatal(err)
	}
	if len(recorded.Cases) == 0 {
		t.Fatal("no recorded cases")
	}
	for index, c := range recorded.Cases {
		s := hostEditService(t)
		start := sidecarText(t, decodeExactly(t, recorded.Starts[c.Start]))
		if err := os.WriteFile(s.guidePath(), start, 0o600); err != nil {
			t.Fatal(err)
		}
		err := s.EditFields(c.EntityID, c.Fields)
		written, readErr := os.ReadFile(s.guidePath())
		if readErr != nil {
			t.Fatal(readErr)
		}
		if c.Error != "" {
			if err == nil || reasonOf(err.Error()) != reasonOf(c.Error) {
				t.Errorf("case %d %v: error = %v, want %q", index, c.Fields, err, c.Error)
			}
			if !bytes.Equal(written, start) {
				t.Errorf("case %d %v: a refused edit wrote the file", index, c.Fields)
			}
			continue
		}
		if err != nil {
			t.Errorf("case %d %v: %v", index, c.Fields, err)
			continue
		}
		if got, want := decodeExactly(t, written), decodeExactly(t, c.After); !reflect.DeepEqual(got, want) {
			t.Errorf("case %d %v: the file differs from the sidecar's\n got: %s\nwant: %s", index, c.Fields, written, c.After)
		}
	}
}

// The file comes back in the sidecar's format: indented, numbers and non-ASCII text as they were, nothing HTML-escaped, a newline at
// the end. A file the narrator opens by hand reads the same whichever side wrote it last.
func TestEditWritesTheSidecarsFormat(t *testing.T) {
	s := hostEditService(t)
	start := "{\n  \"schema_version\": 2,\n  \"entities\": [\n    {\n      \"id\": \"e\",\n      \"canonical_name\": \"Wren\",\n      \"category\": \"Character\",\n      \"score\": 1.0,\n      \"weight\": 12345678901234567\n    }\n  ]\n}\n"
	if err := os.WriteFile(s.guidePath(), []byte(start), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := s.EditFields("e", map[string]string{"description": "שלום 👋 <b>&</b>"}); err != nil {
		t.Fatal(err)
	}
	written, _ := os.ReadFile(s.guidePath())
	text := string(written)
	for _, want := range []string{"\n  \"entities\": [\n    {\n", `"score": 1.0`, `"weight": 12345678901234567`, `"text": "שלום 👋 <b>&</b>"`, `"review_state": "reviewed"`} {
		if !strings.Contains(text, want) {
			t.Errorf("the file has no %q:\n%s", want, text)
		}
	}
	if !strings.HasSuffix(text, "}\n") {
		t.Errorf("no trailing newline:\n%q", text)
	}
	if _, err := os.Stat(s.guidePath() + ".tmp"); !os.IsNotExist(err) {
		t.Errorf("the temporary file was left behind: %v", err)
	}
}

func TestEditRefusesWithoutAFileOrAFileFromANewerVersion(t *testing.T) {
	s := hostEditService(t)
	if err := s.EditFields("e", map[string]string{"description": "x"}); err == nil || !strings.Contains(err.Error(), "build it first") {
		t.Fatalf("no file: %v", err)
	}
	for _, content := range []string{"", "not json", "[]", "null"} {
		if err := os.WriteFile(s.guidePath(), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := s.EditFields("e", map[string]string{"description": "x"}); err == nil || !strings.Contains(err.Error(), "build it first") {
			t.Fatalf("%q: %v", content, err)
		}
	}
	newer := `{"schema_version": 3, "entities": [{"id": "e", "canonical_name": "E", "category": "Character"}]}`
	if err := os.WriteFile(s.guidePath(), []byte(newer), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := s.EditFields("e", map[string]string{"description": "x"}); err == nil || !strings.Contains(err.Error(), "newer version") {
		t.Fatalf("newer file: %v", err)
	}
	if written, _ := os.ReadFile(s.guidePath()); string(written) != newer {
		t.Fatal("a newer file was rewritten")
	}
}

// An alias edit reads the manuscript before it applies any field, as the sidecar's edit does, and is refused with the sidecar's words when
// there is none: the file is untouched and no sidecar starts (this service has none to start; asking one would say so).
func TestAnAliasEditNeedsTheManuscriptAndNotTheSidecar(t *testing.T) {
	s := hostEditService(t)
	start := `{"schema_version": 2, "entities": [{"id": "e", "canonical_name": "E", "category": "Character"}]}`
	if err := os.WriteFile(s.guidePath(), []byte(start), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := s.EditFields("e", map[string]string{"aliases": "Al", "description": "x"}); err == nil || err.Error() != "Import a manuscript first." {
		t.Fatalf("an alias edit with no manuscript: %v", err)
	}
	if written, _ := os.ReadFile(s.guidePath()); string(written) != start {
		t.Fatalf("a refused edit changed the file: %s", written)
	}
}

// Ported from the sidecar's test_manuscript_guide.py when #2251 deleted its edit: renaming an entry keeps its id, so every relationship
// that points at it, and its own, are unchanged.
func TestARenameKeepsTheRelationshipsThatPointAtTheEntrysID(t *testing.T) {
	relation := func(id, name, label string) any { return map[string]any{"id": id, "name": name, "label": label} }
	entry := func(id, name string, relationships ...any) any {
		return map[string]any{"id": id, "canonical_name": name, "category": "Character", "aliases": []any{}, "relationships": relationships}
	}
	s := serviceWithGuideFile(t, []any{
		entry("nicholas", "Nicholas", relation("wren", "Wren", "friend")),
		entry("nico", "Nico", relation("wren", "Wren", "brother"), relation("nicholas", "Nicholas", "same")),
		entry("wren", "Wren", relation("nico", "Nico", "sister"), relation("nicholas", "Nicholas", "sister")),
	})
	if err := s.Edit("nicholas", "canonical_name", "Nicolas"); err != nil {
		t.Fatal(err)
	}
	if got := entityField(t, s, "nicholas", "canonical_name"); got != "Nicolas" {
		t.Fatalf("canonical_name = %v", got)
	}
	ids := func(id string) []any {
		var out []any
		for _, raw := range entityField(t, s, id, "relationships").([]any) {
			out = append(out, raw.(map[string]any)["id"])
		}
		return out
	}
	if got := ids("wren"); !reflect.DeepEqual(got, []any{"nico", "nicholas"}) {
		t.Fatalf("Wren's relationships point at %v", got)
	}
	if got := ids("nico"); !reflect.DeepEqual(got, []any{"wren", "nicholas"}) {
		t.Fatalf("Nico's relationships point at %v", got)
	}
	if got := entityField(t, s, "nicholas", "relationships"); !reflect.DeepEqual(got, []any{relation("wren", "Wren", "friend")}) {
		t.Fatalf("the renamed entry's own relationships = %v", got)
	}
}
