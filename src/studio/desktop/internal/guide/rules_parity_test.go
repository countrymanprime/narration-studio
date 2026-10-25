package guide

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"desktop/internal/contractfile"
)

// ruleCase is one line of tests/fixtures/guide-rules/cases.jsonl: the manuscript file's text (or a repository path, or null for no
// file) and the Story Bible file's text (or null).
type ruleCase struct {
	Name           string  `json:"name"`
	Manuscript     *string `json:"manuscript"`
	ManuscriptPath string  `json:"manuscriptPath"`
	Guide          *string `json:"guide"`
}

// ruleResult is what the sidecar's suggest did with a case: its stdout lines and exit status, and the exception it exited with.
type ruleResult struct {
	Name      string   `json:"name"`
	Stdout    []string `json:"stdout"`
	Exit      int      `json:"exit"`
	Error     *string  `json:"error"`
	ErrorType *string  `json:"errorType"`
}

func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := contractfile.Dir()
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Join(dir, "..", "..", "..")
}

// readRuleCases reads the frozen cases and the sidecar's answers to them, in the same order.
func readRuleCases(t *testing.T) (string, []ruleCase, []ruleResult) {
	t.Helper()
	root := repoRoot(t)
	folder := filepath.Join(root, "tests", "fixtures", "guide-rules")
	file, err := os.Open(filepath.Join(folder, "cases.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = file.Close() }()
	var cases []ruleCase
	scanner := bufio.NewScanner(file)
	scanner.Buffer(nil, 64<<20)
	for scanner.Scan() {
		var c ruleCase
		if err := json.Unmarshal(scanner.Bytes(), &c); err != nil {
			t.Fatal(err)
		}
		cases = append(cases, c)
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(folder, "cases.golden.json"))
	if err != nil {
		t.Fatal(err)
	}
	var results []ruleResult
	if err := json.Unmarshal(raw, &results); err != nil {
		t.Fatal(err)
	}
	if len(results) != len(cases) {
		t.Fatalf("%d cases and %d results", len(cases), len(results))
	}
	return root, cases, results
}

// writeRuleCase writes c's files under dir as the recorder did and gives their paths.
func writeRuleCase(t *testing.T, root, dir string, c ruleCase) (string, string) {
	t.Helper()
	manuscript := filepath.Join(dir, "manuscript.json")
	switch {
	case c.ManuscriptPath != "":
		manuscript = filepath.Join(root, filepath.FromSlash(c.ManuscriptPath))
	case c.Manuscript != nil:
		if err := os.WriteFile(manuscript, []byte(*c.Manuscript), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	bible := filepath.Join(dir, "ManuscriptGuide", "manuscript_guide.json")
	if c.Guide != nil {
		if err := os.MkdirAll(filepath.Dir(bible), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(bible, []byte(*c.Guide), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return manuscript, bible
}

// TestRuleSuggestionsMatchTheSidecar replays every case the sidecar's test_rules_parity.py recorded before its rules were deleted
// (#2251 step 3; the files are frozen): the same lines, byte for byte, and an error exactly where the sidecar exited 1, in its words
// where it refused (a ValueError) rather than crashed.
func TestRuleSuggestionsMatchTheSidecar(t *testing.T) {
	root, cases, results := readRuleCases(t)
	printed, failed, lines := 0, 0, 0
	for i, c := range cases {
		want := results[i]
		if want.Name != c.Name {
			t.Fatalf("case %d is %q, its result %q", i, c.Name, want.Name)
		}
		manuscript, bible := writeRuleCase(t, root, t.TempDir(), c)
		got, err := RuleSuggestions(context.Background(), manuscript, bible)
		if want.Exit != 0 {
			failed++
			switch {
			case err == nil:
				t.Errorf("%s: printed %d lines, want the sidecar's %s %v", c.Name, len(got), *want.ErrorType, *want.Error)
			case (*want.ErrorType == "ValueError" || *want.ErrorType == "ManuscriptError") && err.Error() != *want.Error:
				t.Errorf("%s: error %q, want %q", c.Name, err, *want.Error)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: %v, want %d lines", c.Name, err, len(want.Stdout))
			continue
		}
		if len(got) > 0 {
			printed++
		}
		lines += len(got)
		if !slices.Equal(got, want.Stdout) {
			for j := range max(len(got), len(want.Stdout)) {
				var g, w string
				if j < len(got) {
					g = got[j]
				}
				if j < len(want.Stdout) {
					w = want.Stdout[j]
				}
				if g != w {
					t.Errorf("%s: line %d of %d (want %d)\n got: %s\nwant: %s", c.Name, j+1, len(got), len(want.Stdout), g, w)
					break
				}
			}
		}
	}
	if len(cases) < 500 || printed < 250 || failed < 40 || lines < 4000 {
		t.Errorf("%d cases: %d printed %d lines, %d failed", len(cases), printed, lines, failed)
	}
}

func TestRuleSuggestionsStopWhenCancelled(t *testing.T) {
	root, cases, _ := readRuleCases(t)
	i := slices.IndexFunc(cases, func(c ruleCase) bool { return c.Name == "alice-built-bible" })
	manuscript, bible := writeRuleCase(t, root, t.TempDir(), cases[i])
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := RuleSuggestions(ctx, manuscript, bible); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}

func TestRuleSuggestionsWriteNothing(t *testing.T) {
	root, cases, _ := readRuleCases(t)
	i := slices.IndexFunc(cases, func(c ruleCase) bool { return c.Name == "dawnspire-ada-captain" })
	dir := t.TempDir()
	manuscript, bible := writeRuleCase(t, root, dir, cases[i])
	before := snapshot(t, dir)
	first, err := RuleSuggestions(context.Background(), manuscript, bible)
	if err != nil || len(first) == 0 {
		t.Fatalf("RuleSuggestions = %d lines, %v", len(first), err)
	}
	second, _ := RuleSuggestions(context.Background(), manuscript, bible)
	if !slices.Equal(first, second) {
		t.Error("a second run printed other lines")
	}
	if after := snapshot(t, dir); !maps.Equal(before, after) {
		t.Errorf("files changed: before %v, after %v", before, after)
	}
}

func snapshot(t *testing.T, dir string) map[string]string {
	t.Helper()
	files := map[string]string{}
	err := filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		data, err := os.ReadFile(path)
		files[strings.TrimPrefix(path, dir)] = string(data)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	return files
}
