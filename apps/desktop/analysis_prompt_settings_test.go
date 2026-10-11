package main

import (
	"strings"
	"testing"
)

// ManuscriptGuide.analysis_prompt is the narrator's "ask about better analysis" preference: ask (the default) or basic
// ("Don't ask again"). Any other value is refused and not saved.
func TestAnalysisPromptAcceptsOnlyAskOrBasic(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := NewHost()
	for _, ok := range []string{"basic", "ask"} {
		value := ok
		if err := host.saveSettings("ManuscriptGuide", "global", map[string]*string{"analysis_prompt": &value}); err != nil {
			t.Fatalf("%s must be accepted: %v", ok, err)
		}
	}
	bad := "never"
	err := host.saveSettings("ManuscriptGuide", "global", map[string]*string{"analysis_prompt": &bad})
	if err == nil || !strings.Contains(err.Error(), "unsupported value") {
		t.Fatalf("an unknown value must be refused: %v", err)
	}
	if got, _ := host.settings.Effective("ManuscriptGuide", "analysis_prompt", ""); got != "ask" {
		t.Fatalf("a refused value was saved: %q", got)
	}
}

// It is a narrator preference, so a project cannot carry it.
func TestAnalysisPromptIsGlobalOnly(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := NewHost()
	value := "basic"
	err := host.saveSettings("ManuscriptGuide", "project", map[string]*string{"analysis_prompt": &value})
	if err == nil || !strings.Contains(err.Error(), "global") {
		t.Fatalf("a project-scope save must be refused with a sentence: %v", err)
	}
}

func TestAnalysisPromptDefaultsToAskInTheFieldList(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	host := NewHost()
	fields, err := host.settingsForScope("global")
	if err != nil {
		t.Fatal(err)
	}
	list, _ := fields["ManuscriptGuide"].([]map[string]any)
	for _, field := range list {
		if field["key"] == "analysis_prompt" {
			if field["effectiveValue"] != "ask" || field["kind"] != "choice" {
				t.Fatalf("analysis_prompt = %v", field)
			}
			return
		}
	}
	t.Fatal("ManuscriptGuide has no analysis_prompt field")
}
