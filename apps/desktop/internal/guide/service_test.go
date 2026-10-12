package guide

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/port"
	"github.com/countrymanprime/narration-utils/shell/internal/process"
	"github.com/countrymanprime/narration-utils/shell/internal/settings"
)

func TestEntitiesToleratesMissingGuide(t *testing.T) {
	s := New(t.TempDir(), "", "", settings.New(t.TempDir(), ""), process.NewSupervisor())
	entities, err := s.Entities()
	if err != nil || len(entities) != 0 {
		t.Fatal("missing guide must be empty")
	}
	if got := s.guidePath(); filepath.Base(got) != "manuscript_guide.json" {
		t.Fatal(got)
	}
}

func TestVocabularyCandidatesFallBackToReviewedEntitiesForOlderGuides(t *testing.T) {
	root := t.TempDir()
	s := New(root, "", "", settings.New(root, root), process.NewSupervisor())
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	older := `{"entities":[{"canonical_name":"Dawnspire","category":"Place","aliases":[{"text":"the Spire"}]},{"canonical_name":"Abandoned","category":"Needs Review"}]}`
	if err := os.WriteFile(s.guidePath(), []byte(older), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := s.VocabularyCandidates()
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"Dawnspire", "the Spire"}; !slices.Equal(got, want) {
		t.Fatalf("candidates = %#v, want %#v", got, want)
	}
}

func TestEntitiesFillsMissingPronunciationAndDescription(t *testing.T) {
	root := t.TempDir()
	s := New(root, "", "", settings.New(root, root), process.NewSupervisor())
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	legacy := `{"entities":[{"id":"one","aliases":[{"text":"Al"}]}]}`
	if err := os.WriteFile(s.guidePath(), []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}
	entities, err := s.Entities()
	if err != nil || len(entities) != 1 {
		t.Fatalf("entities = %#v, %v", entities, err)
	}
	entity := entities[0]
	if _, ok := entity["pronunciation"].(map[string]any); !ok {
		t.Fatalf("pronunciation missing: %#v", entity)
	}
	description, ok := entity["description"].(map[string]any)
	if !ok || description["text"] != "" {
		t.Fatalf("description missing: %#v", entity["description"])
	}
	alias := entity["aliases"].([]any)[0].(map[string]any)
	if _, ok := alias["pronunciation"].(map[string]any); !ok {
		t.Fatalf("alias pronunciation missing: %#v", alias)
	}
}

func TestEntitiesNormalizesNullCollectionsAndRejectsMalformedGuide(t *testing.T) {
	root := t.TempDir()
	s := New(root, "", "", settings.New(root, root), process.NewSupervisor())
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	valid := `{"entities":[{"id":"one","aliases":null,"occurrences":null,"personality_notes":null,"relationships":null}]}`
	if err := os.WriteFile(s.guidePath(), []byte(valid), 0o600); err != nil {
		t.Fatal(err)
	}
	entities, err := s.Entities()
	if err != nil || len(entities) != 1 {
		t.Fatalf("entities = %#v, %v", entities, err)
	}
	if aliases, ok := entities[0]["aliases"].([]any); !ok || len(aliases) != 0 {
		t.Fatalf("aliases were not normalized: %#v", entities[0])
	}
	if err := os.WriteFile(s.guidePath(), []byte(`{"entities":{}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Entities(); err == nil {
		t.Fatal("malformed guide entities must return an error")
	}
}

func TestDialogueCuesToleratesMissingGuideAndMissingKey(t *testing.T) {
	root := t.TempDir()
	s := New(root, "", "", settings.New(root, root), process.NewSupervisor())
	if cues, err := s.DialogueCues(); err != nil || len(cues) != 0 {
		t.Fatalf("missing guide must be empty: %#v, %v", cues, err)
	}
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	// A guide written before dialogue cues existed has entities but no dialogue_cues key at all.
	if err := os.WriteFile(s.guidePath(), []byte(`{"entities":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if cues, err := s.DialogueCues(); err != nil || len(cues) != 0 {
		t.Fatalf("a guide with no dialogue_cues key must be empty: %#v, %v", cues, err)
	}
}

func TestDialogueCuesReadsTheDocumentLevelList(t *testing.T) {
	root := t.TempDir()
	s := New(root, "", "", settings.New(root, root), process.NewSupervisor())
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	document := `{"entities":[],"dialogue_cues":[{"id":"cue-1","chapterId":"ch1","paragraphId":"p1","quote_start":0,"quote_end":5,` +
		`"quote_text":"Hallo","speaker_entity_id":"alice","speaker_source":"tag",` +
		`"evidence":{"chapterId":"ch1","paragraphId":"p1","excerpt":"Hallo","tag":"said Alice"},"corrected":false}]}`
	if err := os.WriteFile(s.guidePath(), []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}
	cues, err := s.DialogueCues()
	if err != nil {
		t.Fatal(err)
	}
	if len(cues) != 1 || cues[0].ID != "cue-1" || cues[0].SpeakerEntityID == nil || *cues[0].SpeakerEntityID != "alice" {
		t.Fatalf("cues = %#v", cues)
	}
}

func TestDialogueCuesRejectsMalformedShape(t *testing.T) {
	root := t.TempDir()
	s := New(root, "", "", settings.New(root, root), process.NewSupervisor())
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(s.guidePath(), []byte(`{"dialogue_cues":{}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DialogueCues(); err == nil {
		t.Fatal("malformed dialogue_cues must return an error")
	}
}

func TestCorrectCueFailsCleanlyWithNoConfiguredSidecar(t *testing.T) {
	root := t.TempDir()
	s := New(root, "", "", settings.New(root, root), process.NewSupervisor())
	if err := s.CorrectCue("cue-1", "alice"); err == nil {
		t.Fatal("want an error with no configured sidecar")
	}
}

func TestCommandUsesFrozenSidecarDirectlyWithoutBackendScript(t *testing.T) {
	root := t.TempDir()
	program := filepath.Join(root, "manuscript-guide")
	if runtime.GOOS == "windows" {
		program += ".exe"
	}
	if err := os.WriteFile(program, nil, 0o700); err != nil {
		t.Fatal(err)
	}
	s := New(root, program, "", settings.New(root, root), process.NewSupervisor())
	actualProgram, args, err := s.command([]string{"build", "--out", "guide.json"})
	if err != nil {
		t.Fatal(err)
	}
	if actualProgram != program {
		t.Fatalf("program = %q, want %q", actualProgram, program)
	}
	if got, want := args, []string{"build", "--out", "guide.json"}; !slices.Equal(got, want) {
		t.Fatalf("args = %#v, want %#v", got, want)
	}
}

func TestAliasAndCreateOperationsUseCanonicalManuscriptWithoutLegacyESpeakPath(t *testing.T) {
	root := t.TempDir()
	store := settings.New(root, root)
	s := New(root, "unused", "", store, process.NewSupervisor())
	alias := s.editArgs("entity-1", map[string]string{"aliases": "A. Name"})
	if !slices.Contains(alias, "--manuscript") || !slices.Contains(alias, filepath.Join(root, "narration-utils", "manuscript", "manuscript.json")) || slices.Contains(alias, "--espeak-library") {
		t.Fatalf("alias arguments must use canonical context only: %#v", alias)
	}
	create := s.createArgs("Name", "Character", []string{"A. Name"}, "", nil)
	if slices.Contains(create, "--espeak-library") {
		t.Fatalf("create arguments must not include an eSpeak path: %#v", create)
	}
}

// TestDefaultPronunciationSourceIsOmittedWhenUnset pins the settings default: --default-source is left off build, an alias
// edit and create entirely while the narrator has not set a preference, so every project's command line is unchanged
// from before this setting existed; once set, it reaches all three, but never a field edit that does not touch aliases.
func TestDefaultPronunciationSourceIsOmittedWhenUnset(t *testing.T) {
	root := t.TempDir()
	t.Setenv("APPDATA", filepath.Join(root, "appdata")) // sandbox global scope away from the real machine (store_test.go's own pattern)
	s := New(root, "unused", "", settings.New(root, root), process.NewSupervisor())
	if got := s.buildArgs("progress.txt", "log.txt", "en_core_web_sm"); slices.Contains(got, "--default-source") {
		t.Fatalf("build arguments must not include --default-source when unset: %#v", got)
	}
	if got := s.editArgs("entity-1", map[string]string{"aliases": "A. Name"}); slices.Contains(got, "--default-source") {
		t.Fatalf("alias edit arguments must not include --default-source when unset: %#v", got)
	}
	if got := s.createArgs("Name", "Character", []string{"A. Name"}, "", nil); slices.Contains(got, "--default-source") {
		t.Fatalf("create arguments must not include --default-source when unset: %#v", got)
	}
}

func TestDefaultPronunciationSourceReachesBuildAliasEditAndCreate(t *testing.T) {
	root := t.TempDir()
	t.Setenv("APPDATA", filepath.Join(root, "appdata")) // sandbox global scope away from the real machine (store_test.go's own pattern)
	store := settings.New(root, root)
	value := "espeak"
	if err := store.Save("ManuscriptGuide", "global", map[string]*string{"default_pronunciation_source": &value}); err != nil {
		t.Fatal(err)
	}
	s := New(root, "unused", "", store, process.NewSupervisor())
	if got := s.buildArgs("progress.txt", "log.txt", "en_core_web_sm"); !slices.Contains(got, "--default-source") || !slices.Contains(got, "espeak") {
		t.Fatalf("build arguments must carry the narrator's default source: %#v", got)
	}
	if got := s.editArgs("entity-1", map[string]string{"aliases": "A. Name"}); !slices.Contains(got, "--default-source") || !slices.Contains(got, "espeak") {
		t.Fatalf("alias edit arguments must carry the narrator's default source: %#v", got)
	}
	if got := s.createArgs("Name", "Character", []string{"A. Name"}, "", nil); !slices.Contains(got, "--default-source") || !slices.Contains(got, "espeak") {
		t.Fatalf("create arguments must carry the narrator's default source: %#v", got)
	}
	if got := s.editArgs("entity-1", map[string]string{"description": "New."}); slices.Contains(got, "--default-source") {
		t.Fatalf("a field edit that is not aliases must not include --default-source: %#v", got)
	}
}

func TestEntitiesIgnoresAStoredStatusAndReadsTheLegacyUserSourceAsManual(t *testing.T) {
	entities := []any{map[string]any{
		"id": "e1",
		"pronunciation": map[string]any{
			"ipa": "wɹɛn", "source": "user", "confidence": "narrator", "status": "query_sent", "note": "Asked.",
			"alternate": map[string]any{"ipa": "x", "source": "user", "confidence": "narrator", "status": "author_confirmed"},
		},
		"aliases": []any{map[string]any{"text": "Wrennie", "pronunciation": map[string]any{"ipa": "y", "source": "cmu", "status": "author_confirmed"}}},
	}}
	got, err := serviceWithGuideFile(t, entities).Entities()
	if err != nil {
		t.Fatal(err)
	}
	value := got[0]["pronunciation"].(map[string]any)
	if value["source"] != "manual" || value["note"] != "Asked." || value["ipa"] != "wɹɛn" {
		t.Fatalf("value = %#v", value)
	}
	if _, has := value["status"]; has {
		t.Fatalf("status returned: %#v", value)
	}
	alternate := value["alternate"].(map[string]any)
	if _, has := alternate["status"]; has || alternate["source"] != "manual" {
		t.Fatalf("alternate = %#v", alternate)
	}
	alias := got[0]["aliases"].([]any)[0].(map[string]any)["pronunciation"].(map[string]any)
	if _, has := alias["status"]; has || alias["source"] != "cmu" {
		t.Fatalf("alias = %#v", alias)
	}
}

func TestCandidateRefusesAnUnregisteredSourceBeforeStartingTheSidecar(t *testing.T) {
	rig := newPreviewRig(t, "candidate")
	_, err := rig.service.Candidate("Wren", "forvo")
	if !errors.Is(err, port.ErrNotSupported) {
		t.Fatalf("err = %v, want a *port.NotSupportedError", err)
	}
	if got := rig.invocations(t); got != 0 {
		t.Fatalf("sidecar started %d times", got)
	}
}

func TestCandidateTrimsTheWordAndPassesItAsOneWordArgument(t *testing.T) {
	rig := newPreviewRig(t, "candidate")
	got, err := rig.service.Candidate("  -Wren ", "cmu")
	if err != nil || !got.OK || got.Say != "wɹɛn" {
		t.Fatalf("got %+v, %v", got, err)
	}
	raw, err := os.ReadFile(rig.log)
	if err != nil {
		t.Fatal(err)
	}
	if line := strings.TrimSpace(string(raw)); !strings.Contains(line, "candidate --word=-Wren --source cmu") {
		t.Fatalf("command line = %q", line)
	}
}

func entitiesFrom(t *testing.T, document string) []map[string]any {
	t.Helper()
	root := t.TempDir()
	s := New(root, "", "", settings.New(root, root), process.NewSupervisor())
	if err := os.MkdirAll(filepath.Dir(s.guidePath()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(s.guidePath(), []byte(document), 0o600); err != nil {
		t.Fatal(err)
	}
	entities, err := s.Entities()
	if err != nil {
		t.Fatal(err)
	}
	return entities
}

// SNB-3b: a file written before the review flags reads the entry flag from review_state and no name flags.
func TestEntitiesReadTheReviewFlagFromReviewStateInAnOlderFile(t *testing.T) {
	entities := entitiesFrom(t, `{"entities":[{"id":"a","review_state":"needs review"},{"id":"b","review_state":"generated"}]}`)
	for i, want := range []bool{true, false} {
		review, ok := entities[i]["review"].(map[string]any)
		if !ok || review["entry"] != want || len(review["aliases"].([]any)) != 0 {
			t.Fatalf("entity %d review = %#v", i, entities[i]["review"])
		}
	}
}

func TestEntitiesKeepOnlyTheFlaggedNamesTheEntryHas(t *testing.T) {
	entities := entitiesFrom(t, `{"entities":[{"id":"a","review_state":"needs review","aliases":[{"text":"Sparrow"}],
		"review":{"entry":false,"aliases":["Sparrow","Gone","Sparrow",3]}}]}`)
	review := entities[0]["review"].(map[string]any)
	if review["entry"] != false || !slices.Equal(review["aliases"].([]any), []any{"Sparrow"}) {
		t.Fatalf("review = %#v", review)
	}
}

// SNB-4b: a stored colour 1..7 is sent; anything else reads as automatic.
func TestEntitiesSendOnlyASpeakerColorOneToSeven(t *testing.T) {
	entities := entitiesFrom(t, `{"entities":[{"id":"a","speaker_color":7},{"id":"b","speaker_color":8},{"id":"c","speaker_color":"3"},{"id":"d","speaker_color":0},{"id":"e"}]}`)
	if entities[0]["speaker_color"] != float64(7) {
		t.Fatalf("speaker_color = %#v", entities[0]["speaker_color"])
	}
	for _, entity := range entities[1:] {
		if _, present := entity["speaker_color"]; present {
			t.Fatalf("%v kept speaker_color %#v", entity["id"], entity["speaker_color"])
		}
	}
}

func TestSetSpeakerColorRefusesAnIndexOutsideOneToSevenBeforeTheSidecar(t *testing.T) {
	s := New(t.TempDir(), "", "", nil, nil)
	for _, bad := range []int{-1, 8} {
		if err := s.SetSpeakerColor("a", &bad); err == nil || !strings.Contains(err.Error(), "1 to 7") {
			t.Fatalf("SetSpeakerColor(%d) = %v", bad, err)
		}
	}
}

// fakeMergeEnv turns this test binary into a Story Bible sidecar that answers merge and unmerge the way manuscript_guide.py does,
// recording each call's arguments in the file the variable names. It runs from init, before TestMain hands the binary to the tests.
const fakeMergeEnv = "GUIDE_FAKE_MERGE_LOG"

const fakeUndoID = "0123456789abcdef"

func init() {
	if path := os.Getenv(fakeMergeEnv); path != "" {
		os.Exit(runFakeMerge(path, os.Args[1:]))
	}
}

func runFakeMerge(path string, args []string) int {
	if file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600); err == nil {
		_, _ = fmt.Fprintln(file, strings.Join(args, " "))
		_ = file.Close()
	}
	switch {
	case len(args) > 0 && args[0] == "merge":
		fmt.Printf("MERGED|%s|%s\n", flagValue(args, "--target-id"), fakeUndoID)
	case len(args) > 0 && args[0] == "unmerge" && flagValue(args, "--undo-id") == fakeUndoID:
		fmt.Println("UNMERGED|nico|nicholas")
	default:
		fmt.Fprintln(os.Stderr, "Nicholas changed after the merge, so it cannot be undone.")
		return 1
	}
	return 0
}

func TestUnmergeRoundTripsThroughTheSidecar(t *testing.T) {
	project := t.TempDir()
	log := filepath.Join(t.TempDir(), "calls.log")
	t.Setenv(fakeMergeEnv, log)
	sidecars := process.NewSupervisor()
	t.Cleanup(func() { _ = sidecars.Close() })
	s := New(project, os.Args[0], "", settings.New(project, project), sidecars)

	merged, err := s.Merge("nico", "nicholas")
	if err != nil {
		t.Fatal(err)
	}
	if merged.UndoID != fakeUndoID {
		t.Fatalf("undo id = %q, want %q", merged.UndoID, fakeUndoID)
	}
	contractfile.Check(t, "guide-merge", merged)
	if err := s.Unmerge(merged.UndoID); err != nil {
		t.Fatal(err)
	}
	// The sidecar's reason reaches the caller as the error.
	if err := s.Unmerge("fedcba9876543210"); err == nil || err.Error() != "Nicholas changed after the merge, so it cannot be undone." {
		t.Fatalf("a refused undo = %v", err)
	}
	calls, err := os.ReadFile(log)
	if err != nil {
		t.Fatal(err)
	}
	guidePath := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	want := strings.Join([]string{
		"merge --guide " + guidePath + " --source-id nico --target-id nicholas",
		"unmerge --guide " + guidePath + " --undo-id " + fakeUndoID,
		"unmerge --guide " + guidePath + " --undo-id fedcba9876543210",
	}, "\n") + "\n"
	if string(calls) != want {
		t.Fatalf("calls =\n%s\nwant\n%s", calls, want)
	}
}

func TestMergeRefusesAnAnswerWithoutAnUndoID(t *testing.T) {
	for _, out := range []string{"MERGED|nicholas", "MERGED|nicholas|", "DELETED|nicholas|0123456789abcdef", "MERGED|nicholas|0123456789ABCDEF"} {
		if _, err := mergeResult(out); err == nil {
			t.Fatalf("%q was taken as a merge", out)
		}
	}
}

func TestUnmergeRefusesAMalformedIDBeforeTheSidecar(t *testing.T) {
	root := t.TempDir()
	// No sidecar is configured: an id that reached it would fail with the configuration sentence instead.
	s := New(root, filepath.Join(root, "missing"), "", settings.New(root, root), process.NewSupervisor())
	for _, id := range []string{"", "--guide", "0123456789abcde", "0123456789abcdefa", "0123456789abcdeG"} {
		if err := s.Unmerge(id); err == nil || err.Error() != "that is not an undo id" {
			t.Fatalf("Unmerge(%q) = %v", id, err)
		}
	}
}
