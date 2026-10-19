package guide

// State matrix of a rescan and a status in the host. Each cell names its test; a cell the sidecar's recorded cases already pin says so
// (TestRescansMatchTheSidecarCases and TestStatusMatchesTheSidecarCases replay testdata/rescan-parity.json, TestFindOccurrencesMatches
// TheSidecar replays testdata/occurrence-parity.json; test_rescan_parity.py writes them).
//
//	no Story Bible                             the recorded cases "with no Story Bible", "with an empty Story Bible"
//	an entry with no occurrences               the recorded case "an entry with no occurrences"
//	one entry and many                         the recorded cases (one entry; every entry of a Story Bible in turn)
//	huge manuscript                            TestFindOccurrencesOnAFullLengthManuscript (88,000 words, the name in every paragraph), and the
//	                                           recorded real-shaped manuscript (rescan-manuscript.json: every content kind, 300 paragraphs)
//	long, emoji and right-to-left text         the recorded find_occurrences cases and the sweep; the recorded rescans of "Zoë 😀", Hebrew and Arabic
//	locked entry                               the recorded case "a locked entry" (a rescan does not refuse it, as the sidecar does not)
//	a manuscript that changed since the build  the recorded case "after the manuscript changed since the build", and TestARescanReadsTheManuscriptAsItIsNow
//	missing, corrupt or odd manuscript         the recorded refusals; TestAManuscriptThatCannotBeReadIsRefused (bytes Python's JSON would not take)
//	a manuscript that is not narrated          the recorded cases (all reference or opening; no paragraphs)
//	failed write drops the held document       TestAFailedRescanWriteDropsTheHeldDocument
//	a refusal drops the held document          TestARefusedRescanLeavesTheFileAndDropsTheHeldDocument
//	stale document (another writer)           TestARescanSeesAnotherWritersChange (the same length of file)
//	rapid double-fire                          TestTwoRescansAtOnce (under -race), and the recorded case of the same entry twice
//	reload mid-action, leave mid-action        not tested: the file is read and written in one call under editMu, with nothing to leave halfway
//	no project                                 TestRescanAndStatusNeedAProject

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
)

type rescanStep struct {
	Command   string          `json:"command"`
	Arguments map[string]any  `json:"arguments"`
	Wrote     bool            `json:"wrote"`
	Entity    json.RawMessage `json:"entity"`
	Error     string          `json:"error"`
	Result    string          `json:"result"`
	OSError   bool            `json:"os_error"`
}

type rescanCase struct {
	Name       string       `json:"name"`
	Start      *string      `json:"start"`
	Manuscript string       `json:"manuscript"`
	Results    []rescanStep `json:"results"`
}

type statusCase struct {
	Name       string  `json:"name"`
	Start      *string `json:"start"`
	Manuscript string  `json:"manuscript"`
	Result     string  `json:"result"`
	Error      string  `json:"error"`
	OSError    bool    `json:"os_error"`
}

type rescanGolden struct {
	Starts      map[string]string          `json:"starts"`
	Manuscripts map[string]json.RawMessage `json:"manuscripts"`
	Cases       []rescanCase               `json:"cases"`
	Statuses    []statusCase               `json:"statuses"`
}

func readRescanGolden(t *testing.T) rescanGolden {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "rescan-parity.json"))
	if err != nil {
		t.Fatal(err)
	}
	var golden rescanGolden
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatal(err)
	}
	return golden
}

// manuscriptBytes is the file a recorded manuscript stands for: its text, the committed real-shaped file, or nothing (absent).
func manuscriptBytes(t *testing.T, spec json.RawMessage) ([]byte, bool) {
	t.Helper()
	var text *string
	if err := json.Unmarshal(spec, &text); err == nil {
		if text == nil {
			return nil, false
		}
		return []byte(*text), true
	}
	var file struct {
		File string `json:"file"`
	}
	if err := json.Unmarshal(spec, &file); err != nil || file.File == "" {
		t.Fatalf("manuscript spec %s", spec)
	}
	raw, err := os.ReadFile(filepath.Join("testdata", file.File))
	if err != nil {
		t.Fatal(err)
	}
	return raw, true
}

func remove(t *testing.T, path string) {
	t.Helper()
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		t.Fatal(err)
	}
}

func writeManuscript(t *testing.T, s *Service, raw []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(s.manuscript()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(s.manuscript(), raw, 0o600); err != nil {
		t.Fatal(err)
	}
}

// startFile is a recorded Story Bible in the host's key order (the sidecar's is insertion order, and the host writes sorted keys), so
// "did the command write" compares like with like. A start that is not a JSON object with something in it is written as it is.
func startFile(t *testing.T, text string) []byte {
	t.Helper()
	var document map[string]any
	if json.Unmarshal([]byte(text), &document) != nil || len(document) == 0 {
		return []byte(text)
	}
	return sidecarText(t, decodeExactly(t, []byte(text)))
}

// afterRescan is the Story Bible the sidecar's rescan leaves: the file as the sidecar reads it, with the one entry replaced.
func afterRescan(t *testing.T, before []byte, entityID string, entity json.RawMessage) []byte {
	t.Helper()
	document, err := parseForEdit(before)
	if err != nil {
		t.Fatal(err)
	}
	entities := document["entities"].([]any)
	for index, raw := range entities {
		if raw.(map[string]any)["id"] == entityID {
			entities[index] = decodeExactly(t, entity)
		}
	}
	return sidecarText(t, document)
}

func (step rescanStep) run(s *Service) (string, error) {
	switch step.Command {
	case "rescan":
		id, _ := step.Arguments["entity_id"].(string)
		return "", s.Rescan(id)
	case "status":
		return s.Status()
	}
	return "", fmt.Errorf("no such command %q", step.Command)
}

// TestRescansMatchTheSidecarCases replays every recorded case twice: as a chain on the host's own writes, and with each step on the file
// the sidecar left. A rescan changes one entry, so the cases record that entry and the test requires the rest of the file as it was.
func TestRescansMatchTheSidecarCases(t *testing.T) {
	golden := readRescanGolden(t)
	if len(golden.Cases) < 20 {
		t.Fatalf("only %d recorded cases", len(golden.Cases))
	}
	refused, wrote := 0, 0
	for _, c := range golden.Cases {
		for _, mode := range []string{"chain", "sidecar"} {
			s := hostEditService(t)
			remove(t, s.guidePath())
			manuscript, present := manuscriptBytes(t, golden.Manuscripts[c.Manuscript])
			if present {
				writeManuscript(t, s, manuscript)
			}
			var before []byte
			if c.Start != nil {
				before = startFile(t, golden.Starts[*c.Start])
				writeStart(t, s, string(before))
			}
			for index, step := range c.Results {
				label := fmt.Sprintf("%s, %s step %d %s", c.Name, mode, index+1, step.Command)
				if step.Command == "status" {
					got, err := step.run(s)
					switch {
					case step.OSError:
						if err == nil {
							t.Errorf("%s: status = %q, want an error", label, got)
						}
					case err != nil:
						t.Errorf("%s: %v", label, err)
					case "STATUS|"+got != step.Result:
						t.Errorf("%s: %s, want %s", label, got, step.Result)
					}
					continue
				}
				_, err := step.run(s)
				written, _ := os.ReadFile(s.guidePath())
				if step.Error != "" {
					refused++
					if err == nil || err.Error() != step.Error {
						t.Errorf("%s: error = %v, want %q", label, err, step.Error)
					}
					if !bytes.Equal(written, before) {
						t.Errorf("%s: a refused command wrote the file", label)
					}
					continue
				}
				if err != nil {
					t.Errorf("%s: %v", label, err)
					continue
				}
				id, _ := step.Arguments["entity_id"].(string)
				want := afterRescan(t, before, id, step.Entity)
				if !reflect.DeepEqual(decodeExactly(t, written), decodeExactly(t, want)) {
					t.Errorf("%s: the file differs from the sidecar's\n got: %.2000s\nwant: %.2000s", label, written, want)
				}
				if changed := !bytes.Equal(written, before); changed != step.Wrote {
					t.Errorf("%s: the sidecar's bytes changed = %v, the host's = %v", label, step.Wrote, changed)
				}
				wrote++
				if mode == "sidecar" {
					// The next step starts from the file the sidecar left, not the host's.
					written = want
					writeStart(t, s, string(written))
				}
				before = written
			}
		}
	}
	if refused < 16 || wrote < 40 {
		t.Errorf("%d refusals and %d rescans replayed", refused, wrote)
	}
}

func TestStatusMatchesTheSidecarCases(t *testing.T) {
	golden := readRescanGolden(t)
	counts := map[string]int{}
	for _, c := range golden.Statuses {
		s := hostEditService(t)
		remove(t, s.guidePath())
		if raw, present := manuscriptBytes(t, golden.Manuscripts[c.Manuscript]); present {
			writeManuscript(t, s, raw)
		}
		if c.Start != nil {
			writeStart(t, s, golden.Starts[*c.Start])
		}
		got, err := s.Status()
		switch {
		case c.OSError:
			counts["error"]++
			if err == nil {
				t.Errorf("%s: status = %q, want an error", c.Name, got)
			}
		case err != nil:
			t.Errorf("%s: %v", c.Name, err)
		default:
			counts[got]++
			if "STATUS|"+got != c.Result {
				t.Errorf("%s: status = %s, want %s", c.Name, got, c.Result)
			}
		}
	}
	for _, want := range []string{StatusMissing, StatusStale, StatusCurrent, "error"} {
		if counts[want] == 0 {
			t.Errorf("no recorded status case answers %s", want)
		}
	}
}

const rescanBible = `{"schema_version": 2, "source": {"sha256": "x"}, "entities": [
  {"id": "a", "canonical_name": "Ann", "aliases": [{"text": "Annie", "pronunciation": {}, "occurrences": []}], "occurrences": [], "review_state": "needs review"},
  {"id": "b", "canonical_name": "Bea", "aliases": [], "occurrences": [], "locked": true}]}`

func manuscriptOf(paragraphs ...string) []byte {
	chapter := map[string]any{"id": "c-1", "title": "One", "contentKind": "narration"}
	var items []map[string]any
	for index, text := range paragraphs {
		items = append(items, map[string]any{"id": fmt.Sprintf("p-%d", index+1), "chapterId": "c-1", "chapterTitle": "One", "text": text})
	}
	raw, _ := json.Marshal(map[string]any{"schemaVersion": 1, "documentId": "d", "chapters": []any{chapter}, "paragraphs": items})
	return raw
}

func rescanService(t *testing.T, manuscript []byte) *Service {
	t.Helper()
	s := hostEditService(t)
	writeStart(t, s, rescanBible)
	writeManuscript(t, s, manuscript)
	return s
}

func occurrencesOf(t *testing.T, s *Service, id string) int {
	t.Helper()
	entities, err := s.Entities()
	if err != nil {
		t.Fatal(err)
	}
	for _, entity := range entities {
		if entity["id"] == id {
			return len(entity["occurrences"].([]any))
		}
	}
	t.Fatalf("no entry %s", id)
	return 0
}

func TestRescanAndStatusNeedAProject(t *testing.T) {
	s := hostEditService(t)
	s.project = ""
	if err := s.Rescan("a"); err == nil || !strings.Contains(err.Error(), "import a manuscript first") {
		t.Errorf("Rescan = %v", err)
	}
	if _, err := s.Status(); err == nil {
		t.Error("Status without a project succeeded")
	}
}

func TestARescanReadsTheManuscriptAsItIsNow(t *testing.T) {
	s := rescanService(t, manuscriptOf("Ann met Annie.", "Ann."))
	// The Story Bible was built from some other manuscript: it is stale, and a rescan does not change that.
	if got, err := s.Status(); err != nil || got != StatusStale {
		t.Fatalf("status = %q, %v", got, err)
	}
	if err := s.Rescan("a"); err != nil {
		t.Fatal(err)
	}
	if got := occurrencesOf(t, s, "a"); got != 2 {
		t.Fatalf("%d occurrences", got)
	}
	writeManuscript(t, s, manuscriptOf("Ann."))
	if err := s.Rescan("a"); err != nil {
		t.Fatal(err)
	}
	if got := occurrencesOf(t, s, "a"); got != 1 {
		t.Fatalf("%d occurrences after the manuscript changed", got)
	}
	if got, _ := s.Status(); got != StatusStale {
		t.Fatalf("status after a rescan = %q: only a build brings the hash up to date", got)
	}
}

func TestARescanSeesAnotherWritersChange(t *testing.T) {
	s := rescanService(t, manuscriptOf("Ann met Annie."))
	if err := s.Rescan("a"); err != nil {
		t.Fatal(err)
	}
	held, _ := os.ReadFile(s.guidePath())
	// Another writer renames the entry to a name of the same length: the held copy must not be used.
	changed := bytes.Replace(held, []byte(`"canonical_name": "Ann"`), []byte(`"canonical_name": "Bob"`), 1)
	if bytes.Equal(changed, held) || len(changed) != len(held) {
		t.Fatalf("the test's edit did not apply (%d, %d bytes)", len(changed), len(held))
	}
	if err := os.WriteFile(s.guidePath(), changed, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := s.Rescan("a"); err != nil {
		t.Fatal(err)
	}
	if got := occurrencesOf(t, s, "a"); got != 0 {
		t.Fatalf("%d occurrences of Bob in a manuscript about Ann: the held copy was written over the other writer's", got)
	}
}

func TestAFailedRescanWriteDropsTheHeldDocument(t *testing.T) {
	s := rescanService(t, manuscriptOf("Ann met Annie."))
	if err := s.Rescan("a"); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(s.guidePath())
	// A directory where the temporary file goes makes the next write fail.
	if err := os.Mkdir(s.guidePath()+".tmp", 0o755); err != nil {
		t.Fatal(err)
	}
	writeManuscript(t, s, manuscriptOf("Ann.", "Ann.", "Ann."))
	if err := s.Rescan("a"); err == nil {
		t.Fatal("a rescan that could not be written succeeded")
	}
	s.editMu.Lock()
	held := s.held
	s.editMu.Unlock()
	if held != nil {
		t.Fatal("the held document survived a failed write")
	}
	if after, _ := os.ReadFile(s.guidePath()); !bytes.Equal(after, before) {
		t.Fatal("the failed rescan changed the file")
	}
	if err := os.Remove(s.guidePath() + ".tmp"); err != nil {
		t.Fatal(err)
	}
	// The file is as the first rescan left it (the failed one's three occurrences were only in the held copy), and the next starts from it.
	if got := occurrencesOf(t, s, "a"); got != 1 {
		t.Fatalf("%d occurrences after the failed rescan, want the 1 the first left", got)
	}
	if err := s.Rescan("a"); err != nil {
		t.Fatal(err)
	}
	if got := occurrencesOf(t, s, "a"); got != 3 {
		t.Fatalf("%d occurrences after the rescan that worked", got)
	}
}

func TestARefusedRescanLeavesTheFileAndDropsTheHeldDocument(t *testing.T) {
	s := rescanService(t, manuscriptOf("Ann."))
	if err := s.Edit("a", "locked", "false"); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(s.guidePath())
	for name, refuse := range map[string]func() error{
		"an unknown entry":          func() error { return s.Rescan("nobody") },
		"no manuscript":             func() error { remove(t, s.manuscript()); return s.Rescan("a") },
		"a manuscript with no text": func() error { writeManuscript(t, s, manuscriptOf()); return s.Rescan("a") },
	} {
		if err := refuse(); err == nil {
			t.Errorf("%s: the rescan was not refused", name)
		}
		s.editMu.Lock()
		held := s.held
		s.editMu.Unlock()
		if held != nil {
			t.Errorf("%s: the held document survived a refusal", name)
		}
		if after, _ := os.ReadFile(s.guidePath()); !bytes.Equal(after, before) {
			t.Errorf("%s: the refused rescan wrote the file", name)
		}
	}
	writeManuscript(t, s, manuscriptOf("Ann."))
	if err := s.Rescan("a"); err != nil {
		t.Fatalf("the rescan after the refusals: %v", err)
	}
}

// The second of two rescans of one entry finds the file the first wrote and does the same again; neither is lost or half-written.
func TestTwoRescansAtOnce(t *testing.T) {
	s := rescanService(t, manuscriptOf("Ann met Annie.", "Ann."))
	var wg sync.WaitGroup
	errs := make([]error, 8)
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs[i] = s.Rescan([]string{"a", "b"}[i%2])
		}()
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Errorf("rescan %d: %v", i, err)
		}
	}
	if got := occurrencesOf(t, s, "a"); got != 2 {
		t.Errorf("a has %d occurrences", got)
	}
	var document map[string]any
	raw, _ := os.ReadFile(s.guidePath())
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatalf("the file is not JSON after the rescans: %v", err)
	}
}

func TestARescanWorksOnALockedEntry(t *testing.T) {
	s := rescanService(t, manuscriptOf("Bea.", "bea! BEA"))
	if err := s.Rescan("b"); err != nil {
		t.Fatalf("a locked entry: %v", err)
	}
	if got := occurrencesOf(t, s, "b"); got != 3 {
		t.Fatalf("%d occurrences", got)
	}
}

// Bytes Python's json module reads differently, or not at all: the sidecar says "could not be read" for all of them.
func TestAManuscriptThatCannotBeReadIsRefused(t *testing.T) {
	good := manuscriptOf("Ann.")
	for name, raw := range map[string][]byte{
		"invalid UTF-8":        append(append([]byte{}, good[:len(good)-2]...), 0xff, 0xfe, '}', '}'),
		"a byte order mark":    append([]byte("\xef\xbb\xbf"), good...),
		"text after the value": append(append([]byte{}, good...), []byte(` {}`)...),
		"a second value":       append(append([]byte{}, good...), good...),
		"an empty file":        {},
		"only spaces":          []byte("  \n"),
		"NaN":                  []byte(`{"schemaVersion": NaN}`),
		"a truncated file":     good[:len(good)/2],
	} {
		s := rescanService(t, raw)
		if err := s.Rescan("a"); err == nil || err.Error() != "The canonical manuscript data could not be read." {
			t.Errorf("%s: Rescan = %v", name, err)
		}
	}
	// A directory where the manuscript goes is no manuscript.
	s := rescanService(t, good)
	remove(t, s.manuscript())
	if err := os.Mkdir(s.manuscript(), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := s.Rescan("a"); err == nil || err.Error() != "Import a manuscript first." {
		t.Errorf("a directory: Rescan = %v", err)
	}
}

func TestTheSchemaVersionIsOneInAnyOfPythonsSpellings(t *testing.T) {
	for _, version := range []string{"1", "1.0", "1e0", "true"} {
		raw := bytes.Replace(manuscriptOf("Ann."), []byte(`"schemaVersion":1`), []byte(`"schemaVersion":`+version), 1)
		s := rescanService(t, raw)
		if err := s.Rescan("a"); err != nil {
			t.Errorf("schemaVersion %s: %v", version, err)
		}
	}
	for _, version := range []string{"2", "0", `"1"`, "null", "false", "[1]"} {
		raw := bytes.Replace(manuscriptOf("Ann."), []byte(`"schemaVersion":1`), []byte(`"schemaVersion":`+version), 1)
		s := rescanService(t, raw)
		if err := s.Rescan("a"); err == nil || err.Error() != "This manuscript data uses an unsupported schema version." {
			t.Errorf("schemaVersion %s: Rescan = %v", version, err)
		}
	}
}

// A Story Bible whose source is not an object is stale (the sidecar crashes on it); a manuscript that cannot be read has no hash, but
// only a Story Bible makes that matter.
func TestStatusOfOddFiles(t *testing.T) {
	s := hostEditService(t)
	writeStart(t, s, `{"schema_version": 2, "source": "x", "entities": []}`)
	writeManuscript(t, s, manuscriptOf("Ann."))
	if got, err := s.Status(); err != nil || got != StatusStale {
		t.Errorf("a source that is not an object: %q, %v", got, err)
	}
	remove(t, s.manuscript())
	if _, err := s.Status(); err == nil {
		t.Error("a Story Bible and no manuscript has no answer")
	}
	remove(t, s.guidePath())
	if got, err := s.Status(); err != nil || got != StatusMissing {
		t.Errorf("no Story Bible and no manuscript: %q, %v", got, err)
	}
}
