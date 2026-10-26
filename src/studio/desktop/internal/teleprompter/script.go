package teleprompter

import (
	"crypto/sha256"
	"desktop/internal/brand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
)

// ChapterScript is a chapter as the sidecar tokenises it (chapter_script.load_chapter_script): the title's words,
// then each paragraph's, split on whitespace as Python's str.split() does. A position event's `read` and locate's
// `word` index Tokens, so the host can quote the sentence at any of them without running the sidecar.
// Breaks holds the index of the title's and each paragraph's first token, and ParagraphIDs each paragraph's id
// (ParagraphIDs[i] starts at Breaks[i+1]).
type ChapterScript struct {
	Tokens       []string
	Breaks       []int
	ParagraphIDs []string
}

// LoadChapterScript reads chapterID's script from the imported manuscript, reporting false when there is no
// manuscript or no such chapter.
func LoadChapterScript(project, chapterID string) (ChapterScript, bool) {
	doc, ok := readManuscriptDoc(project)
	if !ok {
		return ChapterScript{}, false
	}
	return doc.script(chapterID)
}

// Book is the imported manuscript read once, for a caller that needs many chapters' scripts and readings (the chapter
// list's recorded-through places) without reading and parsing the manuscript once per chapter.
type Book struct {
	project string
	doc     manuscriptDoc
}

// LoadBook reads the imported manuscript, reporting false when there is none or it cannot be parsed.
func LoadBook(project string) (Book, bool) {
	doc, ok := readManuscriptDoc(project)
	return Book{project: project, doc: doc}, ok
}

// Script is LoadChapterScript over the manuscript the book read.
func (b Book) Script(chapterID string) (ChapterScript, bool) { return b.doc.script(chapterID) }

// Reading is LoadReading checked against the manuscript the book read.
func (b Book) Reading(chapterID string) (*Reading, error) {
	hash, ok := b.doc.hash(chapterID)
	return loadReadingWith(b.project, chapterID, hash, ok)
}

// manuscriptDoc is the part of manuscript.json a chapter's script and its script hash are made of.
type manuscriptDoc struct {
	DocumentID string `json:"documentId"`
	Chapters   []struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Subtitle string `json:"subtitle"`
	} `json:"chapters"`
	Paragraphs []struct {
		ID        string `json:"id"`
		ChapterID string `json:"chapterId"`
		Text      string `json:"text"`
	} `json:"paragraphs"`
}

func readManuscriptDoc(project string) (manuscriptDoc, bool) {
	raw, err := os.ReadFile(filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json"))
	if err != nil {
		return manuscriptDoc{}, false
	}
	var doc manuscriptDoc
	if json.Unmarshal(raw, &doc) != nil {
		return manuscriptDoc{}, false
	}
	return doc, true
}

// script is chapterID's ChapterScript: the title's words, then each paragraph's.
func (doc manuscriptDoc) script(chapterID string) (ChapterScript, bool) {
	for _, chapter := range doc.Chapters {
		if chapter.ID != chapterID {
			continue
		}
		script := ChapterScript{Tokens: splitWords(chapter.Title), Breaks: []int{0}}
		for _, paragraph := range doc.Paragraphs {
			if paragraph.ChapterID == chapterID {
				script.Breaks = append(script.Breaks, len(script.Tokens))
				script.ParagraphIDs = append(script.ParagraphIDs, paragraph.ID)
				script.Tokens = append(script.Tokens, splitWords(paragraph.Text)...)
			}
		}
		return script, true
	}
	return ChapterScript{}, false
}

// hash is chapterScriptHash's value: the document id and the chapter's title, subtitle and paragraphs; false with no
// document id or no such chapter.
func (doc manuscriptDoc) hash(chapterID string) (string, bool) {
	if doc.DocumentID == "" {
		return "", false
	}
	hash := sha256.New()
	write := func(part string) { _, _ = fmt.Fprintf(hash, "%d:%s", len(part), part) }
	found := false
	for _, chapter := range doc.Chapters {
		if chapter.ID == chapterID {
			write(doc.DocumentID)
			write(chapter.ID)
			write(chapter.Title)
			write(chapter.Subtitle)
			found = true
			break
		}
	}
	if !found {
		return "", false
	}
	for _, paragraph := range doc.Paragraphs {
		if paragraph.ChapterID == chapterID {
			write(paragraph.ID)
			write(paragraph.Text)
		}
	}
	return hex.EncodeToString(hash.Sum(nil)), true
}

// splitWords is Python's str.split(): Go's unicode.IsSpace plus the four information separators Python also counts
// as whitespace.
func splitWords(text string) []string {
	return strings.FieldsFunc(text, func(r rune) bool { return unicode.IsSpace(r) || (r >= 0x1c && r <= 0x1f) })
}

// sentenceEnd is locate.py's _SENTENCE_END_RE: a token ending a sentence, before any closing quotes or brackets.
var sentenceEnd = regexp.MustCompile(`[.!?…]["'”’)\]]*$`)

// SentenceAt is the [Start, End) sentence holding token index, as locate.sentence_bounds finds it: from just after
// the previous sentence-ending token to the next one, never across a paragraph break.
func (script ChapterScript) SentenceAt(index int) Sentence {
	breaks := make(map[int]bool, len(script.Breaks))
	for _, at := range script.Breaks {
		breaks[at] = true
	}
	start := index
	for start > 0 && !breaks[start] && !sentenceEnd.MatchString(script.Tokens[start-1]) {
		start--
	}
	end := index + 1
	for end < len(script.Tokens) && !breaks[end] && !sentenceEnd.MatchString(script.Tokens[end-1]) {
		end++
	}
	return Sentence{Start: start, End: end, Text: strings.Join(script.Tokens[start:end], " ")}
}

// WordsLeft reports whether any token from index on is a word the tracker reads: one that script_tracker's
// normalize_word does not reduce to nothing (it keeps letters, digits, underscores and apostrophes).
func (script ChapterScript) WordsLeft(index int) bool {
	for i := max(index, 0); i < len(script.Tokens); i++ {
		if strings.IndexFunc(script.Tokens[i], isWordRune) >= 0 {
			return true
		}
	}
	return false
}

func isWordRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.Is(unicode.Mn, r) || r == '_' || r == '\''
}
