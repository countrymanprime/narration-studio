package guide

// State matrix of a create and an edit of the aliases in the host. Each cell names its test; a cell the sidecar's recorded cases already
// pin says so (TestCreatesMatchTheSidecarCases replays testdata/create-parity.json, written by test_create_parity.py).
//
//	empty (no file, an empty object)          the recorded cases "a file that is not there yet" and "an empty object"
//	one and many aliases, none                the recorded cases
//	duplicate name                            the recorded case "a name that has an entry", TestTwoCreatesOfOneNameAtOnceMakeOne
//	locked entry                              the recorded case "an edit ... that is refused changes nothing"; no lookup is made for it
//	alias that exists already or equals the   the recorded cases "aliases that repeat, equal the name or belong to another entry" and
//	name                                      "an alias list that is an alias the entry already has"
//	pronunciation lookup failing              TestAFailedLookupWritesNothingAndDropsTheHeldDocument
//	pronunciation lookup slow                 TestALookupHoldsTheEditLock (the lock is held while the sidecar is asked)
//	a lookup that is answered badly           TestAnswersThatCannotBeReadAreRefused
//	the sidecar's own lines                   TestPronunciationLookupMatchesTheGolden
//	failed write drops the held document      TestAFailedCreateWriteDropsTheHeldDocument
//	stale document (another writer)           TestACreateSeesAnotherWritersChange
//	emoji, right-to-left, very long names     the recorded case "names in other scripts, emoji and a very long name"
//	rapid double-fire                         TestTwoCreatesOfOneNameAtOnceMakeOne; the recorded case "a create twice"
//	manuscript missing or without text        the recorded cases (the manuscript's own words come from the recording; the host's own
//	                                          reading of the file is the Go find_occurrences', pinned with it)
//	a file with no list of entries            TestACreateInAFileWithNoEntriesIsRefused
//	the host cannot search the manuscript     TestWithoutASearchTheSidecarStillCreates
//	reload mid-action, leave mid-action       not tested: the file is read and written in one call under editMu

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"testing"
)

type createStep struct {
	Command    string          `json:"command"`
	Arguments  map[string]any  `json:"arguments"`
	Wrote      bool            `json:"wrote"`
	After      json.RawMessage `json:"after"`
	Error      string          `json:"error"`
	Pronounced []string        `json:"pronounced"`
	Searched   []string        `json:"searched"`
}

type createCase struct {
	Name       string       `json:"name"`
	Start      string       `json:"start"`
	Manuscript string       `json:"manuscript"`
	Results    []createStep `json:"results"`
}

type recordedCreates struct {
	Manuscripts    map[string]struct{ Error string } `json:"manuscripts"`
	Starts         map[string]json.RawMessage        `json:"starts"`
	Pronunciations map[string]json.RawMessage        `json:"pronunciations"`
	Occurrences    map[string]json.RawMessage        `json:"occurrences"`
	Cases          []createCase                      `json:"cases"`
}

// replayer answers the two things the sidecar's recording fixes: the pronunciation of a word and the occurrences of a name. It keeps what
// it was asked, in order, so a step can require the host to ask for the same words and names the sidecar did.
type replayer struct {
	t          *testing.T
	recorded   recordedCreates
	manuscript string
	asked      []string
	searched   []string
}

func (r *replayer) install(s *Service) {
	s.pronunciationLookup = func(words []string) ([]map[string]any, error) {
		values := make([]map[string]any, 0, len(words))
		for _, word := range words {
			r.asked = append(r.asked, word)
			raw, ok := r.recorded.Pronunciations[word]
			if !ok {
				r.t.Errorf("a pronunciation was asked for %q, which the sidecar never looked up", word)
				return nil, errors.New("unrecorded word")
			}
			values = append(values, decodeExactly(r.t, raw).(map[string]any))
		}
		return values, nil
	}
	s.searchManuscript = func(string) (occurrenceSearch, error) {
		if message := r.recorded.Manuscripts[r.manuscript].Error; message != "" {
			return nil, errors.New(message)
		}
		return func(name string) ([]any, error) {
			r.searched = append(r.searched, name)
			raw, ok := r.recorded.Occurrences[name]
			if !ok {
				r.t.Errorf("the manuscript was searched for %q, which the sidecar never searched for", name)
				return nil, errors.New("unrecorded name")
			}
			return decodeExactly(r.t, raw).([]any), nil
		}, nil
	}
}

// run calls the Service method the case's sidecar command became.
func (step createStep) run(s *Service) error {
	switch step.Command {
	case "create":
		var properties []Property
		encoded, _ := json.Marshal(step.Arguments["properties"])
		if err := json.Unmarshal(encoded, &properties); err != nil {
			return err
		}
		text := func(name string) string { value, _ := step.Arguments[name].(string); return value }
		_, err := s.CreateFull(text("name"), text("category"), strings.Split(text("aliases"), ";"), text("description"), properties)
		return err
	case "edit":
		fields := map[string]string{}
		for field, value := range step.Arguments["fields"].(map[string]any) {
			fields[field] = value.(string)
		}
		return s.EditFields(step.Arguments["entity_id"].(string), fields)
	}
	return errors.New("no such command " + step.Command)
}

// TestCreatesMatchTheSidecarCases replays every recorded case twice: as a chain on the host's own writes, and with each step on the file
// the sidecar left. Each step must leave the same JSON, or refuse with the same reason and the file untouched, and must ask for the
// same pronunciations and search for the same names, in the same order.
func TestCreatesMatchTheSidecarCases(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "create-parity.json"))
	if err != nil {
		t.Fatal(err)
	}
	var recorded recordedCreates
	if err := json.Unmarshal(raw, &recorded); err != nil {
		t.Fatal(err)
	}
	if len(recorded.Cases) < 25 {
		t.Fatalf("only %d recorded cases", len(recorded.Cases))
	}
	s := hostEditService(t)
	replay := &replayer{t: t, recorded: recorded}
	replay.install(s)
	check := func(label string, step createStep, err error, start []byte) {
		t.Helper()
		written := readOrNone(t, s.guidePath())
		switch {
		case step.Error != "":
			if err == nil || !sameReason(err.Error(), step.Error) {
				t.Errorf("%s: error = %v, want %q", label, err, step.Error)
			}
			if !bytes.Equal(written, start) {
				t.Errorf("%s: a refused command changed the file", label)
			}
		case err != nil:
			t.Errorf("%s: %v", label, err)
		case !reflect.DeepEqual(decodeExactly(t, written), decodeExactly(t, step.After)):
			t.Errorf("%s: the file differs from the sidecar's\n got: %s\nwant: %s", label, written, step.After)
		case step.Wrote == bytes.Equal(written, start):
			t.Errorf("%s: wrote = %v but the file's bytes changed = %v", label, step.Wrote, !bytes.Equal(written, start))
		}
		if !slices.Equal(replay.asked, step.Pronounced) {
			t.Errorf("%s: asked for the pronunciations of %q, the sidecar of %q", label, replay.asked, step.Pronounced)
		}
		if !slices.Equal(replay.searched, step.Searched) {
			t.Errorf("%s: searched the manuscript for %q, the sidecar for %q", label, replay.searched, step.Searched)
		}
	}
	put := func(content []byte) {
		t.Helper()
		if content == nil {
			if err := os.Remove(s.guidePath()); err != nil && !os.IsNotExist(err) {
				t.Fatal(err)
			}
			return
		}
		if err := os.WriteFile(s.guidePath(), content, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	for _, c := range recorded.Cases {
		replay.manuscript = c.Manuscript
		var startText []byte
		if stored := recorded.Starts[c.Start]; string(stored) != "null" {
			startText = sidecarText(t, decodeExactly(t, stored))
		}
		// As a chain on the host's own files.
		put(startText)
		before := startText
		for index, step := range c.Results {
			replay.asked, replay.searched = nil, nil
			err := step.run(s)
			check("chain "+c.Name+" step "+string(rune('1'+index)), step, err, before)
			before = readOrNone(t, s.guidePath())
		}
		// Each step on the file the sidecar left before it.
		before = startText
		for index, step := range c.Results {
			put(before)
			replay.asked, replay.searched = nil, nil
			err := step.run(s)
			check("steps "+c.Name+" step "+string(rune('1'+index)), step, err, before)
			if step.Error == "" {
				before = sidecarText(t, decodeExactly(t, step.After))
			}
		}
	}
}

// createService is a service on heldStart with the pronunciation of a word being "say " and the word, and a manuscript where each name
// occurs once.
func createService(t *testing.T) (*Service, *[]string) {
	t.Helper()
	s := heldService(t)
	var asked []string
	s.pronunciationLookup = func(words []string) ([]map[string]any, error) {
		asked = append(asked, words...)
		values := make([]map[string]any, 0, len(words))
		for _, word := range words {
			values = append(values, map[string]any{"ipa": "say " + word, "source": "cmu", "confidence": "high"})
		}
		return values, nil
	}
	s.searchManuscript = func(string) (occurrenceSearch, error) {
		return func(name string) ([]any, error) {
			return []any{map[string]any{"chapter": "One", "chapterId": "c-1", "paragraph": json.Number("0"), "paragraphId": "p-0", "excerpt": name + " ran."}}, nil
		}, nil
	}
	return s, &asked
}

func entityIDs(t *testing.T, s *Service) []string {
	t.Helper()
	raw, err := os.ReadFile(s.guidePath())
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		Entities []struct {
			ID string `json:"id"`
		} `json:"entities"`
	}
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	ids := make([]string, 0, len(document.Entities))
	for _, entity := range document.Entities {
		ids = append(ids, entity.ID)
	}
	return ids
}

func TestACreateIsParsedOnceAndHeld(t *testing.T) {
	s, _ := createService(t)
	for _, name := range []string{"Mira", "Mirb", "Mirc"} {
		if _, err := s.CreateFull(name, "Character", []string{name + "y"}, "", nil); err != nil {
			t.Fatal(err)
		}
	}
	if got := s.parses.Load(); got != 1 {
		t.Fatalf("parses = %d, want 1: each create parsed the file", got)
	}
	if got := len(entityIDs(t, s)); got != 5 {
		t.Fatalf("%d entries, want 5", got)
	}
}

func TestAFailedLookupWritesNothingAndDropsTheHeldDocument(t *testing.T) {
	s, _ := createService(t)
	if err := s.EditFields("a", map[string]string{"description": "kept"}); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(s.guidePath())
	s.pronunciationLookup = func([]string) ([]map[string]any, error) { return nil, errors.New("the sidecar was killed") }
	if _, err := s.CreateFull("Mira", "Character", []string{"Mi"}, "", nil); err == nil || !strings.Contains(err.Error(), "killed") {
		t.Fatalf("create = %v, want the lookup's failure", err)
	}
	if err := s.EditFields("a", map[string]string{"aliases": "Ay"}); err == nil || !strings.Contains(err.Error(), "killed") {
		t.Fatalf("alias edit = %v, want the lookup's failure", err)
	}
	if after, _ := os.ReadFile(s.guidePath()); !bytes.Equal(before, after) {
		t.Fatal("a failed lookup changed the file")
	}
	s.pronunciationLookup = nil
	s.searchManuscript = nil
	s.pronunciationLookup = func(words []string) ([]map[string]any, error) {
		return []map[string]any{{"ipa": "x", "source": "cmu", "confidence": "high"}, {"ipa": "y", "source": "cmu", "confidence": "high"}}[:len(words)], nil
	}
	s.searchManuscript = func(string) (occurrenceSearch, error) {
		return func(string) ([]any, error) { return nil, nil }, nil
	}
	if _, err := s.CreateFull("Mira", "Character", nil, "", nil); err != nil {
		t.Fatal(err)
	}
	if got := s.parses.Load(); got != 2 {
		t.Fatalf("parses = %d, want 2: the create after a failed lookup used the held document", got)
	}
}

func TestAnswersThatCannotBeReadAreRefused(t *testing.T) {
	for _, out := range []string{"", "not json", "[1]", "null", `{"ipa": "x"}` + "\n" + `{"ipa": "y"}`} {
		if _, err := parsePronunciations(out, 1); err == nil {
			t.Errorf("%q was read", out)
		}
	}
	values, err := parsePronunciations("{\"ipa\": \"x\", \"confidence\": 0.75}\r\n\r\n", 1)
	if err != nil || values[0]["confidence"] != json.Number("0.75") {
		t.Fatalf("a number: %v %v", values, err)
	}
}

// TestALookupHoldsTheEditLock pins a choice: the sidecar is asked for the pronunciations while the edit lock is held, so an edit that
// arrives during a slow lookup waits for it and then works on the file the create left.
func TestALookupHoldsTheEditLock(t *testing.T) {
	s, _ := createService(t)
	entered, release := make(chan struct{}), make(chan struct{})
	lookup := s.pronunciationLookup
	s.pronunciationLookup = func(words []string) ([]map[string]any, error) {
		close(entered)
		<-release
		return lookup(words)
	}
	done := make(chan error)
	go func() {
		_, err := s.CreateFull("Mira", "Character", nil, "", nil)
		done <- err
	}()
	<-entered
	if s.editMu.TryLock() {
		s.editMu.Unlock()
		t.Fatal("the edit lock was free while the sidecar was being asked")
	}
	if got := entityIDs(t, s); len(got) != 2 {
		t.Fatalf("%d entries while the lookup is running, want the 2 there were", len(got))
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if got := len(entityIDs(t, s)); got != 3 {
		t.Fatalf("%d entries, want 3", got)
	}
}

func TestTwoCreatesOfOneNameAtOnceMakeOne(t *testing.T) {
	s, _ := createService(t)
	var wait sync.WaitGroup
	results := make([]error, 8)
	for index := range results {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, results[index] = s.CreateFull("Mira", "Character", []string{"Mi"}, "", nil)
		}()
	}
	wait.Wait()
	made := 0
	for _, err := range results {
		switch {
		case err == nil:
			made++
		case !errors.Is(err, errNameTaken):
			t.Errorf("unexpected error %v", err)
		}
	}
	if made != 1 || len(entityIDs(t, s)) != 3 {
		t.Fatalf("%d creates succeeded, the file has %v", made, entityIDs(t, s))
	}
}

func TestAFailedCreateWriteDropsTheHeldDocument(t *testing.T) {
	s, _ := createService(t)
	if _, err := s.CreateFull("Mira", "Character", nil, "", nil); err != nil {
		t.Fatal(err)
	}
	lift := blockWrite(t, s)
	if _, err := s.CreateFull("Mirb", "Character", nil, "", nil); err == nil {
		t.Fatal("the create succeeded though its file could not be written")
	}
	lift()
	if _, err := s.CreateFull("Mirc", "Character", nil, "", nil); err != nil {
		t.Fatal(err)
	}
	if got := s.parses.Load(); got != 2 {
		t.Fatalf("parses = %d, want 2: the create after a failed write used the held document", got)
	}
	if ids := entityIDs(t, s); len(ids) != 4 || slices.Contains(ids, entityID("Mirb")) {
		t.Fatalf("entries %v: the failed create reached the file or the next one lost Mira", ids)
	}
}

func TestACreateSeesAnotherWritersChange(t *testing.T) {
	s, _ := createService(t)
	if _, err := s.CreateFull("Mira", "Character", nil, "", nil); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(s.guidePath())
	// Another writer (the sidecar's own create, a build) adds an entry of the same length of file, so only the bytes can tell.
	other := bytes.Replace(raw, []byte(`"canonical_name": "Mira"`), []byte(`"canonical_name": "Mirb"`), 1)
	other = bytes.Replace(other, []byte(entityID("Mira")), []byte(entityID("Mirb")), 1)
	if len(other) != len(raw) {
		t.Fatalf("the test's own edit changed the length")
	}
	if err := os.WriteFile(s.guidePath(), other, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateFull("Mirb", "Character", nil, "", nil); !errors.Is(err, errNameTaken) {
		t.Fatalf("create of the other writer's name = %v, want a refusal", err)
	}
	if _, err := s.CreateFull("Mira", "Character", nil, "", nil); err != nil {
		t.Fatalf("create of the name the other writer replaced: %v", err)
	}
}

func TestACreateInAFileWithNoEntriesIsRefused(t *testing.T) {
	s, _ := createService(t)
	if err := os.WriteFile(s.guidePath(), []byte(`{"schema_version": 2}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateFull("Mira", "Character", nil, "", nil); !errors.Is(err, errNoEntries) {
		t.Fatalf("create = %v", err)
	}
	if raw, _ := os.ReadFile(s.guidePath()); string(raw) != `{"schema_version": 2}` {
		t.Fatalf("the file was changed: %s", raw)
	}
}

func TestACreateInAFileFromANewerVersionIsRefused(t *testing.T) {
	s, _ := createService(t)
	newer := `{"schema_version": 3, "entities": []}`
	if err := os.WriteFile(s.guidePath(), []byte(newer), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateFull("Mira", "Character", nil, "", nil); err == nil {
		t.Fatal("a newer file was rewritten")
	}
	if raw, _ := os.ReadFile(s.guidePath()); string(raw) != newer {
		t.Fatalf("the file was changed: %s", raw)
	}
}

// Until the host can search the manuscript (hostCreates), a create and an edit of the aliases still go to the sidecar, as before.
func TestWithoutASearchTheSidecarStillCreates(t *testing.T) {
	s := heldService(t)
	if s.hostCreates() {
		t.Fatal("a service with no search creates in the host")
	}
	if _, err := s.CreateFull("Mira", "Character", nil, "", nil); err == nil || !strings.Contains(err.Error(), "Manuscript Guide executable") {
		t.Fatalf("create = %v, want the sidecar to be asked (and, in this test, missing)", err)
	}
	if err := s.EditFields("a", map[string]string{"aliases": "Ay"}); err == nil || !strings.Contains(err.Error(), "Manuscript Guide executable") {
		t.Fatalf("alias edit = %v, want the sidecar to be asked (and, in this test, missing)", err)
	}
	if err := s.EditFields("a", map[string]string{"description": "x"}); err != nil {
		t.Fatalf("an edit without aliases still works in the host: %v", err)
	}
}

func TestTheLookupCommandCarriesEachWordWhole(t *testing.T) {
	s := heldService(t)
	got := s.lookupArgs([]string{"-brave", "Wren", "שלום 😀"})
	want := []string{"pronunciation", "--word=-brave", "--word=Wren", "--word=שלום 😀"}
	if !slices.Equal(got, want) {
		t.Fatalf("args = %q, want %q", got, want)
	}
}

// The lines the sidecar's pronunciation command printed (testdata/pronunciation-lookup-golden.json, written by test_pronunciation_lookup.py)
// are read by the host's parser into the values the sidecar's pronunciation() made.
func TestPronunciationLookupMatchesTheGolden(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "pronunciation-lookup-golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	var golden struct {
		Cases []struct {
			Words []string `json:"words"`
			Lines []string `json:"lines"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatal(err)
	}
	if len(golden.Cases) < 2 {
		t.Fatal("no golden cases")
	}
	for _, c := range golden.Cases {
		values, err := parsePronunciations(strings.Join(c.Lines, "\n"), len(c.Words))
		if err != nil {
			t.Fatal(err)
		}
		for index, value := range values {
			for _, key := range []string{"ipa", "source", "confidence"} {
				if _, ok := value[key]; !ok {
					t.Errorf("word %q: no %s in %v", c.Words[index], key, value)
				}
			}
		}
		if values[len(values)-1]["source"] != "not generated" {
			t.Errorf("the last word has no pronunciation but got %v", values[len(values)-1])
		}
	}
}

func TestADescriptionIsTakenFromTheFirstSentenceThatHasOne(t *testing.T) {
	occurrences := func(excerpts ...string) []any {
		var list []any
		for _, excerpt := range excerpts {
			list = append(list, map[string]any{"chapter": "One", "excerpt": excerpt})
		}
		return list
	}
	cases := []struct {
		name, want string
		excerpts   []string
	}{
		{"Wren", "Explicitly described as tall girl.", []string{"Wren ran. Wren was a tall girl, and"}},
		{"Wren", "", []string{"Wren was tall.", "Wrenwas a tall girl"}},
		{"Captain Arelian", "Explicitly described as captain of the Ash.", []string{"Arelian—Captain Arelian, was the captain of the Ash."}},
		{"Zoë", "Explicitly described as old friend.", []string{"Zoë is an old friend; Ünal"}},
		{"Zoë", "", []string{"Zoëx is an old friend", "xZoë is an old friend"}},
		{"The Mill", "Explicitly described as oldest building.", []string{"The Mill  was the oldest building."}},
		{"ÉCOLE", "Explicitly described as old.", []string{"école IS A old. x"}},
	}
	for _, c := range cases {
		got := directDescription(c.name, occurrences(c.excerpts...))["text"]
		if got != c.want {
			t.Errorf("%q in %q: %q, want %q", c.name, c.excerpts, got, c.want)
		}
	}
	if got := splitSentences("A. B!  C? D.E"); !slices.Equal(got, []string{"A.", "B!", "C?", "D.E"}) {
		t.Errorf("sentences = %q", got)
	}
}
