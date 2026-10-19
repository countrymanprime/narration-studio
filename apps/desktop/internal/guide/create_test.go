package guide

// State matrix of a create and an alias edit in the host. Each cell names its test; a cell the sidecar's recorded cases already pin says
// so (TestCreatesMatchTheSidecarCases replays testdata/create-parity.json, which test_create_parity.py writes: the real `create` and
// `edit` with `aliases`, over a stand-in for the pronunciation lookup).
//
//	no Story Bible, an empty one, a null one      the recorded cases "a create with no Story Bible starts one" and the two beside it
//	one entry and many, a locked entry            the recorded cases (a create beside many entries; an alias edit of a locked entry is refused)
//	a name that normalizes to an existing id      the recorded cases "a name that is already an entry is refused", "... a locked entry ...", and
//	                                              the non-Latin names, which all have the id of the empty name
//	an alias already present, in any case         the recorded cases "an alias already there, in any case, is kept as it was" and the ones beside it
//	an alias that is another entry's name         the recorded cases "an alias that is another entry's name" (a create and an edit): it is allowed
//	emoji, right-to-left, non-ASCII text          the recorded creates and alias edits of them, and the descriptions over them
//	long name, many aliases                       the recorded case "a long name and many aliases"
//	a pronunciation from each source              the recorded answers use every source and "not generated"; the replay hands them back
//	a refusal asks for no pronunciation           TestCreatesMatchTheSidecarCases (no lookup on a refused step)
//	huge manuscript                               TestACreateInAFullLengthManuscript (88,000 words, the name in every paragraph)
//	missing, corrupt or odd manuscript            the recorded refusals
//	a lookup that fails                           TestALookupThatFailsChangesNothing
//	a lookup that gives a wrong answer            TestALookupThatGivesAnUnreadableAnswerChangesNothing
//	a lookup that times out                       TestALookupThatTimesOutChangesNothing
//	failed write drops the held document          TestAFailedCreateWriteDropsTheHeldDocument
//	a refusal keeps the file, drops the held copy  TestARefusedCreateLeavesTheFile
//	stale document (another writer, by bytes)     TestACreateSeesAnotherWritersChange, TestAnAliasEditSeesAnotherWritersChange
//	rapid double-fire                             TestTwoCreatesAtOnce, TestTwoAliasEditsAtOnce, the recorded "a create twice"
//	a Save is not held up by a lookup             TestALookupDoesNotHoldTheLock
//	the sidecar's command line                    TestTheLookupGoesToTheSidecarInBatches
//	reload mid-action, leave mid-action           not tested: a lookup that is under way when the narrator leaves finishes and writes; the host has
//	                                              no cancel for it, as the sidecar's create had none
//	no project                                    TestACreateNeedsAProject

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/process"
	"github.com/countrymanprime/narration-utils/shell/internal/settings"
)

type createStep struct {
	Command   string          `json:"command"`
	Arguments json.RawMessage `json:"arguments"`
	Wrote     bool            `json:"wrote"`
	Entity    json.RawMessage `json:"entity"`
	Lookups   []string        `json:"lookups"`
	Error     string          `json:"error"`
}

type createCase struct {
	Name       string       `json:"name"`
	Start      *string      `json:"start"`
	Manuscript string       `json:"manuscript"`
	Results    []createStep `json:"results"`
}

type descriptionCase struct {
	Name        string          `json:"name"`
	Occurrences json.RawMessage `json:"occurrences"`
	Description json.RawMessage `json:"description"`
}

type createGolden struct {
	Starts         map[string]string          `json:"starts"`
	Manuscripts    map[string]json.RawMessage `json:"manuscripts"`
	Pronunciations map[string]json.RawMessage `json:"pronunciations"`
	Cases          []createCase               `json:"cases"`
	Descriptions   []descriptionCase          `json:"descriptions"`
}

func readCreateGolden(t *testing.T) createGolden {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "create-parity.json"))
	if err != nil {
		t.Fatal(err)
	}
	var golden createGolden
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatal(err)
	}
	return golden
}

// recordedLookup answers a lookup from the sidecar's recorded answers, and notes the names it was asked for. A name the sidecar was not
// asked about has no answer: the host asked for something the sidecar never did.
func recordedLookup(t *testing.T, golden createGolden, asked *[]string) func([]string) ([]map[string]any, error) {
	t.Helper()
	return func(names []string) ([]map[string]any, error) {
		values := make([]map[string]any, len(names))
		for index, name := range names {
			*asked = append(*asked, name)
			raw, ok := golden.Pronunciations[name]
			if !ok {
				return nil, fmt.Errorf("the sidecar was never asked about %q", name)
			}
			value, _ := decodeExactly(t, raw).(map[string]any)
			values[index] = value
		}
		return values, nil
	}
}

// afterCreate is the Story Bible the sidecar's create leaves: the file as the sidecar reads it, or a new one, with the entry added.
func afterCreate(t *testing.T, before []byte, entity json.RawMessage) []byte {
	t.Helper()
	document := emptyGuide()
	if before != nil {
		parsed, err := parseForEdit(before)
		if err != nil && !errors.Is(err, errNoFile) {
			t.Fatal(err)
		}
		if err == nil {
			document = parsed
		}
	}
	document["entities"] = append(listOf(document["entities"]), decodeExactly(t, entity))
	return sidecarText(t, document)
}

func (step createStep) run(s *Service) error {
	var arguments struct {
		Name        string            `json:"name"`
		Category    string            `json:"category"`
		Aliases     []string          `json:"aliases"`
		Description string            `json:"description"`
		Properties  []Property        `json:"properties"`
		EntityID    string            `json:"entity_id"`
		Fields      map[string]string `json:"fields"`
	}
	if err := json.Unmarshal(step.Arguments, &arguments); err != nil {
		return err
	}
	switch step.Command {
	case "create":
		_, err := s.CreateFull(arguments.Name, arguments.Category, arguments.Aliases, arguments.Description, arguments.Properties)
		return err
	case "edit":
		return s.EditFields(arguments.EntityID, arguments.Fields)
	}
	return fmt.Errorf("no such command %q", step.Command)
}

func (step createStep) entityID() string {
	var arguments struct {
		EntityID string `json:"entity_id"`
	}
	_ = json.Unmarshal(step.Arguments, &arguments)
	return arguments.EntityID
}

// TestCreatesMatchTheSidecarCases replays every recorded case twice: as a chain on the host's own writes, and with each step on the file
// the sidecar left. A create adds one entry and an alias edit changes one, so the cases record that entry and the test requires the rest
// of the file as it was.
func TestCreatesMatchTheSidecarCases(t *testing.T) {
	golden := readCreateGolden(t)
	if len(golden.Cases) < 70 {
		t.Fatalf("only %d recorded cases", len(golden.Cases))
	}
	refused, created, edited := 0, 0, 0
	for _, c := range golden.Cases {
		for _, mode := range []string{"chain", "sidecar"} {
			s := hostEditService(t)
			var asked []string
			s.lookup = recordedLookup(t, golden, &asked)
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
				asked = nil
				err := step.run(s)
				written, _ := os.ReadFile(s.guidePath())
				if step.Error != "" {
					refused++
					if err == nil || err.Error() != step.Error {
						t.Errorf("%s: error = %v, want %q", label, err, step.Error)
					}
					if !bytes.Equal(written, before) {
						t.Errorf("%s: a refused command wrote the file", label)
					}
					if len(asked) != 0 {
						t.Errorf("%s: a refused command looked up %v", label, asked)
					}
					continue
				}
				if err != nil {
					t.Errorf("%s: %v", label, err)
					continue
				}
				var want []byte
				if step.Command == "create" {
					created++
					want = afterCreate(t, before, step.Entity)
				} else {
					edited++
					want = afterRescan(t, before, step.entityID(), step.Entity)
				}
				if !reflect.DeepEqual(decodeExactly(t, written), decodeExactly(t, want)) {
					t.Errorf("%s: the file differs from the sidecar's\n got: %.3000s\nwant: %.3000s", label, written, want)
				}
				if changed := !bytes.Equal(written, before); changed != step.Wrote {
					t.Errorf("%s: the sidecar's bytes changed = %v, the host's = %v", label, step.Wrote, changed)
				}
				slices.Sort(asked)
				if got := slices.Compact(asked); !slices.Equal(got, nonNil(step.Lookups)) && (len(got) != 0 || len(step.Lookups) != 0) {
					t.Errorf("%s: looked up %q, the sidecar looked up %q", label, got, step.Lookups)
				}
				if mode == "sidecar" {
					// The next step starts from the file the sidecar left, not the host's.
					written = want
					writeStart(t, s, string(written))
				}
				before = written
			}
		}
	}
	if refused < 80 || created < 100 || edited < 40 {
		t.Errorf("%d refusals, %d creates and %d alias edits replayed", refused, created, edited)
	}
}

func nonNil(names []string) []string {
	if names == nil {
		return []string{}
	}
	return names
}

func TestDirectDescriptionMatchesTheSidecar(t *testing.T) {
	golden := readCreateGolden(t)
	found, none := 0, 0
	for _, c := range golden.Descriptions {
		occurrences, _ := decodeExactly(t, c.Occurrences).([]any)
		got := directDescription(c.Name, occurrences)
		if !reflect.DeepEqual(decodeExactly(t, mustMarshal(t, got)), decodeExactly(t, c.Description)) {
			t.Errorf("%q over %s: %v, the sidecar says %s", c.Name, c.Occurrences, got, c.Description)
		}
		if got["text"] == "" {
			none++
		} else {
			found++
		}
	}
	if found < 200 || none < 200 {
		t.Errorf("%d descriptions found and %d not, over %d cases", found, none, len(golden.Descriptions))
	}
}

func mustMarshal(t *testing.T, value any) []byte {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

// ---- the cells the recorded cases cannot pin: the host's own behaviour --------------------------------------------------------------

// notGenerated is the answer of a lookup for a name no source knows.
func notGenerated(names []string) ([]map[string]any, error) {
	values := make([]map[string]any, len(names))
	for index := range values {
		values[index] = map[string]any{"ipa": "", "source": "not generated", "confidence": "unknown"}
	}
	return values, nil
}

func createService(t *testing.T) *Service {
	t.Helper()
	s := rescanService(t, manuscriptOf("Ann met Annie.", "Ann."))
	s.lookup = notGenerated
	return s
}

func guideBytes(t *testing.T, s *Service) []byte {
	t.Helper()
	raw, _ := os.ReadFile(s.guidePath())
	return raw
}

func heldDocumentOf(s *Service) *heldDocument {
	s.editMu.Lock()
	defer s.editMu.Unlock()
	return s.held
}

func TestACreateNeedsAProject(t *testing.T) {
	s := hostEditService(t)
	s.project = ""
	s.lookup = func([]string) ([]map[string]any, error) { t.Fatal("looked up a name with no project"); return nil, nil }
	if _, err := s.CreateFull("Ann", "Character", nil, "", nil); err == nil || !strings.Contains(err.Error(), "import a manuscript first") {
		t.Errorf("CreateFull = %v", err)
	}
}

func TestACreateReturnsTheIDAndWritesTheEntry(t *testing.T) {
	s := createService(t)
	id, err := s.Create("Cy", "Place", []string{"Cyrus"})
	if err != nil {
		t.Fatal(err)
	}
	if id != entityID("Cy") {
		t.Fatalf("id = %q", id)
	}
	entities, _ := s.Entities()
	last := entities[len(entities)-1]
	if last["id"] != id || last["manual"] != true || last["category"] != "Place" {
		t.Fatalf("entry = %v", last)
	}
	if pronunciation := last["pronunciation"].(map[string]any); pronunciation["source"] != "not generated" {
		t.Fatalf("pronunciation = %v", pronunciation)
	}
}

func TestACorruptStoryBibleIsNotWrittenOver(t *testing.T) {
	s := createService(t)
	writeStart(t, s, "{broken")
	if _, err := s.Create("Cy", "Character", nil); err == nil {
		t.Fatal("a create over a Story Bible that cannot be read succeeded")
	}
	if got := guideBytes(t, s); string(got) != "{broken" {
		t.Fatalf("the file was changed to %q", got)
	}
}

func TestAStoryBibleWithNoListOfEntriesIsRefused(t *testing.T) {
	s := createService(t)
	writeStart(t, s, `{"schema_version": 2, "source": {}}`)
	before := guideBytes(t, s)
	if _, err := s.Create("Cy", "Character", nil); !errors.Is(err, errNoEntryList) {
		t.Fatalf("create = %v", err)
	}
	if !bytes.Equal(guideBytes(t, s), before) {
		t.Fatal("the refused create wrote the file")
	}
}

func TestANewerStoryBibleIsRefusedAndKept(t *testing.T) {
	s := createService(t)
	writeStart(t, s, `{"schema_version": 3, "entities": []}`)
	if _, err := s.Create("Cy", "Character", nil); err == nil {
		t.Fatal("a create in a newer Story Bible succeeded")
	}
	if string(guideBytes(t, s)) != `{"schema_version": 3, "entities": []}` {
		t.Fatal("the newer file was rewritten")
	}
}

func TestAFailedCreateWriteDropsTheHeldDocument(t *testing.T) {
	s := createService(t)
	if _, err := s.Create("Cy", "Character", nil); err != nil {
		t.Fatal(err)
	}
	before := guideBytes(t, s)
	if err := os.Mkdir(s.guidePath()+".tmp", 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create("Di", "Character", nil); err == nil {
		t.Fatal("a create that could not be written succeeded")
	}
	if heldDocumentOf(s) != nil {
		t.Fatal("the held document survived a failed write")
	}
	if !bytes.Equal(guideBytes(t, s), before) {
		t.Fatal("the failed create changed the file")
	}
	if err := os.Remove(s.guidePath() + ".tmp"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create("Di", "Character", nil); err != nil {
		t.Fatalf("the create after the failed write: %v", err)
	}
	if entities, _ := s.Entities(); len(entities) != 4 { // Ann, Bea, Cy, Di
		t.Fatalf("%d entries, want the failed create gone and the next one in", len(entities))
	}
}

func TestAFailedAliasEditWriteDropsTheHeldDocument(t *testing.T) {
	s := createService(t)
	if err := s.Edit("a", "aliases", "Annie;Anne"); err != nil {
		t.Fatal(err)
	}
	before := guideBytes(t, s)
	if err := os.Mkdir(s.guidePath()+".tmp", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := s.Edit("a", "aliases", "Annie;Anne;Anna"); err == nil {
		t.Fatal("an alias edit that could not be written succeeded")
	}
	if heldDocumentOf(s) != nil {
		t.Fatal("the held document survived a failed write")
	}
	if !bytes.Equal(guideBytes(t, s), before) {
		t.Fatal("the failed edit changed the file")
	}
}

func TestARefusedCreateLeavesTheFile(t *testing.T) {
	s := createService(t)
	if _, err := s.Create("Cy", "Character", nil); err != nil { // holds the document
		t.Fatal(err)
	}
	before := guideBytes(t, s)
	for name, refuse := range map[string]func() error{
		"a taken name": func() error { _, err := s.Create("Cy", "Character", nil); return err },
		"a bad type":   func() error { _, err := s.Create("Cy", "Wizard", nil); return err },
		"no name":      func() error { _, err := s.Create(" ", "Character", nil); return err },
		"no manuscript": func() error {
			remove(t, s.manuscript())
			_, err := s.Create("Cy", "Character", nil)
			return err
		},
	} {
		if err := refuse(); err == nil {
			t.Errorf("%s: the create was not refused", name)
		}
		if !bytes.Equal(guideBytes(t, s), before) {
			t.Errorf("%s: the refused create wrote the file", name)
		}
	}
	if heldDocumentOf(s) != nil {
		t.Error("the held document survived a refusal")
	}
}

// A pass that has to ask for pronunciations has changed nothing, so the held document is still good for the next one: the lookup does not
// make every create parse the file again.
func TestAskingForPronunciationsKeepsTheHeldDocument(t *testing.T) {
	s := createService(t)
	if err := s.Edit("a", "context", "x"); err != nil {
		t.Fatal(err)
	}
	parses := s.parses.Load()
	if _, err := s.Create("Cy", "Character", []string{"Cyrus"}); err != nil {
		t.Fatal(err)
	}
	if got := s.parses.Load(); got != parses {
		t.Fatalf("the file was parsed %d more times", got-parses)
	}
}

func TestALookupThatFailsChangesNothing(t *testing.T) {
	s := createService(t)
	before := guideBytes(t, s)
	s.lookup = func([]string) ([]map[string]any, error) { return nil, errors.New("the dictionary is gone") }
	if _, err := s.Create("Cy", "Character", []string{"Cyrus"}); err == nil || !strings.Contains(err.Error(), "dictionary is gone") {
		t.Fatalf("create = %v", err)
	}
	if err := s.Edit("a", "aliases", "Annie;New"); err == nil {
		t.Fatal("an alias edit with a failed lookup succeeded")
	}
	if !bytes.Equal(guideBytes(t, s), before) {
		t.Fatal("a failed lookup changed the file")
	}
	// The lookup works again: the narrator's retry is an ordinary create.
	s.lookup = notGenerated
	if _, err := s.Create("Cy", "Character", []string{"Cyrus"}); err != nil {
		t.Fatalf("the retry: %v", err)
	}
}

func TestALookupThatGivesAnUnreadableAnswerChangesNothing(t *testing.T) {
	for name, lookup := range map[string]func([]string) ([]map[string]any, error){
		"too few answers":  func(names []string) ([]map[string]any, error) { return notGenerated(names[1:]) },
		"too many answers": func(names []string) ([]map[string]any, error) { return notGenerated(append(names, "x")) },
		"a null answer":    func(names []string) ([]map[string]any, error) { return make([]map[string]any, len(names)), nil },
	} {
		s := createService(t)
		before := guideBytes(t, s)
		s.lookup = lookup
		if _, err := s.Create("Cy", "Character", []string{"Cyrus"}); !errors.Is(err, errLookupUnreadble) {
			t.Errorf("%s: create = %v", name, err)
		}
		if !bytes.Equal(guideBytes(t, s), before) {
			t.Errorf("%s: the file changed", name)
		}
	}
}

// ---- another writer ---------------------------------------------------------------------------------------------------------------

// While the pronunciations are looked up the lock is not held, so a build, another tool or the narrator can change the file. The create
// runs again on the file as it is then, never on the copy it held.
func TestACreateSeesAnotherWritersChange(t *testing.T) {
	s := createService(t)
	if err := s.Edit("a", "context", "held"); err != nil {
		t.Fatal(err)
	}
	s.lookup = func(names []string) ([]map[string]any, error) {
		// Another writer adds an entry and renames Ann while the lookup runs.
		raw := guideBytes(t, s)
		changed := bytes.Replace(raw, []byte(`"canonical_name": "Ann"`), []byte(`"canonical_name": "Anne"`), 1)
		changed = bytes.Replace(changed, []byte(`"entities": [`), []byte(`"entities": [{"id": "other", "canonical_name": "Other", "aliases": []}, `), 1)
		if bytes.Equal(changed, raw) {
			t.Fatal("the other writer's change did not apply")
		}
		if err := os.WriteFile(s.guidePath(), changed, 0o600); err != nil {
			t.Fatal(err)
		}
		return notGenerated(names)
	}
	if _, err := s.Create("Cy", "Character", []string{"Cyrus"}); err != nil {
		t.Fatal(err)
	}
	entities, _ := s.Entities()
	names := []string{}
	for _, entity := range entities {
		names = append(names, entity["canonical_name"].(string))
	}
	if !slices.Equal(names, []string{"Other", "Anne", "Bea", "Cy"}) {
		t.Fatalf("entries after the create = %v: the other writer's change was written over", names)
	}
}

func TestACreateRefusedBecauseTheOtherWriterMadeTheSameEntry(t *testing.T) {
	s := createService(t)
	s.lookup = func(names []string) ([]map[string]any, error) {
		changed := bytes.Replace(guideBytes(t, s), []byte(`"entities": [`), []byte(`"entities": [{"id": "`+entityID("Cy")+`", "canonical_name": "Cy", "aliases": []}, `), 1)
		if err := os.WriteFile(s.guidePath(), changed, 0o600); err != nil {
			t.Fatal(err)
		}
		return notGenerated(names)
	}
	if _, err := s.Create("Cy", "Character", nil); !errors.Is(err, errNameExists) {
		t.Fatalf("create = %v", err)
	}
}

func TestAnAliasEditSeesAnotherWritersChange(t *testing.T) {
	s := createService(t)
	if err := s.Edit("a", "aliases", "Annie"); err != nil {
		t.Fatal(err)
	}
	var rounds [][]string
	s.lookup = func(names []string) ([]map[string]any, error) {
		rounds = append(rounds, slices.Clone(names))
		if len(rounds) == 1 {
			// Another writer takes Annie away while New is looked up, so the second pass needs Annie again.
			changed := bytes.Replace(guideBytes(t, s), []byte(`"text": "Annie"`), []byte(`"text": "Other"`), 1)
			if err := os.WriteFile(s.guidePath(), changed, 0o600); err != nil {
				t.Fatal(err)
			}
		}
		return notGenerated(names)
	}
	if err := s.Edit("a", "aliases", "Annie;New"); err != nil {
		t.Fatal(err)
	}
	if want := [][]string{{"New"}, {"Annie"}}; !reflect.DeepEqual(rounds, want) {
		t.Fatalf("lookups = %v, want %v", rounds, want)
	}
	entities, _ := s.Entities()
	var texts []string
	for _, alias := range entities[0]["aliases"].([]any) {
		texts = append(texts, alias.(map[string]any)["text"].(string))
	}
	if !slices.Equal(texts, []string{"Annie", "New"}) {
		t.Fatalf("aliases = %v", texts)
	}
}

// A writer that takes a different alias away every time keeps the command from ever finishing; it gives up after maxLookupRounds, says so,
// and writes nothing.
func TestAnAliasEditGivesUpWhenTheFileKeepsChanging(t *testing.T) {
	s := createService(t)
	if err := s.Edit("a", "aliases", "Annie;B2;B3"); err != nil {
		t.Fatal(err)
	}
	calls := 0
	s.lookup = func(names []string) ([]map[string]any, error) {
		calls++
		renamed := fmt.Sprintf(`"text": "X%d"`, calls)
		taken := []string{`"text": "Annie"`, `"text": "B2"`, `"text": "B3"`}[calls-1]
		changed := bytes.Replace(guideBytes(t, s), []byte(taken), []byte(renamed), 1)
		if err := os.WriteFile(s.guidePath(), changed, 0o600); err != nil {
			t.Fatal(err)
		}
		return notGenerated(names)
	}
	err := s.Edit("a", "aliases", "Annie;B2;B3;N")
	if !errors.Is(err, errLookupMoved) {
		t.Fatalf("edit = %v, want %v", err, errLookupMoved)
	}
	if calls != maxLookupRounds {
		t.Fatalf("%d lookups, want %d", calls, maxLookupRounds)
	}
	if written := guideBytes(t, s); !bytes.Contains(written, []byte(`"X3"`)) || bytes.Contains(written, []byte(`"N"`)) {
		t.Fatalf("the command that gave up wrote the file: %s", written)
	}
}

func TestTwoCreatesAtOnce(t *testing.T) {
	s := createService(t)
	var wg sync.WaitGroup
	errs := make([]error, 8)
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = s.Create("Cy", "Character", []string{"Cyrus"})
		}()
	}
	wg.Wait()
	made := 0
	for _, err := range errs {
		switch {
		case err == nil:
			made++
		case !errors.Is(err, errNameExists):
			t.Errorf("create: %v", err)
		}
	}
	if made != 1 {
		t.Errorf("%d creates succeeded, want 1", made)
	}
	var document map[string]any
	if err := json.Unmarshal(guideBytes(t, s), &document); err != nil {
		t.Fatalf("the file is not JSON after the creates: %v", err)
	}
	if entities, _ := s.Entities(); len(entities) != 3 {
		t.Errorf("%d entries, want Ann, Bea and one Cy", len(entities))
	}
}

func TestTwoAliasEditsAtOnce(t *testing.T) {
	s := createService(t)
	var wg sync.WaitGroup
	errs := make([]error, 8)
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs[i] = s.Edit("a", "aliases", fmt.Sprintf("Annie;Same;Own%d", i%2))
		}()
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Errorf("edit %d: %v", i, err)
		}
	}
	entities, _ := s.Entities()
	if count := len(entities[0]["aliases"].([]any)); count != 3 {
		t.Errorf("%d aliases after the edits, want 3", count)
	}
}

// A Save of another entry is not held up while a create waits for the dictionary: the lock is not held during a lookup.
func TestALookupDoesNotHoldTheLock(t *testing.T) {
	s := createService(t)
	entered, release := make(chan struct{}), make(chan struct{})
	s.lookup = func(names []string) ([]map[string]any, error) {
		close(entered)
		<-release
		return notGenerated(names)
	}
	done := make(chan error, 1)
	go func() { _, err := s.Create("Cy", "Character", nil); done <- err }()
	<-entered
	saved := make(chan error, 1)
	go func() { saved <- s.Edit("a", "context", "saved meanwhile") }()
	select {
	case err := <-saved:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("a Save waited for a lookup")
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	entities, _ := s.Entities()
	if len(entities) != 3 || entities[0]["context"] != "saved meanwhile" {
		t.Fatalf("entries = %v: the Save or the create was lost", entities)
	}
}

// ---- size --------------------------------------------------------------------------------------------------------------------------

func TestACreateInAFullLengthManuscript(t *testing.T) {
	paragraphs := make([]string, 0, 8000)
	for i := 0; i < 8000; i++ {
		paragraphs = append(paragraphs, "Wren walked the long road home, and nobody on the road said a word about it, not even Wren. Wren was a courier.")
	}
	s := createService(t)
	writeManuscript(t, s, manuscriptOf(paragraphs...))
	asked := 0
	lookup := s.lookup
	s.lookup = func(names []string) ([]map[string]any, error) { asked++; return lookup(names) }
	started := time.Now()
	id, err := s.Create("Wren", "Character", []string{"the courier"})
	if err != nil {
		t.Fatal(err)
	}
	if asked != 1 {
		t.Errorf("%d lookups, want 1", asked)
	}
	entities, _ := s.Entities()
	var entry map[string]any
	for _, entity := range entities {
		if entity["id"] == id {
			entry = entity
		}
	}
	if got := len(entry["occurrences"].([]any)); got != 24000 {
		t.Errorf("%d occurrences", got)
	}
	if entry["description"].(map[string]any)["text"] != "Explicitly described as courier." {
		t.Errorf("description = %v", entry["description"])
	}
	if elapsed := time.Since(started); elapsed > 30*time.Second {
		t.Errorf("a create over %d paragraphs took %v", len(paragraphs), elapsed)
	}
}

// ---- the sidecar's command line -------------------------------------------------------------------------------------------------

// lookupSidecar is a fake sidecar: it appends its arguments, joined by a unit separator, to a log, then does what the file "mode" next to
// it says (nothing, sleep, fail, garbage) and answers a pronunciation-lookup with one value per --name.
func lookupSidecar(t *testing.T, root string) (program, log, mode string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("the fake sidecar is a shell script")
	}
	log, mode = filepath.Join(root, "calls.log"), filepath.Join(root, "mode")
	program = filepath.Join(root, "fake-guide")
	script := `#!/bin/sh
IFS="$(printf '\037')"
echo "$*" >> '` + log + `'
case "$(cat '` + mode + `' 2>/dev/null)" in
  sleep) exec sleep 20;;
  garbage) echo 'not json'; exit 0;;
  fail) echo 'the dictionary could not be opened' >&2; exit 3;;
esac
n=0
for a in "$@"; do case "$a" in --name=*) n=$((n+1));; esac; done
out=''
i=0
while [ $i -lt $n ]; do
  [ $i -gt 0 ] && out="$out,"
  out="$out{\"ipa\":\"x$i\",\"source\":\"cmu\",\"confidence\":\"medium\"}"
  i=$((i+1))
done
echo "{\"pronunciations\":[$out]}"
`
	if err := os.WriteFile(program, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	return program, log, mode
}

func sidecarCreateService(t *testing.T) (s *Service, log, mode string) {
	t.Helper()
	root := t.TempDir()
	program, log, mode := lookupSidecar(t, root)
	s = New(root, program, "", settings.New(root, root), process.NewSupervisor())
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	writeStart(t, s, rescanBible)
	writeManuscript(t, s, manuscriptOf("Ann met Annie.", "Ann."))
	return s, log, mode
}

func TestTheLookupGoesToTheSidecarInBatches(t *testing.T) {
	s, log, _ := sidecarCreateService(t)
	if _, err := s.Create("-Cy", "Character", []string{"--Cyrus", "Zoë 😀"}); err != nil {
		t.Fatal(err)
	}
	made := calls(t, log)
	if len(made) != 1 {
		t.Fatalf("%d sidecar processes for a create, want 1: %v", len(made), made)
	}
	// One process for the name and every alias; a name that starts with a dash is a value; names are sent in sorted order, once each.
	want := []string{"pronunciation-lookup", "--name=--Cyrus", "--name=-Cy", "--name=Zoë 😀"}
	if !slices.Equal(made[0], want) {
		t.Fatalf("arguments = %q, want %q", made[0], want)
	}
	entities, _ := s.Entities()
	last := entities[len(entities)-1]
	if got := last["pronunciation"].(map[string]any)["ipa"]; got != "x1" { // "-Cy" is the second of the three sorted names
		t.Errorf("the name's pronunciation = %v: the answers are not matched to the names in order", got)
	}
	// A new alias is a lookup of that alias alone.
	if err := s.Edit(entityID("-Cy"), "aliases", "--Cyrus;Zoë 😀;Fresh"); err != nil {
		t.Fatal(err)
	}
	if got := calls(t, log); len(got) != 2 || !slices.Equal(got[1], []string{"pronunciation-lookup", "--name=Fresh"}) {
		t.Fatalf("the alias edit's sidecar calls = %q", got)
	}
	// Nothing new: no process.
	if err := s.Edit(entityID("-Cy"), "aliases", "Fresh"); err != nil {
		t.Fatal(err)
	}
	if got := calls(t, log); len(got) != 2 {
		t.Fatalf("an alias edit with nothing new started a process: %q", got)
	}
}

func TestALongListOfNamesIsLookedUpInSeveralProcesses(t *testing.T) {
	s, log, _ := sidecarCreateService(t)
	long := strings.Repeat("x", 5000)
	if _, err := s.Create("Cy", "Character", []string{long + "1", long + "2", long + "3"}); err != nil {
		t.Fatal(err)
	}
	got := calls(t, log)
	if len(got) < 2 {
		t.Fatalf("%d processes for 15,000 bytes of names, want several", len(got))
	}
	total := 0
	for _, call := range got {
		size := 0
		for _, arg := range call[1:] {
			size += len(arg)
			total++
		}
		if size > maxLookupArguments+len("--name=")*len(call) {
			t.Errorf("a process was given %d bytes of names", size)
		}
	}
	if total != 4 {
		t.Errorf("%d names sent, want 4", total)
	}
}

func TestANameWithANULIsRefusedBeforeAnyProcess(t *testing.T) {
	s, log, _ := sidecarCreateService(t)
	if _, err := s.Create("Cy\x00", "Character", nil); !errors.Is(err, errNameHasNUL) {
		t.Fatalf("create = %v", err)
	}
	if got := calls(t, log); len(got) != 0 {
		t.Fatalf("a process was started: %v", got)
	}
}

func TestTheSidecarFailingChangesNothing(t *testing.T) {
	s, _, mode := sidecarCreateService(t)
	before := guideBytes(t, s)
	for name, content := range map[string]string{"fails": "fail", "gives garbage": "garbage"} {
		if err := os.WriteFile(mode, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		_, err := s.Create("Cy", "Character", nil)
		switch {
		case err == nil:
			t.Errorf("%s: the create succeeded", name)
		case name == "fails" && !strings.Contains(err.Error(), "dictionary could not be opened"):
			t.Errorf("%s: error = %v, want the sidecar's reason", name, err)
		case name == "gives garbage" && !errors.Is(err, errLookupUnreadble):
			t.Errorf("%s: error = %v", name, err)
		}
		if !bytes.Equal(guideBytes(t, s), before) {
			t.Errorf("%s: the file changed", name)
		}
	}
}

func TestALookupThatTimesOutChangesNothing(t *testing.T) {
	s, _, mode := sidecarCreateService(t)
	s.lookupTimeout = 300 * time.Millisecond
	if err := os.WriteFile(mode, []byte("sleep"), 0o600); err != nil {
		t.Fatal(err)
	}
	before := guideBytes(t, s)
	started := time.Now()
	if _, err := s.Create("Cy", "Character", nil); !errors.Is(err, errLookupTimedOut) {
		t.Fatalf("create = %v", err)
	}
	if elapsed := time.Since(started); elapsed > 10*time.Second {
		t.Errorf("the timeout took %v", elapsed)
	}
	if !bytes.Equal(guideBytes(t, s), before) {
		t.Error("the file changed")
	}
	if err := s.Edit("a", "aliases", "Annie;New"); !errors.Is(err, errLookupTimedOut) {
		t.Errorf("alias edit = %v", err)
	}
}

func TestTheSidecarsDefaultSourceGoesWithTheLookup(t *testing.T) {
	s, log, _ := sidecarCreateService(t)
	value := "espeak"
	root := s.project
	t.Setenv("APPDATA", filepath.Join(root, "appdata"))
	if err := s.settings.Save("ManuscriptGuide", "global", map[string]*string{"default_pronunciation_source": &value}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create("Cy", "Character", nil); err != nil {
		t.Fatal(err)
	}
	got := calls(t, log)
	if len(got) != 1 || !slices.Equal(got[0][len(got[0])-2:], []string{"--default-source", "espeak"}) {
		t.Fatalf("calls = %q", got)
	}
}

// The line the sidecar's pronunciation-lookup really prints (guide-pronunciation-lookup-sidecar.json, written by test_create_parity.py)
// is read by the host's own parser, one value for each name, whatever source answered.
func TestTheSidecarsOwnLookupLineIsRead(t *testing.T) {
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "guide-pronunciation-lookup-sidecar.json"))
	if err != nil {
		t.Fatalf("the sidecar's lookup file is missing (run test_create_parity.py with UPDATE_CONTRACTS=1): %v", err)
	}
	var contract struct {
		Names []string        `json:"names"`
		Line  json.RawMessage `json:"line"`
	}
	if err := json.Unmarshal(raw, &contract); err != nil {
		t.Fatal(err)
	}
	s, _, mode := sidecarCreateService(t)
	line := filepath.Join(filepath.Dir(mode), "line.json")
	if err := os.WriteFile(line, contract.Line, 0o600); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\ncat '" + line + "'\n"
	if err := os.WriteFile(s.python, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	values, err := s.lookupBatch(contract.Names)
	if err != nil {
		t.Fatal(err)
	}
	var want struct {
		Pronunciations []map[string]any `json:"pronunciations"`
	}
	if err := json.Unmarshal(contract.Line, &want); err != nil {
		t.Fatal(err)
	}
	if len(values) != len(contract.Names) || !reflect.DeepEqual(values, want.Pronunciations) {
		t.Fatalf("values = %v, want %v", values, want.Pronunciations)
	}
	sources := map[any]bool{}
	for _, value := range values {
		sources[value["source"]] = true
	}
	if len(sources) != 4 {
		t.Errorf("the contract file holds %d sources, want cmu, wiktextract, espeak and not generated", len(sources))
	}
}
