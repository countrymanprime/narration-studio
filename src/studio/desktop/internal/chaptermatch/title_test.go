package chaptermatch

import (
	"encoding/json"
	"math"
	"os"
	"reflect"
	"testing"

	"desktop/internal/compare"
	"desktop/internal/layout"
)

// parityCases is tests/fixtures/chapter-track-match/parity-cases.json: what
// compare.py's matcher (find_chapter_by_track_name) returned for each input
// before it was deleted; the file is frozen, so this port is held to it.
type parityCases struct {
	NormalizedTokens []struct {
		Input  string   `json:"input"`
		Tokens []string `json:"tokens"`
	} `json:"normalizedTokens"`
	LabelTokens []struct {
		Input  string   `json:"input"`
		Tokens []string `json:"tokens"`
		Marker Marker   `json:"marker"`
	} `json:"labelTokens"`
	Matches []struct {
		Name     string   `json:"name"`
		Chapters []string `json:"chapters"`
		Track    string   `json:"track"`
		Index    *int     `json:"index"`
		Score    float64  `json:"score"`
	} `json:"matches"`
}

func loadParity(t *testing.T) parityCases {
	t.Helper()
	raw, err := os.ReadFile(layout.RepoFile(layout.FixturesDir + "/chapter-track-match/parity-cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases parityCases
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases.NormalizedTokens) == 0 || len(cases.Matches) == 0 {
		t.Fatal("the parity file holds no cases")
	}
	return cases
}

func TestNormalizedTokensMatchThePythonMatcher(t *testing.T) {
	for _, c := range loadParity(t).NormalizedTokens {
		got := NormalizedTokens(c.Input)
		if len(got) == 0 && len(c.Tokens) == 0 {
			continue
		}
		if !reflect.DeepEqual(got, c.Tokens) {
			t.Errorf("NormalizedTokens(%q) = %q, want %q", c.Input, got, c.Tokens)
		}
	}
}

func TestLabelTokensMatchThePythonMatcher(t *testing.T) {
	cases := loadParity(t).LabelTokens
	if len(cases) == 0 {
		t.Fatal("the parity file holds no labelTokens cases")
	}
	for _, c := range cases {
		tokens, marker := LabelTokens(c.Input)
		if !reflect.DeepEqual(tokens, c.Tokens) || marker != c.Marker {
			t.Errorf("LabelTokens(%q) = %q %q, want %q %q", c.Input, tokens, marker, c.Tokens, c.Marker)
		}
	}
}

func TestFindChapterByTrackNameMatchesThePythonMatcher(t *testing.T) {
	for _, c := range loadParity(t).Matches {
		t.Run(c.Name, func(t *testing.T) {
			index, score := FindChapterByTrackName(c.Chapters, c.Track)
			want := -1
			if c.Index != nil {
				want = *c.Index
			}
			if index != want {
				t.Fatalf("index = %d, want %d", index, want)
			}
			if math.Abs(score-c.Score) > 1e-12 {
				t.Fatalf("score = %.17g, want %.17g", score, c.Score)
			}
		})
	}
}

func TestSequenceRatioMatchesDifflib(t *testing.T) {
	// Values from Python's difflib.SequenceMatcher(None, a, b).ratio().
	cases := []struct {
		a, b string
		want float64
	}{
		{"", "", 1},
		{"abc", "", 0},
		{"abcd", "bcde", 0.75},
		{"chapter 11", "chapter 1", 18.0 / 19.0},
		{"the beginning", "the begining", 0.96},
		{"private thread", "thread private", 0.5},
	}
	for _, c := range cases {
		if got := sequenceRatio(c.a, c.b); math.Abs(got-c.want) > 1e-12 {
			t.Errorf("sequenceRatio(%q, %q) = %.17g, want %.17g", c.a, c.b, got, c.want)
		}
	}
}

// A project's equivalence list applies to both sides, as compare.py's label_tokens applied _CUSTOM_CANON: a title and a
// track name spelled two ways meet exactly, and the plain matcher has no list.
func TestAProjectsEquivalencesApplyToTheTitleAndTheTrackName(t *testing.T) {
	titles := []string{"Chapter 1: Arelian", "Chapter 2: Home"}
	with := compare.NewTokenizer([][]string{{"arelian", "arelion"}})
	if match := MatchTitleWith(with, titles, "Chapter 1 Arelion"); match.Index != 0 || match.Score != ScoreExact || !match.Confident {
		t.Fatalf("with the list: %+v", match)
	}
	if match := MatchTitle(titles, "Chapter 1 Arelion"); match.Score == ScoreExact {
		t.Fatalf("without it: %+v", match)
	}
	if tokens, marker := LabelTokensWith(with, "Arelion"); marker != MarkerNone || len(tokens) != 1 || tokens[0] != "arelian" {
		t.Fatalf("tokens %v %q", tokens, marker)
	}
}
