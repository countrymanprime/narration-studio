package main

import (
	"errors"
	"slices"
	"strings"
	"testing"

	"desktop/internal/port"
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
