package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"desktop/internal/port"
	"desktop/internal/wiktextract"
)

// pronounceCall is the one sidecar call a Generate/Replace makes: `pronunciation --source <source> --words-file <file>`, and nothing of
// the Story Bible, which the host reads and writes itself.
func pronounceCall(t *testing.T, calls [][]string, source string) {
	t.Helper()
	if len(calls) != 1 {
		t.Fatalf("calls = %v, want one", calls)
	}
	call := calls[0]
	at := slices.Index(call, "--source")
	if call[0] != "pronunciation" || at < 0 || at+1 >= len(call) || call[at+1] != source || !slices.Contains(call, "--words-file") {
		t.Fatalf("call = %v", call)
	}
	for _, arg := range call {
		if strings.Contains(arg, "manuscript_guide.json") || arg == "--guide" || arg == "--entity-id" || arg == "--alias-index" {
			t.Fatalf("the Story Bible reached the sidecar: %v", call)
		}
	}
}

func TestGuidePronounceAsksTheSourceAndWritesTheChosenValue(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := &Host{guide: service}
	if _, err := host.GuidePronounce("entity-1", nil, "cmu"); err != nil {
		t.Fatal(err)
	}
	pronounceCall(t, calls(), "cmu")
	entities, err := service.Entities()
	if err != nil {
		t.Fatal(err)
	}
	value, _ := entities[0]["pronunciation"].(map[string]any)
	if value["ipa"] != "say Al" || value["source"] != "cmu" || value["chosen"] != true {
		t.Fatalf("pronunciation = %v", entities[0]["pronunciation"])
	}
}

func TestGuidePronounceSetsTheAliasByIndex(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := &Host{guide: service}
	aliasIndex := 2
	if _, err := host.GuidePronounce("entity-1", &aliasIndex, "espeak"); err != nil {
		t.Fatal(err)
	}
	pronounceCall(t, calls(), "espeak")
	entities, _ := service.Entities()
	aliases, _ := entities[0]["aliases"].([]any)
	value, _ := aliases[2].(map[string]any)["pronunciation"].(map[string]any)
	if value["ipa"] != "say Big Al" || value["source"] != "espeak" || value["chosen"] != true {
		t.Fatalf("alias = %v", aliases[2])
	}
}

func TestGuidePronounceRefusesBeforeStartingTheSidecar(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	host := &Host{guide: service}
	if _, err := host.GuidePronounce("entity-1", nil, "cmu"); err == nil || err.Error() != "Guide file does not exist; build it first." {
		t.Fatalf("GuidePronounce without a Story Bible = %v", err)
	}
	writeStoryBible(t, project)
	out := 3
	if _, err := host.GuidePronounce("entity-1", &out, "cmu"); err == nil || err.Error() != "Alias index out of range." {
		t.Fatalf("GuidePronounce(alias 3) = %v", err)
	}
	if _, err := host.GuidePronounce("entity-2", nil, "cmu"); err == nil || err.Error() != "Entity not found." {
		t.Fatalf("GuidePronounce(entity-2) = %v", err)
	}
	if got := calls(); len(got) != 0 {
		t.Fatalf("a refused Generate/Replace started the sidecar: %v", got)
	}
}

func TestGuidePronounceIsUnavailableWithoutTheStoryBible(t *testing.T) {
	host := &Host{}
	if _, err := host.GuidePronounce("entity-1", nil, "cmu"); err == nil {
		t.Fatal("expected an error when the Story Bible service is unavailable")
	}
}

func TestGuidePronounceRefusesAnUnregisteredSourceBeforeStartingTheSidecar(t *testing.T) {
	service, calls := countingGuide(t)
	host := &Host{guide: service}
	_, err := host.GuidePronounce("entity-1", nil, "forvo")
	if !errors.Is(err, port.ErrNotSupported) {
		t.Fatalf("GuidePronounce(forvo) = %v, want a *port.NotSupportedError", err)
	}
	if want := `There is no pronunciation source called "forvo".`; err.Error() != want {
		t.Fatalf("message = %q, want %q", err.Error(), want)
	}
	if got := calls(); len(got) != 0 {
		t.Fatalf("the sidecar must not start for a source the registry refuses: %v", got)
	}
}

// flagAfter is the value that follows flag in call, and whether flag is there.
func flagAfter(call []string, flag string) (string, bool) {
	at := slices.Index(call, flag)
	if at < 0 || at+1 >= len(call) {
		return "", at >= 0
	}
	return call[at+1], true
}

// A Generate/Replace from Wiktextract gives the sidecar the index the narrator installed in Settings, as app.go wires the service.
func TestGuidePronounceFromWiktextractGivesTheSidecarTheInstalledIndex(t *testing.T) {
	manager := testWiktextractManager(t, map[string]wiktextract.WordEntry{"al": {IPA: "/æl/"}})
	index, err := manager.Installed("wiktextract-test")
	if err != nil {
		t.Fatal(err)
	}
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := hostWithWiktextract(manager)
	host.guide = service
	service.SetWiktextractIndex(host.wiktextractIndexPath)
	if _, err := host.GuidePronounce("entity-1", nil, "wiktextract"); err != nil {
		t.Fatal(err)
	}
	got := calls()
	pronounceCall(t, got, "wiktextract")
	if value, _ := flagAfter(got[0], "--wiktextract-index"); value != index {
		t.Fatalf("--wiktextract-index = %q, want %q: %v", value, index, got[0])
	}
	entities, err := service.Entities()
	if err != nil {
		t.Fatal(err)
	}
	value, _ := entities[0]["pronunciation"].(map[string]any)
	if value["ipa"] != "say Al" || value["source"] != "wiktextract" || value["chosen"] != true {
		t.Fatalf("pronunciation = %v", entities[0]["pronunciation"])
	}
}

// Without an installed index the flag stays off, and the sidecar's Wiktextract source says it is not installed yet.
func TestGuidePronounceFromWiktextractWithoutAnInstalledIndexLeavesTheFlagOff(t *testing.T) {
	manager, err := wiktextract.New(productionWiktextractCatalogFixture(t), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := hostWithWiktextract(manager)
	host.guide = service
	service.SetWiktextractIndex(host.wiktextractIndexPath)
	if _, err := host.GuidePronounce("entity-1", nil, "wiktextract"); err != nil {
		t.Fatal(err)
	}
	got := calls()
	pronounceCall(t, got, "wiktextract")
	if _, found := flagAfter(got[0], "--wiktextract-index"); found {
		t.Fatalf("the sidecar was given an index that is not installed: %v", got[0])
	}
}

func TestTheStoryBiblesWiktextractIndexIsTheInstalledOneOrNothing(t *testing.T) {
	installed := testWiktextractManager(t, map[string]wiktextract.WordEntry{"al": {IPA: "/æl/"}})
	want, err := installed.Installed("wiktextract-test")
	if err != nil {
		t.Fatal(err)
	}
	if got := hostWithWiktextract(installed).wiktextractIndexPath(); got != want {
		t.Fatalf("installed: %q, want %q", got, want)
	}
	missing, err := wiktextract.New(productionWiktextractCatalogFixture(t), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if got := hostWithWiktextract(missing).wiktextractIndexPath(); got != "" {
		t.Fatalf("not installed: %q, want none", got)
	}
	broken := NewHost()
	broken.wiktextractManager = func() (*wiktextract.Manager, error) { return nil, errors.New("no catalog") }
	if got := broken.wiktextractIndexPath(); got != "" {
		t.Fatalf("no manager: %q, want none", got)
	}
}

// The source picker's preview of one word from Wiktextract is given the installed index too.
func TestPronunciationCandidateFromWiktextractGivesTheSidecarTheInstalledIndex(t *testing.T) {
	manager := testWiktextractManager(t, map[string]wiktextract.WordEntry{"wren": {IPA: "/ɹɛn/"}})
	index, err := manager.Installed("wiktextract-test")
	if err != nil {
		t.Fatal(err)
	}
	service, calls := countingGuide(t)
	host := hostWithWiktextract(manager)
	host.guide = service
	service.SetWiktextractIndex(host.wiktextractIndexPath)
	host.pronunciationCandidate("Wren", "wiktextract")
	got := calls()
	if len(got) != 1 || got[0][0] != "candidate" {
		t.Fatalf("calls = %v", got)
	}
	if value, _ := flagAfter(got[0], "--wiktextract-index"); value != index {
		t.Fatalf("--wiktextract-index = %q, want %q: %v", value, index, got[0])
	}
}

// configureLocked makes the project's Story Bible service with the installed Wiktextract index, so a lookup from the app reaches it.
func TestTheProjectsStoryBibleIsGivenTheInstalledWiktextractIndex(t *testing.T) {
	manager := testWiktextractManager(t, map[string]wiktextract.WordEntry{"wren": {IPA: "/ɹɛn/"}})
	index, err := manager.Installed("wiktextract-test")
	if err != nil {
		t.Fatal(err)
	}
	log := filepath.Join(t.TempDir(), "calls.jsonl")
	t.Setenv(fakeGuideCountEnv, log)
	host := newTestHost(t)
	host.mu.Lock()
	host.wiktextractManager = func() (*wiktextract.Manager, error) { return manager, nil }
	host.configureLocked(parseConfigArgs(t.TempDir(), []string{"--project-folder", t.TempDir(), "--manuscript-python", os.Args[0]}))
	host.mu.Unlock()
	host.pronunciationCandidate("Wren", "wiktextract")
	raw, err := os.ReadFile(log)
	if err != nil {
		t.Fatal(err)
	}
	var call []string
	if err := json.Unmarshal(bytes.TrimSpace(raw), &call); err != nil {
		t.Fatalf("calls %q: %v", raw, err)
	}
	if value, _ := flagAfter(call, "--wiktextract-index"); call[0] != "candidate" || value != index {
		t.Fatalf("call = %v, want --wiktextract-index %q", call, index)
	}
}
