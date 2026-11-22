package guide

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
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

// buildParityResult is what the build did: its exit status and exception, its stdout line (the file's path as @OUT@), every progress
// line and info log message, the names it asked pronunciations for and the (stubbed) answers, and the Story Bible file it left (its
// SHA-256, and its text when short; the manuscript's path in it as @MANUSCRIPT@). ambiguous marks a case whose file Python's own hash
// seed decided, where the file is the one Python writes with the order this host uses.
type buildParityResult struct {
	Name           string   `json:"name"`
	Exit           int      `json:"exit"`
	Error          *string  `json:"error"`
	ErrorType      *string  `json:"errorType"`
	Stdout         string   `json:"stdout"`
	Progress       []string `json:"progress"`
	Log            []string `json:"log"`
	Words          []string `json:"words"`
	Pronunciations []string `json:"pronunciations"`
	Written        *string  `json:"written"`
	WrittenSHA256  *string  `json:"writtenSha256"`
	Ambiguous      bool     `json:"ambiguous"`
}

// recordedModel answers a build's model work from a recorded case, and keeps the words it was asked for. byWord, when set, answers
// each word with the answer recorded for it, and a word the recording never asked with the recorder's own stub (the word reversed,
// from espeak): a rules build asks for other names since #2251, and which names it asks is what is under test, not their answers.
type recordedModel struct {
	kind    string
	spans   [][][3]any
	answers []string
	byWord  map[string]string
	asked   []string
}

func (m *recordedModel) entities(ctx context.Context, _, _, log string, paragraphs []ruleParagraph, names func([][]entitySpan) []string) ([]*pyObject, error) {
	var spans [][]entitySpan
	if m.kind == "spacy" {
		if len(m.spans) != len(paragraphs) {
			return nil, fmt.Errorf("%d paragraphs of spans for %d paragraphs", len(m.spans), len(paragraphs))
		}
		spans = make([][]entitySpan, len(m.spans))
		for i, row := range m.spans {
			spans[i] = []entitySpan{}
			for _, span := range row {
				spans[i] = append(spans[i], entitySpan{start: int(span[0].(float64)), end: int(span[1].(float64)), label: span[2].(string)})
			}
		}
	}
	words := names(spans)
	if len(words) == 0 {
		return nil, nil
	}
	return m.pronunciations(ctx, words, log)
}

func (m *recordedModel) pronunciations(_ context.Context, words []string, _ string) ([]*pyObject, error) {
	m.asked = append(m.asked, words...)
	if m.byWord != nil {
		answers := make([]string, len(words))
		for i, word := range words {
			answer, ok := m.byWord[word]
			if !ok {
				reversed := []rune(word)
				slices.Reverse(reversed)
				answer = `{"ipa": ` + jsonText(string(reversed)) + `, "source": "espeak", "confidence": "low"}`
			}
			answers[i] = answer
		}
		return parsePronunciationObjects(strings.Join(answers, "\n"), len(words))
	}
	if len(words) > len(m.answers) {
		return nil, fmt.Errorf("asked %d words, %d recorded", len(words), len(m.answers))
	}
	return parsePronunciationObjects(strings.Join(m.answers[:len(words)], "\n"), len(words))
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

func readBuildParity(t *testing.T) (string, []buildParityCase, []buildParityResult, map[string]ruleCase, map[string]buildCase) {
	t.Helper()
	root := repoRoot(t)
	folder := filepath.Join(root, "tests", "fixtures", "guide-build")
	cases := readJSONLines[buildParityCase](t, filepath.Join(folder, "cases.jsonl"))
	results := readJSONLines[buildParityResult](t, filepath.Join(folder, "cases.golden.jsonl"))
	if len(cases) != len(results) {
		t.Fatalf("%d cases and %d results", len(cases), len(results))
	}
	_, ruleCases, _ := readRuleCases(t)
	rules := map[string]ruleCase{}
	for _, c := range ruleCases {
		rules[c.Name] = c
	}
	cues := map[string]buildCase{}
	for _, c := range readJSONLines[buildCase](t, filepath.Join(root, "tests", "fixtures", "guide-cues", "builds.jsonl")) {
		cues[c.Name] = c
	}
	return root, cases, results, rules, cues
}

// refusedInWords are the exceptions the sidecar raised on purpose, whose words the host keeps; any other was a crash on a value of the
// wrong type, where the host refuses in its own words.
var refusedInWords = []string{"ValueError", "ManuscriptError"}

// rulesBuild is what a build that read the names with the rules did: its stdout line (the file's path as @OUT@), the names it asked
// pronunciations for, in order, and its Story Bible file's SHA-256, read as on Linux; or the error it failed with.
type rulesBuild struct {
	Stdout string   `json:"stdout,omitempty"`
	Error  string   `json:"error,omitempty"`
	Words  []string `json:"words"`
	SHA256 string   `json:"sha256"`
}

// writtenSHA256 is the SHA-256 of the Story Bible at path, its line ends as on Linux, or "" when there is none.
func writtenSHA256(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return ""
	}
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256([]byte(strings.ReplaceAll(string(raw), pyLineEnd, "\n")))
	return hex.EncodeToString(digest[:])
}

// isSidecarLogLine is a message the sidecar now logs itself, into the same log: that the language model could not be loaded.
func isSidecarLogLine(message string) bool {
	return strings.HasPrefix(message, "WARNING: spaCy model unavailable (")
}

func first(words []string, n int) []string { return words[:min(n, len(words))] }

// checkBuilt compares the Story Bible at path with the sidecar's, read as Python wrote it on Linux.
func checkBuilt(t *testing.T, name, path string, text, sum *string) {
	t.Helper()
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		if sum != nil {
			t.Errorf("%s: no Story Bible, want the sidecar's", name)
		}
		return
	}
	if err != nil {
		t.Fatal(err)
	}
	if sum == nil {
		t.Errorf("%s: wrote a Story Bible where the sidecar left none", name)
		return
	}
	got := strings.ReplaceAll(string(raw), pyLineEnd, "\n")
	digest := sha256.Sum256([]byte(got))
	if hex.EncodeToString(digest[:]) == *sum {
		return
	}
	digest = sha256.Sum256(raw) // a file the build left as it was, byte for byte
	if hex.EncodeToString(digest[:]) == *sum {
		return
	}
	if dir := os.Getenv("GUIDE_BUILD_DUMP"); dir != "" {
		_ = os.WriteFile(filepath.Join(dir, "go_"+strings.ReplaceAll(name, "/", "_")+".json"), []byte(got), 0o600)
	}
	if text == nil {
		t.Errorf("%s: the Story Bible differs from the sidecar's (SHA-256 %s); got %d bytes: %.600q", name, *sum, len(got), got)
		return
	}
	at := 0
	for at < min(len(got), len(*text)) && got[at] == (*text)[at] {
		at++
	}
	from := max(0, at-160)
	t.Errorf("%s: the Story Bible differs at byte %d\n got: %q\nwant: %q", name, at, got[from:min(len(got), at+160)], (*text)[from:min(len(*text), at+160)])
}
