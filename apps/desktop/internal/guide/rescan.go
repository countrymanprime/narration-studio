package guide

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"
	"unicode/utf8"
)

// The sidecar's own words for a refusal, shown to the narrator (narration_common/manuscript.py and manuscript_guide.py load_manuscript).
var (
	errNoManuscript     = errors.New("Import a manuscript first.")                               //nolint:staticcheck // the sidecar's own words
	errManuscriptRead   = errors.New("The canonical manuscript data could not be read.")         //nolint:staticcheck // the sidecar's own words
	errManuscriptSchema = errors.New("This manuscript data uses an unsupported schema version.") //nolint:staticcheck // the sidecar's own words
	errManuscriptShape  = errors.New("The canonical manuscript data is invalid.")                //nolint:staticcheck // the sidecar's own words
	errManuscriptItems  = errors.New("The canonical manuscript has invalid paragraph records.")  //nolint:staticcheck // the sidecar's own words
	errNoNarration      = errors.New("The manuscript has no readable text paragraphs.")          //nolint:staticcheck // the sidecar's own words
	errNoProject        = errors.New("save the REAPER project and import a manuscript first")
)

// The three answers of Status, the words after "STATUS|" in the sidecar's output.
const (
	StatusMissing = "MISSING" // no Story Bible
	StatusStale   = "STALE"   // the Story Bible was built from another manuscript
	StatusCurrent = "CURRENT" // the Story Bible was built from this manuscript
)

// narration is load_manuscript: the paragraphs of the chapters that are narrated (a chapter with no contentKind is), in manuscript
// order, each with its text by code point. It refuses what narration_common.manuscript.validate refuses, with its words.
//
// Where the sidecar would crash instead of refuse (a chapter title that is missing, JSON that Python accepts and Go does not, such as
// NaN), this refuses with the closest of those words.
func narration(path string) ([]textParagraph, error) {
	if info, err := os.Stat(path); err != nil || !info.Mode().IsRegular() {
		return nil, errNoManuscript
	}
	raw, err := os.ReadFile(path)
	if err != nil || !utf8.Valid(raw) {
		return nil, errManuscriptRead
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var data any
	if err := decoder.Decode(&data); err != nil {
		return nil, errManuscriptRead
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) { // json.loads takes one value and nothing after it
		return nil, errManuscriptRead
	}
	document, ok := data.(map[string]any)
	if !ok || !isOne(document["schemaVersion"]) {
		return nil, errManuscriptSchema
	}
	_, hasID := document["documentId"].(string)
	chapters, hasChapters := document["chapters"].([]any)
	paragraphs, hasParagraphs := document["paragraphs"].([]any)
	if !hasID || !hasChapters || !hasParagraphs {
		return nil, errManuscriptShape
	}
	chapterIDs := map[string]bool{}
	narrated := map[string]bool{}
	for _, raw := range chapters {
		chapter, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if id, ok := chapter["id"].(string); ok {
			chapterIDs[id] = true
			if kind, has := chapter["contentKind"]; !has || kind == "narration" {
				narrated[id] = true
			}
		}
	}
	seen := map[string]bool{}
	narrative := []textParagraph{}
	for _, raw := range paragraphs {
		paragraph, ok := raw.(map[string]any)
		id, hasID := paragraph["id"].(string)
		chapterID, hasChapter := paragraph["chapterId"].(string)
		text, hasText := paragraph["text"].(string)
		title, hasTitle := paragraph["chapterTitle"]
		if !ok || !hasID || seen[id] || !hasChapter || !chapterIDs[chapterID] || !hasText || !hasTitle {
			return nil, errManuscriptItems
		}
		seen[id] = true
		if narrated[chapterID] {
			narrative = append(narrative, textParagraph{chapter: title, chapterID: chapterID, paragraphID: id, text: []rune(text)})
		}
	}
	if len(narrative) == 0 {
		return nil, errNoNarration
	}
	return narrative, nil
}

// isOne is Python's value == 1 for a decoded schema version: 1, 1.0 and true.
func isOne(value any) bool {
	switch v := value.(type) {
	case json.Number:
		f, err := v.Float64()
		return err == nil && f == 1
	case bool:
		return v
	}
	return false
}

// Rescan is manuscript_guide.py rescan, in the host: it finds the entry's name and each of its aliases in the manuscript again
// (rescanEntity). Unlike an edit, it works on a locked entry. A rescan that is refused (an unknown entry, a manuscript that cannot be
// read) leaves the file as it was.
func (s *Service) Rescan(id string) error {
	if s.project == "" {
		return errNoProject
	}
	return s.mutateInHost(func(document map[string]any) (bool, error) { return rescanEntity(document, id, s.manuscript()) })
}

// rescanEntity is the body of rescan: the entry's occurrences and its aliases' are found again in the manuscript at path, the count is
// made again, and an entry that needs review and now has a place in the manuscript is reviewed. The Story Bible is read before the
// manuscript, so an unknown entry is refused whatever the manuscript is.
func rescanEntity(document map[string]any, id, path string) (bool, error) {
	_, entity, err := findEntity(document, id)
	if err != nil {
		return false, err
	}
	paragraphs, err := narration(path)
	if err != nil {
		return false, err
	}
	name, _ := entity["canonical_name"].(string)
	entity["occurrences"] = findOccurrences(paragraphs, name)
	for _, raw := range listOf(entity["aliases"]) {
		if alias, ok := raw.(map[string]any); ok {
			text, _ := alias["text"].(string)
			alias["occurrences"] = findOccurrences(paragraphs, text)
		}
	}
	count := occurrenceCount(entity)
	entity["occurrence_count"] = count
	if entity["review_state"] == "needs review" && count != json.Number("0") {
		entity["review_state"] = "reviewed"
	}
	return true, nil
}

// Status is manuscript_guide.py status, in the host: whether the Story Bible was built from the manuscript as it is now. No file, an
// empty one or one that is not a JSON object is StatusMissing; a file whose source hash is not the SHA-256 of the manuscript's bytes is
// StatusStale. A manuscript that cannot be read is an error, but only when there is a Story Bible to compare it with.
//
// A source that is not an object is StatusStale here; the sidecar crashes on it.
func (s *Service) Status() (string, error) {
	if s.project == "" {
		return "", errNoProject
	}
	raw, err := os.ReadFile(s.guidePath())
	if err != nil {
		return StatusMissing, nil
	}
	var document map[string]any
	if err := json.Unmarshal(raw, &document); err != nil || len(document) == 0 {
		return StatusMissing, nil
	}
	hash, err := fileHash(s.manuscript())
	if err != nil {
		return "", errNoManuscript
	}
	if source, ok := document["source"].(map[string]any); ok && source["sha256"] == hash {
		return StatusCurrent, nil
	}
	return StatusStale, nil
}

// fileHash is document_hash: the SHA-256 of the file's bytes as lower-case hexadecimal.
func fileHash(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer func() { _ = file.Close() }() // read only
	digest := sha256.New()
	if _, err := io.Copy(digest, file); err != nil {
		return "", err
	}
	return strings.ToLower(hex.EncodeToString(digest.Sum(nil))), nil
}
