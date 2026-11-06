// Package scriptprep is the Script page's preparation record: each chapter's prep state (not started, in progress, prepped), the
// opening and closing credits' among them.
//
// Schema 1 also kept the words the narrator flagged for pronunciation, each with how it is said and its source. A word's
// pronunciation now lives on its Story Bible name (#2595): a schema-1 file still reads its chapters, LegacyWords gives its words to
// the migration that moves them into the Story Bible, Backup keeps the file as script-prep.v1.json (or script-prep.v1-<n>.json beside an earlier cycle's backup), and FinishMigration rewrites it
// as schema 2. Until then a chapter change keeps the words as they were.
//
// The file is narrator data, read through persist: a corrupt one is kept aside and a fresh record starts, one written by a newer
// app is refused and never overwritten. Replacing the manuscript or Clear project data removes it (the manuscript service's
// resetDerived); a re-import without a reset keeps it.
package scriptprep

import (
	"desktop/internal/brand"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf16"

	"desktop/internal/persist"
)

// SchemaVersion is the script-prep.json version this package writes. It reads legacyVersion too.
const SchemaVersion = 2

// legacyVersion is the schema that also kept the flagged words.
const legacyVersion = 1

// what names the file for the narrator in a persist notice or an error.
const what = "script prep"

// The limits. Text is counted in UTF-16 code units, the unit the UI's maxLength and its schema count.
const (
	// MaxWordUnits is the longest flagged range a schema-1 file kept.
	MaxWordUnits = 80
	// MaxSayUnits is the longest say-value a schema-1 file kept.
	MaxSayUnits = 200
	// MaxFlags is the most flags a schema-1 file kept.
	MaxFlags = 10000
	// MaxChapters is the most chapter prep states a project keeps.
	MaxChapters = 5000
	// MaxFileBytes is the largest script-prep.json that is read or written.
	MaxFileBytes = 4 << 20
)

// A chapter's prep state, the Studio Next mock's PrepState.
const (
	PrepNone     = "none"
	PrepProgress = "progress"
	PrepPrepped  = "prepped"
)

// The opening and closing credits are no manuscript chapter, but the Script page lists them with a prep state, as the mock does: their
// state is kept under these two ids beside the chapters', and listed after them once set.
const (
	CreditsOpening = "credits:opening"
	CreditsClosing = "credits:closing"
)

func isCredits(id string) bool { return id == CreditsOpening || id == CreditsClosing }

var sourcePattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,64}$`)

// File is where a project's script prep is kept.
func File(project string) string {
	return filepath.Join(project, brand.ProjectFolder, "script-prep.json")
}

// BackupFile is the schema-1 file as it was before the migration moved its words, written once and never overwritten. A schema-1
// file with other bytes, from a later cycle, is backed up beside it as script-prep.v1-2.json, script-prep.v1-3.json and so on.
func BackupFile(project string) string {
	return backupName(project, 1)
}

// backupName is the nth backup's path: BackupFile for the first, script-prep.v1-<n>.json after it.
func backupName(project string, n int) string {
	name := "script-prep.v1.json"
	if n > 1 {
		name = "script-prep.v1-" + strconv.Itoa(n) + ".json"
	}
	return filepath.Join(project, brand.ProjectFolder, name)
}

var backupPattern = regexp.MustCompile(`^script-prep\.v1(-[1-9][0-9]*)?\.json$`)

// BackupFiles is every backup of a schema-1 file the project has: script-prep.v1.json and each script-prep.v1-<n>.json.
func BackupFiles(project string) ([]string, error) {
	folder := filepath.Join(project, brand.ProjectFolder)
	entries, err := os.ReadDir(folder)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var backups []string
	for _, entry := range entries {
		if backupPattern.MatchString(entry.Name()) {
			backups = append(backups, filepath.Join(folder, entry.Name()))
		}
	}
	return backups, nil
}

// legacyFlag is one flagged range as a schema-1 file stored it. Start and End are UTF-16 code units into the paragraph's text,
// Start before End; Quote is the line's own text for the range when it was flagged; Word is its key, Quote lower-cased.
type legacyFlag struct {
	ID          string    `json:"id"`
	ChapterID   string    `json:"chapterId"`
	ParagraphID string    `json:"paragraphId"`
	Start       int       `json:"start"`
	End         int       `json:"end"`
	Quote       string    `json:"quote"`
	Word        string    `json:"word"`
	CreatedAt   time.Time `json:"createdAt"`
}

// legacySay is how a schema-1 file kept a word's value and the id of the source it came from.
type legacySay struct {
	Say    string `json:"say"`
	Source string `json:"source"`
}

// LegacyFlag is one place a schema-1 file flagged a word.
type LegacyFlag struct {
	ChapterID   string
	ParagraphID string
	Start       int
	End         int
	Quote       string
}

// LegacyWord is one word a schema-1 file kept: its lower-cased key, its say-value and source (both empty when none was set), and
// its flags in reading order.
type LegacyWord struct {
	Word   string
	Say    string
	Source string
	Flags  []LegacyFlag
}

// Chapter is one chapter's prep state.
type Chapter struct {
	ChapterID string `json:"chapterId"`
	State     string `json:"state"`
}

// ScriptPrep is what a list answers: every manuscript chapter in order with its state (none when never set), then the credits
// once set.
type ScriptPrep struct {
	Chapters []Chapter `json:"chapters"`
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
	// Manuscript reads the current manuscript; an error reads as an empty one.
	Manuscript func() (Book, error)
	// Reporter tells the narrator about a file that cannot be read; nil only logs nothing.
	Reporter *persist.Reporter
}

// prepFile is the file. Flags and Says are a schema-1 file's words, kept as read until FinishMigration drops them; a schema-2
// file has neither.
type prepFile struct {
	SchemaVersion int                  `json:"schemaVersion"`
	Chapters      map[string]string    `json:"chapters"`
	Flags         []legacyFlag         `json:"flags,omitempty"`
	Says          map[string]legacySay `json:"says,omitempty"`
}

// legacy reports whether the file still holds a schema-1 file's words.
func (file prepFile) legacy() bool { return len(file.Flags) > 0 || len(file.Says) > 0 }

// Service reads and writes a project's script prep. It holds no state of its own, so the host builds one per call; the
// read-modify-write of one file is serialised by fileLock.
type Service struct {
	config Config
}

// New returns the service for config.
func New(config Config) *Service {
	return &Service{config: config}
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

func emptyPrep() ScriptPrep {
	return ScriptPrep{Chapters: []Chapter{}}
}

// List returns every chapter's prep state.
func (s *Service) List() (ScriptPrep, error) {
	if s.config.Project == "" {
		return emptyPrep(), nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return emptyPrep(), err
	}
	return answer(file, s.manuscript()), nil
}

// SetChapter stores one chapter's prep state; none is the state of a chapter never set.
func (s *Service) SetChapter(chapterID, state string) (Chapter, error) {
	if s.config.Project == "" {
		return Chapter{}, errors.New("save the project first")
	}
	if state != PrepNone && state != PrepProgress && state != PrepPrepped {
		return Chapter{}, errors.New("that is not a prep state")
	}
	if !isCredits(chapterID) && !hasChapter(s.manuscript(), chapterID) {
		return Chapter{}, errors.New("that chapter is not in the manuscript")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return Chapter{}, err
	}
	if state == PrepNone {
		delete(file.Chapters, chapterID)
	} else {
		if _, ok := file.Chapters[chapterID]; !ok && len(file.Chapters) >= MaxChapters {
			return Chapter{}, fmt.Errorf("a project can keep at most %d chapter prep states", MaxChapters)
		}
		file.Chapters[chapterID] = state
	}
	if err := s.write(file); err != nil {
		return Chapter{}, err
	}
	return Chapter{ChapterID: chapterID, State: state}, nil
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

// wordKey is a word's key: its text trimmed and lower-cased.
func wordKey(text string) string {
	return strings.ToLower(strings.TrimSpace(text))
}

// checkSay checks a schema-1 say-value: one line of plain text of at most MaxSayUnits.
func checkSay(say string) error {
	if units(say) > MaxSayUnits {
		return fmt.Errorf("how a word is said can be at most %d characters", MaxSayUnits)
	}
	for _, character := range say {
		if unicode.IsControl(character) {
			return errors.New("how a word is said is one line of text")
		}
	}
	return nil
}

// validFile reports whether a stored file keeps the rules the service enforced when it was written; a file that does not is
// corrupt. A schema-2 file has no words.
func validFile(file prepFile) bool {
	if file.SchemaVersion != legacyVersion && file.legacy() {
		return false
	}
	if len(file.Chapters) > MaxChapters || len(file.Flags) > MaxFlags {
		return false
	}
	for chapterID, state := range file.Chapters {
		if chapterID == "" || (state != PrepProgress && state != PrepPrepped) {
			return false
		}
	}
	ids := make(map[string]bool, len(file.Flags))
	words := make(map[string]bool, len(file.Flags))
	for _, flag := range file.Flags {
		if flag.ID == "" || ids[flag.ID] || flag.ChapterID == "" || flag.ParagraphID == "" || flag.Start < 0 || flag.End <= flag.Start {
			return false
		}
		if flag.Word == "" || flag.Word != wordKey(flag.Quote) || units(flag.Quote) > MaxWordUnits {
			return false
		}
		ids[flag.ID] = true
		words[flag.Word] = true
	}
	for key, say := range file.Says {
		if !words[key] || say.Say == "" || strings.TrimSpace(say.Say) != say.Say || checkSay(say.Say) != nil || !sourcePattern.MatchString(say.Source) {
			return false
		}
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

// answer lists every manuscript chapter with its state, then the credits once set.
func answer(file prepFile, book Book) ScriptPrep {
	result := emptyPrep()
	for _, chapterID := range book.Chapters {
		state := file.Chapters[chapterID]
		if state == "" {
			state = PrepNone
		}
		result.Chapters = append(result.Chapters, Chapter{ChapterID: chapterID, State: state})
	}
	for _, id := range []string{CreditsOpening, CreditsClosing} {
		if state := file.Chapters[id]; state != "" {
			result.Chapters = append(result.Chapters, Chapter{ChapterID: id, State: state})
		}
	}
	return result
}

// read reads script-prep.json; the caller holds the file's lock. A corrupt file, one over the byte cap, or one that breaks a
// rule is kept aside and a fresh one started (the narrator is told by the reporter); one written by a newer app is refused and
// never overwritten.
func (s *Service) read() (prepFile, error) {
	file := prepFile{SchemaVersion: SchemaVersion, Chapters: map[string]string{}}
	path := File(s.config.Project)
	newer := 0
	var decoded prepFile
	outcome := s.config.Reporter.ReadJSON(path, what, persist.NarratorData, func(raw []byte) error {
		if len(raw) > MaxFileBytes {
			return errors.New("the script prep file is too large")
		}
		var candidate prepFile
		if err := json.Unmarshal(raw, &candidate); err != nil {
			return err
		}
		if candidate.SchemaVersion > SchemaVersion {
			newer = candidate.SchemaVersion
			return nil
		}
		if !validFile(candidate) {
			return errors.New("a flag or state breaks the file's rules")
		}
		decoded = candidate
		return nil
	})
	switch outcome {
	case persist.Missing, persist.Quarantined, persist.Healed:
		return file, nil
	case persist.Unreadable:
		return prepFile{}, fmt.Errorf("your %s file could not be read, so nothing was changed", what)
	}
	if err := persist.CheckVersion(newer, SchemaVersion, what); err != nil {
		return prepFile{}, err
	}
	if decoded.Chapters == nil {
		decoded.Chapters = map[string]string{}
	}
	return decoded, nil
}

// write replaces script-prep.json through a temporary file and a rename; the caller holds the file's lock. A file that still holds
// a schema-1 file's words is written as schema 1, so they wait for the migration.
func (s *Service) write(file prepFile) error {
	file.SchemaVersion = SchemaVersion
	if file.legacy() {
		file.SchemaVersion = legacyVersion
	}
	path := File(s.config.Project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the app's folder in the project: %w", err)
	}
	bytes, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	if len(bytes) > MaxFileBytes {
		return errors.New("the script prep file would be too large, so nothing was saved")
	}
	if err := persist.WriteFile(path, bytes, 0o600); err != nil {
		return fmt.Errorf("could not write the %s file: %w", what, err)
	}
	return nil
}
