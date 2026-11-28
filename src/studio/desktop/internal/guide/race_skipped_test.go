//go:build !race

package guide

// The tests here are the ones the race detector makes too slow for the raced job: on Windows TestBuildMatchesTheSidecar took 95 s under it
// against 14 s without, and the case-folding sweep 58 s against 0.7 s (run 44958798993, #3860). Neither starts a goroutine.
// scripts/ci/coverage-gate.mjs runs every Test in a `!race` file once without -race after a raced package's raced run, so each still
// runs on main-health and on a pull request that touches this package.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"desktop/internal/contractfile"
)

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

// TestBuildMatchesTheSidecar replays every build the sidecar's build recorded before it was deleted (#2251 step 3; the files are frozen).
// A build with the language model's spans is the sidecar's byte for byte: the same Story Bible file, the same names asked for
// pronunciations in the same order, the same progress lines, log messages and stdout line. Every build fails exactly where the
// sidecar's exited 1, in its words where it refused rather than crashed. A build that read the names with the rules (no model, or
// one that could not be loaded) reads them with the scan's name finder since #2251 (scanCandidates): it refuses a manuscript or a
// Story Bible as the sidecar did, and what else it did is pinned in testdata/build-rules.json instead (its stdout line or error, the
// names it asked pronunciations for, and its file's SHA-256; UPDATE_CONTRACTS=1 rewrites it).
func TestBuildMatchesTheSidecar(t *testing.T) {
	root, cases, results, rules, cues := readBuildParity(t)
	built, refused, ambiguous, names, spacy := 0, 0, 0, 0, 0
	byRules := map[string]rulesBuild{}
	for i, c := range cases {
		want := results[i]
		if want.Name != c.Name {
			t.Fatalf("case %d is %q, its result %q", i, c.Name, want.Name)
		}
		s, guidePath := writeBuildCase(t, root, c, rules, cues)
		model := &recordedModel{kind: c.Model.Kind, spans: c.Model.Spans, answers: want.Pronunciations}
		withRules := c.Model.Kind != "spacy"
		if withRules {
			model.byWord = map[string]string{}
			for j, word := range want.Words {
				if j < len(want.Pronunciations) {
					model.byWord[word] = want.Pronunciations[j]
				}
			}
		}
		s.buildModel = model
		run := &buildRun{}
		modelArgument := "model-folder"
		if c.Model.Kind == "rules-only" {
			modelArgument = RulesOnly
		}
		out, _, err := s.build(context.Background(), run, modelArgument, false)
		inWords := want.ErrorType != nil && slices.Contains(refusedInWords, *want.ErrorType)
		if err != nil {
			run.fail(err)
		}
		if withRules && !inWords {
			// Which names the rules find decides whether a crash the sidecar had on a damaged previous file is reached, so a rules
			// build is pinned whole, refusal included, unless the refusal is of the manuscript or the Story Bible themselves.
			got := rulesBuild{Words: model.asked, SHA256: writtenSHA256(t, guidePath)}
			if err != nil {
				got.Error = err.Error()
				refused++
			} else {
				got.Stdout = strings.Replace(out, guidePath, "@OUT@", 1)
				built++
			}
			byRules[c.Name] = got
			continue
		}
		switch {
		case want.Exit != 0 && err == nil:
			t.Errorf("%s: built %s, want the sidecar's %s %s", c.Name, out, *want.ErrorType, *want.Error)
			continue
		case want.Exit == 0 && err != nil:
			t.Errorf("%s: %v, want %s", c.Name, err, want.Stdout)
			continue
		case want.Exit != 0:
			refused++
			if inWords && err.Error() != *want.Error {
				t.Errorf("%s: error %q, want %q", c.Name, err, *want.Error)
			}
		default:
			built++
			if got := strings.Replace(out, guidePath, "@OUT@", 1); got != want.Stdout {
				t.Errorf("%s: printed %q, want %q", c.Name, got, want.Stdout)
			}
		}
		if want.Exit == 0 || inWords {
			if !slices.Equal(run.stages, want.Progress) {
				t.Errorf("%s: progress %q, want %q", c.Name, run.stages, want.Progress)
			}
			if wantLog := slices.DeleteFunc(slices.Clone(want.Log), isSidecarLogLine); !slices.Equal(run.said, wantLog) {
				t.Errorf("%s: log %q, want %q", c.Name, run.said, wantLog)
			}
		} else if len(run.stages) != len(want.Progress) || !slices.Equal(run.stages[:len(run.stages)-1], want.Progress[:len(want.Progress)-1]) {
			t.Errorf("%s: progress %q, want %q", c.Name, run.stages, want.Progress)
		}
		if (want.Exit == 0 || inWords) && !withRules && !slices.Equal(model.asked, want.Words) {
			t.Errorf("%s: asked for %d pronunciations, want %d (%q, want %q)", c.Name, len(model.asked), len(want.Words), first(model.asked, 6), first(want.Words, 6))
		}
		checkBuilt(t, c.Name, guidePath, want.Written, want.WrittenSHA256)
		names += len(want.Words)
		if want.Ambiguous {
			ambiguous++
		}
		if c.Model.Kind == "spacy" {
			spacy++
		}
	}
	t.Logf("%d builds: %d written, %d refused, %d with spaCy's spans, %d ambiguous in Python, %d names", len(cases), built, refused, spacy, ambiguous, names)
	if len(cases) < 1800 || built < 1400 || refused < 250 || spacy < 600 || len(byRules) < 700 {
		t.Errorf("%d builds: %d written, %d refused, %d with spaCy's spans, %d with the rules", len(cases), built, refused, spacy, len(byRules))
	}
	contractfile.CheckIn(t, "testdata", "build-rules", byRules)
}

// TestCaseFoldingMatchesTheSidecarForEveryCasedCharacter asks, for every character re gives a case (and the ones it adds as pairs), which
// of them a one-character name matches in a text of all of them. The sweep is in the sidecar's own terms, so a letter Go's unicode package
// would fold differently (the Kelvin sign, the long s, dotless i, a final sigma, sharp s) is found here.
func TestCaseFoldingMatchesTheSidecarForEveryCasedCharacter(t *testing.T) {
	_, _, sweep := readOccurrenceGolden(t)
	var universe []rune
	for _, run := range sweep.Universe {
		for r := run[0]; r <= run[1]; r++ {
			universe = append(universe, r)
		}
	}
	if len(universe) < 2500 {
		t.Fatalf("the sweep holds %d characters", len(universe))
	}
	// "x?x" for each character, a space between: the letter either side keeps a character that is not a word character from being ruled
	// out by the word edge.
	var text []rune
	for _, r := range universe {
		text = append(text, 'x', r, 'x', ' ')
	}
	recorded := map[rune][]rune{}
	for _, row := range sweep.Matches {
		lit := rune(row[0].(float64))
		var matched []rune
		for _, m := range row[1].([]any) {
			matched = append(matched, rune(m.(float64)))
		}
		recorded[lit] = matched
	}
	tables := pythonUnicode()
	for _, lit := range universe {
		pattern := compileLiterals(tables, []rune{'x', lit, 'x'})
		var got []rune
		forEachMatch(tables, pattern, text, func(start, _ int) { got = append(got, text[start+1]) })
		want, ok := recorded[lit]
		if !ok {
			want = []rune{lit}
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("U+%04X matches %U, want %U", lit, got, want)
		}
	}
}
