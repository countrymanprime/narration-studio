// Package bookmarks is the narrator's bookmarks (ADR 0820): a spot in the manuscript, a paragraph and a character offset in
// its text, with an optional short label and note, kept in the project's own file and checked against the current text on
// every read. A bookmark whose line is gone or whose offset no longer fits is reported stale, never moved to a guess.
//
// The file is narrator data, read through persist: a corrupt one is kept aside and an empty list starts, one written by a
// newer app is refused and never overwritten. Replacing the manuscript or Clear project data removes it (the manuscript
// service's resetDerived); a re-import without a reset keeps it.
package bookmarks

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf16"

	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// SchemaVersion is the only bookmarks.json version this package reads or writes.
const SchemaVersion = 1

// what names the file for the narrator in a persist notice or an error.
const what = "bookmarks"

// The limits on a bookmark's text, in UTF-16 code units: the unit the UI's maxLength and its schema count.
const (
	MaxLabelUnits = 60
	MaxNoteUnits  = 500
)

// Why a bookmark is stale.
const (
	// StaleParagraphMissing means the line the bookmark was placed on is no longer in its chapter.
	StaleParagraphMissing = "paragraph_missing"
	// StaleOffsetOutOfRange means the line is there but the offset is past its end or between the halves of a surrogate pair.
	StaleOffsetOutOfRange = "offset_out_of_range"
)

// File is where a project's bookmarks are kept.
func File(project string) string {
	return filepath.Join(project, "narration-utils", "bookmarks.json")
}

// Bookmark is one bookmark as stored. Offset is in UTF-16 code units into the paragraph's text (a JS string index, the
// reader's own unit); a chapter bookmark is a spot at the start of the chapter's first line.
type Bookmark struct {
	ID          string    `json:"id"`
	ChapterID   string    `json:"chapterId"`
	ParagraphID string    `json:"paragraphId"`
	Offset      int       `json:"offset"`
	Label       string    `json:"label"`
	Note        string    `json:"note"`
	CreatedAt   time.Time `json:"createdAt"`
}

// Resolved is a bookmark as the UI gets it: where its line is in the current manuscript, or why it is stale.
type Resolved struct {
	Bookmark
	// Paragraph is the line's index in the manuscript, or nil when the line is gone.
	Paragraph *int `json:"paragraph"`
	// Stale is true when the line is gone or the offset no longer fits it. Offset is then the stored one.
	Stale       bool   `json:"stale"`
	StaleReason string `json:"staleReason,omitempty"`
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

// Config is what a Service needs.
type Config struct {
	// Project is the project folder; empty means no project is open, and nothing is saved.
	Project string
	// Manuscript reads the current manuscript; an error reads as an empty one, so every bookmark shows stale.
	Manuscript func() (Book, error)
	// Reporter tells the narrator about a file that cannot be read (ADR 0069); nil only logs nothing.
	Reporter *persist.Reporter
}

type bookmarksFile struct {
	SchemaVersion int        `json:"schemaVersion"`
	Bookmarks     []Bookmark `json:"bookmarks"`
}

// Service reads and writes a project's bookmarks. It holds no state of its own, so the host builds one per call; the
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

// List returns every bookmark in reading order, each checked against the current manuscript.
func (s *Service) List() ([]Resolved, error) {
	if s.config.Project == "" {
		return []Resolved{}, nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return []Resolved{}, err
	}
	return resolveAll(file.Bookmarks, s.manuscript()), nil
}

// Add bookmarks a spot: offset is UTF-16 units into the line's current text, from 0 to its length. A spot that already has a
// bookmark is not marked twice; that bookmark is returned.
func (s *Service) Add(chapterID, paragraphID string, offset int) (Resolved, error) {
	if s.config.Project == "" {
		return Resolved{}, errors.New("save the project first")
	}
	book := s.manuscript()
	if !hasChapter(book, chapterID) {
		return Resolved{}, errors.New("that chapter is not in the manuscript")
	}
	line, ok := findLine(book, chapterID, paragraphID)
	if !ok {
		return Resolved{}, errors.New("that line is not in this chapter")
	}
	if !fits(line.Text, offset) {
		return Resolved{}, errors.New("that place is not in the line")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return Resolved{}, err
	}
	for _, existing := range file.Bookmarks {
		if existing.ChapterID == chapterID && existing.ParagraphID == paragraphID && existing.Offset == offset {
			return resolve(existing, book), nil
		}
	}
	bookmark := Bookmark{ID: newID(), ChapterID: chapterID, ParagraphID: paragraphID, Offset: offset, CreatedAt: s.now().UTC()}
	file.Bookmarks = append(file.Bookmarks, bookmark)
	if err := s.write(file); err != nil {
		return Resolved{}, err
	}
	return resolve(bookmark, book), nil
}

// Update replaces a bookmark's label and note. Both are trimmed plain text; a label is one line, a note may hold line breaks
// and tabs. A stale bookmark can be updated.
func (s *Service) Update(id, label, note string) (Resolved, error) {
	if s.config.Project == "" {
		return Resolved{}, errors.New("save the project first")
	}
	label, note, err := cleanText(label, note)
	if err != nil {
		return Resolved{}, err
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return Resolved{}, err
	}
	for index := range file.Bookmarks {
		if file.Bookmarks[index].ID != id {
			continue
		}
		file.Bookmarks[index].Label, file.Bookmarks[index].Note = label, note
		if err := s.write(file); err != nil {
			return Resolved{}, err
		}
		return resolve(file.Bookmarks[index], s.manuscript()), nil
	}
	return Resolved{}, errors.New("that bookmark is no longer there")
}

// Remove deletes a bookmark by id and returns the bookmarks left, in reading order. An id that is not there is not an error.
func (s *Service) Remove(id string) ([]Resolved, error) {
	if s.config.Project == "" {
		return []Resolved{}, errors.New("save the project first")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return []Resolved{}, err
	}
	kept := make([]Bookmark, 0, len(file.Bookmarks))
	for _, bookmark := range file.Bookmarks {
		if bookmark.ID != id {
			kept = append(kept, bookmark)
		}
	}
	if len(kept) != len(file.Bookmarks) {
		file.Bookmarks = kept
		if err := s.write(file); err != nil {
			return []Resolved{}, err
		}
	}
	return resolveAll(kept, s.manuscript()), nil
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

// cleanText trims a label and a note and checks them against the limits: plain text, no control characters (a note may hold
// line breaks and tabs, with a Windows line break read as one).
func cleanText(label, note string) (string, string, error) {
	label = strings.TrimSpace(label)
	note = strings.TrimSpace(strings.ReplaceAll(note, "\r\n", "\n"))
	if err := checkText(label, "label", MaxLabelUnits, false); err != nil {
		return "", "", err
	}
	if err := checkText(note, "note", MaxNoteUnits, true); err != nil {
		return "", "", err
	}
	return label, note, nil
}

func checkText(text, name string, limit int, multiline bool) error {
	if units(text) > limit {
		return fmt.Errorf("a bookmark's %s can be at most %d characters", name, limit)
	}
	for _, character := range text {
		if multiline && (character == '\n' || character == '\t') {
			continue
		}
		if unicode.IsControl(character) {
			if multiline {
				return fmt.Errorf("a bookmark's %s can hold only text, line breaks and tabs", name)
			}
			return fmt.Errorf("a bookmark's %s is one line of text", name)
		}
	}
	return nil
}

// valid reports whether a stored bookmark keeps the rules Add and Update enforce; a file with one that does not is corrupt.
func valid(bookmark Bookmark) bool {
	if bookmark.ID == "" || bookmark.ChapterID == "" || bookmark.ParagraphID == "" || bookmark.Offset < 0 {
		return false
	}
	return checkText(bookmark.Label, "label", MaxLabelUnits, false) == nil && checkText(bookmark.Note, "note", MaxNoteUnits, true) == nil
}

func units(text string) int {
	count := 0
	for _, character := range text {
		count += utf16.RuneLen(character)
	}
	return count
}

// fits reports whether a UTF-16 offset is a place in the text: from 0 to its length, never between the two halves of a
// surrogate pair.
func fits(text string, offset int) bool {
	if offset < 0 {
		return false
	}
	count := 0
	for _, character := range text {
		if count == offset {
			return true
		}
		if count > offset {
			return false
		}
		count += utf16.RuneLen(character)
	}
	return count == offset
}

// resolve checks one stored bookmark against the current manuscript.
func resolve(bookmark Bookmark, book Book) Resolved {
	result := Resolved{Bookmark: bookmark}
	line, ok := findLine(book, bookmark.ChapterID, bookmark.ParagraphID)
	if !ok {
		result.Stale, result.StaleReason = true, StaleParagraphMissing
		return result
	}
	index := line.Index
	result.Paragraph = &index
	if !fits(line.Text, bookmark.Offset) {
		result.Stale, result.StaleReason = true, StaleOffsetOutOfRange
	}
	return result
}

// resolveAll resolves every bookmark and puts them in reading order: by line, then offset; one whose line is gone goes last.
func resolveAll(stored []Bookmark, book Book) []Resolved {
	position := make(map[string]int, len(book.Lines))
	for index, line := range book.Lines {
		position[line.ChapterID+"\x00"+line.ID] = index
	}
	at := func(bookmark Resolved) int {
		if index, ok := position[bookmark.ChapterID+"\x00"+bookmark.ParagraphID]; ok {
			return index
		}
		return math.MaxInt
	}
	result := make([]Resolved, 0, len(stored))
	for _, bookmark := range stored {
		result = append(result, resolve(bookmark, book))
	}
	sort.SliceStable(result, func(i, j int) bool {
		a, b := result[i], result[j]
		if at(a) != at(b) {
			return at(a) < at(b)
		}
		if a.Offset != b.Offset {
			return a.Offset < b.Offset
		}
		if !a.CreatedAt.Equal(b.CreatedAt) {
			return a.CreatedAt.Before(b.CreatedAt)
		}
		return a.ID < b.ID
	})
	return result
}

func newID() string {
	bytes := make([]byte, 16)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// read reads bookmarks.json; the caller holds the file's lock. A corrupt file, or one with a bookmark that breaks a rule, is
// kept aside and a fresh one started (the narrator is told by the reporter); one written by a newer app is refused and never
// overwritten.
func (s *Service) read() (bookmarksFile, error) {
	file := bookmarksFile{SchemaVersion: SchemaVersion, Bookmarks: []Bookmark{}}
	path := File(s.config.Project)
	newer := 0
	var decoded bookmarksFile
	outcome := s.config.Reporter.ReadJSON(path, what, persist.NarratorData, func(raw []byte) error {
		var candidate bookmarksFile
		if err := json.Unmarshal(raw, &candidate); err != nil {
			return err
		}
		if candidate.SchemaVersion > SchemaVersion {
			newer = candidate.SchemaVersion
			return nil
		}
		seen := make(map[string]bool, len(candidate.Bookmarks))
		for _, bookmark := range candidate.Bookmarks {
			if !valid(bookmark) || seen[bookmark.ID] {
				return errors.New("a bookmark breaks the file's rules")
			}
			seen[bookmark.ID] = true
		}
		decoded = candidate
		return nil
	})
	switch outcome {
	case persist.Missing, persist.Quarantined, persist.Healed:
		return file, nil
	case persist.Unreadable:
		return bookmarksFile{}, fmt.Errorf("your %s file could not be read, so nothing was changed", what)
	}
	if err := persist.CheckVersion(newer, SchemaVersion, what); err != nil {
		return bookmarksFile{}, err
	}
	if decoded.Bookmarks != nil {
		file.Bookmarks = decoded.Bookmarks
	}
	return file, nil
}

// write replaces bookmarks.json through a temporary file and a rename; the caller holds the file's lock.
func (s *Service) write(file bookmarksFile) error {
	file.SchemaVersion = SchemaVersion
	path := File(s.config.Project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the project's narration-utils folder: %w", err)
	}
	bytes, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
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
