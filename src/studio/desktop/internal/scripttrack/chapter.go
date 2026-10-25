package scripttrack

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math/big"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"desktop/internal/compare"
)

// The script for one chapter of the canonical manuscript, as the Booth's sidecar builds it in chapter_script.py: the
// flat token list the tracker follows, and the spans that map token indices back onto the chapter's heading and
// paragraphs. The tokens are the whitespace-split words of the title, then the subtitle (narrators read it aloud), then
// each paragraph's text in manuscript order.

// ChapterError is ChapterError: the requested script cannot be built. Candidates lists the chapters that could have
// been chosen, when that would help.
type ChapterError struct {
	Message    string
	Candidates []string
}

func (e *ChapterError) Error() string { return e.Message }

// ScriptSpan is one span of a script: Kind "title" or "paragraph", the chapter's or paragraph's ID, Index the
// paragraph's manuscript "index" as written (nil for the title or a paragraph without one), and the token range.
type ScriptSpan struct {
	Kind         string
	ID           string
	Index        json.RawMessage
	Start, Count int
}

// ChapterScript is ChapterScript. Heading is how many tokens open the script as its heading (the title span's count);
// 0 for a script with no title span.
type ChapterScript struct {
	ChapterID, Title string
	Tokens           []string
	Spans            []ScriptSpan
	Text             string
	Heading          int
}

// invalidManuscript is what the host says for a chapter record the sidecar could not read at all: chapter_script.py
// raises a TypeError, KeyError or AttributeError there, which the importer never writes.
var invalidManuscript = &ChapterError{Message: "The canonical manuscript data is invalid."}

// pyCollapse is _collapse: Python's whitespace collapsed, then casefolded.
func pyCollapse(text string) string {
	return compare.PyCasefold(strings.Join(compare.PySplit(text), " "))
}

// DisplayTitle is display_title: a title's lines with words, stripped and joined with ": " ("CHAPTER ONE: Bad
// Ideas..."), a form a caller may still name a chapter by.
func DisplayTitle(title string) string {
	lines := []string{}
	for _, line := range compare.PySplitLines(title) {
		if stripped := compare.PyStrip(line); stripped != "" {
			lines = append(lines, stripped)
		}
	}
	return strings.Join(lines, ": ")
}

func pySquash(text string) string { return strings.Join(compare.PySplit(text), " ") }

// trailingSeparator is chapter_names' _TRAILING_SEPARATOR, applied to text with no trailing space or line break.
var trailingSeparator = regexp.MustCompile(`[:—–-]$`)

// chapterName is narration_common.chapter_names.chapter_display_name(title, subtitle) with Python's whitespace:
// subtitle is nil for a chapter with no subtitle, and then a title's later lines are its subtitle.
func chapterName(title string, subtitle *string) string {
	first, rest, legacy := strings.Cut(title, "\n")
	name, sub := pySquash(title), ""
	if legacy {
		name, sub = pySquash(first), pySquash(strings.ReplaceAll(rest, "\n", " "))
	}
	if subtitle != nil {
		sub = pySquash(*subtitle)
	}
	if sub == "" {
		return name
	}
	if stripped := compare.PyStrip(trailingSeparator.ReplaceAllString(name, "")); stripped != "" {
		return stripped + " — " + sub
	}
	return sub
}

// manuscriptChapter is a narration chapter record as _select reads it; Subtitle is nil for a missing or null one.
type manuscriptChapter struct {
	ID, Title string
	Subtitle  *string
}

// narratableChapters is _narratable_chapters: the narration chapter records (no contentKind counts as narration) whose
// id has a paragraph, in file order, as raw records; a record _select would fail on is reported when it is reached.
func narratableChapters(data compare.Manuscript) ([]map[string]json.RawMessage, error) {
	withParagraphs := map[string]bool{}
	for _, paragraph := range data.Paragraphs {
		withParagraphs[paragraph.ChapterID] = true
	}
	chapters := []map[string]json.RawMessage{}
	for _, raw := range data.Chapters {
		var record map[string]json.RawMessage
		if json.Unmarshal(raw, &record) != nil || record == nil {
			return nil, invalidManuscript
		}
		if kind, ok := record["contentKind"]; ok {
			if text, isText := compare.JSONString(kind); !isText || text != "narration" {
				continue
			}
		}
		rawID, ok := record["id"]
		if !ok {
			return nil, invalidManuscript
		}
		if id, isText := compare.JSONString(rawID); isText && withParagraphs[id] {
			chapters = append(chapters, record)
		}
	}
	return chapters, nil
}

func readChapter(record map[string]json.RawMessage) (manuscriptChapter, error) {
	id, _ := compare.JSONString(record["id"])
	title, ok := compare.JSONString(record["title"])
	if !ok {
		return manuscriptChapter{}, invalidManuscript
	}
	chapter := manuscriptChapter{ID: id, Title: title}
	if raw, present := record["subtitle"]; present && string(bytes.TrimSpace(raw)) != "null" {
		subtitle, isText := compare.JSONString(raw)
		if !isText {
			return manuscriptChapter{}, invalidManuscript
		}
		chapter.Subtitle = &subtitle
	}
	return chapter, nil
}

// selectChapter is _select: the first chapter whose id is query, or whose title, display title or display name is
// query once whitespace is collapsed and case folded.
func selectChapter(records []map[string]json.RawMessage, query string) (manuscriptChapter, error) {
	wanted := pyCollapse(query)
	for _, record := range records {
		chapter, err := readChapter(record)
		if err != nil {
			return manuscriptChapter{}, err
		}
		names := []string{chapter.Title, DisplayTitle(chapter.Title), chapterName(chapter.Title, chapter.Subtitle)}
		for _, name := range names {
			if chapter.ID == query || pyCollapse(name) == wanted {
				return chapter, nil
			}
		}
	}
	candidates := []string{}
	for _, record := range records {
		chapter, err := readChapter(record)
		if err != nil {
			return manuscriptChapter{}, err
		}
		candidates = append(candidates, chapterName(chapter.Title, chapter.Subtitle))
	}
	return manuscriptChapter{}, &ChapterError{
		Message:    fmt.Sprintf("Chapter %s was not found among the narration chapters.", compare.PyRepr(query)),
		Candidates: candidates,
	}
}

// LoadChapterScript is load_chapter_script: the script for the chapter with this id or title in the canonical
// manuscript at path. Every error is a *ChapterError.
func LoadChapterScript(path, chapter string) (ChapterScript, error) {
	data, err := compare.LoadManuscript(path)
	if err != nil {
		return ChapterScript{}, &ChapterError{Message: err.Error()}
	}
	records, err := narratableChapters(data)
	if err != nil {
		return ChapterScript{}, err
	}
	selected, err := selectChapter(records, chapter)
	if err != nil {
		return ChapterScript{}, err
	}
	parts := []string{}
	for _, part := range []string{selected.Title, deref(selected.Subtitle)} {
		if compare.PyStrip(part) != "" {
			parts = append(parts, part)
		}
	}
	heading := strings.Join(parts, " ")
	tokens := compare.PySplit(heading)
	script := ChapterScript{
		ChapterID: selected.ID, Title: selected.Title, Heading: len(tokens),
		Spans: []ScriptSpan{{Kind: "title", ID: selected.ID, Count: len(tokens)}},
	}
	texts := []string{heading}
	for _, paragraph := range data.Paragraphs {
		if paragraph.ChapterID != selected.ID {
			continue
		}
		words := compare.PySplit(paragraph.Text)
		script.Spans = append(script.Spans, ScriptSpan{Kind: "paragraph", ID: paragraph.ID, Index: paragraph.Index, Start: len(tokens), Count: len(words)})
		tokens = append(tokens, words...)
		texts = append(texts, paragraph.Text)
	}
	script.Tokens, script.Text = tokens, strings.Join(texts, "\n")
	return script, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// lineBreak is _LINE_BREAK.
var lineBreak = regexp.MustCompile(`\r\n|\r|\n`)

// TextScript is text_script: the script for text that is not a manuscript chapter (the opening or closing credits the
// host renders). Every line with words is one paragraph span, "<scriptID>-<n>" counted from 1 over those lines only,
// with no manuscript index; there is no title span, because the script's name is not read aloud.
func TextScript(text, scriptID, title string) (ChapterScript, error) {
	script := ChapterScript{ChapterID: scriptID, Title: title, Tokens: []string{}, Spans: []ScriptSpan{}, Text: text}
	for _, line := range lineBreak.Split(text, -1) {
		words := compare.PySplit(line)
		if len(words) == 0 {
			continue
		}
		id := scriptID + "-" + strconv.Itoa(len(script.Spans)+1)
		script.Spans = append(script.Spans, ScriptSpan{Kind: "paragraph", ID: id, Start: len(script.Tokens), Count: len(words)})
		script.Tokens = append(script.Tokens, words...)
	}
	if len(script.Tokens) == 0 {
		return ChapterScript{}, &ChapterError{Message: "The " + title + " text has no words to read."}
	}
	return script, nil
}

// universalNewlines is what Path.read_text does to line ends: "\r\n" and "\r" become "\n".
var universalNewlines = strings.NewReplacer("\r\n", "\n", "\r", "\n")

// LoadTextScript is load_text_script: TextScript over a UTF-8 file the host wrote, its line ends read as Python's text
// mode reads them. A file that cannot be read says why after "Could not read the <title> text: ", in Go's words.
func LoadTextScript(path, scriptID, title string) (ChapterScript, error) {
	raw, err := compare.ReadBounded(path)
	if err == nil && !utf8.Valid(raw) {
		err = fmt.Errorf("%s is not UTF-8", path)
	}
	if err != nil {
		return ChapterScript{}, &ChapterError{Message: fmt.Sprintf("Could not read the %s text: %v", title, err)}
	}
	return TextScript(universalNewlines.Replace(string(raw)), scriptID, title)
}

// ScriptEvent is script_event: the one-off `script` event describing the tokenization, emitted before any position
// event, as json.dumps writes it once its keys are sorted. A span's index is written as Python writes the value it
// read.
func ScriptEvent(script ChapterScript) compare.PyObject {
	spans := make([]any, len(script.Spans))
	for k, span := range script.Spans {
		spans[k] = compare.PyObject{"kind": span.Kind, "id": span.ID, "index": pyJSONValue(span.Index), "start": span.Start, "count": span.Count}
	}
	return compare.PyObject{
		"type":    "script",
		"chapter": compare.PyObject{"id": script.ChapterID, "title": script.Title},
		"tokens":  len(script.Tokens),
		"spans":   spans,
	}
}

// pyJSONValue is a JSON value as json.loads reads it, ready for compare.DumpPy to write as json.dumps would: an
// integer of any size as its digits, a float with Python's repr, and arrays and objects
// element by element. Missing and null are nil.
func pyJSONValue(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if decoder.Decode(&value) != nil {
		return nil
	}
	return pyValue(value)
}

func pyValue(value any) any {
	switch x := value.(type) {
	case json.Number:
		text := string(x)
		if !strings.ContainsAny(text, ".eE") {
			n, _ := new(big.Int).SetString(text, 10)
			return compare.RawJSON(n.String())
		}
		f, _ := strconv.ParseFloat(text, 64) // past the float range, ±Inf, which DumpPy writes as Python does
		return f
	case []any:
		out := make([]any, len(x))
		for k, element := range x {
			out[k] = pyValue(element)
		}
		return out
	case map[string]any:
		out := compare.PyObject{}
		for key, element := range x {
			out[key] = pyValue(element)
		}
		return out
	}
	return value
}
