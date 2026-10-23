package guide

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

const heldStart = `{
  "schema_version": 2,
  "entities": [
    {"id": "a", "canonical_name": "Ada", "category": "Character", "locked": false},
    {"id": "b", "canonical_name": "Bo", "category": "Place", "locked": false}
  ]
}
`

func heldService(t *testing.T) *Service {
	t.Helper()
	s := hostEditService(t)
	if err := os.WriteFile(s.guidePath(), []byte(heldStart), 0o600); err != nil {
		t.Fatal(err)
	}
	return s
}

func entityField(t *testing.T, s *Service, id, field string) any {
	t.Helper()
	raw, err := os.ReadFile(s.guidePath())
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		Entities []map[string]any `json:"entities"`
	}
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	for _, entity := range document.Entities {
		if entity["id"] == id {
			return entity[field]
		}
	}
	t.Fatalf("no entity %s", id)
	return nil
}

func TestTheFileIsParsedOnceWhileNoOneElseWritesIt(t *testing.T) {
	s := heldService(t)
	for i, fields := range []map[string]string{{"description": "one"}, {"context": "two"}, {"locked": "true"}, {"locked": "false"}} {
		if err := s.EditFields("a", fields); err != nil {
			t.Fatalf("edit %d: %v", i, err)
		}
	}
	if got := s.parses.Load(); got != 1 {
		t.Fatalf("parses = %d, want 1: an edit after the host's own write reuses the held document", got)
	}
	if entityField(t, s, "a", "context") != "two" || entityField(t, s, "a", "description").(map[string]any)["text"] != "one" {
		t.Fatal("an edit was lost")
	}
}

// Another writer (the sidecar, a build, a tool, the narrator) is seen by its bytes, not by the file's size or time: here the new file
// has the same length and is given the same modification time, as a coarse file system (FAT32, some network drives) would report it.
func TestAnotherWriterIsSeenEvenWithTheSameSizeAndTime(t *testing.T) {
	s := heldService(t)
	if err := s.EditFields("a", map[string]string{"description": "mine"}); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(s.guidePath())
	info, _ := os.Stat(s.guidePath())
	other := bytes.Replace(before, []byte(`"Bo"`), []byte(`"Cy"`), 1)
	if len(other) != len(before) || bytes.Equal(other, before) {
		t.Fatal("the other writer's file must differ with the same length")
	}
	if err := os.WriteFile(s.guidePath(), other, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(s.guidePath(), info.ModTime(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	if err := s.EditFields("a", map[string]string{"context": "after"}); err != nil {
		t.Fatal(err)
	}
	if entityField(t, s, "b", "canonical_name") != "Cy" {
		t.Fatal("the host wrote its stale copy over the other writer's change")
	}
	if got := s.parses.Load(); got != 2 {
		t.Fatalf("parses = %d, want 2", got)
	}
}

func TestARefusedFieldLeavesTheHeldDocumentAsItWas(t *testing.T) {
	s := heldService(t)
	if err := s.EditFields("a", map[string]string{"description": "kept"}); err != nil {
		t.Fatal(err)
	}
	if err := s.EditFields("a", map[string]string{"description": "lost", "category": "Draft"}); err == nil {
		t.Fatal("a reserved category was accepted")
	}
	if err := s.EditFields("a", map[string]string{"context": "c"}); err != nil {
		t.Fatal(err)
	}
	if got := entityField(t, s, "a", "description").(map[string]any)["text"]; got != "kept" {
		t.Fatalf("description = %v: a refused field reached the held document", got)
	}
	if got := s.parses.Load(); got != 1 {
		t.Fatalf("parses = %d, want 1", got)
	}
}

func TestAFileThatIsGoneIsNotEditedFromTheHeldCopy(t *testing.T) {
	s := heldService(t)
	if err := s.EditFields("a", map[string]string{"description": "x"}); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(s.guidePath()); err != nil {
		t.Fatal(err)
	}
	if err := s.EditFields("a", map[string]string{"description": "y"}); err == nil || !strings.Contains(err.Error(), "build it first") {
		t.Fatalf("edit of a removed file = %v", err)
	}
	if _, err := os.Stat(s.guidePath()); !os.IsNotExist(err) {
		t.Fatal("the held copy brought a removed file back")
	}
}

// The parity cases again, all through one Service: each case's starting file replaces the last, which the held document must notice
// every time, however quickly the files follow each other.
func TestEditMatchesTheSidecarCasesThroughOneService(t *testing.T) {
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
	s := hostEditService(t)
	stamp := time.Unix(1_700_000_000, 0)
	for index, c := range recorded.Cases {
		start := sidecarText(t, decodeExactly(t, recorded.Starts[c.Start]))
		if err := os.WriteFile(s.guidePath(), start, 0o600); err != nil {
			t.Fatal(err)
		}
		// Every starting file gets the same time, so only its bytes can tell the held document it changed.
		if err := os.Chtimes(s.guidePath(), stamp, stamp); err != nil {
			t.Fatal(err)
		}
		err := s.EditFields(c.EntityID, c.Fields)
		written, _ := os.ReadFile(s.guidePath())
		switch {
		case c.Error != "":
			if err == nil || reasonOf(err.Error()) != reasonOf(c.Error) || !bytes.Equal(written, start) {
				t.Errorf("case %d %v: error = %v, want %q and the file untouched", index, c.Fields, err, c.Error)
			}
		case err != nil:
			t.Errorf("case %d %v: %v", index, c.Fields, err)
		case !reflect.DeepEqual(decodeExactly(t, written), decodeExactly(t, c.After)):
			t.Errorf("case %d %v: the file differs from the sidecar's", index, c.Fields)
		}
		// A second edit of the same file reuses the held document and must still agree with what was written.
		if c.Error == "" && err == nil {
			before := s.parses.Load()
			if err := s.EditFields(c.EntityID, map[string]string{"context": "again"}); err != nil && !strings.Contains(err.Error(), "locked") {
				t.Errorf("case %d: second edit: %v", index, err)
			}
			if s.parses.Load() != before {
				t.Errorf("case %d: the second edit parsed the file again", index)
			}
		}
	}
}

// blockWrite makes the next writeDocument fail by putting a directory where it writes its temporary file; the returned function lifts it.
func blockWrite(t *testing.T, s *Service) (lift func()) {
	t.Helper()
	blocker := s.guidePath() + ".tmp"
	if err := os.Mkdir(blocker, 0o700); err != nil {
		t.Fatal(err)
	}
	return func() {
		if err := os.Remove(blocker); err != nil {
			t.Fatal(err)
		}
	}
}

// A write that fails leaves the file's contents unknown, so the held document is dropped and the next edit parses the file again.
func TestAFailedWriteDropsTheHeldDocument(t *testing.T) {
	s := heldService(t)
	if err := s.EditFields("a", map[string]string{"description": "kept"}); err != nil {
		t.Fatal(err)
	}
	lift := blockWrite(t, s)
	if err := s.EditFields("a", map[string]string{"context": "never written"}); err == nil {
		t.Fatal("the edit succeeded though its file could not be written")
	}
	lift()
	if err := s.EditFields("a", map[string]string{"locked": "true"}); err != nil {
		t.Fatal(err)
	}
	if got := s.parses.Load(); got != 2 {
		t.Fatalf("parses = %d, want 2: the edit after a failed write used the held document", got)
	}
	if got := entityField(t, s, "a", "context"); got != nil {
		t.Fatalf("context = %v: the failed edit reached the file", got)
	}
	if got := entityField(t, s, "a", "description").(map[string]any)["text"]; got != "kept" {
		t.Fatalf("description = %v, want the edit made before the failure", got)
	}
}

// The same for a command that changes the document through mutateInHost.
func TestAFailedMutationWriteDropsTheHeldDocument(t *testing.T) {
	s := heldService(t)
	if err := s.EditFields("a", map[string]string{"description": "kept"}); err != nil {
		t.Fatal(err)
	}
	lift := blockWrite(t, s)
	if err := s.MarkReviewed("b", nil); err == nil {
		t.Fatal("the command succeeded though its file could not be written")
	}
	lift()
	if err := s.EditFields("a", map[string]string{"locked": "true"}); err != nil {
		t.Fatal(err)
	}
	if got := s.parses.Load(); got != 2 {
		t.Fatalf("parses = %d, want 2: the edit after a failed write used the held document", got)
	}
	if got := entityField(t, s, "b", "review_state"); got == "reviewed" {
		t.Fatal("the failed command reached the file")
	}
}
