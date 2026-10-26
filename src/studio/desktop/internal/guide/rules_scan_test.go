package guide

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"unicode"
)

// scanCorpusCase is one case of testdata/scan-corpus.json.
type scanCorpusCase struct {
	Name       string              `json:"name"`
	Paragraphs []string            `json:"paragraphs"`
	Entries    []string            `json:"entries"`
	Aliases    map[string][]string `json:"aliases"`
	Rejected   []string            `json:"rejected"`
}

func readScanCorpus(t *testing.T) []scanCorpusCase {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "scan-corpus.json"))
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Cases []scanCorpusCase `json:"cases"`
	}
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatal(err)
	}
	return corpus.Cases
}

// scanEntries runs the scan over paragraphs with an empty Story Bible and gives its entry suggestions.
func scanEntries(t *testing.T, paragraphs ...string) []suggestionLine {
	t.Helper()
	s := book(t, "", paragraphs...)
	got, err := RuleSuggestions(context.Background(), s.manuscript(), s.guidePath())
	if err != nil {
		t.Fatal(err)
	}
	var lines []suggestionLine
	for _, line := range got {
		var decoded suggestionLine
		if err := json.Unmarshal([]byte(line), &decoded); err != nil {
			t.Fatal(err)
		}
		lines = append(lines, decoded)
	}
	return ofKind(lines, "entry")
}

func TestTheScanProposesExactlyTheCorpusNames(t *testing.T) {
	cases := readScanCorpus(t)
	if len(cases) < 10 {
		t.Fatalf("%d corpus cases", len(cases))
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			entries := scanEntries(t, c.Paragraphs...)
			got := names(entries)
			slices.Sort(got)
			want := slices.Clone(c.Entries)
			slices.Sort(want)
			if !slices.Equal(got, want) {
				t.Errorf("entries = %q\nwant      %q", got, want)
			}
			for _, entry := range entries {
				aliases := slices.Clone(entry.Payload.Aliases)
				slices.Sort(aliases)
				if want, ok := c.Aliases[entry.Payload.Name]; ok && !slices.Equal(aliases, want) {
					t.Errorf("%s aliases = %q, want %q", entry.Payload.Name, aliases, want)
				}
				for _, junk := range c.Rejected {
					if entry.Payload.Name == junk || slices.Contains(entry.Payload.Aliases, junk) {
						t.Errorf("%q proposed (as %s with aliases %q)", junk, entry.Payload.Name, entry.Payload.Aliases)
					}
				}
			}
		})
	}
}

// The owner's three examples (#2251): "I'm", "Mr" and "Because I" were proposed as names.
func TestTheScanNeverProposesIMMrOrBecauseI(t *testing.T) {
	entries := scanEntries(t,
		"I'm sure. I'm certain. Then I'm gone, and I'm glad.",
		"Because I said so. Because I can. Because I will, and Because I must.",
		"He told Mr that. Mr was there, and Mr waited, and Mr left.",
	)
	if len(entries) != 0 {
		t.Fatalf("entries = %q, want none", names(entries))
	}
}

// ownerJunk are names the scan proposed before #2251 tuned it, which it must never propose as a name or an alias.
var ownerJunk = []string{"I", "I'm", "I’m", "I'll", "I’ll", "I'd", "I’d", "I've", "I’ve", "Mr", "Mr.", "Mrs", "Mrs.", "Ms", "Dr", "Sir",
	"Because I", "If I", "If I’d", "What I", "Nor I", "Do I", "That’s Bill", "It’s the Cheshire Cat", "KING AND QUEEN", "English"}

// TestNoScanNameIsAPronounContractionOrBareHonorific is the guard over the whole class, across every frozen case and the corpus: no
// name or alias the scan proposes is a bare form of address or a single letter, or has a capitalised word that is a pronoun, a
// function word, a contraction or shouted.
func TestNoScanNameIsAPronounContractionOrBareHonorific(t *testing.T) {
	root, cases, results := readRuleCases(t)
	var books [][]string
	for i, c := range cases {
		if results[i].Exit != 0 {
			continue
		}
		manuscript, bible := writeRuleCase(t, root, t.TempDir(), c)
		got, err := RuleSuggestions(context.Background(), manuscript, bible)
		if err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		books = append(books, got)
	}
	for _, c := range readScanCorpus(t) {
		s := book(t, "", c.Paragraphs...)
		got, err := RuleSuggestions(context.Background(), s.manuscript(), s.guidePath())
		if err != nil {
			t.Fatal(err)
		}
		books = append(books, got)
	}
	checked := 0
	for _, lines := range books {
		for _, line := range lines {
			var l suggestionLine
			if err := json.Unmarshal([]byte(line), &l); err != nil {
				t.Fatal(err)
			}
			for _, name := range append([]string{l.Payload.Name, l.Payload.Alias}, l.Payload.Aliases...) {
				if name == "" {
					continue
				}
				checked++
				if why := junkReason(name); why != "" {
					t.Errorf("%q proposed: %s", name, why)
				}
			}
		}
	}
	if checked < 1000 {
		t.Errorf("checked %d names", checked)
	}
}

func junkReason(name string) string {
	if slices.Contains(ownerJunk, name) {
		return "the owner's junk"
	}
	words := strings.Fields(name)
	if len(words) == 1 && scanAddresses[strings.ToLower(strings.TrimSuffix(name, "."))] {
		return "a bare form of address"
	}
	if len([]rune(scanKey(name))) < 2 {
		return "a single letter"
	}
	for _, word := range words {
		runes := []rune(word)
		if !unicode.IsUpper(runes[0]) {
			continue // a particle: de la, of the
		}
		switch lower := strings.ToLower(word); {
		case scanStopwords[lower]:
			return "the word " + word + " is a pronoun or a function word"
		case isContraction(runes):
			return "the word " + word + " is a contraction"
		case isShouted(runes):
			return "the word " + word + " is shouted"
		}
	}
	return ""
}

func TestJunkReasonCatchesTheOwnersExamples(t *testing.T) {
	for _, name := range []string{"I'm", "Mr", "Because I", "Then I", "We’re Home", "Mr.", "Ma’am", "O", "STOP Tom"} {
		if junkReason(name) == "" {
			t.Errorf("junkReason(%q) is empty", name)
		}
	}
	for _, name := range []string{"Mr Darcy", "Isabel de la Cruz", "O’Brien", "D'Arcy", "Queen of Hearts", "Zoë"} {
		if why := junkReason(name); why != "" {
			t.Errorf("junkReason(%q) = %q", name, why)
		}
	}
}
