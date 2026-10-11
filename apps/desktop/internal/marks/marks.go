// Package marks is the Script page's marks: a range of one paragraph of the manuscript, marked with one of the narrator's mark
// types, with an optional note, or a question when the type asks. The narrator defines the types (a name, one of six colours,
// one of six line styles, and whether it asks), and both lists are kept in the project's own file and every mark is checked
// against the current text on every read. A mark whose line is gone, whose range no longer fits, or whose words changed is
// reported stale, never moved to a guess (the rule of ADR 0382 and ADR 0820).
//
// The file is narrator data, read through persist: a corrupt one is kept aside and a fresh list starts, one written by a newer
// app is refused and never overwritten. Replacing the manuscript or Clear project data removes it (the manuscript service's
// resetDerived); a re-import without a reset keeps it. The first read of a project with no marks file brings the reader's old
// notes across once, as note marks; the old file is left as it is.
package marks

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf16"

	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// SchemaVersion is the only marks.json version this package reads or writes.
const SchemaVersion = 1

// what names the file for the narrator in a persist notice or an error.
const what = "marks"

// The limits. Text is counted in UTF-16 code units, the unit the UI's maxLength and its schema count.
const (
	// MaxTextUnits is the longest note or question.
	MaxTextUnits = 2000
	// MaxTypeNameUnits is the longest mark type name.
	MaxTypeNameUnits = 40
	// MaxTypes is the most mark types a project keeps.
	MaxTypes = 24
	// MaxMarks is the most marks a project keeps.
	MaxMarks = 10000
	// MaxFileBytes is the largest marks.json that is read or written.
	MaxFileBytes = 8 << 20
)

// A mark's status: an asking mark starts open; a note has none.
const (
	StatusOpen     = "open"
	StatusResolved = "resolved"
)

// Why a mark is stale.
const (
	// StaleParagraphMissing means the line the mark was placed on is no longer in its chapter.
	StaleParagraphMissing = "paragraph_missing"
	// StaleRangeOutOfRange means the line is there but the range runs past its end or splits a surrogate pair.
	StaleRangeOutOfRange = "range_out_of_range"
	// StaleTextChanged means the range fits the line but its words are no longer the quoted ones.
	StaleTextChanged = "text_changed"
)

// Colours and Styles are the closed sets a mark type draws with, as in the Studio Next mock.
var (
	Colours = []string{"copper", "info", "ok", "warn", "bad", "violet"}
	Styles  = []string{"highlight", "underline", "double", "dotted", "wavy", "box"}
)

var typeKeyPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,40}$`)

// File is where a project's marks are kept.
func File(project string) string {
	return filepath.Join(project, "narration-utils", "marks.json")
}

// MarkType is one of the narrator's ways of marking up. Key names it in each mark; Asks makes its marks questions that track a
// reply.
type MarkType struct {
	Key    string `json:"key"`
	Name   string `json:"name"`
	Colour string `json:"colour"`
	Style  string `json:"style"`
	Asks   bool   `json:"asks"`
}

// DefaultTypes are the types a project starts with: the Studio Next mock's own.
func DefaultTypes() []MarkType {
	return []MarkType{
		{Key: "stress", Name: "Word stress", Colour: "copper", Style: "highlight"},
		{Key: "breath", Name: "Breath / pause", Colour: "info", Style: "dotted"},
		{Key: "pace", Name: "Pace", Colour: "ok", Style: "wavy"},
		{Key: "emo", Name: "Emotion", Colour: "bad", Style: "underline"},
		{Key: "note", Name: "Note", Colour: "violet", Style: "double"},
		{Key: "ask", Name: "Query for author", Colour: "warn", Style: "highlight", Asks: true},
	}
}

// noteType is the type the reader's old notes come across as.
const noteType = "note"

// Message is one message in a mark's thread: who wrote it (one of Authors), its plain text, and the host's UTC time it was
// written, as RFC 3339.
type Message struct {
	Who  string `json:"who"`
	Text string `json:"text"`
	At   string `json:"at"`
}

// Mark is one mark as stored. Start and End are UTF-16 code units into the paragraph's text (a JS string index, the page's
// own unit), Start before End; Quote is the line's own text for the range when it was placed. A note brought across from the
// reader without an anchor sits at the start of its line with an empty range.
type Mark struct {
	ID          string    `json:"id"`
	ChapterID   string    `json:"chapterId"`
	ParagraphID string    `json:"paragraphId"`
	Start       int       `json:"start"`
	End         int       `json:"end"`
	Quote       string    `json:"quote"`
	Type        string    `json:"type"`
	Text        string    `json:"text"`
	Status      string    `json:"status,omitempty"`
	Thread      []Message `json:"thread"`
	CreatedAt   time.Time `json:"createdAt"`
}

// Resolved is a mark as the UI gets it: where its line is in the current manuscript, or why it is stale.
type Resolved struct {
	Mark
	// Paragraph is the line's index in the manuscript, or nil when the line is gone.
	Paragraph *int `json:"paragraph"`
	// Stale is true when the line is gone, the range no longer fits it or its words changed. The range is then the stored one.
	Stale       bool   `json:"stale"`
	StaleReason string `json:"staleReason,omitempty"`
}

// Marks is what a list, a remove and a types save answer: the types in the narrator's order and the marks in reading order.
type Marks struct {
	Types []MarkType `json:"types"`
	Marks []Resolved `json:"marks"`
}

// Line is one paragraph of the manuscript as it currently is.
type Line struct {
	ChapterID string
	ID        string
	Index     int
	Text      string
}

// Book is the current manuscript: its chapter ids, and its lines in reading order.
type Book struct {
	Chapters []string
	Lines    []Line
}

// OldNote is one of the reader's notes (manuscript-notes.json), as the migration reads it. Start and End are its anchor, when
// it has one.
type OldNote struct {
	ChapterID   string
	ParagraphID string
	Text        string
	Start, End  *int
	CreatedAt   time.Time
}

// Config is what a Service needs.
type Config struct {
	// Project is the project folder; empty means no project is open, and nothing is saved.
	Project string
	// Manuscript reads the current manuscript; an error reads as an empty one, so every mark shows stale.
	Manuscript func() (Book, error)
	// OldNotes reads the reader's notes for the one-time migration; nil means there are none.
	OldNotes func() ([]OldNote, error)
	// Reporter tells the narrator about a file that cannot be read (ADR 0069); nil only logs nothing.
	Reporter *persist.Reporter
}

type marksFile struct {
	SchemaVersion int        `json:"schemaVersion"`
	MigratedNotes bool       `json:"migratedNotes"`
	Types         []MarkType `json:"types"`
	Marks         []Mark     `json:"marks"`
}

// Service reads and writes a project's marks. It holds no state of its own, so the host builds one per call; the
// read-modify-write of one file is serialised by fileLock.
type Service struct {
	config Config
	now    func() time.Time
}

// New returns the service for config.
func New(config Config) *Service {
	return &Service{config: config, now: time.Now}
}

var fileLocks sync.Map

// lockFile serialises every change to one project's file across services built for the same project.
// +checklocksignore
func lockFile(path string) func() {
	lock, _ := fileLocks.LoadOrStore(filepath.Clean(path), &sync.Mutex{})
	mutex, _ := lock.(*sync.Mutex)
	mutex.Lock()
	return mutex.Unlock
}

// List returns the mark types and every mark in reading order, each checked against the current manuscript.
func (s *Service) List() (Marks, error) {
	if s.config.Project == "" {
		return Marks{Types: DefaultTypes(), Marks: []Resolved{}}, nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, migrated, err := s.read()
	if err != nil {
		return Marks{Types: []MarkType{}, Marks: []Resolved{}}, err
	}
	if migrated {
		if err := s.write(file); err != nil {
			return Marks{Types: []MarkType{}, Marks: []Resolved{}}, err
		}
	}
	return answer(file, s.manuscript()), nil
}

// Add marks a range of one line with a type: start and end are UTF-16 units into the line's current text, start before end.
// The stored quote is the line's own text for the range. A type that asks needs its question, and its mark starts open.
func (s *Service) Add(chapterID, paragraphID string, start, end int, typeKey, text string) (Resolved, error) {
	if s.config.Project == "" {
		return Resolved{}, errors.New("save the project first")
	}
	text, err := cleanText(text)
	if err != nil {
		return Resolved{}, err
	}
	book := s.manuscript()
	if !hasChapter(book, chapterID) {
		return Resolved{}, errors.New("that chapter is not in the manuscript")
	}
	line, ok := findLine(book, chapterID, paragraphID)
	if !ok {
		return Resolved{}, errors.New("that line is not in this chapter")
	}
	if start >= end {
		return Resolved{}, errors.New("choose some words to mark first")
	}
	quote, ok := slice(line.Text, start, end)
	if !ok {
		return Resolved{}, errors.New("those words are not in the line")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, _, err := s.read()
	if err != nil {
		return Resolved{}, err
	}
	markType, ok := findType(file.Types, typeKey)
	if !ok {
		return Resolved{}, errors.New("that kind of mark is no longer there")
	}
	if markType.Asks && text == "" {
		return Resolved{}, errors.New("write the question first")
	}
	if len(file.Marks) >= MaxMarks {
		return Resolved{}, fmt.Errorf("a project can keep at most %d marks", MaxMarks)
	}
	mark := Mark{ID: newID(), ChapterID: chapterID, ParagraphID: paragraphID, Start: start, End: end, Quote: quote, Type: typeKey, Text: text, Thread: []Message{}, CreatedAt: s.now().UTC()}
	if markType.Asks {
		mark.Status = StatusOpen
	}
	file.Marks = append(file.Marks, mark)
	if err := s.write(file); err != nil {
		return Resolved{}, err
	}
	return resolve(mark, book), nil
}

// Remove deletes a mark by id and returns the types and the marks left. An id that is not there is not an error.
func (s *Service) Remove(id string) (Marks, error) {
	if s.config.Project == "" {
		return Marks{Types: []MarkType{}, Marks: []Resolved{}}, errors.New("save the project first")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, migrated, err := s.read()
	if err != nil {
		return Marks{Types: []MarkType{}, Marks: []Resolved{}}, err
	}
	kept := make([]Mark, 0, len(file.Marks))
	for _, mark := range file.Marks {
		if mark.ID != id {
			kept = append(kept, mark)
		}
	}
	if migrated || len(kept) != len(file.Marks) {
		file.Marks = kept
		if err := s.write(file); err != nil {
			return Marks{Types: []MarkType{}, Marks: []Resolved{}}, err
		}
	}
	return answer(file, s.manuscript()), nil
}

// SaveTypes replaces the mark types with types, in the narrator's order. A type with no key is new and the host names it. At
// least one type is kept. Removing a type that marks still use is refused with the count unless removeUses is set, which
// removes those marks too. A type that now asks opens its marks that have no status.
func (s *Service) SaveTypes(types []MarkType, removeUses bool) (Marks, error) {
	if s.config.Project == "" {
		return Marks{Types: []MarkType{}, Marks: []Resolved{}}, errors.New("save the project first")
	}
	cleaned, err := cleanTypes(types)
	if err != nil {
		return Marks{Types: []MarkType{}, Marks: []Resolved{}}, err
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, _, err := s.read()
	if err != nil {
		return Marks{Types: []MarkType{}, Marks: []Resolved{}}, err
	}
	asks := make(map[string]bool, len(cleaned))
	for _, markType := range cleaned {
		asks[markType.Key] = markType.Asks
	}
	orphans := 0
	for _, mark := range file.Marks {
		if _, ok := asks[mark.Type]; !ok {
			orphans++
		}
	}
	if orphans > 0 && !removeUses {
		noun := "marks use"
		if orphans == 1 {
			noun = "mark uses"
		}
		return Marks{Types: []MarkType{}, Marks: []Resolved{}}, fmt.Errorf("%d %s a kind you removed; remove them too, or keep that kind", orphans, noun)
	}
	kept := make([]Mark, 0, len(file.Marks))
	for _, mark := range file.Marks {
		ask, ok := asks[mark.Type]
		if !ok {
			continue
		}
		if ask && mark.Status == "" {
			mark.Status = StatusOpen
		}
		kept = append(kept, mark)
	}
	file.Types, file.Marks = cleaned, kept
	if err := s.write(file); err != nil {
		return Marks{Types: []MarkType{}, Marks: []Resolved{}}, err
	}
	return answer(file, s.manuscript()), nil
}

// manuscript reads the current manuscript; one that cannot be read is an empty one.
func (s *Service) manuscript() Book {
	if s.config.Manuscript == nil {
		return Book{}
	}
	book, err := s.config.Manuscript()
	if err != nil {
		return Book{}
	}
	return book
}

func hasChapter(book Book, chapterID string) bool {
	for _, id := range book.Chapters {
		if id == chapterID {
			return true
		}
	}
	return false
}

func findLine(book Book, chapterID, paragraphID string) (Line, bool) {
	for _, line := range book.Lines {
		if line.ID == paragraphID && line.ChapterID == chapterID {
			return line, true
		}
	}
	return Line{}, false
}

func findType(types []MarkType, key string) (MarkType, bool) {
	for _, markType := range types {
		if markType.Key == key {
			return markType, true
		}
	}
	return MarkType{}, false
}

// cleanText trims a note or question and checks it: plain text of at most MaxTextUnits, no control character but a line
// break or tab, a Windows line break read as one.
func cleanText(text string) (string, error) {
	text = strings.TrimSpace(strings.ReplaceAll(text, "\r\n", "\n"))
	return text, checkText(text)
}

func checkText(text string) error {
	if units(text) > MaxTextUnits {
		return fmt.Errorf("a note can be at most %d characters", MaxTextUnits)
	}
	for _, character := range text {
		if character != '\n' && character != '\t' && unicode.IsControl(character) {
			return errors.New("a note can hold only text, line breaks and tabs")
		}
	}
	return nil
}

// cleanTypes checks a full list of mark types and names the new ones.
func cleanTypes(types []MarkType) ([]MarkType, error) {
	if len(types) == 0 {
		return nil, errors.New("keep at least one kind of mark")
	}
	if len(types) > MaxTypes {
		return nil, fmt.Errorf("a project can keep at most %d kinds of mark", MaxTypes)
	}
	cleaned := make([]MarkType, 0, len(types))
	seen := make(map[string]bool, len(types))
	for _, markType := range types {
		markType.Name = strings.TrimSpace(markType.Name)
		if markType.Key == "" {
			markType.Key = "m" + newID()[:12]
		}
		if err := checkType(markType); err != nil {
			return nil, err
		}
		if seen[markType.Key] {
			return nil, errors.New("two kinds of mark have the same key")
		}
		seen[markType.Key] = true
		cleaned = append(cleaned, markType)
	}
	return cleaned, nil
}

func checkType(markType MarkType) error {
	if !typeKeyPattern.MatchString(markType.Key) {
		return errors.New("that is not a kind of mark")
	}
	if markType.Name == "" {
		return errors.New("give each kind of mark a name")
	}
	if units(markType.Name) > MaxTypeNameUnits {
		return fmt.Errorf("a kind of mark's name can be at most %d characters", MaxTypeNameUnits)
	}
	for _, character := range markType.Name {
		if unicode.IsControl(character) {
			return errors.New("a kind of mark's name is one line of text")
		}
	}
	if !contains(Colours, markType.Colour) {
		return errors.New("that colour is not one of the six")
	}
	if !contains(Styles, markType.Style) {
		return errors.New("that line is not one of the six")
	}
	return nil
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

// validFile reports whether a stored file keeps the rules the service enforces; a file that does not is corrupt.
func validFile(file marksFile) bool {
	if len(file.Types) == 0 || len(file.Types) > MaxTypes || len(file.Marks) > MaxMarks {
		return false
	}
	keys := make(map[string]bool, len(file.Types))
	for _, markType := range file.Types {
		if checkType(markType) != nil || strings.TrimSpace(markType.Name) != markType.Name || keys[markType.Key] {
			return false
		}
		keys[markType.Key] = true
	}
	ids := make(map[string]bool, len(file.Marks))
	for _, mark := range file.Marks {
		if mark.ID == "" || ids[mark.ID] || mark.ChapterID == "" || mark.ParagraphID == "" || mark.Start < 0 || mark.End < mark.Start {
			return false
		}
		if !keys[mark.Type] || checkText(mark.Text) != nil || (mark.Status != "" && mark.Status != StatusOpen && mark.Status != StatusResolved) {
			return false
		}
		for _, message := range mark.Thread {
			if checkMessage(message) != nil {
				return false
			}
		}
		ids[mark.ID] = true
	}
	return true
}

func units(text string) int {
	count := 0
	for _, character := range text {
		count += utf16.RuneLen(character)
	}
	return count
}

// slice returns the text between two UTF-16 offsets, or false when either is past the end or between the two halves of a
// surrogate pair.
func slice(text string, start, end int) (string, bool) {
	if start < 0 || end < start {
		return "", false
	}
	from, to := -1, -1
	count := 0
	for index, character := range text {
		if count == start {
			from = index
		}
		if count == end {
			to = index
		}
		count += utf16.RuneLen(character)
	}
	if count == start {
		from = len(text)
	}
	if count == end {
		to = len(text)
	}
	if from < 0 || to < 0 {
		return "", false
	}
	return text[from:to], true
}

// resolve checks one stored mark against the current manuscript.
func resolve(mark Mark, book Book) Resolved {
	result := Resolved{Mark: mark}
	if result.Thread == nil {
		result.Thread = []Message{}
	}
	line, ok := findLine(book, mark.ChapterID, mark.ParagraphID)
	if !ok {
		result.Stale, result.StaleReason = true, StaleParagraphMissing
		return result
	}
	index := line.Index
	result.Paragraph = &index
	quote, fits := slice(line.Text, mark.Start, mark.End)
	switch {
	case !fits:
		result.Stale, result.StaleReason = true, StaleRangeOutOfRange
	case quote != mark.Quote:
		result.Stale, result.StaleReason = true, StaleTextChanged
	}
	return result
}

// answer resolves every mark and puts them in reading order: by line, then range; one whose line is gone goes last.
func answer(file marksFile, book Book) Marks {
	position := make(map[string]int, len(book.Lines))
	for index, line := range book.Lines {
		position[line.ChapterID+"\x00"+line.ID] = index
	}
	at := func(mark Resolved) int {
		if index, ok := position[mark.ChapterID+"\x00"+mark.ParagraphID]; ok {
			return index
		}
		return math.MaxInt
	}
	result := make([]Resolved, 0, len(file.Marks))
	for _, mark := range file.Marks {
		result = append(result, resolve(mark, book))
	}
	sort.SliceStable(result, func(i, j int) bool {
		a, b := result[i], result[j]
		if at(a) != at(b) {
			return at(a) < at(b)
		}
		if a.Start != b.Start {
			return a.Start < b.Start
		}
		if a.End != b.End {
			return a.End < b.End
		}
		if !a.CreatedAt.Equal(b.CreatedAt) {
			return a.CreatedAt.Before(b.CreatedAt)
		}
		return a.ID < b.ID
	})
	types := append([]MarkType{}, file.Types...)
	return Marks{Types: types, Marks: result}
}

func newID() string {
	bytes := make([]byte, 16)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// read reads marks.json; the caller holds the file's lock. A corrupt file, one over the byte cap, or one that breaks a rule
// is kept aside and a fresh one started (the narrator is told by the reporter); one written by a newer app is refused and
// never overwritten. When there is no file yet, the reader's old notes come across as note marks, and migrated says some did:
// a caller that does not otherwise write then writes the file, so they come across only once.
func (s *Service) read() (marksFile, bool, error) {
	file := marksFile{SchemaVersion: SchemaVersion, MigratedNotes: true, Types: DefaultTypes(), Marks: []Mark{}}
	path := File(s.config.Project)
	newer := 0
	var decoded marksFile
	outcome := s.config.Reporter.ReadJSON(path, what, persist.NarratorData, func(raw []byte) error {
		if len(raw) > MaxFileBytes {
			return errors.New("the marks file is too large")
		}
		var candidate marksFile
		if err := json.Unmarshal(raw, &candidate); err != nil {
			return err
		}
		if candidate.SchemaVersion > SchemaVersion {
			newer = candidate.SchemaVersion
			return nil
		}
		if !validFile(candidate) {
			return errors.New("a mark breaks the file's rules")
		}
		decoded = candidate
		return nil
	})
	switch outcome {
	case persist.Missing:
		migrated := s.migrate(file)
		return migrated, len(migrated.Marks) > 0, nil
	case persist.Quarantined, persist.Healed:
		return file, false, nil
	case persist.Unreadable:
		return marksFile{}, false, fmt.Errorf("your %s file could not be read, so nothing was changed", what)
	}
	if err := persist.CheckVersion(newer, SchemaVersion, what); err != nil {
		return marksFile{}, false, err
	}
	if decoded.Marks == nil {
		decoded.Marks = []Mark{}
	}
	return decoded, false, nil
}

// migrate brings the reader's old notes across as note marks: its anchor range when it has one, else the start of its line.
// The note's text is kept as plain text within the cap; a note with no chapter or line is left behind.
func (s *Service) migrate(file marksFile) marksFile {
	if s.config.OldNotes == nil {
		return file
	}
	notes, err := s.config.OldNotes()
	if err != nil || len(notes) == 0 {
		return file
	}
	book := s.manuscript()
	for _, note := range notes {
		if note.ChapterID == "" || note.ParagraphID == "" || len(file.Marks) >= MaxMarks {
			continue
		}
		mark := Mark{ID: newID(), ChapterID: note.ChapterID, ParagraphID: note.ParagraphID, Type: noteType, Text: plain(note.Text), Thread: []Message{}, CreatedAt: note.CreatedAt.UTC()}
		if mark.CreatedAt.IsZero() {
			mark.CreatedAt = s.now().UTC()
		}
		if note.Start != nil && note.End != nil && *note.Start >= 0 && *note.End >= *note.Start {
			mark.Start, mark.End = *note.Start, *note.End
		}
		if line, ok := findLine(book, mark.ChapterID, mark.ParagraphID); ok {
			mark.Quote, _ = slice(line.Text, mark.Start, mark.End)
		}
		file.Marks = append(file.Marks, mark)
	}
	return file
}

// plain makes an old note's text a valid note: control characters other than line breaks and tabs become spaces, and it is cut
// to the cap without splitting a character.
func plain(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	var builder strings.Builder
	count := 0
	for _, character := range text {
		if character != '\n' && character != '\t' && unicode.IsControl(character) {
			character = ' '
		}
		width := utf16.RuneLen(character)
		if width < 0 {
			width = 1
		}
		if count+width > MaxTextUnits {
			break
		}
		count += width
		builder.WriteRune(character)
	}
	return strings.TrimSpace(builder.String())
}

// write replaces marks.json through a temporary file and a rename; the caller holds the file's lock.
func (s *Service) write(file marksFile) error {
	file.SchemaVersion = SchemaVersion
	file.MigratedNotes = true
	path := File(s.config.Project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the project's narration-utils folder: %w", err)
	}
	bytes, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	if len(bytes) > MaxFileBytes {
		return errors.New("the marks file would be too large, so nothing was saved")
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, bytes, 0o600); err != nil {
		return fmt.Errorf("could not write the %s file: %w", what, err)
	}
	if err := os.Rename(temporary, path); err != nil {
		return fmt.Errorf("could not activate the %s file: %w", what, err)
	}
	return nil
}
