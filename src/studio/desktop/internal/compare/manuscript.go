package compare

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/big"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"
)

// sentence makes an error whose text is a sentence for the narrator, shown as
// written in a check's failure message (the sidecar's own wording), so it
// starts with a capital and ends with a full stop: ST1005's rule is for errors
// wrapped into other messages.
func sentence(format string, args ...any) error {
	return fmt.Errorf(format, args...)
}

// MaxInputBytes bounds every file a check reads: a words file for an
// hour-long item is well under a megabyte.
const MaxInputBytes = 64 << 20

// ReadBounded reads a whole file of at most MaxInputBytes.
func ReadBounded(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = file.Close() }()
	raw, err := io.ReadAll(io.LimitReader(file, MaxInputBytes+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > MaxInputBytes {
		return nil, fmt.Errorf("%s is larger than %d bytes", filepath.Base(path), MaxInputBytes)
	}
	return raw, nil
}

// JSONString is a JSON string value (null and every other type are not).
func JSONString(raw json.RawMessage) (string, bool) {
	var value string
	if len(raw) == 0 || raw[0] != '"' || json.Unmarshal(raw, &value) != nil {
		return "", false
	}
	return value, true
}

// JSONNumber reports whether raw is a finite JSON number (not a boolean), and
// whether it is an integer as Python's json reads it (no fraction, no
// exponent).
func JSONNumber(raw json.RawMessage) (value float64, integer, ok bool) {
	text := strings.TrimSpace(string(raw))
	if text == "" || text[0] != '-' && (text[0] < '0' || text[0] > '9') {
		return 0, false, false
	}
	if err := json.Unmarshal(raw, &value); err != nil {
		return 0, false, false
	}
	return value, !strings.ContainsAny(text, ".eE"), true
}

// IsVersionOne is Python's `value == 1` for a JSON value: the number 1 (1.0
// included) and, since Python's True equals 1, true.
func IsVersionOne(raw json.RawMessage) bool {
	if string(raw) == "true" {
		return true
	}
	value, _, ok := JSONNumber(raw)
	return ok && value == 1
}

// Chapter is one narration chapter of the canonical manuscript, as
// compare.py's load_manuscript_chapters reads it.
type Chapter struct {
	ID           string
	Title        string
	Subtitle     string
	Paragraphs   []string
	ParagraphIDs []string
	// ParagraphIndices is each paragraph's "index" (the reader's global paragraph index) as Python's str() writes it,
	// nil for a null.
	ParagraphIndices []*string
}

// Heading is the heading a narrator may read first: the title and the
// subtitle, the empty ones left out.
func (c Chapter) Heading() string {
	parts := []string{}
	for _, part := range []string{c.Title, c.Subtitle} {
		if part != "" {
			parts = append(parts, part)
		}
	}
	return strings.Join(parts, " ")
}

// LoadManuscriptChapters is compare.py's load_manuscript_chapters: the
// canonical manuscript at path, validated the way
// narration_common.manuscript.load_file validates it, as its narration
// chapters that have paragraphs, in file order. The errors are the sidecar's
// own sentences.
func LoadManuscriptChapters(path string) ([]Chapter, error) {
	raw, err := ReadBounded(path)
	if err != nil {
		if info, statErr := os.Stat(path); statErr != nil || !info.Mode().IsRegular() {
			return nil, sentence("Import a manuscript first.")
		}
		return nil, sentence("The canonical manuscript data could not be read.")
	}
	var data struct {
		SchemaVersion json.RawMessage   `json:"schemaVersion"`
		DocumentID    json.RawMessage   `json:"documentId"`
		Chapters      []json.RawMessage `json:"chapters"`
		Paragraphs    []json.RawMessage `json:"paragraphs"`
	}
	if !utf8.Valid(raw) || json.Unmarshal(raw, &data) != nil {
		return nil, sentence("The canonical manuscript data could not be read.")
	}
	if !IsVersionOne(data.SchemaVersion) {
		return nil, sentence("This manuscript data uses an unsupported schema version.")
	}
	if _, ok := JSONString(data.DocumentID); !ok || data.Chapters == nil || data.Paragraphs == nil {
		return nil, sentence("The canonical manuscript data is invalid.")
	}
	type chapterRecord struct {
		ID          *string         `json:"id"`
		Title       json.RawMessage `json:"title"`
		Subtitle    json.RawMessage `json:"subtitle"`
		ContentKind json.RawMessage `json:"contentKind"`
	}
	chapterIDs := map[string]bool{}
	records := make([]chapterRecord, len(data.Chapters))
	for k, rawChapter := range data.Chapters {
		if json.Unmarshal(rawChapter, &records[k]) == nil && records[k].ID != nil {
			chapterIDs[*records[k].ID] = true
		}
	}
	type paragraphRecord struct {
		ID        string          `json:"id"`
		ChapterID string          `json:"chapterId"`
		Text      string          `json:"text"`
		Index     json.RawMessage `json:"index"`
	}
	paragraphs := make([]paragraphRecord, len(data.Paragraphs))
	seen := map[string]bool{}
	for k, rawParagraph := range data.Paragraphs {
		var fields map[string]json.RawMessage
		invalid := json.Unmarshal(rawParagraph, &fields) != nil || fields == nil
		for _, key := range []string{"id", "chapterId", "text"} {
			if _, ok := JSONString(fields[key]); invalid || !ok {
				invalid = true
				break
			}
		}
		if !invalid {
			_ = json.Unmarshal(rawParagraph, &paragraphs[k])
			invalid = seen[paragraphs[k].ID] || !chapterIDs[paragraphs[k].ChapterID]
		}
		if invalid {
			return nil, sentence("The canonical manuscript has invalid paragraph records.")
		}
		seen[paragraphs[k].ID] = true
	}

	narration := map[string]*Chapter{}
	order := []string{}
	for _, record := range records {
		if record.ID == nil {
			return nil, sentence("The canonical manuscript data is invalid.")
		}
		if kind := record.ContentKind; kind != nil && string(kind) != `"narration"` {
			continue
		}
		title, ok := JSONString(record.Title)
		if !ok {
			return nil, sentence("The chapter %q has no title.", *record.ID)
		}
		subtitle, _ := JSONString(record.Subtitle)
		if _, again := narration[*record.ID]; !again {
			order = append(order, *record.ID)
		}
		narration[*record.ID] = &Chapter{ID: *record.ID, Title: title, Subtitle: subtitle}
	}
	for _, paragraph := range paragraphs {
		if chapter := narration[paragraph.ChapterID]; chapter != nil {
			if paragraph.Index == nil {
				// load_manuscript_chapters reads paragraph["index"] (the reader's global index) and fails on a paragraph without one.
				return nil, fmt.Errorf("'index'")
			}
			chapter.Paragraphs = append(chapter.Paragraphs, paragraph.Text)
			chapter.ParagraphIDs = append(chapter.ParagraphIDs, paragraph.ID)
			chapter.ParagraphIndices = append(chapter.ParagraphIndices, pyStr(paragraph.Index))
		}
	}
	chapters := []Chapter{}
	for _, id := range order {
		if chapter := narration[id]; len(chapter.Paragraphs) > 0 {
			chapters = append(chapters, *chapter)
		}
	}
	if len(chapters) == 0 {
		return nil, sentence("The canonical manuscript has no narratable chapters.")
	}
	return chapters, nil
}

// pyStr is Python's str() of a JSON value as json.loads reads it, nil for null: an integer as written (any size), a
// float with Python's repr ("inf" past the float range), true and false as "True" and "False", a string as itself. An
// array or an object is its JSON text, which Python would write as its repr; the host never writes one.
func pyStr(raw json.RawMessage) *string {
	text := strings.TrimSpace(string(raw))
	out := text
	switch {
	case text == "null":
		return nil
	case text == "true":
		out = "True"
	case text == "false":
		out = "False"
	case strings.HasPrefix(text, `"`):
		out, _ = JSONString(raw)
	case text != "" && (text[0] == '-' || text[0] >= '0' && text[0] <= '9'):
		if !strings.ContainsAny(text, ".eE") {
			if n, ok := new(big.Int).SetString(text, 10); ok {
				out = n.String()
			}
		} else if value, err := strconv.ParseFloat(text, 64); err == nil || math.IsInf(value, 0) {
			switch {
			case math.IsInf(value, 1):
				out = "inf"
			case math.IsInf(value, -1):
				out = "-inf"
			default:
				out = PyFloatRepr(value)
			}
		}
	}
	return &out
}
