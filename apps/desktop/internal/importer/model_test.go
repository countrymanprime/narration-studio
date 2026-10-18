package importer

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewDraftGivesContentsItsOwnGroupInsteadOfLeakingIntoPriorSection(t *testing.T) {
	paragraphs := []Paragraph{
		{Chapter: "Chapter One", Text: "Chapter one text.", SourceIndex: 0},
		{Chapter: "Contents", Text: "Chapter One .... 1", SourceIndex: 1},
		{Chapter: "Chapter Two", Text: "Chapter two text.", SourceIndex: 2},
	}
	draft, err := newDraft("docx", "test.docx", paragraphs, []string{"Chapter One", "Chapter Two"}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[string]string{}
	counts := map[string]int{}
	for _, section := range draft.Sections {
		kinds[section.Title] = section.ContentKind
		counts[section.Title] = section.ParagraphCount
	}
	if kinds["Contents"] != "reference" {
		t.Fatalf("expected Contents section to be classified as reference, got %q", kinds["Contents"])
	}
	if counts["Chapter One"] != 1 {
		t.Fatalf("expected Chapter One to keep only its own paragraph, got %d", counts["Chapter One"])
	}
	if kinds["Chapter One"] != "narration" {
		t.Fatalf("expected Chapter One to stay narration, got %q", kinds["Chapter One"])
	}
}

// TestNewDraftClassifiesACharactersHeadingAsReference pins docs/guides/using-the-app/script.md: a
// Characters section stays classified `reference` - it is not dropped and gets no special non-chapter kind - so the Story Bible
// entries seeded from its candidates are its readable form.
func TestNewDraftClassifiesACharactersHeadingAsReference(t *testing.T) {
	paragraphs := []Paragraph{
		{Chapter: "Chapter One", Text: "Chapter one text.", SourceIndex: 0},
		{Chapter: "Characters", Text: "Wren — a spy.", SourceIndex: 1},
	}
	draft, err := newDraft("docx", "test.docx", paragraphs, []string{"Chapter One"}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := sectionNamed(t, draft, "Characters").ContentKind; got != "reference" {
		t.Fatalf("Characters content kind = %q, want reference", got)
	}
}

func TestNewDraftClassifiesFrontMatterAsOpening(t *testing.T) {
	paragraphs := []Paragraph{
		{Chapter: "Front Matter", Text: "By Jane Author", SourceIndex: 0},
		{Chapter: "Chapter One", Text: "Chapter one text.", SourceIndex: 1},
	}
	draft, err := newDraft("docx", "test.docx", paragraphs, []string{"Chapter One"}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, section := range draft.Sections {
		if section.Title == "Front Matter" && section.ContentKind != "opening" {
			t.Fatalf("expected Front Matter to be classified as opening, got %q", section.ContentKind)
		}
	}
}

func TestMarkdownContentsHeadingGetsItsOwnGroup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "book.md")
	content := "# Chapter One\nChapter one text.\n\n# Contents\nChapter One .... 1\n\n# Chapter Two\nChapter two text.\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	draft, err := markdown(path, 1)
	if err != nil {
		t.Fatal(err)
	}
	for _, paragraph := range draft.Paragraphs {
		if paragraph.Chapter == "Chapter One" && paragraph.Text != "Chapter one text." {
			t.Fatalf("Chapter One accumulated an unexpected paragraph: %q", paragraph.Text)
		}
	}
	var sawContents bool
	for _, section := range draft.Sections {
		if section.Title == "Contents" {
			sawContents = true
			if section.ContentKind != "reference" {
				t.Fatalf("expected Contents to be reference, got %q", section.ContentKind)
			}
		}
	}
	if !sawContents {
		t.Fatal("expected a Contents section in the draft")
	}
	if len(draft.ChapterTitles) != 2 {
		t.Fatalf("expected Contents to be excluded from chapter titles, got %#v", draft.ChapterTitles)
	}
}

func sectionNamed(t *testing.T, draft Draft, title string) DraftSection {
	t.Helper()
	for _, section := range draft.Sections {
		if section.Title == title {
			return section
		}
	}
	t.Fatalf("no section %q in %#v", title, draft.Sections)
	return DraftSection{}
}

func subtitled(chapter, subtitle, text string, index int) Paragraph {
	return Paragraph{Chapter: chapter, ChapterSubtitle: &subtitle, Text: text, SourceIndex: index}
}

func TestNewDraftSectionSubtitleIsTheFirstParagraphsSubtitleAsTheCommitReadsIt(t *testing.T) {
	paragraphs := []Paragraph{
		subtitled("Chapter One", "Down the Rabbit-Hole", "First.", 0),
		{Chapter: "Chapter Two", Text: "No subtitle here.", SourceIndex: 1},
		// A title that repeats merges into the first section, and the first subtitle wins, as it does when the chapter is written.
		subtitled("Chapter One", "A Later Subtitle", "Second.", 2),
		// The first paragraph has none and a later one does: the chapter is written from the first paragraph, so it has none.
		{Chapter: "Chapter Three", Text: "Plain.", SourceIndex: 3},
		subtitled("Chapter Three", "The Pool of Tears", "Later.", 4),
	}
	draft, err := newDraft("docx", "test.docx", paragraphs, []string{"Chapter One", "Chapter Two", "Chapter Three", "Chapter Four"}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	for title, want := range map[string]string{
		"Chapter One":   "Down the Rabbit-Hole",
		"Chapter Two":   "",
		"Chapter Three": "",
		// A heading with no paragraphs under it has nothing to take a subtitle from.
		"Chapter Four": "",
	} {
		if got := sectionNamed(t, draft, title).Subtitle; got != want {
			t.Errorf("section %q subtitle = %q, want %q", title, got, want)
		}
	}
}

func candidateNamed(t *testing.T, draft Draft, name string) CharacterCandidate {
	t.Helper()
	for _, candidate := range draft.CharacterCandidates {
		if candidate.Name == name {
			return candidate
		}
	}
	t.Fatalf("no candidate %q in %#v", name, draft.CharacterCandidates)
	return CharacterCandidate{}
}

// TestCharacterBlockLabelledFactsBecomeOneCandidateWithThreeProperties covers a
// Codename/Abilities/Dossier block, three lines under a bare name line, produces one candidate with three ordered properties -
// not four spurious candidates named "Codename", "Abilities" and so on (the collision bug).
func TestCharacterBlockLabelledFactsBecomeOneCandidateWithThreeProperties(t *testing.T) {
	paragraphs := []Paragraph{
		{Chapter: "Characters", Text: "Wren", SourceIndex: 0},
		{Chapter: "Characters", Text: "Codename: The Sparrow", SourceIndex: 1},
		{Chapter: "Characters", Text: "Abilities: Flight, invisibility", SourceIndex: 2},
		{Chapter: "Characters", Text: "Dossier: Missing since the spring thaw", SourceIndex: 3},
	}
	draft, err := newDraft("docx", "test.docx", paragraphs, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(draft.CharacterCandidates) != 1 {
		t.Fatalf("expected exactly one candidate, got %#v", draft.CharacterCandidates)
	}
	wren := candidateNamed(t, draft, "Wren")
	want := []Property{{Key: "Codename", Value: "The Sparrow"}, {Key: "Abilities", Value: "Flight, invisibility"}, {Key: "Dossier", Value: "Missing since the spring thaw"}}
	if len(wren.Properties) != len(want) {
		t.Fatalf("properties = %#v want %#v", wren.Properties, want)
	}
	for index := range want {
		if wren.Properties[index] != want[index] {
			t.Errorf("property %d = %#v want %#v", index, wren.Properties[index], want[index])
		}
	}
}

// TestASecondBareNameClosesThePriorCandidateAndOpensANew covers the structural rule's core fix: a labelled line only attaches to
// the candidate that is currently open, so a second character's own labels never leak onto the first.
func TestASecondBareNameClosesThePriorCandidateAndOpensANew(t *testing.T) {
	paragraphs := []Paragraph{
		{Chapter: "Characters", Text: "Wren", SourceIndex: 0},
		{Chapter: "Characters", Text: "Codename: The Sparrow", SourceIndex: 1},
		{Chapter: "Characters", Text: "Juno", SourceIndex: 2},
		{Chapter: "Characters", Text: "Codename: The Crow", SourceIndex: 3},
	}
	draft, err := newDraft("docx", "test.docx", paragraphs, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(draft.CharacterCandidates) != 2 {
		t.Fatalf("expected two candidates, got %#v", draft.CharacterCandidates)
	}
	wren, juno := candidateNamed(t, draft, "Wren"), candidateNamed(t, draft, "Juno")
	if len(wren.Properties) != 1 || wren.Properties[0].Value != "The Sparrow" {
		t.Fatalf("Wren properties = %#v", wren.Properties)
	}
	if len(juno.Properties) != 1 || juno.Properties[0].Value != "The Crow" {
		t.Fatalf("Juno properties = %#v", juno.Properties)
	}
}

// TestADuplicateLabelUnderOneCandidateKeepsTheFirstValue must never send the sidecar a payload it will reject outright: create
// --properties refuses two properties with the same key, case-insensitively (manuscript_guide.py normalize_properties).
func TestADuplicateLabelUnderOneCandidateKeepsTheFirstValue(t *testing.T) {
	paragraphs := []Paragraph{
		{Chapter: "Characters", Text: "Wren", SourceIndex: 0},
		{Chapter: "Characters", Text: "Notes: first note", SourceIndex: 1},
		{Chapter: "Characters", Text: "Notes: second note", SourceIndex: 2},
	}
	draft, err := newDraft("docx", "test.docx", paragraphs, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	wren := candidateNamed(t, draft, "Wren")
	if len(wren.Properties) != 1 || wren.Properties[0].Value != "first note" {
		t.Fatalf("properties = %#v, want one Notes property with the first value", wren.Properties)
	}
}

// TestWithNoCandidateOpenALabelledLineKeepsTheLegacyNameDescriptionBehavior covers the fallback: a "Name: description" line with
// no candidate already open still opens one, exactly as the pre-Phase-3 characterLine parsing did.
func TestWithNoCandidateOpenALabelledLineKeepsTheLegacyNameDescriptionBehavior(t *testing.T) {
	paragraphs := []Paragraph{
		{Chapter: "Characters", Text: "Wren - a spy for the crown.", SourceIndex: 0},
	}
	draft, err := newDraft("docx", "test.docx", paragraphs, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	wren := candidateNamed(t, draft, "Wren")
	if wren.Description != "a spy for the crown." {
		t.Fatalf("description = %q", wren.Description)
	}
	if len(wren.Properties) != 0 {
		t.Fatalf("expected no properties from the legacy Name: description form, got %#v", wren.Properties)
	}
}

// TestARepeatedBareNameDoesNotFabricateACandidateFromTheNextLabel covers a review finding: a name mentioned twice (the second
// time closing without reopening, since it is already seen) must not leave the scanner in a state where the very next
// "Label: value" line - which was never meant to open anything, only to attach to whichever candidate was open - gets misread as
// the legacy "Name: description" form and fabricates a phantom character out of the label itself.
func TestARepeatedBareNameDoesNotFabricateACandidateFromTheNextLabel(t *testing.T) {
	paragraphs := []Paragraph{
		{Chapter: "Characters", Text: "Wren", SourceIndex: 0},
		{Chapter: "Characters", Text: "Codename: The Sparrow", SourceIndex: 1},
		{Chapter: "Characters", Text: "Wren", SourceIndex: 2},
		{Chapter: "Characters", Text: "Notes: something", SourceIndex: 3},
	}
	draft, err := newDraft("docx", "test.docx", paragraphs, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(draft.CharacterCandidates) != 1 {
		t.Fatalf("expected only the one Wren candidate, got %#v", draft.CharacterCandidates)
	}
	wren := candidateNamed(t, draft, "Wren")
	if len(wren.Properties) != 1 || wren.Properties[0] != (Property{Key: "Codename", Value: "The Sparrow"}) {
		t.Fatalf("Wren properties = %#v, the stray Notes line must not have reopened or altered it", wren.Properties)
	}
}

func TestNewDraftSectionWithoutSubtitleSendsNoSubtitleField(t *testing.T) {
	draft, err := newDraft("docx", "test.docx", []Paragraph{{Chapter: "Chapter One", Text: "Text.", SourceIndex: 0}}, []string{"Chapter One"}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(draft.Sections[0])
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "subtitle") {
		t.Fatalf("a section without a subtitle must not carry the field, got %s", encoded)
	}
}

// A book's preliminary pages are usually headed ("Copyright", "Title Page"), not just loose text before chapter 1. The ones an
// audiobook does not read are Front Matter (kind opening), so they are not recorded as chapters. What it does read (Dedication,
// Epigraph, Foreword, Prologue, Acknowledgements, About the Author) stays narration; Contents-type material stays reference.
func TestNewDraftClassifiesHeadedFrontMatterAsOpening(t *testing.T) {
	cases := map[string]string{
		"Title Page":                    "opening",
		"Half Title":                    "opening",
		"Copyright":                     "opening",
		"Copyright Page":                "opening",
		"Dedication":                    "narration",
		"Epigraph":                      "narration",
		"About the Author":              "narration",
		"Glossary":                      "reference",
		"Praise for After the Applause": "opening",
		"Also by Adrian Crow":           "opening",
		"Other Books by Adrian Crow":    "opening",
		"Opening Credits":               "opening",
		"Acknowledgements":              "narration",
		"Foreword":                      "narration",
		"Prologue":                      "narration",
		"Chapter One":                   "narration",
	}
	for title, want := range cases {
		paragraphs := []Paragraph{
			{Chapter: title, Text: "Some text.", SourceIndex: 0},
			{Chapter: "Chapter Two", Text: "Chapter two text.", SourceIndex: 1},
		}
		draft, err := newDraft("docx", "test.docx", paragraphs, []string{title, "Chapter Two"}, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if got := sectionNamed(t, draft, title).ContentKind; got != want {
			t.Errorf("%q content kind = %q, want %q", title, got, want)
		}
	}
}

func TestMarkdownHeadedFrontMatterIsNotNarrated(t *testing.T) {
	path := filepath.Join(t.TempDir(), "book.md")
	content := "# Copyright\nCopyright © 2026 Adrian Crow.\n\n# Dedication\nFor my mother.\n\n# Chapter One\nChapter one text.\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	draft, err := markdown(path, 1)
	if err != nil {
		t.Fatal(err)
	}
	if got := sectionNamed(t, draft, "Copyright").ContentKind; got != "opening" {
		t.Errorf("Copyright content kind = %q, want opening", got)
	}
	if got := sectionNamed(t, draft, "Dedication").ContentKind; got != "narration" {
		t.Errorf("Dedication content kind = %q, want narration", got)
	}
	if got := sectionNamed(t, draft, "Chapter One").ContentKind; got != "narration" {
		t.Errorf("Chapter One content kind = %q, want narration", got)
	}
}

// The review's outline shows how long each section is and how it begins, so the narrator can tell a chapter from a stray heading.
func TestNewDraftSectionsCarryTheirWordCountAndTheStartOfTheirText(t *testing.T) {
	long := strings.Repeat("word ", 60) // 60 words, longer than the preview line
	paragraphs := []Paragraph{
		{Chapter: "Chapter One", Text: "It was a bright cold day.", SourceIndex: 0},
		{Chapter: "Chapter One", Text: "  Clocks were striking thirteen.  ", SourceIndex: 1},
		{Chapter: "Chapter Two", Text: long, SourceIndex: 2},
		{Chapter: "Empty", Text: "   ", SourceIndex: 3},
	}
	draft, err := newDraft("docx", "test.docx", paragraphs, []string{"Chapter One", "Chapter Two", "Empty"}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	byTitle := map[string]DraftSection{}
	for _, section := range draft.Sections {
		byTitle[section.Title] = section
	}
	one := byTitle["Chapter One"]
	if one.WordCount != 10 {
		t.Fatalf("Chapter One word count = %d, want 10", one.WordCount)
	}
	if one.FirstText != "It was a bright cold day." {
		t.Fatalf("Chapter One first text = %q, want its first paragraph", one.FirstText)
	}
	two := byTitle["Chapter Two"]
	if two.WordCount != 60 {
		t.Fatalf("Chapter Two word count = %d, want 60", two.WordCount)
	}
	if got := len([]rune(two.FirstText)); got > FirstTextMax+1 || !strings.HasSuffix(two.FirstText, "…") {
		t.Fatalf("Chapter Two first text should be cut to %d runes and end in an ellipsis, got %d runes: %q", FirstTextMax, got, two.FirstText)
	}
	empty := byTitle["Empty"]
	if empty.WordCount != 0 || empty.FirstText != "" {
		t.Fatalf("a section of blank text has no words and no first text, got %d and %q", empty.WordCount, empty.FirstText)
	}
}
