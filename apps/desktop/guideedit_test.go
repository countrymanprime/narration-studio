package main

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/guide"
	"github.com/countrymanprime/narration-utils/shell/internal/importer"
	"github.com/countrymanprime/narration-utils/shell/internal/process"
	"github.com/countrymanprime/narration-utils/shell/internal/settings"
)

// fakeGuideCountEnv turns this test binary into a Story Bible sidecar that only records how it was called: one JSON line of arguments per
// process it is started as, in the file the variable names. It answers a pronunciation lookup the way the real one does.
const fakeGuideCountEnv = "SHELL_FAKE_GUIDE_COUNT"

func runFakeGuideCount(path string) int {
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return 2
	}
	defer func() { _ = file.Close() }()
	line, _ := json.Marshal(os.Args[1:])
	_, _ = file.Write(append(line, '\n'))
	if len(os.Args) > 1 && os.Args[1] == "pronunciation-lookup" {
		var values []string
		for _, arg := range os.Args[2:] {
			if strings.HasPrefix(arg, "--name=") {
				values = append(values, `{"ipa":"","source":"not generated","confidence":"unknown"}`)
			}
		}
		_, _ = os.Stdout.WriteString(`{"pronunciations":[` + strings.Join(values, ",") + "]}\n")
	}
	return 0
}

// countingGuide returns a Story Bible service whose sidecar is the recording fake, and a function that reads back every call it received.
func countingGuide(t *testing.T) (*guide.Service, func() [][]string) {
	t.Helper()
	service, calls, _ := countingGuideIn(t)
	return service, calls
}

// countingGuideIn is countingGuide that also returns the project folder, for a test that needs a Story Bible file in it.
func countingGuideIn(t *testing.T) (*guide.Service, func() [][]string, string) {
	t.Helper()
	log := filepath.Join(t.TempDir(), "calls.jsonl")
	t.Setenv(fakeGuideCountEnv, log)
	project := t.TempDir()
	sidecars := process.NewSupervisor()
	t.Cleanup(func() { _ = sidecars.Close() })
	service := guide.New(project, os.Args[0], "", settings.New(t.TempDir(), project), sidecars)
	return service, func() [][]string {
		file, err := os.Open(log)
		if os.IsNotExist(err) {
			return nil
		}
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = file.Close() }()
		var calls [][]string
		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			var args []string
			if err := json.Unmarshal(scanner.Bytes(), &args); err != nil {
				t.Fatal(err)
			}
			calls = append(calls, args)
		}
		return calls
	}, project
}

// writeStoryBible puts a Story Bible with one entry, entity-1, a Character with three aliases, in the service's project.
func writeStoryBible(t *testing.T, project string) {
	t.Helper()
	path := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := `{"schema_version": 2, "entities": [{"id": "entity-1", "canonical_name": "Al", "category": "Character", "locked": false,
		"aliases": [{"text": "Ally"}, {"text": "Alfie"}, {"text": "Big Al"}]}]}`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

// A Save without aliases is applied by the host (guide.Service.editInHost): no sidecar process, and every field in the file. It used to be
// one sidecar process; an alias edit still is (below).
func TestASaveWithoutAliasesStartsNoProcessAndWritesEveryField(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := &Host{guide: service}
	values := map[string]string{"canonical_name": "Alice", "description": "A child.", "personality": "-curious", "context": "--oxford"}
	if _, err := host.GuideEdit("entity-1", values); err != nil {
		t.Fatal(err)
	}
	if got := calls(); len(got) != 0 {
		t.Fatalf("a Save without aliases started %d sidecar processes, want 0: %v", len(got), got)
	}
	entities, err := service.Entities()
	if err != nil {
		t.Fatal(err)
	}
	entity := entities[0]
	notes, _ := entity["personality_notes"].([]any)
	if entity["canonical_name"] != "Alice" || entity["description"].(map[string]any)["text"] != "A child." || entity["context"] != "--oxford" ||
		len(notes) != 1 || notes[0].(map[string]any)["text"] != "-curious" {
		t.Fatalf("entity after the Save = %v", entity)
	}
}

func TestSettingTheLockStartsNoProcess(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := &Host{guide: service}
	if _, err := host.GuideSetLocked("entity-1", true); err != nil {
		t.Fatal(err)
	}
	if _, err := host.GuideEdit("entity-1", map[string]string{"description": "x"}); err == nil || !strings.Contains(err.Error(), "locked") {
		t.Fatalf("an edit of a locked entry = %v, want the lock refusal", err)
	}
	if got := calls(); len(got) != 0 {
		t.Fatalf("the lock started %d sidecar processes: %v", len(got), got)
	}
	entities, _ := service.Entities()
	if entities[0]["locked"] != true {
		t.Fatalf("entity = %v", entities[0])
	}
}

// writeNarration puts a one-paragraph manuscript in the project, which an alias edit searches for the new alias.
func writeNarration(t *testing.T, project string) {
	t.Helper()
	path := filepath.Join(project, "narration-utils", "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := `{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c-1", "title": "One"}],
		"paragraphs": [{"id": "p-1", "chapterId": "c-1", "chapterTitle": "One", "text": "Al met Ally and Big Al."}]}`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

// An alias edit is applied by the host. The sidecar is asked only for the pronunciation of an alias the entry did not have, in one
// process, and not at all when every alias is already there; the same edit twice is one lookup.
func TestAnAliasEditAsksTheSidecarOnlyForTheNewAliases(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	writeNarration(t, project)
	host := &Host{guide: service}
	for i := 0; i < 3; i++ {
		if _, err := host.GuideEdit("entity-1", map[string]string{"context": "C", "aliases": "Al;Ally", "description": "D"}); err != nil {
			t.Fatal(err)
		}
	}
	got := calls()
	if want := [][]string{{"pronunciation-lookup", "--name=Al"}}; !slices.EqualFunc(got, want, slices.Equal[[]string]) {
		t.Fatalf("sidecar calls = %q, want %q", got, want)
	}
	entities, err := service.Entities()
	if err != nil {
		t.Fatal(err)
	}
	var texts []string
	for _, alias := range entities[0]["aliases"].([]any) {
		texts = append(texts, alias.(map[string]any)["text"].(string))
	}
	if !slices.Equal(texts, []string{"Al", "Ally"}) || entities[0]["context"] != "C" || entities[0]["description"].(map[string]any)["text"] != "D" {
		t.Fatalf("entity = %v", entities[0])
	}
	if occurrences := entities[0]["aliases"].([]any)[0].(map[string]any)["occurrences"].([]any); len(occurrences) != 2 {
		t.Fatalf("the new alias Al has %d occurrences, want the 2 in the manuscript", len(occurrences))
	}
}

// A name that starts with a dash is a value, not an option: the lookup takes each name as --name=VALUE, so an alias the narrator typed that
// way must not fail the whole Save.
func TestAnAliasThatLooksLikeAnOptionIsSentAsAValue(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	writeNarration(t, project)
	host := &Host{guide: service}
	if _, err := host.GuideEdit("entity-1", map[string]string{"aliases": "-brave;--not-a-flag", "personality": "-brave", "description": "--not-a-flag"}); err != nil {
		t.Fatal(err)
	}
	got := calls()
	if len(got) != 1 {
		t.Fatalf("calls = %v", got)
	}
	if want := []string{"pronunciation-lookup", "--name=--not-a-flag", "--name=-brave"}; !slices.Equal(got[0], want) {
		t.Fatalf("arguments = %q, want %q", got[0], want)
	}
	entities, _ := service.Entities()
	notes := entities[0]["personality_notes"].([]any)
	if entities[0]["description"].(map[string]any)["text"] != "--not-a-flag" || notes[0].(map[string]any)["text"] != "-brave" {
		t.Fatalf("the other fields of the Save: %v", entities[0])
	}
}

func TestAnEmptyEditStartsNoProcess(t *testing.T) {
	service, calls := countingGuide(t)
	host := &Host{guide: service}
	if _, err := host.GuideEdit("entity-1", map[string]string{}); err != nil {
		t.Fatal(err)
	}
	if got := calls(); len(got) != 0 {
		t.Fatalf("an empty edit started %d processes", len(got))
	}
}

func TestSeedingACharacterIsOneProcessNotTwo(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeNarration(t, project)
	candidates := []importer.CharacterCandidate{
		{ID: "a", Name: "Juno", Description: "The narrator's friend."},
		{ID: "b", Name: "Zeph"},
		{ID: "c", Name: "Unchecked", Description: "Not chosen."},
	}
	var last string
	seedCharacterCandidates(service, candidates, []string{"a", "b"}, func(_ int, message string) { last = message })
	got := calls()
	if want := [][]string{{"pronunciation-lookup", "--name=Juno"}, {"pronunciation-lookup", "--name=Zeph"}}; !slices.EqualFunc(got, want, slices.Equal[[]string]) {
		t.Fatalf("two checked characters started %q, want one lookup each, only to pronounce the name", got)
	}
	entities, err := service.Entities()
	if err != nil {
		t.Fatal(err)
	}
	if len(entities) != 2 || entities[0]["description"].(map[string]any)["text"] != "The narrator's friend." || entities[1]["description"].(map[string]any)["text"] != "" {
		t.Fatalf("entries = %v: only a candidate with a description carries one", entities)
	}
	if last != "Added 2 Story Bible characters" {
		t.Fatalf("last report = %q", last)
	}
}

// TestSeedingACharacterWritesItsPropertiesWithTheEntry covers seeding a character: a candidate's labelled facts (Codename, Abilities, ...)
// are written in the same write as the name and description - not a second edit - and a candidate with none gets an empty list.
func TestSeedingACharacterWritesItsPropertiesWithTheEntry(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeNarration(t, project)
	candidates := []importer.CharacterCandidate{
		{ID: "a", Name: "Wren", Description: "A spy.", Properties: []importer.Property{{Key: "Codename", Value: "The Sparrow"}, {Key: "Abilities", Value: "Flight"}}},
		{ID: "b", Name: "Juno"},
	}
	seedCharacterCandidates(service, candidates, []string{"a", "b"}, func(_ int, _ string) {})
	if got := calls(); len(got) != 2 {
		t.Fatalf("two checked characters started %d processes, want 2: %v", len(got), got)
	}
	entities, err := service.Entities()
	if err != nil {
		t.Fatal(err)
	}
	if got := entities[0]["properties"]; !reflect.DeepEqual(got, []any{map[string]any{"key": "Codename", "value": "The Sparrow"}, map[string]any{"key": "Abilities", "value": "Flight"}}) {
		t.Fatalf("Wren's properties = %v", got)
	}
	if got := entities[1]["properties"]; !reflect.DeepEqual(got, []any{}) {
		t.Fatalf("Juno has no properties and must have an empty list: %v", got)
	}
}
