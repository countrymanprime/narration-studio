package scripttrack

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"desktop/internal/compare"
	"desktop/internal/layout"
)

// The placement is held to what locate.py and align_word.py answer (tests/fixtures/booth-parity/placement-cases.jsonl
// and its .golden.jsonl, written by the sidecar's test_tracker_parity.py): the recorded calls and the seeded tails.

type placementCase struct {
	K      string   `json:"k"`
	Tokens []string `json:"tokens"`
	Breaks []int    `json:"breaks"`
	Script struct {
		Text           string `json:"text"`
		ManuscriptPath string `json:"manuscriptPath"`
		Chapter        string `json:"chapter"`
	} `json:"script"`
	Heard  []string            `json:"heard"`
	Timed  [][]json.RawMessage `json:"timed"`
	Word   int                 `json:"word"`
	Offset float64             `json:"offset"`
}

// placementScript is _placement_script: the tokens and paragraph breaks a case places its words in.
func placementScript(t *testing.T, root string, c placementCase) ([]string, map[int]bool) {
	t.Helper()
	breaks := map[int]bool{}
	if c.Tokens != nil {
		for _, at := range c.Breaks {
			breaks[at] = true
		}
		return c.Tokens, breaks
	}
	if c.Script.Text != "" {
		raw, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(c.Script.Text)))
		if err != nil {
			t.Fatal(err)
		}
		return ScriptWords(string(raw)), breaks
	}
	script, err := LoadChapterScript(filepath.Join(root, filepath.FromSlash(c.Script.ManuscriptPath)), c.Script.Chapter)
	if err != nil {
		t.Fatal(err)
	}
	for _, span := range script.Spans {
		breaks[span.Start] = true
	}
	return script.Tokens, breaks
}

func timedWords(t *testing.T, raw [][]json.RawMessage) []TimedWord {
	t.Helper()
	out := make([]TimedWord, len(raw))
	for k, entry := range raw {
		var word TimedWord
		start, _ := ParseNum(entry[1])
		end, _ := ParseNum(entry[2])
		if err := json.Unmarshal(entry[0], &word.Text); err != nil {
			t.Fatal(err)
		}
		word.Start, word.End = start.Value(), end.Value()
		out[k] = word
	}
	return out
}

func TestEveryPlacementGivesThePinnedLocateOrWordTime(t *testing.T) {
	working, _ := os.Getwd()
	root := layout.FindRoot(working)
	inputs, golden := fixture(t, "placement-cases.jsonl"), fixture(t, "placement-cases.golden.jsonl")
	if len(inputs) != len(golden) || len(inputs) < 800 {
		t.Fatalf("%d cases, %d answers", len(inputs), len(golden))
	}
	for k, line := range inputs {
		var c placementCase
		if err := json.Unmarshal([]byte(line), &c); err != nil {
			t.Fatal(err)
		}
		tokens, breaks := placementScript(t, root, c)
		var answer compare.PyObject
		if c.K == "locate" {
			answer = LocateEvent(c.Heard, tokens, breaks)
		} else {
			answer = WordTimeEvent(timedWords(t, c.Timed), tokens, c.Word, c.Offset)
		}
		if got := compare.DumpPy(answer, true); got != golden[k] {
			t.Errorf("case %d (%s) differs:\n got %.400s\nwant %.400s", k, c.K, got, golden[k])
		}
	}
}
