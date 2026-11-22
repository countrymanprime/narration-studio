//go:build !race

package guide

// The tests here are the ones the race detector makes too slow for the raced job: on Windows TestBuildMatchesTheSidecar took 95 s under it
// against 14 s without, and the case-folding sweep 58 s against 0.7 s (run 44958798993, #3860). Neither starts a goroutine.
// scripts/ci/coverage-gate.mjs runs every Test in a `!race` file once without -race after a raced package's raced run, so each still
// runs on main-health and on a pull request that touches this package.

import (
	"context"
	"reflect"
	"slices"
	"strings"
	"testing"

	"desktop/internal/contractfile"
)

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
