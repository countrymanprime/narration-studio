package guide

// State matrix of a merge, an unmerge and a split in the host. Each cell names its test; a cell the sidecar's recorded cases already
// pin says so (TestMergesMatchTheSidecarCases replays testdata/merge-parity.json, written by test_merge_parity.py).
//
//	empty (a file with no entries)            TestMergeNeedsAStoryBible
//	one and many entries                      the recorded cases (a merge of a few entries; twelve merges of fourteen)
//	merge into a locked entry                 the recorded case "merge into a locked entry"
//	merge of a locked entry                   the recorded case, and TestARefusedMergeLeavesTheFileAndDropsTheHeldDocument
//	rapid double-fire                         TestTheSecondOfTwoMergesOfOneEntryIsRefused
//	stale document (another writer)           TestAMergeSeesAnotherWritersChange (size and bytes, not only the time)
//	failed write drops the held document      TestAFailedWriteDropsTheHeldDocument
//	unmerge after edits                       the recorded cases "after the target was edited" and "after a re-pointed relationship changed"
//	unmerge of a record the other side wrote  TestMergesMatchTheSidecarCases, step by step on the sidecar's file
//	an old file (no absorbed names)           the recorded case "in a file with no absorbed names"
//	long, right-to-left, emoji text           the recorded case "names that lower-case differently", and the encoder golden
//	reload mid-action, leave mid-action       not tested: the file is read and written in one call under editMu, with nothing to leave halfway
//	the source's id back in the file          TestUnmergeRefusesWhenTheSourceIdCameBack (no sidecar command can make it)

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
)

type mergeStep struct {
	Command   string          `json:"command"`
	Arguments map[string]any  `json:"arguments"`
	Wrote     bool            `json:"wrote"`
	After     json.RawMessage `json:"after"`
	Error     string          `json:"error"`
}

type mergeCase struct {
	Name    string      `json:"name"`
	Start   string      `json:"start"`
	Results []mergeStep `json:"results"`
}

func (step mergeStep) run(s *Service) error {
	text := func(name string) string { value, _ := step.Arguments[name].(string); return value }
	switch step.Command {
	case "merge":
		_, err := s.Merge(text("source_id"), text("target_id"))
		return err
	case "unmerge":
		return s.Unmerge(text("undo_id"))
	case "split":
		_, err := s.Split(text("entity_id"), text("alias_text"))
		return err
	case "mark-reviewed":
		return s.MarkReviewed(text("entity_id"), nil)
	case "unrelate":
		return s.Unrelate(text("entity_id"), text("other_id"), text("label"))
	case "delete":
		return s.Delete(text("entity_id"))
	}
	return fmt.Errorf("no such command %q", step.Command)
}

// countingIDs gives the undo ids the Python recorder fixed: 0000000000000001, then 0000000000000002 and on, one per merge made.
func countingIDs(s *Service, made int) {
	s.undoIDs = func() string {
		made++
		return fmt.Sprintf("%016x", made)
	}
}

// TestMergesMatchTheSidecarCases replays every recorded case twice: as a chain on the host's own writes, and with each step on the file
// the sidecar left, so the host unmerges a record the sidecar wrote and merges from a file the sidecar wrote.
func TestMergesMatchTheSidecarCases(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "merge-parity.json"))
	if err != nil {
		t.Fatal(err)
	}
	var recorded struct {
		Starts map[string]json.RawMessage `json:"starts"`
		Cases  []mergeCase                `json:"cases"`
	}
	if err := json.Unmarshal(raw, &recorded); err != nil {
		t.Fatal(err)
	}
	if len(recorded.Cases) < 15 {
		t.Fatalf("only %d recorded cases", len(recorded.Cases))
	}
	s := hostEditService(t)
	check := func(label string, step mergeStep, err error, start []byte) {
		t.Helper()
		written, _ := os.ReadFile(s.guidePath())
		switch {
		case step.Error != "":
			if err == nil || err.Error() != step.Error {
				t.Errorf("%s: error = %v, want %q", label, err, step.Error)
			}
			if !bytes.Equal(written, start) {
				t.Errorf("%s: a refused command wrote the file", label)
			}
		case err != nil:
			t.Errorf("%s: %v", label, err)
		case !reflect.DeepEqual(decodeExactly(t, written), decodeExactly(t, step.After)):
			t.Errorf("%s: the file differs from the sidecar's\n got: %s\nwant: %s", label, written, step.After)
		case step.Wrote == bytes.Equal(written, start):
			t.Errorf("%s: wrote = %v but the file's bytes changed = %v", label, step.Wrote, !bytes.Equal(written, start))
		}
	}
	for _, c := range recorded.Cases {
		startText := sidecarText(t, decodeExactly(t, recorded.Starts[c.Start]))
		// As a chain on the host's own files.
		if err := os.WriteFile(s.guidePath(), startText, 0o600); err != nil {
			t.Fatal(err)
		}
		countingIDs(s, 0)
		before := startText
		for index, step := range c.Results {
			err := step.run(s)
			check(fmt.Sprintf("%s, chain step %d %s", c.Name, index+1, step.Command), step, err, before)
			before, _ = os.ReadFile(s.guidePath())
		}
		// Each step on the sidecar's file.
		before = startText
		made := 0
		for index, step := range c.Results {
			if err := os.WriteFile(s.guidePath(), before, 0o600); err != nil {
				t.Fatal(err)
			}
			countingIDs(s, made)
			err := step.run(s)
			check(fmt.Sprintf("%s, sidecar step %d %s", c.Name, index+1, step.Command), step, err, before)
			if step.Command == "merge" && step.Error == "" {
				made++
			}
			if step.Error == "" {
				before = sidecarText(t, decodeExactly(t, step.After))
			}
		}
	}
}

func TestPythonJSONMatchesTheGolden(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "merge-fingerprint-golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	var golden struct {
		Values []struct {
			JSON        string `json:"json"`
			PythonJSON  string `json:"python_json"`
			Fingerprint string `json:"fingerprint"`
		} `json:"values"`
		Names []struct {
			Text       string `json:"text"`
			Lower      string `json:"lower"`
			Normalized string `json:"normalized"`
			EntityID   string `json:"entity_id"`
		} `json:"names"`
	}
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatal(err)
	}
	if len(golden.Values) < 30 || len(golden.Names) < 20 {
		t.Fatalf("the golden holds %d values and %d names", len(golden.Values), len(golden.Names))
	}
	for _, row := range golden.Values {
		value := decodeExactly(t, []byte(row.JSON))
		if got := pythonJSON(value); got != row.PythonJSON {
			t.Errorf("pythonJSON(%s) = %s, want %s", row.JSON, got, row.PythonJSON)
		}
		if got := fingerprint(value); got != row.Fingerprint {
			t.Errorf("fingerprint(%s) = %s, want %s", row.JSON, got, row.Fingerprint)
		}
	}
	for _, row := range golden.Names {
		if got := pythonLower(row.Text); got != row.Lower {
			t.Errorf("pythonLower(%q) = %q, want %q", row.Text, got, row.Lower)
		}
		if got := normalizeName(row.Text); got != row.Normalized {
			t.Errorf("normalizeName(%q) = %q, want %q", row.Text, got, row.Normalized)
		}
		if got := entityID(row.Text); got != row.EntityID {
			t.Errorf("entityID(%q) = %q, want %q", row.Text, got, row.EntityID)
		}
	}
}

func writeStart(t *testing.T, s *Service, text string) {
	t.Helper()
	if err := os.WriteFile(s.guidePath(), []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

const twoEntries = `{"schema_version": 2, "entities": [
  {"id": "a", "canonical_name": "Ann", "aliases": [], "relationships": []},
  {"id": "b", "canonical_name": "Bea", "aliases": [], "relationships": []},
  {"id": "c", "canonical_name": "Cy", "aliases": [], "relationships": [{"id": "a", "name": "Ann", "label": "knows"}]}]}`

func TestMergeNeedsAStoryBible(t *testing.T) {
	s := hostEditService(t)
	for name, call := range map[string]func() error{
		"Merge":   func() error { _, err := s.Merge("a", "b"); return err },
		"Unmerge": func() error { return s.Unmerge("0123456789abcdef") },
		"Split":   func() error { _, err := s.Split("a", "x"); return err },
	} {
		if err := call(); err == nil || !strings.Contains(err.Error(), "build it first") {
			t.Errorf("%s without a file = %v", name, err)
		}
	}
	writeStart(t, s, `{}`)
	if _, err := s.Merge("a", "b"); err == nil || !strings.Contains(err.Error(), "build it first") {
		t.Errorf("Merge in an empty object = %v", err)
	}
}

func TestMergeAnswersAnUndoIDOfSixteenHexCharacters(t *testing.T) {
	s := hostEditService(t)
	writeStart(t, s, twoEntries)
	merged, err := s.Merge("a", "b")
	if err != nil {
		t.Fatal(err)
	}
	if !isUndoID(merged.UndoID) {
		t.Fatalf("undo id = %q", merged.UndoID)
	}
	if err := s.Unmerge(merged.UndoID); err != nil {
		t.Fatal(err)
	}
}

// The answer GuideMerge sends the page, as the wire contract pins it.
func TestMergeResultMatchesTheContractFile(t *testing.T) {
	s := hostEditService(t)
	writeStart(t, s, twoEntries)
	s.undoIDs = func() string { return "0123456789abcdef" }
	merged, err := s.Merge("a", "b")
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "guide-merge", merged)
}

func TestTheSecondOfTwoMergesOfOneEntryIsRefused(t *testing.T) {
	s := hostEditService(t)
	writeStart(t, s, twoEntries)
	if _, err := s.Merge("a", "b"); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(s.guidePath())
	if _, err := s.Merge("a", "b"); err == nil || err.Error() != "Entity not found." {
		t.Fatalf("a second merge of the same entry = %v", err)
	}
	if after, _ := os.ReadFile(s.guidePath()); !bytes.Equal(after, before) {
		t.Fatal("the refused merge wrote the file")
	}
}

func TestARefusedMergeLeavesTheFileAndDropsTheHeldDocument(t *testing.T) {
	s := hostEditService(t)
	writeStart(t, s, strings.Replace(twoEntries, `"id": "a",`, `"id": "a", "locked": true,`, 1))
	before, _ := os.ReadFile(s.guidePath())
	if _, err := s.Merge("a", "b"); err == nil {
		t.Fatal("a locked source was merged")
	}
	s.editMu.Lock()
	held := s.held
	s.editMu.Unlock()
	if held != nil {
		t.Fatal("the held document survived a refusal")
	}
	if after, _ := os.ReadFile(s.guidePath()); !bytes.Equal(after, before) {
		t.Fatal("the refused merge wrote the file")
	}
}

func TestAMergeSeesAnotherWritersChange(t *testing.T) {
	s := hostEditService(t)
	writeStart(t, s, twoEntries)
	if err := s.Delete("c"); err != nil {
		t.Fatal(err)
	}
	// Another writer puts "c" back with the same length of file: the held copy must not be used.
	writeStart(t, s, twoEntries)
	merged, err := s.Merge("c", "b")
	if err != nil {
		t.Fatal(err)
	}
	if !isUndoID(merged.UndoID) {
		t.Fatalf("undo id = %q", merged.UndoID)
	}
}

func TestAFailedWriteDropsTheHeldDocument(t *testing.T) {
	s := hostEditService(t)
	writeStart(t, s, twoEntries)
	if _, err := s.Merge("a", "b"); err != nil {
		t.Fatal(err)
	}
	// A directory where the temporary file goes makes the next write fail.
	if err := os.Mkdir(s.guidePath()+".tmp", 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Merge("c", "b"); err == nil {
		t.Fatal("a merge that could not be written succeeded")
	}
	s.editMu.Lock()
	held := s.held
	s.editMu.Unlock()
	if held != nil {
		t.Fatal("the held document survived a failed write")
	}
	if err := os.Remove(s.guidePath() + ".tmp"); err != nil {
		t.Fatal(err)
	}
	// The file is as the first merge left it, and the next merge starts from it.
	var document map[string]any
	raw, _ := os.ReadFile(s.guidePath())
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	if got := len(document["entities"].([]any)); got != 2 {
		t.Fatalf("%d entries after the failed merge, want 2", got)
	}
	if _, err := s.Merge("c", "b"); err != nil {
		t.Fatalf("the merge after the failed write: %v", err)
	}
}

func TestUnmergeRefusesWhenTheSourceIdCameBack(t *testing.T) {
	s := hostEditService(t)
	writeStart(t, s, twoEntries)
	merged, err := s.Merge("a", "b")
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	raw, _ := os.ReadFile(s.guidePath())
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	entities := document["entities"].([]any)
	document["entities"] = append(entities, map[string]any{"id": "a", "canonical_name": "Ann again"})
	changed, _ := json.Marshal(document)
	if err := os.WriteFile(s.guidePath(), changed, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := s.Unmerge(merged.UndoID); err == nil || err.Error() != "An entry named Ann is in the Story Bible again, so the merge cannot be undone." {
		t.Fatalf("Unmerge = %v", err)
	}
}

func TestSplitAnswersTheNewEntrysID(t *testing.T) {
	s := hostEditService(t)
	writeStart(t, s, `{"schema_version": 2, "entities": [{"id": "a", "canonical_name": "Ann", "aliases": [{"text": "Annie", "pronunciation": {}, "occurrences": []}]}]}`)
	id, err := s.Split("a", "annie")
	if err != nil {
		t.Fatal(err)
	}
	if id != entityID("Annie") {
		t.Fatalf("id = %q, want %q", id, entityID("Annie"))
	}
}
