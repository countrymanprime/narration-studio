package guide

import (
	"bufio"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
	"unicode"
)

// The Story Bible build benchmark: each way a build finds its entries, run over four public-domain books and scored against a
// hand-labelled cast (testdata/benchmark/<book>.labels.json). The books are prepared by scripts/research/story-bible-benchmark/prepare.py
// and the language model's spans for them were recorded once from the sidecar's `entities` command (<book>.spacy.json.gz), so the test
// needs neither the network nor spaCy. testdata/benchmark/golden.json pins every figure and every wrong or missed name; a change that
// moves one fails here. UPDATE_BENCHMARK=1 rewrites it. docs/research/story-bible-build-benchmark.md reads the numbers.

// benchmarkBooks are the books, by file name.
var benchmarkBooks = []string{"alice", "wind-in-the-willows", "three-men-in-a-boat", "pride-and-prejudice", benchmarkHeldOut}

// benchmarkHeldOut is the book labelled before the confidence rule ran on it and never used to tune it: its figures are the honest ones.
const benchmarkHeldOut = "treasure-island"

// benchmarkPipeline is one way of making a build's entries.
type benchmarkPipeline struct {
	name string
	run  func(paragraphs []ruleParagraph, spans [][]entitySpan) []freshEntity
}

var benchmarkPipelines = []benchmarkPipeline{
	{"rules", func(p []ruleParagraph, _ [][]entitySpan) []freshEntity {
		sorted, _ := buildEntities(p, scanCandidates(p))
		return sorted
	}},
	{"spacy", func(p []ruleParagraph, s [][]entitySpan) []freshEntity {
		sorted, _ := buildEntities(p, spacyCandidates(p, s))
		return sorted
	}},
	{"confident-rules", func(p []ruleParagraph, _ [][]entitySpan) []freshEntity {
		sorted, _ := buildEntities(p, confidentCandidates(p, nil))
		return sorted
	}},
	{"confident-spacy", func(p []ruleParagraph, s [][]entitySpan) []freshEntity {
		sorted, _ := buildEntities(p, confidentCandidates(p, s))
		return sorted
	}},
}

// The bar the confident builds must clear: of the entries a narrator is shown as characters, this share must be real characters,
// pooled over the books, and no book below the floor.
const (
	benchmarkCharacterPrecision      = 0.95
	benchmarkCharacterPrecisionFloor = 0.90
)

type benchmarkLabel struct {
	Name     string   `json:"name"`
	Aliases  []string `json:"aliases"`
	Required bool     `json:"required"`
}

type benchmarkLabels struct {
	Characters []benchmarkLabel `json:"characters"`
	Places     []benchmarkLabel `json:"places"`
	Other      []string         `json:"other"`
}

// benchmarkKind is one kind's score in one book.
type benchmarkKind struct {
	Shown     int      `json:"shown"`     // entries shown as this kind
	Correct   int      `json:"correct"`   // of those, the ones that are this kind
	Precision float64  `json:"precision"` // correct / shown
	Required  int      `json:"required"`  // labelled required names of this kind
	Found     int      `json:"found"`     // required names shown as this kind
	Recall    float64  `json:"recall"`    // found / required
	Listed    int      `json:"listed"`    // required names in the build at all, this kind or Needs Review
	Wrong     []string `json:"wrong"`     // entries shown as this kind that are not, with what they are
	Missed    []string `json:"missed"`    // required names not shown as this kind, with where they went
}

type benchmarkScore struct {
	Entries    int           `json:"entries"`
	Characters benchmarkKind `json:"characters"`
	Places     benchmarkKind `json:"places"`
	Review     int           `json:"review"`      // Needs Review entries
	ReviewReal int           `json:"review_real"` // of those, real characters or places
	ReviewJunk []string      `json:"review_junk"` // Needs Review entries that are neither
	Other      []string      `json:"other"`       // entries of any other kind (Organization)
}

func TestStoryBibleBenchmark(t *testing.T) {
	results := map[string]map[string]benchmarkScore{}
	pooled := map[string][2]int{}
	for _, book := range benchmarkBooks {
		paragraphs := benchmarkParagraphs(t, book)
		spans := benchmarkSpans(t, book, len(paragraphs))
		labels := benchmarkLabelsOf(t, book)
		results[book] = map[string]benchmarkScore{}
		for _, pipeline := range benchmarkPipelines {
			began := time.Now()
			entries := pipeline.run(slices.Clone(paragraphs), spans)
			took := time.Since(began)
			score := scoreBenchmark(entries, labels)
			results[book][pipeline.name] = score
			sum := pooled[pipeline.name]
			pooled[pipeline.name] = [2]int{sum[0] + score.Characters.Correct, sum[1] + score.Characters.Shown}
			t.Logf("%-20s %-16s %3d entries  characters %3d/%3d precision %5.1f%% recall %5.1f%% (listed %d/%d)  places %3d/%3d precision %5.1f%% recall %5.1f%%  review %3d (%d real)  %v",
				book, pipeline.name, score.Entries, score.Characters.Correct, score.Characters.Shown, 100*score.Characters.Precision, 100*score.Characters.Recall,
				score.Characters.Listed, score.Characters.Required, score.Places.Correct, score.Places.Shown, 100*score.Places.Precision, 100*score.Places.Recall,
				score.Review, score.ReviewReal, took.Round(time.Millisecond))
			if strings.HasPrefix(pipeline.name, "confident") && score.Characters.Precision < benchmarkCharacterPrecisionFloor {
				t.Errorf("%s, %s: %.1f%% of the characters shown are real, under the %.0f%% floor: %v", book, pipeline.name,
					100*score.Characters.Precision, 100*benchmarkCharacterPrecisionFloor, score.Characters.Wrong)
			}
		}
	}
	for _, pipeline := range benchmarkPipelines {
		sum := pooled[pipeline.name]
		precision := ratio(sum[0], sum[1])
		t.Logf("pooled %-16s characters %d/%d precision %.1f%%", pipeline.name, sum[0], sum[1], 100*precision)
		if strings.HasPrefix(pipeline.name, "confident") && precision < benchmarkCharacterPrecision {
			t.Errorf("%s: %.1f%% of the characters shown are real over the four books, under the %.0f%% bar", pipeline.name, 100*precision, 100*benchmarkCharacterPrecision)
		}
	}
	golden := filepath.Join("testdata", "benchmark", "golden.json")
	got, err := json.MarshalIndent(results, "", " ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	if os.Getenv("UPDATE_BENCHMARK") == "1" {
		if err := os.WriteFile(golden, got, 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("%v (UPDATE_BENCHMARK=1 writes it)", err)
	}
	if string(want) != string(got) {
		t.Errorf("the benchmark moved from %s: compare the figures and the names above, and when the change is wanted rerun with UPDATE_BENCHMARK=1 and update docs/research/story-bible-build-benchmark.md", golden)
	}
}

// benchmarkParagraphs reads a prepared book: one paragraph a line, a chapter's title on a line starting "# ".
func benchmarkParagraphs(t *testing.T, book string) []ruleParagraph {
	t.Helper()
	file, err := os.Open(filepath.Join("testdata", "benchmark", book+".txt.gz"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = file.Close() }()
	reader, err := gzip.NewReader(file)
	if err != nil {
		t.Fatal(err)
	}
	var paragraphs []ruleParagraph
	chapter, chapterID := "", ""
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 1<<20), 1<<22)
	for scanner.Scan() {
		line := scanner.Text()
		if title, ok := strings.CutPrefix(line, "# "); ok {
			chapter, chapterID = title, fmt.Sprintf("c-%04d", len(paragraphs))
			continue
		}
		paragraphs = append(paragraphs, ruleParagraph{chapter: chapter, chapterID: chapterID, paragraphID: fmt.Sprintf("p%d", len(paragraphs)+1), text: []rune(line)})
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	return paragraphs
}

// benchmarkSpans reads the language model's recorded spans for a book, one list a paragraph.
func benchmarkSpans(t *testing.T, book string, paragraphs int) [][]entitySpan {
	t.Helper()
	file, err := os.Open(filepath.Join("testdata", "benchmark", book+".spacy.json.gz"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = file.Close() }()
	reader, err := gzip.NewReader(file)
	if err != nil {
		t.Fatal(err)
	}
	var recorded struct {
		Spans [][]benchmarkSpan `json:"spans"`
	}
	if err := json.NewDecoder(reader).Decode(&recorded); err != nil {
		t.Fatal(err)
	}
	if len(recorded.Spans) != paragraphs {
		t.Fatalf("%s: spans for %d paragraphs, the book has %d", book, len(recorded.Spans), paragraphs)
	}
	spans := make([][]entitySpan, paragraphs)
	for i, list := range recorded.Spans {
		for _, span := range list {
			spans[i] = append(spans[i], entitySpan{start: span.Start, end: span.End, label: span.Label})
		}
	}
	return spans
}

// UnmarshalJSON reads a recorded span, [start, end, label].
func (s *benchmarkSpan) UnmarshalJSON(raw []byte) error {
	var row []any
	if err := json.Unmarshal(raw, &row); err != nil {
		return err
	}
	if len(row) != 3 {
		return fmt.Errorf("a span is [start, end, label], not %s", raw)
	}
	start, ok1 := row[0].(float64)
	end, ok2 := row[1].(float64)
	label, ok3 := row[2].(string)
	if !ok1 || !ok2 || !ok3 {
		return fmt.Errorf("a span is [start, end, label], not %s", raw)
	}
	s.Start, s.End, s.Label = int(start), int(end), label
	return nil
}

type benchmarkSpan struct {
	Start, End int
	Label      string
}

func benchmarkLabelsOf(t *testing.T, book string) benchmarkLabels {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "benchmark", book+".labels.json"))
	if err != nil {
		t.Fatal(err)
	}
	var labels benchmarkLabels
	if err := json.Unmarshal(raw, &labels); err != nil {
		t.Fatal(err)
	}
	return labels
}

// benchmarkKey is a name as the labels are matched: lower case, straight apostrophes, no leading "the", no possessive, letters,
// digits and single spaces only.
func benchmarkKey(name string) string {
	name = strings.ToLower(strings.ReplaceAll(name, "’", "'"))
	name = strings.TrimPrefix(name, "the ")
	name = strings.TrimSuffix(strings.TrimSuffix(name, "'s"), "'")
	var b strings.Builder
	space := false
	for _, r := range name {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			if space && b.Len() > 0 {
				b.WriteByte(' ')
			}
			space = false
			b.WriteRune(r)
		default:
			space = true
		}
	}
	return b.String()
}

// benchmarkIndex maps every key of a list of labels to its label's name.
func benchmarkIndex(labels []benchmarkLabel) map[string]string {
	index := map[string]string{}
	for _, label := range labels {
		for _, name := range append([]string{label.Name}, label.Aliases...) {
			index[benchmarkKey(name)] = label.Name
		}
	}
	return index
}

// entryNames are an entry's name and its aliases.
func entryNames(entry freshEntity) []string {
	names := []string{entry.object.values["canonical_name"].(string)}
	for _, alias := range entry.object.values["aliases"].([]any) {
		names = append(names, alias.(*pyObject).values["text"].(string))
	}
	return names
}

// matchOf is the label an entry answers to in index: its name first, then its aliases in order.
func matchOf(entry freshEntity, index map[string]string) (string, bool) {
	for _, name := range entryNames(entry) {
		if label, ok := index[benchmarkKey(name)]; ok {
			return label, true
		}
	}
	return "", false
}

func scoreBenchmark(entries []freshEntity, labels benchmarkLabels) benchmarkScore {
	characters, places := benchmarkIndex(labels.Characters), benchmarkIndex(labels.Places)
	other := map[string]bool{}
	for _, name := range labels.Other {
		other[benchmarkKey(name)] = true
	}
	what := func(entry freshEntity) string {
		if label, ok := matchOf(entry, characters); ok {
			return "character " + label
		}
		if label, ok := matchOf(entry, places); ok {
			return "place " + label
		}
		for _, name := range entryNames(entry) {
			if other[benchmarkKey(name)] {
				return "a named thing"
			}
		}
		return "not a name"
	}
	score := benchmarkScore{Entries: len(entries), ReviewJunk: []string{}, Other: []string{}}
	score.Characters.Wrong, score.Characters.Missed, score.Places.Wrong, score.Places.Missed = []string{}, []string{}, []string{}, []string{}
	shownAs := map[string]string{} // label name -> the category of the first entry that answers to it
	for _, entry := range entries {
		category := entry.object.values["category"].(string)
		name := entry.object.values["canonical_name"].(string)
		if label, ok := matchOf(entry, characters); ok {
			if _, seen := shownAs["c:"+label]; !seen {
				shownAs["c:"+label] = category
			} else if category == categoryCharacter {
				shownAs["c:"+label] = category
			}
		}
		if label, ok := matchOf(entry, places); ok {
			if _, seen := shownAs["p:"+label]; !seen || category == categoryPlace {
				shownAs["p:"+label] = category
			}
		}
		switch category {
		case categoryCharacter:
			score.Characters.Shown++
			if _, ok := matchOf(entry, characters); ok {
				score.Characters.Correct++
			} else {
				score.Characters.Wrong = append(score.Characters.Wrong, name+" ("+what(entry)+")")
			}
		case categoryPlace:
			score.Places.Shown++
			if _, ok := matchOf(entry, places); ok {
				score.Places.Correct++
			} else {
				score.Places.Wrong = append(score.Places.Wrong, name+" ("+what(entry)+")")
			}
		case categoryNeedsReview:
			score.Review++
			if kind := what(entry); strings.HasPrefix(kind, "character") || strings.HasPrefix(kind, "place") {
				score.ReviewReal++
			} else {
				score.ReviewJunk = append(score.ReviewJunk, name+" ("+kind+")")
			}
		default:
			score.Other = append(score.Other, name+" as "+category+" ("+what(entry)+")")
		}
	}
	tally := func(kind *benchmarkKind, labels []benchmarkLabel, prefix, want string) {
		for _, label := range labels {
			if !label.Required {
				continue
			}
			kind.Required++
			category, seen := shownAs[prefix+label.Name]
			switch {
			case seen && category == want:
				kind.Found++
				kind.Listed++
			case seen && category == categoryNeedsReview:
				kind.Listed++
				kind.Missed = append(kind.Missed, label.Name+" (in Needs Review)")
			case seen:
				kind.Missed = append(kind.Missed, label.Name+" (as "+category+")")
			default:
				kind.Missed = append(kind.Missed, label.Name+" (not found)")
			}
		}
		kind.Precision, kind.Recall = ratio(kind.Correct, kind.Shown), ratio(kind.Found, kind.Required)
	}
	tally(&score.Characters, labels.Characters, "c:", categoryCharacter)
	tally(&score.Places, labels.Places, "p:", categoryPlace)
	return score
}

// ratio is a/b to three decimals, and 1 for 0/0 (nothing shown is nothing wrong).
func ratio(a, b int) float64 {
	if b == 0 {
		return 1
	}
	return float64(int(1000*float64(a)/float64(b)+0.5)) / 1000
}
