package guide

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

type goldenParagraph struct {
	Chapter     string `json:"chapter"`
	ChapterID   string `json:"chapterId"`
	ParagraphID string `json:"paragraphId"`
	Text        string `json:"text"`
}

func (p goldenParagraph) paragraph() textParagraph {
	return textParagraph{chapter: p.Chapter, chapterID: p.ChapterID, paragraphID: p.ParagraphID, text: []rune(p.Text)}
}

func readOccurrenceGolden(t *testing.T) (sets map[string][]goldenParagraph, cases []struct {
	Set         string          `json:"set"`
	Name        string          `json:"name"`
	Occurrences json.RawMessage `json:"occurrences"`
}, sweep struct {
	Universe [][2]rune `json:"universe"`
	Matches  [][]any   `json:"matches"`
}) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "occurrence-parity.json"))
	if err != nil {
		t.Fatal(err)
	}
	var golden struct {
		Sets  map[string][]goldenParagraph `json:"sets"`
		Cases []struct {
			Set         string          `json:"set"`
			Name        string          `json:"name"`
			Occurrences json.RawMessage `json:"occurrences"`
		} `json:"cases"`
		FoldSweep struct {
			Universe [][2]rune `json:"universe"`
			Matches  [][]any   `json:"matches"`
		} `json:"fold_sweep"`
	}
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatal(err)
	}
	return golden.Sets, golden.Cases, golden.FoldSweep
}

// TestFindOccurrencesMatchesTheSidecar replays find_occurrences over the recorded paragraphs and names: non-ASCII, emoji, right-to-left
// text, combining marks, very long paragraphs, overlapping matches, names at the start and end of a paragraph, characters a regular
// expression treats specially, and names that are blank once stripped. Every record, excerpt included, must be the sidecar's to the
// character.
func TestFindOccurrencesMatchesTheSidecar(t *testing.T) {
	sets, cases, _ := readOccurrenceGolden(t)
	if len(cases) < 100 {
		t.Fatalf("only %d recorded cases", len(cases))
	}
	found, empty := 0, 0
	for _, c := range cases {
		var paragraphs []textParagraph
		for _, p := range sets[c.Set] {
			paragraphs = append(paragraphs, p.paragraph())
		}
		got := findOccurrences(paragraphs, c.Name)
		want := decodeExactly(t, c.Occurrences)
		if !reflect.DeepEqual(any(got), want) {
			t.Errorf("%s: find_occurrences(%q)\n got: %s\nwant: %s", c.Set, c.Name, pythonJSON(any(got)), pythonJSON(want))
		}
		if len(got) == 0 {
			empty++
		} else {
			found++
		}
	}
	if found < 60 || empty < 8 {
		t.Errorf("%d cases found something and %d found nothing", found, empty)
	}
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

func TestTheEmbeddedTablesAreThePythonOnes(t *testing.T) {
	tables := pythonUnicode()
	for r, want := range map[rune]bool{'a': true, '_': true, '5': true, 'é': true, '田': true, 'Ⅳ': true, '²': true, '٣': true, ' ': false, '-': false, '😀': false, 'Ⓐ': false, 0x200f: false, 0x0308: false} {
		if tables.isWord(r) != want {
			t.Errorf("isWord(%U) = %v, want %v", r, !want, want)
		}
	}
	for r, want := range map[rune]bool{' ': true, '\n': true, 0x1c: true, 0x1f: true, 0x85: true, 0xa0: true, 0x3000: true, 0x2028: true, 0x200b: false, 0xfeff: false, 'a': false} {
		if tables.isSpace(r) != want {
			t.Errorf("isSpace(%U) = %v, want %v", r, !want, want)
		}
	}
	for r, want := range map[rune]rune{'A': 'a', 'a': 'a', 0x130: 'i', 0x1e9e: 0xdf, 0x212a: 'k', 0x3a3: 0x3c3, 0x3c2: 0x3c2, 'é': 'é', 'É': 'é'} {
		if got := tables.lowerOf(r); got != want {
			t.Errorf("lowerOf(%U) = %U, want %U", r, got, want)
		}
	}
	if !reflect.DeepEqual(tables.extra['i'], []rune{0x131}) || !reflect.DeepEqual(tables.extra['s'], []rune{0x17f}) {
		t.Errorf("extra case pairs: i = %U, s = %U", tables.extra['i'], tables.extra['s'])
	}
}

// Python indexes by code point, Go by byte: a match after emoji, with Arabic after it, is cut at the same places as Python's.
func TestExcerptsAreCutByCodePointNotByte(t *testing.T) {
	text := []rune(strings.Repeat("😀", 200) + "Wren!" + strings.Repeat("م", 200))
	got := findOccurrences([]textParagraph{{chapter: "One", chapterID: "c-1", paragraphID: "p-1", text: text}}, "wren")
	if len(got) != 1 {
		t.Fatalf("%d matches", len(got))
	}
	// The match is code points 200 to 204: the cut is 150 before it and 150 after it, 50 to 354 of 405.
	want := "…" + strings.Repeat("😀", 150) + "Wren!" + strings.Repeat("م", 149) + "…"
	if excerptText := got[0].(map[string]any)["excerpt"]; excerptText != want {
		t.Errorf("excerpt = %q\nwant      %q", excerptText, want)
	}
}

// An 88,000-word manuscript with the name in every paragraph, searched the way a rescan does: all of it, in well under a second.
func TestFindOccurrencesOnAFullLengthManuscript(t *testing.T) {
	var paragraphs []textParagraph
	words := strings.Fields("the rain kept on over the hills and nobody on the road said a word about it")
	const perParagraph, count = 74, 1200
	for i := range count {
		var b strings.Builder
		for w := range perParagraph {
			switch {
			case w%25 == 0:
				b.WriteString("Zoë")
			case w%26 == 0:
				b.WriteString("😀 ZOË.")
			default:
				b.WriteString(words[(i+w)%len(words)])
			}
			b.WriteByte(' ')
		}
		paragraphs = append(paragraphs, textParagraph{chapter: "One", chapterID: "c-1", paragraphID: fmt.Sprintf("p-%d", i), text: []rune(b.String())})
	}
	start := time.Now()
	got := findOccurrences(paragraphs, "zoë")
	elapsed := time.Since(start)
	// w%25==0: 0,25,50 and w%26==0: 26,52 (0 goes to the first case): 3 + 2 per paragraph.
	if want := count * 5; len(got) != want {
		t.Fatalf("%d occurrences, want %d", len(got), want)
	}
	if elapsed > 5*time.Second {
		t.Errorf("the search took %v", elapsed)
	}
}

func TestABlankNameHasNoOccurrences(t *testing.T) {
	paragraphs := []textParagraph{{chapter: "One", chapterID: "c-1", paragraphID: "p-1", text: []rune("  Wren  ")}}
	for _, name := range []string{"", "   ", "\n\t", " 　", "\x1c\x1f"} {
		if got := findOccurrences(paragraphs, name); len(got) != 0 {
			t.Errorf("name %q found %v", name, got)
		}
	}
	if got := findOccurrences(nil, "Wren"); got == nil || len(got) != 0 {
		t.Errorf("no paragraphs found %#v, want an empty list", got)
	}
}
