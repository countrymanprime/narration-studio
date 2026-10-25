package guide

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// cueCase is one line of tests/fixtures/guide-cues/cases.jsonl: the inputs of one run of the sidecar's cues command. rulesCase names a
// case of tests/fixtures/guide-rules whose manuscript and Story Bible it reads; otherwise the manuscript is its text or a repository path
// and the Story Bible its text, a repository path or null (no file).
type cueCase struct {
	Name           string   `json:"name"`
	RulesCase      string   `json:"rulesCase"`
	Manuscript     *string  `json:"manuscript"`
	ManuscriptPath string   `json:"manuscriptPath"`
	Guide          *string  `json:"guide"`
	GuidePath      string   `json:"guidePath"`
	Chapters       []string `json:"chapters"`
}

// cueResult is what the command did: the line it printed, its exit status and exception, and the Story Bible file afterwards (its text
// when short, and its SHA-256; both null when there was no file).
type cueResult struct {
	Name          string  `json:"name"`
	Exit          int     `json:"exit"`
	Stdout        string  `json:"stdout"`
	Error         *string `json:"error"`
	ErrorType     *string `json:"errorType"`
	Written       *string `json:"written"`
	WrittenSHA256 *string `json:"writtenSha256"`
}

func readJSONLines[T any](t *testing.T, path string) []T {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = file.Close() }()
	var rows []T
	scanner := bufio.NewScanner(file)
	scanner.Buffer(nil, 64<<20)
	for scanner.Scan() {
		var row T
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
			t.Fatal(err)
		}
		rows = append(rows, row)
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	return rows
}

func readJSONFile[T any](t *testing.T, path string) T {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var value T
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func readText(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// fromPython is text the sidecar wrote on Linux as it reads on this platform: Python's text mode ended each line with os.linesep.
func fromPython(text string) string { return strings.ReplaceAll(text, "\n", pyLineEnd) }

// checkWritten compares the Story Bible file at path with what the sidecar left there.
func checkWritten(t *testing.T, name, path string, text, sum *string) {
	t.Helper()
	raw, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		if sum != nil {
			t.Errorf("%s: no Story Bible, want the sidecar's", name)
		}
		return
	}
	if err != nil {
		t.Fatal(err)
	}
	got := strings.ReplaceAll(string(raw), pyLineEnd, "\n")
	if sum == nil {
		t.Errorf("%s: wrote a Story Bible where the sidecar left none", name)
		return
	}
	digest := sha256.Sum256([]byte(got))
	if hex.EncodeToString(digest[:]) == *sum {
		return
	}
	if text == nil {
		t.Errorf("%s: the Story Bible differs from the sidecar's (SHA-256 %s)", name, *sum)
		return
	}
	at := 0
	for at < min(len(got), len(*text)) && got[at] == (*text)[at] {
		at++
	}
	from := max(0, at-120)
	t.Errorf("%s: the Story Bible differs at byte %d\n got: %q\nwant: %q", name, at, got[from:min(len(got), at+120)], (*text)[from:min(len(*text), at+120)])
}

// TestRefreshCuesMatchesTheSidecar replays every case the sidecar's test_cues_parity.py recorded before its cue code was deleted (#2251
// step 3; the files are frozen): the same Story Bible file byte for byte, the same counts as its CUES line, and an error exactly where it
// exited 1, in its words where it refused (a ValueError) rather than crashed.
func TestRefreshCuesMatchesTheSidecar(t *testing.T) {
	root := repoRoot(t)
	folder := filepath.Join(root, "tests", "fixtures", "guide-cues")
	cases := readJSONLines[cueCase](t, filepath.Join(folder, "cases.jsonl"))
	results := readJSONFile[[]cueResult](t, filepath.Join(folder, "cases.golden.json"))
	if len(cases) != len(results) {
		t.Fatalf("%d cases and %d results", len(cases), len(results))
	}
	_, ruleCases, _ := readRuleCases(t)
	byRule := map[string]ruleCase{}
	for _, c := range ruleCases {
		byRule[c.Name] = c
	}
	refused, attributed, cues := 0, 0, 0
	for i, c := range cases {
		want := results[i]
		if want.Name != c.Name {
			t.Fatalf("case %d is %q, its result %q", i, c.Name, want.Name)
		}
		dir := t.TempDir()
		var manuscript, bible string
		if c.RulesCase != "" {
			manuscript, bible = writeRuleCase(t, root, dir, byRule[c.RulesCase])
		} else {
			guideText := c.Guide
			if c.GuidePath != "" {
				text := readText(t, filepath.Join(root, filepath.FromSlash(c.GuidePath)))
				guideText = &text
			}
			manuscript, bible = writeRuleCase(t, root, dir, ruleCase{Name: c.Name, Manuscript: c.Manuscript, ManuscriptPath: c.ManuscriptPath, Guide: guideText})
		}
		counts, err := refreshCues(context.Background(), manuscript, bible, c.Chapters)
		if want.Exit != 0 {
			refused++
			switch {
			case err == nil:
				t.Errorf("%s: wrote %+v, want the sidecar's %s %v", c.Name, counts, *want.ErrorType, *want.Error)
			case (*want.ErrorType == "ValueError" || *want.ErrorType == "ManuscriptError") && err.Error() != *want.Error:
				t.Errorf("%s: error %q, want %q", c.Name, err, *want.Error)
			}
		} else {
			if err != nil {
				t.Errorf("%s: %v, want %s", c.Name, err, want.Stdout)
				continue
			}
			if line := fmt.Sprintf("CUES|%d|%d", counts.Cues, counts.Attributed); line != want.Stdout {
				t.Errorf("%s: %s, want %s", c.Name, line, want.Stdout)
			}
			cues += counts.Cues
			attributed += counts.Attributed
		}
		checkWritten(t, c.Name, bible, want.Written, want.WrittenSHA256)
	}
	t.Logf("%d cases: %d refused, %d cues, %d with a speaker", len(cases), refused, cues, attributed)
	if len(cases) < 1300 || refused < 150 || cues < 10000 || attributed < 2000 {
		t.Errorf("%d cases: %d refused, %d cues, %d with a speaker", len(cases), refused, cues, attributed)
	}
}

// buildCase is one line of tests/fixtures/guide-cues/builds.jsonl: a manuscript and the Story Bible a build rebuilt.
type buildCase struct {
	Name           string  `json:"name"`
	Manuscript     *string `json:"manuscript"`
	ManuscriptPath string  `json:"manuscriptPath"`
	Previous       *string `json:"previous"`
	PreviousPath   string  `json:"previousPath"`
}

// buildResult is what the sidecar's build wrote while it still found the cues itself (built), and what it writes now, keeping the
// previous file's dialogue_cues as they were (cut), each with its exit status. The manuscript's path in the file is @MANUSCRIPT@.
type buildResult struct {
	Name  string  `json:"name"`
	Exit  int     `json:"exit"`
	Error *string `json:"error"`
	Built *struct {
		Written       *string `json:"written"`
		WrittenSHA256 *string `json:"writtenSha256"`
	} `json:"built"`
	CutExit int     `json:"cutExit"`
	Cut     *string `json:"cut"`
}

// TestBuildThenRefreshIsTodaysBuild pins the cut Build makes: the build keeps the old cues and the host refreshes them at once, which
// must leave the file the sidecar's build alone wrote while it found the cues itself, byte for byte. The build's half (it writes cut) is
// TestEveryRecordedBuildWritesTheFileThatKeepsTheCues. Where the old build failed on the old cues (they are the narrator's file, and it crashed on a
// value of the wrong type), the refresh fails on them too; the build has written its entries by then, which the old one had not.
func TestBuildThenRefreshIsTodaysBuild(t *testing.T) {
	root := repoRoot(t)
	folder := filepath.Join(root, "tests", "fixtures", "guide-cues")
	cases := readJSONLines[buildCase](t, filepath.Join(folder, "builds.jsonl"))
	results := readJSONFile[[]buildResult](t, filepath.Join(folder, "builds.golden.json"))
	if len(cases) != len(results) {
		t.Fatalf("%d cases and %d results", len(cases), len(results))
	}
	built, crashed := 0, 0
	for i, c := range cases {
		want := results[i]
		if want.Name != c.Name {
			t.Fatalf("case %d is %q, its result %q", i, c.Name, want.Name)
		}
		if want.CutExit != 0 {
			if want.Exit == 0 {
				t.Errorf("%s: the build without cues failed where the old one did not", c.Name)
			}
			continue // the build failed before the cues, now as then
		}
		dir := t.TempDir()
		manuscript, bible := writeRuleCase(t, root, dir, ruleCase{Name: c.Name, Manuscript: c.Manuscript, ManuscriptPath: c.ManuscriptPath, Guide: ptrTo(fromPython(*want.Cut))})
		_, err := refreshCues(context.Background(), manuscript, bible, nil)
		if want.Exit != 0 {
			crashed++
			if err == nil {
				t.Errorf("%s: the refresh after the build passed where the old build failed (%v)", c.Name, *want.Error)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: %v", c.Name, err)
			continue
		}
		built++
		checkWritten(t, c.Name, bible, want.Built.Written, want.Built.WrittenSHA256)
	}
	t.Logf("%d builds pinned, %d crashed on the old cues", built, crashed)
	if built < 140 || crashed < 1 {
		t.Errorf("%d builds pinned, %d crashed on the old cues", built, crashed)
	}
}

func ptrTo[T any](value T) *T { return &value }
