package manuscript

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"desktop/internal/brand"
	"desktop/internal/layout"
)

// searchParity is tests/fixtures/manuscript-search/parity-cases.json, which the mock reads too.
type searchParity struct {
	TermMax     int    `json:"termMax"`
	TermTooLong string `json:"termTooLong"`
	MatchesMax  int    `json:"matchesMax"`
	Cases       []struct {
		Name    string   `json:"name"`
		Text    string   `json:"text"`
		Query   string   `json:"query"`
		Matches [][2]int `json:"matches"`
	} `json:"cases"`
}

func writeBook(t *testing.T, project string, chapters, paragraphs []map[string]any) {
	t.Helper()
	dir := filepath.Join(project, brand.ProjectFolder, "manuscript")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	bytes, err := json.Marshal(map[string]any{"schemaVersion": 1, "chapters": chapters, "paragraphs": paragraphs})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "manuscript.json"), bytes, 0o644); err != nil {
		t.Fatal(err)
	}
}

func line(id, chapterID string, index int, text string) map[string]any {
	return map[string]any{"id": id, "chapterId": chapterID, "chapterTitle": "Title " + chapterID, "index": index, "text": text}
}

func loadSearchParity(t *testing.T) searchParity {
	t.Helper()
	raw, err := os.ReadFile(layout.RepoFile(layout.FixturesDir + "/manuscript-search/parity-cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	var parity searchParity
	if err := json.Unmarshal(raw, &parity); err != nil || len(parity.Cases) == 0 {
		t.Fatalf("parity cases = %d, %v", len(parity.Cases), err)
	}
	return parity
}

// The mock reads the same caps, so the two cannot drift apart.
func TestSearchCapsAreTheParityFilesCaps(t *testing.T) {
	parity := loadSearchParity(t)
	if parity.TermMax != MaxSearchTermLength || parity.MatchesMax != maxSearchMatches || parity.TermTooLong != ErrSearchTermTooLong.Error() {
		t.Fatalf("parity file caps = %d, %d, %q; host = %d, %d, %q", parity.TermMax, parity.MatchesMax, parity.TermTooLong,
			MaxSearchTermLength, maxSearchMatches, ErrSearchTermTooLong.Error())
	}
}

func TestSearchFindsEachParityCaseAtItsJSStringIndices(t *testing.T) {
	parity := loadSearchParity(t)
	for _, c := range parity.Cases {
		t.Run(c.Name, func(t *testing.T) {
			project := t.TempDir()
			writeBook(t, project, nil, []map[string]any{line("p0", "c1", 0, c.Text)})
			result, err := New(project).Search(c.Query)
			if err != nil {
				t.Fatal(err)
			}
			got := [][2]int{}
			for _, hit := range result.Hits {
				for _, match := range hit.Matches {
					got = append(got, [2]int{match.Start, match.End})
				}
			}
			want := c.Matches
			if want == nil {
				want = [][2]int{}
			}
			if !reflect.DeepEqual(got, want) || result.Total != len(want) || result.Truncated {
				t.Fatalf("matches = %v (total %d, truncated %v), want %v", got, result.Total, result.Truncated, want)
			}
		})
	}
}

func TestSearchAnswersOneHitPerParagraphInBookOrderWithItsPlace(t *testing.T) {
	project := t.TempDir()
	writeBook(t, project, nil, []map[string]any{
		line("p0", "c1", 0, "The rabbit and the other rabbit."),
		line("p1", "c1", 1, "No match here."),
		line("p2", "c2", 2, "A rabbit."),
	})
	result, err := New(project).Search("rabbit")
	if err != nil {
		t.Fatal(err)
	}
	want := SearchResult{Total: 3, Hits: []SearchHit{
		{Chapter: "Title c1", ChapterID: "c1", Paragraph: 0, ParagraphID: "p0", Excerpt: "The rabbit and the other rabbit.", Matches: []SearchMatch{{4, 10}, {25, 31}}},
		{Chapter: "Title c2", ChapterID: "c2", Paragraph: 2, ParagraphID: "p2", Excerpt: "A rabbit.", Matches: []SearchMatch{{2, 8}}},
	}}
	if !reflect.DeepEqual(result, want) {
		t.Fatalf("result = %#v\nwant %#v", result, want)
	}
}

// The Script page shows neither front matter nor reference chapters, so the search skips both: a hit there would count in
// the total but could not be shown.
func TestSearchSkipsFrontMatterAndReferenceChapters(t *testing.T) {
	project := t.TempDir()
	writeBook(t, project,
		[]map[string]any{
			{"id": "front", "title": "Front Matter", "contentKind": "opening"},
			{"id": "ref", "title": "Appendix", "contentKind": "reference"},
			{"id": "c1", "title": "Chapter One", "contentKind": "narration"},
			{"id": "c2", "title": "Chapter Two"},
		},
		[]map[string]any{
			line("pf", "front", 0, "rabbit in the front matter"),
			line("pr", "ref", 1, "rabbit in the appendix"),
			line("p1", "c1", 2, "rabbit in chapter one"),
			line("p2", "c2", 3, "rabbit in chapter two"),
		})
	result, err := New(project).Search("rabbit")
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{}
	for _, hit := range result.Hits {
		ids = append(ids, hit.ParagraphID)
	}
	if !reflect.DeepEqual(ids, []string{"p1", "p2"}) || result.Total != 2 {
		t.Fatalf("paragraphs = %v, total %d, want p1 and p2 only", ids, result.Total)
	}
}

// Past the cap the hits stop, inside a paragraph if need be, but the total still counts every match and truncated says so.
func TestSearchCapsTheMatchesItSendsButCountsEveryOne(t *testing.T) {
	project := t.TempDir()
	paragraphs := []map[string]any{}
	for i := range maxSearchMatches/2 + 10 {
		paragraphs = append(paragraphs, line("p", "c1", i, "fox and fox"))
	}
	writeBook(t, project, nil, paragraphs)
	result, err := New(project).Search("fox")
	if err != nil {
		t.Fatal(err)
	}
	sent := 0
	for _, hit := range result.Hits {
		sent += len(hit.Matches)
	}
	if sent != maxSearchMatches || result.Total != 2*len(paragraphs) || !result.Truncated {
		t.Fatalf("sent %d of total %d (truncated %v), want %d of %d, truncated", sent, result.Total, result.Truncated, maxSearchMatches, 2*len(paragraphs))
	}

	// Exactly at the cap nothing is left out.
	project = t.TempDir()
	writeBook(t, project, nil, paragraphs[:maxSearchMatches/2])
	result, err = New(project).Search("fox")
	if err != nil || result.Total != maxSearchMatches || result.Truncated {
		t.Fatalf("at the cap: total %d, truncated %v, %v", result.Total, result.Truncated, err)
	}
}

func TestSearchRefusesATermLongerThanTheCap(t *testing.T) {
	project := t.TempDir()
	long := strings.Repeat("a", MaxSearchTermLength)
	writeBook(t, project, nil, []map[string]any{line("p0", "c1", 0, long)})
	service := New(project)
	if result, err := service.Search("  " + long + "  "); err != nil || result.Total != 1 {
		t.Fatalf("a term at the cap: %#v, %v", result, err)
	}
	// The cap counts JS string length (UTF-16 code units), so an emoji counts two.
	for _, term := range []string{strings.Repeat("a", MaxSearchTermLength+1), strings.Repeat("🐇", MaxSearchTermLength/2+1), strings.Repeat("x", 10_000)} {
		result, err := service.Search(term)
		if !errors.Is(err, ErrSearchTermTooLong) || result.Hits == nil || len(result.Hits) != 0 {
			t.Fatalf("a %d-byte term: %#v, %v, want ErrSearchTermTooLong", len(term), result, err)
		}
	}
}

func TestSearchOfAnEmptyTermReadsNothingAndSendsAnEmptyList(t *testing.T) {
	result, err := New(t.TempDir()).Search(" \t ")
	if err != nil || result.Hits == nil || len(result.Hits) != 0 || result.Total != 0 || result.Truncated {
		t.Fatalf("result = %#v, %v", result, err)
	}
}

func TestSearchOfABookWithoutAManuscriptFails(t *testing.T) {
	if _, err := New(t.TempDir()).Search("rabbit"); err == nil {
		t.Fatal("want an error with no manuscript")
	}
}
