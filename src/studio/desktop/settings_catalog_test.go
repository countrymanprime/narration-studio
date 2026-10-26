package main

import (
	"slices"
	"strings"
	"testing"

	"desktop/internal/settings"
)

// The spaCy model choice comes from the approved catalog, not from a list in the host: every approved model can be selected before it is
// installed (selecting never downloads), and nothing else can be selected.
func TestTheLanguageModelChoiceIsTheApprovedCatalogWhetherOrNotAModelIsInstalled(t *testing.T) {
	f := newSpacyFixture(t)
	schemas, err := f.host.settingsForScope("global")
	if err != nil {
		t.Fatal(err)
	}
	fields, _ := schemas["ManuscriptGuide"].([]map[string]any)
	// spacy_model plus build_after_import plus analysis_prompt plus default_pronunciation_source: the catalog override must replace only spacy_model's choices, not the whole ManuscriptGuide list
	// (a bug this test would have caught had it existed sooner).
	if len(fields) != 4 || fields[0]["key"] != "spacy_model" {
		t.Fatalf("ManuscriptGuide fields = %v", schemas["ManuscriptGuide"])
	}
	choices, _ := fields[0]["choices"].([]string)
	if len(choices) != 1 || choices[0] != "en_core_web_sm" {
		t.Fatalf("choices = %v, want the catalog model even though it is not installed", choices)
	}
	value := "en_core_web_sm"
	if err := f.host.saveSettings("ManuscriptGuide", "global", map[string]*string{"spacy_model": &value}); err != nil {
		t.Fatalf("selecting an approved model that is not installed must work: %v", err)
	}
	if f.manager.State(mustModel(t, f.manager)) != "not_installed" {
		t.Fatal("selecting a model must never download it")
	}
	other := "en_core_web_lg"
	if err := f.host.saveSettings("ManuscriptGuide", "global", map[string]*string{"spacy_model": &other}); err == nil || !strings.Contains(err.Error(), "unsupported value") {
		t.Fatalf("a model that is not in the catalog must be refused: %v", err)
	}
}

// The Preview voice choice is every voice in the approved catalog (config/tts-assets.json), in catalog order, whether or not it is
// installed: the hardcoded one-voice list it replaced could never offer a second voice, however many the catalog held.
func TestThePreviewVoiceChoiceIsEveryVoiceInTheApprovedCatalog(t *testing.T) {
	host := newTestHost(t)
	host.settings = settings.New(t.TempDir(), "")
	host.assets = contractServices(t).registry
	want := []string{}
	for _, voice := range host.registry().tts.Voices() {
		want = append(want, voice.ID)
	}
	if len(want) < 2 {
		t.Fatalf("the approved catalog has %d voices, want more than one: %v", len(want), want)
	}
	schemas, err := host.settingsForScope("global")
	if err != nil {
		t.Fatal(err)
	}
	fields, _ := schemas["Piper"].([]map[string]any)
	var choices []string
	for _, field := range fields {
		if field["key"] == "tts_voice_id" {
			choices, _ = field["choices"].([]string)
		}
	}
	if !slices.Equal(choices, want) {
		t.Fatalf("Preview voice choices = %v, want the catalog's %v", choices, want)
	}
	for _, id := range want {
		value := id
		if err := host.saveSettings("Piper", "global", map[string]*string{"tts_voice_id": &value}); err != nil {
			t.Fatalf("selecting the approved voice %s must work before it is installed: %v", id, err)
		}
	}
	other := "en_US-unapproved-high"
	if err := host.saveSettings("Piper", "global", map[string]*string{"tts_voice_id": &other}); err == nil || !strings.Contains(err.Error(), "unsupported value") {
		t.Fatalf("a voice that is not in the catalog must be refused: %v", err)
	}
}
