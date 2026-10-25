package main

import (
	"bufio"
	"context"
	"desktop/internal/brand"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"desktop/internal/guide"
	"desktop/internal/importer"
	"desktop/internal/process"
	"desktop/internal/settings"
)

// fakeGuideCountEnv turns this test binary into a Story Bible sidecar that only records how it was called: one JSON line of arguments per
// process it is started as, in the file the variable names. It answers a pronunciation lookup the way the real one does: one line per word,
// from --word or a --words-file, naming the --source when there is one.
const fakeGuideCountEnv = "SHELL_FAKE_GUIDE_COUNT"

func runFakeGuideCount(path string) int {
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return 2
	}
	defer func() { _ = file.Close() }()
	line, _ := json.Marshal(os.Args[1:])
	_, _ = file.Write(append(line, '\n'))
	if len(os.Args) > 1 && os.Args[1] == "pronunciation" {
		source := "cmu"
		var words []string
		for index, arg := range os.Args[2:] {
			if strings.HasPrefix(arg, "--word=") {
				words = append(words, strings.TrimPrefix(arg, "--word="))
			}
			if next := 2 + index + 1; next < len(os.Args) && arg == "--source" {
				source = os.Args[next]
			}
			if next := 2 + index + 1; next < len(os.Args) && arg == "--words-file" {
				raw, err := os.ReadFile(os.Args[next])
				if err != nil || json.Unmarshal(raw, &words) != nil {
					return 2
				}
			}
		}
		for _, word := range words {
			_, _ = os.Stdout.WriteString(`{"ipa": "say ` + strings.ReplaceAll(word, `"`, "") + `", "source": "` + source + `", "confidence": "high"}` + "\n")
		}
	}
	return 0
}

// hostWithoutCueRefresh is a host over service whose cue refreshes do nothing: a test that counts what an edit asks the sidecar leaves
// out the background refresh that follows a speaker's edit (extraction_cues_test.go tests that).
func hostWithoutCueRefresh(service *guide.Service) *Host {
	host := &Host{guide: service}
	host.refreshCues = func(context.Context, ...string) (guide.CueCounts, error) { return guide.CueCounts{}, nil }
	return host
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

// words reads the --word arguments of one pronunciation lookup back, in order.
func words(args []string) []string {
	out := []string{}
	for _, arg := range args {
		if value, ok := strings.CutPrefix(arg, "--word="); ok {
			out = append(out, value)
		}
	}
	return out
}

// writeManuscript puts a manuscript with one narrated paragraph in the service's project, where the host searches for a new name.
func writeManuscript(t *testing.T, project string) {
	t.Helper()
	path := filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	content := `{"schemaVersion": 1, "documentId": "d", "chapters": [{"id": "c1", "title": "One"}],
		"paragraphs": [{"id": "p1", "chapterId": "c1", "chapterTitle": "One", "text": "Juno met Zeph. Juno is a friend."}]}`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
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

// An edit of the aliases is applied by the host too; the sidecar is started once, for the pronunciation of the names the entry did not have,
// and not at all when it had them all. The manuscript and the file never reach it.
func TestAnAliasEditAsksTheSidecarOnlyForTheNewNames(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	writeManuscript(t, project)
	host := hostWithoutCueRefresh(service)
	for i := 0; i < 3; i++ {
		if _, err := host.GuideEdit("entity-1", map[string]string{"context": "C", "aliases": "Ally;Alfie;Juno;Zeph", "description": "D"}); err != nil {
			t.Fatal(err)
		}
	}
	got := calls()
	if len(got) != 1 || got[0][0] != "pronunciation" || !slices.Equal(words(got[0]), []string{"Juno", "Zeph"}) {
		t.Fatalf("calls = %v, want one pronunciation lookup of the two new names", got)
	}
	for _, arg := range got[0] {
		if arg == "--manuscript" || arg == "--guide" || arg == "--field" {
			t.Fatalf("the lookup is given more than the words: %v", got[0])
		}
	}
	entities, err := service.Entities()
	if err != nil {
		t.Fatal(err)
	}
	aliases, _ := entities[0]["aliases"].([]any)
	if len(aliases) != 4 || entities[0]["context"] != "C" || entities[0]["occurrence_count"] == nil {
		t.Fatalf("entity after the edit = %v", entities[0])
	}
	juno := aliases[2].(map[string]any)
	if juno["text"] != "Juno" || len(juno["occurrences"].([]any)) != 2 || juno["pronunciation"].(map[string]any)["ipa"] != "say Juno" {
		t.Fatalf("the new alias = %v", juno)
	}
}

// A name that starts with a dash ("-brave") is a name, not an option: argparse only takes it in the --word=value form, so an alias the
// narrator typed that way must not fail the whole Save (or make a seeded character be skipped). Every other value is written by the host.
func TestAValueThatLooksLikeAnOptionIsSentAsAValue(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	writeManuscript(t, project)
	host := hostWithoutCueRefresh(service)
	if _, err := host.GuideEdit("entity-1", map[string]string{"aliases": "-brave", "personality": "-brave", "description": "--not-a-flag"}); err != nil {
		t.Fatal(err)
	}
	got := calls()
	if len(got) != 1 || !slices.Equal(words(got[0]), []string{"-brave"}) {
		t.Fatalf("calls = %v", got)
	}
	if slices.Contains(got[0], "-brave") {
		t.Fatalf("a bare option-looking name would be read as a flag: %v", got[0])
	}
	entities, err := service.Entities()
	if err != nil {
		t.Fatal(err)
	}
	if entities[0]["description"].(map[string]any)["text"] != "--not-a-flag" || entities[0]["aliases"].([]any)[0].(map[string]any)["text"] != "-brave" {
		t.Fatalf("entity = %v", entities[0])
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

// Seeding a character is one sidecar process, for its name's pronunciation, and one write: the host makes the entry, with the description
// and the labelled facts (Codename, Abilities, ...) a candidate carries, and an unchecked candidate is not created.
func TestSeedingACharacterIsOneProcessNotTwo(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeManuscript(t, project)
	candidates := []importer.CharacterCandidate{
		{ID: "a", Name: "Juno", Description: "The narrator's friend.", Properties: []importer.Property{{Key: "Codename", Value: "The Sparrow"}, {Key: "Abilities", Value: "Flight"}}},
		{ID: "b", Name: "Zeph"},
		{ID: "c", Name: "Unchecked", Description: "Not chosen."},
	}
	var last string
	seedCharacterCandidates(service, candidates, []string{"a", "b"}, func(_ int, message string) { last = message })
	got := calls()
	if len(got) != 2 {
		t.Fatalf("two checked characters started %d processes, want 2: %v", len(got), got)
	}
	for index, name := range []string{"Juno", "Zeph"} {
		if got[index][0] != "pronunciation" || !slices.Equal(words(got[index]), []string{name}) {
			t.Fatalf("seeding must only look up the name: %v", got[index])
		}
	}
	if last != "Added 2 Story Bible characters" {
		t.Fatalf("last report = %q", last)
	}
	entities, err := service.Entities()
	if err != nil || len(entities) != 2 {
		t.Fatalf("entries = %v, %v", entities, err)
	}
	juno, zeph := entities[0], entities[1]
	if juno["description"].(map[string]any)["text"] != "The narrator's friend." || len(juno["properties"].([]any)) != 2 {
		t.Fatalf("Juno did not carry her description and properties: %v", juno)
	}
	if zeph["description"].(map[string]any)["text"] != "" || len(zeph["properties"].([]any)) != 0 {
		t.Fatalf("Zeph has neither and must be written with none: %v", zeph)
	}
}
