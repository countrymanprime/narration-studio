package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The narrator's own pronunciation and switching to the kept alternate. Each is applied by the host (guide.Service, mutate.go) with
// no sidecar process; free text is stored as typed, so a value starting with "-" is still the value.

// aliasPronunciation is the pronunciation of the alias at index of entity-1 in the project's Story Bible.
func aliasPronunciation(t *testing.T, project string, index int) map[string]any {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json"))
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		Entities []struct {
			Aliases []map[string]any `json:"aliases"`
		} `json:"entities"`
	}
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	value, _ := document.Entities[0].Aliases[index]["pronunciation"].(map[string]any)
	return value
}

func TestGuidePronounceUserStoresTheTextWithoutTheSidecar(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := &Host{guide: service}
	aliasIndex := 1
	if _, err := host.GuidePronounceUser("entity-1", &aliasIndex, " -wɹɛn "); err != nil {
		t.Fatal(err)
	}
	if got := aliasPronunciation(t, project, 1); got["ipa"] != "-wɹɛn" || got["source"] != "manual" || got["chosen"] != true {
		t.Fatalf("Alfie's pronunciation = %v", got)
	}
	if got := calls(); len(got) != 0 {
		t.Fatalf("the sidecar was started: %v", got)
	}
}

func TestGuidePronounceUserRefusesBlankMultiLineAndOverlongTextWithoutTheSidecar(t *testing.T) {
	for _, bad := range []string{"  ", "one\ntwo", strings.Repeat("x", 201)} {
		service, calls, project := countingGuideIn(t)
		writeStoryBible(t, project)
		host := &Host{guide: service}
		if _, err := host.GuidePronounceUser("entity-1", nil, bad); err == nil {
			t.Fatalf("GuidePronounceUser(%q) accepted", bad[:2])
		}
		if len(calls()) != 0 {
			t.Fatal("the sidecar started")
		}
	}
}

func TestGuidePronunciationUseAlternateSwitchesWithoutTheSidecar(t *testing.T) {
	service, calls, project := countingGuideIn(t)
	writeStoryBible(t, project)
	host := &Host{guide: service}
	if _, err := host.GuidePronunciationUseAlternate("entity-1", nil); err == nil || !strings.Contains(err.Error(), "no other pronunciation") {
		t.Fatalf("a switch with no alternate = %v", err)
	}
	path := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw = []byte(strings.Replace(string(raw), `{"text": "Ally"}`, `{"text": "Ally", "pronunciation": {"ipa": "ˈæli", "source": "manual",
		"alternate": {"ipa": "ˈɑli", "source": "cmu", "confidence": "high"}}}`, 1))
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	zero := 0
	if _, err := host.GuidePronunciationUseAlternate("entity-1", &zero); err != nil {
		t.Fatal(err)
	}
	got := aliasPronunciation(t, project, 0)
	if alternate, _ := got["alternate"].(map[string]any); got["ipa"] != "ˈɑli" || got["source"] != "cmu" || alternate["ipa"] != "ˈæli" {
		t.Fatalf("Ally's pronunciation = %v", got)
	}
	if got := calls(); len(got) != 0 {
		t.Fatalf("the sidecar was started: %v", got)
	}
}

func TestPronunciationDepthBindingsAreUnavailableWithoutTheStoryBible(t *testing.T) {
	host := &Host{}
	if _, err := host.GuidePronounceUser("entity-1", nil, "x"); err == nil {
		t.Fatal("GuidePronounceUser: expected an error")
	}
	if _, err := host.GuidePronunciationUseAlternate("entity-1", nil); err == nil {
		t.Fatal("GuidePronunciationUseAlternate: expected an error")
	}
}
