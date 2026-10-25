package guide

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type mutationCase struct {
	Command   string          `json:"command"`
	Start     string          `json:"start"`
	Arguments map[string]any  `json:"arguments"`
	Wrote     bool            `json:"wrote"`
	After     json.RawMessage `json:"after"`
	Error     string          `json:"error"`
}

// run calls the Service method the case's sidecar command became.
func (c mutationCase) run(s *Service) error {
	text := func(name string) string { value, _ := c.Arguments[name].(string); return value }
	index := func(name string) *int {
		value, ok := c.Arguments[name].(float64)
		if !ok {
			return nil
		}
		whole := int(value)
		return &whole
	}
	switch c.Command {
	case "mark-reviewed":
		return s.MarkReviewed(text("entity_id"), index("alias_index"))
	case "review-flag":
		return s.FlagReview(text("entity_id"), index("alias_index"))
	case "speaker-color":
		return s.SetSpeakerColor(text("entity_id"), index("index"))
	case "relate":
		return s.Relate(text("entity_id"), text("other_id"), text("label"))
	case "unrelate":
		return s.Unrelate(text("entity_id"), text("other_id"), text("label"))
	case "delete":
		return s.Delete(text("entity_id"))
	case "correct-cue":
		return s.CorrectCue(text("cue_id"), text("speaker_entity_id"))
	}
	return fmt.Errorf("no such command %q", c.Command)
}

// sameReason compares two refusals the way a narrator reads them: the host's own early check of a speaker colour words the sidecar's
// sentence in lower case and without the full stop.
func sameReason(got, want string) bool {
	norm := func(text string) string { return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(text)), ".") }
	return norm(got) == norm(want)
}

// TestMutationsMatchTheSidecarCases replays every case testdata/mutation-parity.json recorded from the sidecar's own commands (frozen:
// #2251 deleted the Python commands and their recorder, so nothing rewrites it): the same file after it, no write when the sidecar wrote nothing, or the same reason with the file untouched. One
// Service runs them all, so the held document must notice every new starting file.
func TestMutationsMatchTheSidecarCases(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "mutation-parity.json"))
	if err != nil {
		t.Fatal(err)
	}
	var recorded struct {
		Starts map[string]json.RawMessage `json:"starts"`
		Cases  []mutationCase             `json:"cases"`
	}
	if err := json.Unmarshal(raw, &recorded); err != nil {
		t.Fatal(err)
	}
	if len(recorded.Cases) == 0 {
		t.Fatal("no recorded cases")
	}
	s := hostEditService(t)
	for index, c := range recorded.Cases {
		start := sidecarText(t, decodeExactly(t, recorded.Starts[c.Start]))
		if err := os.WriteFile(s.guidePath(), start, 0o600); err != nil {
			t.Fatal(err)
		}
		err := c.run(s)
		written, _ := os.ReadFile(s.guidePath())
		label := fmt.Sprintf("case %d %s %v", index, c.Command, c.Arguments)
		switch {
		case c.Error != "":
			if err == nil || !sameReason(err.Error(), c.Error) {
				t.Errorf("%s: error = %v, want %q", label, err, c.Error)
			}
			if !bytes.Equal(written, start) {
				t.Errorf("%s: a refused command wrote the file", label)
			}
		case err != nil:
			t.Errorf("%s: %v", label, err)
		case !c.Wrote && !bytes.Equal(written, start):
			t.Errorf("%s: the sidecar writes nothing here, the host wrote the file", label)
		case !reflect.DeepEqual(decodeExactly(t, written), decodeExactly(t, c.After)):
			t.Errorf("%s: the file differs from the sidecar's\n got: %s\nwant: %s", label, written, c.After)
		}
	}
}

func TestMutationsNeedAStoryBible(t *testing.T) {
	s := hostEditService(t)
	one := 1
	for name, call := range map[string]func() error{
		"MarkReviewed":    func() error { return s.MarkReviewed("a", nil) },
		"FlagReview":      func() error { return s.FlagReview("a", nil) },
		"SetSpeakerColor": func() error { return s.SetSpeakerColor("a", &one) },
		"Relate":          func() error { return s.Relate("a", "b", "x") },
		"Unrelate":        func() error { return s.Unrelate("a", "b", "x") },
		"Delete":          func() error { return s.Delete("a") },
		"CorrectCue":      func() error { return s.CorrectCue("c", "a") },
	} {
		if err := call(); err == nil || !strings.Contains(err.Error(), "build it first") {
			t.Errorf("%s without a file = %v", name, err)
		}
	}
}

// reviewEntry is a Character with the aliases texts and the given fields, for the review tests below.
func reviewEntry(aliases []string, fields map[string]any) map[string]any {
	list := []any{}
	for _, text := range aliases {
		list = append(list, map[string]any{"text": text, "pronunciation": map[string]any{}, "occurrences": []any{}})
	}
	entry := map[string]any{"id": "entity-wren", "canonical_name": "Wren", "category": "Character", "aliases": list, "locked": false, "review_state": "generated"}
	for key, value := range fields {
		entry[key] = value
	}
	return entry
}

// checkReview requires the entry's stored review flags and review_state.
func checkReview(t *testing.T, s *Service, entry bool, aliases []any, state string) {
	t.Helper()
	want := map[string]any{"entry": entry, "aliases": aliases}
	if got := entityField(t, s, "entity-wren", "review"); !reflect.DeepEqual(got, want) {
		t.Fatalf("review = %v, want %v", got, want)
	}
	if got := entityField(t, s, "entity-wren", "review_state"); got != state {
		t.Fatalf("review_state = %v, want %q", got, state)
	}
}

// Ported from the sidecar's test_review_flags.py when #2251 deleted its mark-reviewed: the entry is reviewed once the last name that
// needed a look is, even though the entry's own flag was already clear.
func TestTheEntryIsReviewedWhenItsLastFlaggedNameIs(t *testing.T) {
	s := serviceWithGuideFile(t, []any{reviewEntry([]string{"Sparrow"}, map[string]any{
		"review_state": "needs review", "review": map[string]any{"entry": false, "aliases": []any{"Sparrow"}},
	})})
	first := 0
	if err := s.MarkReviewed("entity-wren", &first); err != nil {
		t.Fatal(err)
	}
	checkReview(t, s, false, []any{}, "reviewed")
}

// Ported from test_review_flags.py: Flag review of the entry and of a name puts back what Mark reviewed cleared.
func TestFlagReviewIsTheUndoOfMarkReviewed(t *testing.T) {
	s := serviceWithGuideFile(t, []any{reviewEntry([]string{"Sparrow"}, map[string]any{
		"review_state": "needs review", "review": map[string]any{"entry": true, "aliases": []any{"Sparrow"}},
	})})
	first := 0
	if err := s.MarkReviewed("entity-wren", nil); err != nil {
		t.Fatal(err)
	}
	checkReview(t, s, false, []any{}, "reviewed")
	if err := s.FlagReview("entity-wren", nil); err != nil {
		t.Fatal(err)
	}
	if err := s.FlagReview("entity-wren", &first); err != nil {
		t.Fatal(err)
	}
	checkReview(t, s, true, []any{"Sparrow"}, "needs review")
}

// Ported from test_review_flags.py: flagging one name of an entry nobody flagged leaves the entry's own flag and its review_state alone.
func TestFlaggingANameLeavesTheEntryFlagAlone(t *testing.T) {
	s := serviceWithGuideFile(t, []any{reviewEntry([]string{"Sparrow"}, nil)})
	first := 0
	if err := s.FlagReview("entity-wren", &first); err != nil {
		t.Fatal(err)
	}
	checkReview(t, s, false, []any{"Sparrow"}, "generated")
}
