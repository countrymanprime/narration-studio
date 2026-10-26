package teleprompter

import (
	"crypto/sha256"
	"desktop/internal/brand"
	"desktop/internal/recordedthrough"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

// readingSchemaVersion is a reading file's version. A file with another
// version reads as absent.
const readingSchemaVersion = 1

// Reading is where the prompter last was in a chapter: the last position event's Read (the index space of
// locate's Word) out of Tokens script words, written when a chapter session
// ends. Ranges are the stretches of the script every take has followed since the chapter's text last changed, each
// from the word the session started at to its last Read, joined where they overlap (recordedthrough.Merge): what
// says how far the chapter is recorded (recordedthrough.Resolve). A file written before Ranges has none, and reads as
// one stretch from the top to Read. ScriptHash is a hash of the manuscript document and the chapter's text,
// so a reading is dropped rather than misplaced once the chapter is edited or
// the manuscript re-imported. It is one word index, never a word-to-time
// anchor (docs/architecture/manuscript-teleprompter.md#resume-where-reaper-is-and-where-the-prompter-was stands). The host reads it back, so its shape is
// a wire contract (tests/fixtures/contracts/teleprompter-reading.json).
type Reading struct {
	Version    int       `json:"version"`
	ChapterID  string    `json:"chapterId"`
	Read       int       `json:"read"`
	Tokens     int       `json:"tokens"`
	ScriptHash string    `json:"scriptHash"`
	Status     string    `json:"status"`
	EndedAt    time.Time `json:"endedAt"`
	// Ranges is omitted when empty, so a file with none is the version-1 file it always was.
	Ranges []recordedthrough.Range `json:"ranges,omitempty"`
}

// Followed is the stretches the reading says were read: Ranges, or for a file written before them, the top to Read.
func (r Reading) Followed() []recordedthrough.Range {
	if len(r.Ranges) > 0 {
		return r.Ranges
	}
	return recordedthrough.Merge(nil, recordedthrough.Range{From: 0, To: r.Read})
}

// ReadingDir is where the readings live: beside the anchors file (anchors.go).
func ReadingDir(project string) string {
	return filepath.Join(project, brand.ProjectFolder, "teleprompter")
}

var plainID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// hashedChapterID is a short, stable stand-in for a chapter id that is not already a plain file name, shared by
// readingFileName and anchorsFileName so neither ever lets an id's own characters name a path.
func hashedChapterID(chapterID string) string {
	sum := sha256.Sum256([]byte(chapterID))
	return hex.EncodeToString(sum[:16])
}

// readingFileName is the host's name for chapterID's reading. A chapter id
// that is not already a short, plain file name is hashed, so no id, whatever
// its characters, ever names a path.
func readingFileName(chapterID string) string {
	if plainID.MatchString(chapterID) {
		return chapterID + ".reading.json"
	}
	return "id-" + hashedChapterID(chapterID) + ".reading.json"
}

// chapterScriptHash hashes the manuscript's document id and chapterID's
// title, subtitle and paragraphs, reporting false when the manuscript cannot
// be read or has no such chapter.
func chapterScriptHash(project, chapterID string) (string, bool) {
	doc, ok := readManuscriptDoc(project)
	if !ok {
		return "", false
	}
	return doc.hash(chapterID)
}

// WriteReading is WriteReadingFrom for a session that started at the top.
func WriteReading(project, chapterID string, read, tokens int, status string, endedAt time.Time) error {
	return WriteReadingFrom(project, chapterID, 0, read, tokens, status, endedAt)
}

// WriteReadingFrom records that the prompter, started at word from, stopped at word read of tokens in chapterID,
// through a temp file and a rename, adding from-read to the stretches the chapter's reading already holds (a reading
// for other text or another token count starts them afresh). It refuses a chapter the imported manuscript does not
// have and a read outside [0, tokens]. A read before from (the narrator went back) adds no stretch.
func WriteReadingFrom(project, chapterID string, from, read, tokens int, status string, endedAt time.Time) error {
	if project == "" {
		return errors.New("no project is open")
	}
	if tokens <= 0 || read < 0 || read > tokens {
		return fmt.Errorf("a reading of word %d of %d is out of range", read, tokens)
	}
	hash, ok := chapterScriptHash(project, chapterID)
	if !ok {
		return fmt.Errorf("chapter %q is not in the imported manuscript", chapterID)
	}
	var kept []recordedthrough.Range
	if previous, err := LoadReading(project, chapterID); err == nil && previous != nil && previous.Tokens == tokens {
		kept = previous.Followed()
	}
	reading := Reading{
		Version: readingSchemaVersion, ChapterID: chapterID, Read: read, Tokens: tokens, ScriptHash: hash, Status: status, EndedAt: endedAt.UTC(),
		Ranges: recordedthrough.Merge(kept, recordedthrough.Range{From: max(from, 0), To: read}),
	}
	bytes, err := json.MarshalIndent(reading, "", "  ")
	if err != nil {
		return err
	}
	dir := ReadingDir(project)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("could not create the teleprompter folder: %w", err)
	}
	path := filepath.Join(dir, readingFileName(chapterID))
	temp := path + ".tmp"
	if err := os.WriteFile(temp, bytes, 0o600); err != nil {
		return fmt.Errorf("could not write the last reading position: %w", err)
	}
	if err := os.Rename(temp, path); err != nil {
		return fmt.Errorf("could not activate the last reading position: %w", err)
	}
	return nil
}

// LoadReading returns chapterID's reading, or nil when there is none that
// still applies: no file, a corrupt or other-version one, one for another
// chapter, a read out of range, or a chapter whose text (or document) changed
// since. Only an unreadable-but-present file is an error.
func LoadReading(project, chapterID string) (*Reading, error) {
	hash, ok := chapterScriptHash(project, chapterID)
	return loadReadingWith(project, chapterID, hash, ok)
}

// loadReadingWith is LoadReading with the chapter's current script hash already known (ok false: no such chapter).
func loadReadingWith(project, chapterID, hash string, ok bool) (*Reading, error) {
	raw, err := os.ReadFile(filepath.Join(ReadingDir(project), readingFileName(chapterID)))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("could not read the last reading position: %w", err)
	}
	var reading Reading
	if json.Unmarshal(raw, &reading) != nil || reading.Version != readingSchemaVersion || reading.ChapterID != chapterID ||
		reading.Tokens <= 0 || reading.Read < 0 || reading.Read > reading.Tokens {
		return nil, nil
	}
	if !ok || hash != reading.ScriptHash {
		return nil, nil
	}
	return &reading, nil
}

// endedReading is what a session that just ended leaves to record: its
// chapter (empty for a credits script, MC8/MC9), the script's token count and
// the last position. ok is false when there is nothing to record.
func endedReading(chapter string, credits bool, script, position json.RawMessage) (read, tokens int, status string, ok bool) {
	if chapter == "" || credits || len(script) == 0 || len(position) == 0 {
		return 0, 0, "", false
	}
	var scriptEvent struct {
		Tokens int `json:"tokens"`
	}
	var positionEvent struct {
		Read   *int   `json:"read"`
		Status string `json:"status"`
	}
	if json.Unmarshal(script, &scriptEvent) != nil || json.Unmarshal(position, &positionEvent) != nil || positionEvent.Read == nil {
		return 0, 0, "", false
	}
	if *positionEvent.Read <= 0 {
		return 0, 0, "", false // nothing was read: there is no place to remember
	}
	return *positionEvent.Read, scriptEvent.Tokens, positionEvent.Status, true
}
