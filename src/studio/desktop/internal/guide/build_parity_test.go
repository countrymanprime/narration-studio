package guide

import (
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"desktop/internal/brand"
	"desktop/internal/settings"
)

// buildParityCase is one line of tests/fixtures/guide-build/cases.jsonl: the inputs of one run of the sidecar's build. The manuscript
// is a guide-rules case's (rulesCase), a guide-cues build's (cueBuild), a repository file (manuscriptPath) or its text; the previous
// Story Bible likewise (rulesCase's guide, cueBuild's previous, previousRulesCase, previousPath, previous, or previousBytes in hex),
// or none. model is what the model work gave: the rules alone, spaCy's spans for each paragraph, or a model that could not be loaded.
type buildParityCase struct {
	Name              string  `json:"name"`
	RulesCase         string  `json:"rulesCase"`
	CueBuild          string  `json:"cueBuild"`
	ManuscriptPath    string  `json:"manuscriptPath"`
	Manuscript        *string `json:"manuscript"`
	Previous          *string `json:"previous"`
	PreviousRulesCase string  `json:"previousRulesCase"`
	PreviousPath      string  `json:"previousPath"`
	PreviousBytes     string  `json:"previousBytes"`
	Clock             *int    `json:"clock"`
	Model             struct {
		Kind  string     `json:"kind"`
		Spans [][][3]any `json:"spans"`
	} `json:"model"`
}

// writeBuildCase lays a case out as a project: its manuscript where the host reads it and its Story Bible where the build writes.
func writeBuildCase(t *testing.T, root string, c buildParityCase, rules map[string]ruleCase, cues map[string]buildCase) (*Service, string) {
	t.Helper()
	project := t.TempDir()
	manuscript := filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json")
	guidePath := filepath.Join(project, "ManuscriptGuide", "manuscript_guide.json")
	var manuscriptText, previous *string
	manuscriptFile := c.ManuscriptPath
	switch {
	case c.RulesCase != "":
		rule := rules[c.RulesCase]
		manuscriptText, manuscriptFile, previous = rule.Manuscript, rule.ManuscriptPath, rule.Guide
	case c.CueBuild != "":
		build := cues[c.CueBuild]
		manuscriptText, manuscriptFile, previous = build.Manuscript, build.ManuscriptPath, build.Previous
		if build.PreviousPath != "" {
			previous = ptrTo(readText(t, filepath.Join(root, filepath.FromSlash(build.PreviousPath))))
		}
	default:
		manuscriptText = c.Manuscript
	}
	switch {
	case c.PreviousRulesCase != "":
		previous = rules[c.PreviousRulesCase].Guide
	case c.PreviousPath != "":
		previous = ptrTo(readText(t, filepath.Join(root, filepath.FromSlash(c.PreviousPath))))
	case c.Previous != nil:
		previous = c.Previous
	}
	if manuscriptFile != "" {
		manuscriptText = ptrTo(readText(t, filepath.Join(root, filepath.FromSlash(manuscriptFile))))
	}
	write := func(path string, data []byte) {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, data, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if manuscriptText != nil {
		write(manuscript, []byte(*manuscriptText))
	}
	if err := os.MkdirAll(filepath.Dir(guidePath), 0o755); err != nil {
		t.Fatal(err)
	}
	switch {
	case c.PreviousBytes != "":
		raw, err := hex.DecodeString(strings.ReplaceAll(c.PreviousBytes, " ", ""))
		if err != nil {
			t.Fatal(err)
		}
		write(guidePath, raw)
	case previous != nil:
		write(guidePath, []byte(*previous))
	}
	s := New(project, "unused", "", settings.New(project, project), nil)
	micro := 123456
	if c.Clock != nil {
		micro = *c.Clock
	}
	s.clock = func() time.Time { return time.Date(2026, 10, 25, 12, 0, 0, micro*1000, time.UTC) }
	s.resolvePath = func(string) string { return "@MANUSCRIPT@" }
	return s, guidePath
}
