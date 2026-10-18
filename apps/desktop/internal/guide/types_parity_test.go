package guide

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type typeCase struct {
	Command   string          `json:"command"`
	Start     string          `json:"start"`
	Arguments map[string]any  `json:"arguments"`
	After     json.RawMessage `json:"after"`
	Error     string          `json:"error"`
}

// run calls the Service method the case's sidecar command became.
func (c typeCase) run(s *Service) error {
	text := func(name string) string { value, _ := c.Arguments[name].(string); return value }
	switch c.Command {
	case "type-add":
		return s.AddType(text("name"))
	case "type-rename":
		return s.RenameType(text("name"), text("to"))
	case "type-colour":
		return s.SetTypeColour(text("name"), text("colour"))
	case "type-speaks":
		return s.SetTypeSpeaks(text("name"), c.Arguments["speaks"] == float64(1))
	case "type-remove":
		return s.RemoveType(text("name"))
	}
	return fmt.Errorf("no such command %q", c.Command)
}

// readOrNone is the file's bytes, or nil when there is no file.
func readOrNone(t *testing.T, path string) []byte {
	t.Helper()
	raw, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

// TestTypesMatchTheSidecarCases replays every case sidecars/manuscript-guide/tests/test_type_parity.py recorded from the sidecar's own
// type commands: the same file after it (a Story Bible started where there was none), or the same reason with the file untouched. One
// Service runs them all, so the held document must notice every new starting file, and a file that is gone.
func TestTypesMatchTheSidecarCases(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "type-parity.json"))
	if err != nil {
		t.Fatal(err)
	}
	var recorded struct {
		Starts map[string]json.RawMessage `json:"starts"`
		Cases  []typeCase                 `json:"cases"`
	}
	if err := json.Unmarshal(raw, &recorded); err != nil {
		t.Fatal(err)
	}
	if len(recorded.Cases) == 0 {
		t.Fatal("no recorded cases")
	}
	s := hostEditService(t)
	folder := filepath.Dir(s.guidePath())
	for index, c := range recorded.Cases {
		// Each case starts from no folder at all, as a project before its first build has none.
		if err := os.RemoveAll(folder); err != nil {
			t.Fatal(err)
		}
		var start []byte
		if stored := recorded.Starts[c.Start]; string(stored) != "null" {
			start = sidecarText(t, decodeExactly(t, stored))
			if err := os.MkdirAll(folder, 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(s.guidePath(), start, 0o600); err != nil {
				t.Fatal(err)
			}
		}
		err := c.run(s)
		written := readOrNone(t, s.guidePath())
		label := fmt.Sprintf("case %d %s %s %q", index, c.Command, c.Start, c.Arguments)
		switch {
		case c.Error != "":
			if err == nil || !sameReason(err.Error(), c.Error) {
				t.Errorf("%s: error = %v, want %q", label, err, c.Error)
			}
			if !bytes.Equal(written, start) {
				t.Errorf("%s: a refused command changed the file", label)
			}
		case err != nil:
			t.Errorf("%s: %v", label, err)
		case written == nil:
			t.Errorf("%s: no file was written", label)
		case !reflect.DeepEqual(decodeExactly(t, written), decodeExactly(t, c.After)):
			t.Errorf("%s: the file differs from the sidecar's\n got: %s\nwant: %s", label, written, c.After)
		}
	}
}

// A file that is not a Story Bible at all is refused and kept. The sidecar's load_json reads it as no file and its type commands then
// write a new Story Bible over it; the host does not, so a damaged file is still there to recover from.
func TestATypeEditLeavesAFileThatIsNotAStoryBible(t *testing.T) {
	for _, content := range []string{`{"schema_version": 2, "entities": [`, `[]`, `"text"`, "\x00\x01"} {
		s := hostEditService(t)
		if err := os.WriteFile(s.guidePath(), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		for name, call := range map[string]func() error{
			"AddType":       func() error { return s.AddType("Creature") },
			"RenameType":    func() error { return s.RenameType("Place", "Location") },
			"SetTypeColour": func() error { return s.SetTypeColour("Place", "amber") },
			"SetTypeSpeaks": func() error { return s.SetTypeSpeaks("Place", true) },
			"RemoveType":    func() error { return s.RemoveType("Event") },
		} {
			if err := call(); err == nil || !strings.Contains(err.Error(), "build it first") {
				t.Errorf("%s on %q = %v", name, content, err)
			}
			if got := readOrNone(t, s.guidePath()); string(got) != content {
				t.Errorf("%s on %q wrote %q", name, content, got)
			}
		}
	}
}

func TestTypeEditsStartNoSidecarAndReuseTheHeldDocument(t *testing.T) {
	s := heldService(t)
	steps := []func() error{
		func() error { return s.AddType("Creature") },
		func() error { return s.SetTypeSpeaks("Creature", true) },
		func() error { return s.SetTypeColour("Creature", "amber") },
		func() error { return s.RenameType("Place", "Location") },
		func() error { return s.RemoveType("Event") },
		func() error { return s.EditFields("b", map[string]string{"category": "Creature"}) },
	}
	for index, step := range steps {
		if err := step(); err != nil {
			t.Fatalf("step %d: %v", index, err)
		}
	}
	if got := s.parses.Load(); got != 1 {
		t.Fatalf("parses = %d, want 1", got)
	}
	types, err := s.Types()
	if err != nil {
		t.Fatal(err)
	}
	want := []Type{
		{"Character", "green", true}, {"Location", "blue", false}, {"Organization", "violet", false},
		{"Lore", "amber", false}, {"Item", "teal", false}, {"Creature", "amber", true},
	}
	if !reflect.DeepEqual(types, want) {
		t.Fatalf("types = %v, want %v", types, want)
	}
	if got := entityField(t, s, "b", "category"); got != "Creature" {
		t.Fatalf("b's category = %v: an edit after the type edits must see the new type", got)
	}
}

func TestPythonStripMatchesStrSpace(t *testing.T) {
	// Every code point Python's str.isspace() is true for (Python 3.12), so str.strip() removes it.
	spaces := []rune{
		0x9, 0xa, 0xb, 0xc, 0xd, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
		0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
	}
	for _, space := range spaces {
		if got := pythonStrip(string(space) + "a" + string(space)); got != "a" {
			t.Errorf("pythonStrip kept %#x", space)
		}
	}
	for _, kept := range []rune{0x0, 0x8, 0x180e, 0x200b, 0xfeff} {
		if got := pythonStrip(string(kept)); got != string(kept) {
			t.Errorf("pythonStrip removed %#x", kept)
		}
	}
}

// Every Cherokee small letter folds to its capital, as str.casefold folds it, so the two spellings of a type name are one name.
func TestFoldCaseFoldsCherokeeAsCasefoldDoes(t *testing.T) {
	pairs := map[rune]rune{0xab70: 0x13a0, 0xabbf: 0x13ef, 0x13f8: 0x13f0, 0x13fd: 0x13f5}
	for small, capital := range pairs {
		if got, want := foldCase(string(small)), string(capital); got != want || foldCase(string(capital)) != want {
			t.Errorf("foldCase(%U) = %q, foldCase(%U) = %q, want both %q", small, got, capital, foldCase(string(capital)), want)
		}
	}
	for small := rune(0xab70); small <= 0xabbf; small++ {
		if foldCase(string(small)) != foldCase(string(small-0xab70+0x13a0)) {
			t.Errorf("%U and its capital fold apart", small)
		}
	}
}
