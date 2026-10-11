// Package scriptprep is the Script page's preparation record: each chapter's prep state (not started, in progress, prepped) and
// the words the narrator flagged for pronunciation, each with how it is said and the id of the source the value came from (ADR
// 0792). A flag is a range of one paragraph; the word is the manuscript's own text for the range, lower-cased as its key, so the
// same word flagged in two places is one word with two flags. A word's say-value is kept while any of its flags remains and is
// dropped with the last one. Every flag is checked against the current text on every read: one whose line is gone, whose range
// no longer fits or whose words changed is reported stale, never moved (ADR 0849).
//
// The file is narrator data, read through persist: a corrupt one is kept aside and a fresh record starts, one written by a newer
// app is refused and never overwritten. Replacing the manuscript or Clear project data removes it (the manuscript service's
// resetDerived); a re-import without a reset keeps it.
package scriptprep

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

// SchemaVersion is the only script-prep.json version this package reads or writes.
const SchemaVersion = 1

// what names the file for the narrator in a persist notice or an error.
const what = "script prep"

// The limits. Text is counted in UTF-16 code units, the unit the UI's maxLength and its schema count.
const (
	// MaxWordUnits is the longest flagged range, the pronunciation sources' own word limit.
	MaxWordUnits = 80
	// MaxSayUnits is the longest say-value.
	MaxSayUnits = 200
	// MaxFlags is the most flags a project keeps.
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

// A word's pronunciation status, the mock's pronStatus: Set, Not set, Not flagged.
const (
	StatusSet        = "set"
	StatusNotSet     = "not_set"
	StatusNotFlagged = "not_flagged"
)

// ManualSource is the source id of a say-value the narrator typed (ADR 0792). A say-value saved with no source is one.
const ManualSource = "manual"

// Why a flag is stale.
const (
	// StaleParagraphMissing means the line the flag was placed on is no longer in its chapter.
	StaleParagraphMissing = "paragraph_missing"
	// StaleRangeOutOfRange means the line is there but the range runs past its end or splits a surrogate pair.
	StaleRangeOutOfRange = "range_out_of_range"
	// StaleTextChanged means the range fits the line but its words are no longer the quoted ones.
	StaleTextChanged = "text_changed"
)

var sourcePattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,64}$`)

// File is where a project's script prep is kept.
func File(project string) string {
	return filepath.Join(project, "narration-utils", "script-prep.json")
}

// Flag is one flagged range as stored. Start and End are UTF-16 code units into the paragraph's text (a JS string index, the
// page's own unit), Start before End; Quote is the line's own text for the range when it was flagged; Word is its key.
type Flag struct {
	ID          string    `json:"id"`
	ChapterID   string    `json:"chapterId"`
	ParagraphID string    `json:"paragraphId"`
	Start       int       `json:"start"`
	End         int       `json:"end"`
	Quote       string    `json:"quote"`
	Word        string    `json:"word"`
	CreatedAt   time.Time `json:"createdAt"`
}

// Say is how a word is said and the id of the source the value came from.
type Say struct {
	Say    string `json:"say"`
	Source string `json:"source"`
}

// ResolvedFlag is a flag as the UI gets it: where its line is in the current manuscript, or why it is stale.
type ResolvedFlag struct {
	ID          string    `json:"id"`
	ChapterID   string    `json:"chapterId"`
	ParagraphID string    `json:"paragraphId"`
	Start       int       `json:"start"`
	End         int       `json:"end"`
	Quote       string    `json:"quote"`
	CreatedAt   time.Time `json:"createdAt"`
	// Paragraph is the line's index in the manuscript, or nil when the line is gone.
	Paragraph *int `json:"paragraph"`
	// Stale is true when the line is gone, the range no longer fits it or its words changed. The range is then the stored one.
	Stale       bool   `json:"stale"`
	StaleReason string `json:"staleReason,omitempty"`
}

// Word is one flagged word: its key, its say-value and source (both empty while nothing is set), its status, and its flags in
// reading order. A word whose last flag was just removed comes back once with no flags, no value and not_flagged.
type Word struct {
	Word   string         `json:"word"`
	Say    string         `json:"say"`
	Source string         `json:"source"`
	Status string         `json:"status"`
	Flags  []ResolvedFlag `json:"flags"`
}

// Chapter is one chapter's prep state.
type Chapter struct {
	ChapterID string `json:"chapterId"`
	State     string `json:"state"`
}

// ScriptPrep is what a list answers: every manuscript chapter in order with its state (none when never set), and every flagged
// word in reading order of its first flag.
type ScriptPrep struct {
	Chapters []Chapter `json:"chapters"`
	Words    []Word    `json:"words"`
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
	// Manuscript reads the current manuscript; an error reads as an empty one, so every flag shows stale.
	Manuscript func() (Book, error)
	// Sources lists the registered pronunciation source ids a say-value may name; nil allows only ManualSource.
	Sources func() []string
	// Reporter tells the narrator about a file that cannot be read (ADR 0069); nil only logs nothing.
	Reporter *persist.Reporter
}

type prepFile struct {
	SchemaVersion int               `json:"schemaVersion"`
	Chapters      map[string]string `json:"chapters"`
	Flags         []Flag            `json:"flags"`
	Says          map[string]Say    `json:"says"`
}

// Service reads and writes a project's script prep. It holds no state of its own, so the host builds one per call; the
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

func emptyPrep() ScriptPrep {
	return ScriptPrep{Chapters: []Chapter{}, Words: []Word{}}
}

// List returns every chapter's prep state and every flagged word, each flag checked against the current manuscript.
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
	if !hasChapter(s.manuscript(), chapterID) {
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

// Flag flags a range of one line for pronunciation: start and end are UTF-16 units into the line's current text, start before
// end. The word is the line's own text for the range, lower-cased as its key; the same range flagged again is the one flag.
func (s *Service) Flag(chapterID, paragraphID string, start, end int) (Word, error) {
	if s.config.Project == "" {
		return Word{}, errors.New("save the project first")
	}
	book := s.manuscript()
	if !hasChapter(book, chapterID) {
		return Word{}, errors.New("that chapter is not in the manuscript")
	}
	line, ok := findLine(book, chapterID, paragraphID)
	if !ok {
		return Word{}, errors.New("that line is not in this chapter")
	}
	if start >= end {
		return Word{}, errors.New("choose a word to flag first")
	}
	quote, ok := slice(line.Text, start, end)
	if !ok {
		return Word{}, errors.New("those words are not in the line")
	}
	if units(quote) > MaxWordUnits {
		return Word{}, fmt.Errorf("a flagged word can be at most %d characters", MaxWordUnits)
	}
	key := wordKey(quote)
	if key == "" {
		return Word{}, errors.New("choose a word to flag first")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return Word{}, err
	}
	for _, flag := range file.Flags {
		if flag.ChapterID == chapterID && flag.ParagraphID == paragraphID && flag.Start == start && flag.End == end && flag.Word == key {
			return wordOf(file, key, book), nil
		}
	}
	if len(file.Flags) >= MaxFlags {
		return Word{}, fmt.Errorf("a project can keep at most %d flagged words", MaxFlags)
	}
	file.Flags = append(file.Flags, Flag{ID: newID(), ChapterID: chapterID, ParagraphID: paragraphID, Start: start, End: end, Quote: quote, Word: key, CreatedAt: s.now().UTC()})
	if err := s.write(file); err != nil {
		return Word{}, err
	}
	return wordOf(file, key, book), nil
}

// Say stores how a flagged word is said and the source the value came from: a registered source id, or empty for one the
// narrator typed (stored as ManualSource). An empty say clears the value and keeps the word flagged.
func (s *Service) Say(word, say, source string) (Word, error) {
	if s.config.Project == "" {
		return Word{}, errors.New("save the project first")
	}
	key := wordKey(word)
	say = strings.TrimSpace(say)
	if err := checkSay(say); err != nil {
		return Word{}, err
	}
	switch {
	case say == "":
		source = ""
	case source == "":
		source = ManualSource
	case !s.knownSource(source):
		return Word{}, errors.New("that pronunciation source is not one of yours")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return Word{}, err
	}
	if !flagged(file, key) {
		return Word{}, errors.New("flag the word in the text first")
	}
	if say == "" {
		delete(file.Says, key)
	} else {
		file.Says[key] = Say{Say: say, Source: source}
	}
	if err := s.write(file); err != nil {
		return Word{}, err
	}
	return wordOf(file, key, s.manuscript()), nil
}

// Unflag removes one flag and returns its word. The word's say-value is kept while any of its flags remains and dropped with
// the last, and the word then comes back not_flagged.
func (s *Service) Unflag(flagID string) (Word, error) {
	if s.config.Project == "" {
		return Word{}, errors.New("save the project first")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return Word{}, err
	}
	key := ""
	kept := make([]Flag, 0, len(file.Flags))
	for _, flag := range file.Flags {
		if flag.ID == flagID {
			key = flag.Word
			continue
		}
		kept = append(kept, flag)
	}
	if key == "" {
		return Word{}, errors.New("that flag is no longer there")
	}
	file.Flags = kept
	if !flagged(file, key) {
		delete(file.Says, key)
	}
	if err := s.write(file); err != nil {
		return Word{}, err
	}
	return wordOf(file, key, s.manuscript()), nil
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

func (s *Service) knownSource(source string) bool {
	if !sourcePattern.MatchString(source) {
		return false
	}
	if source == ManualSource {
		return true
	}
	if s.config.Sources == nil {
		return false
	}
	for _, id := range s.config.Sources() {
		if id == source {
			return true
		}
	}
	return false
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

func flagged(file prepFile, key string) bool {
	for _, flag := range file.Flags {
		if flag.Word == key {
			return true
		}
	}
	return false
}

// wordKey is a word's key: its text trimmed and lower-cased.
func wordKey(text string) string {
	return strings.ToLower(strings.TrimSpace(text))
}

// checkSay checks a say-value: one line of plain text of at most MaxSayUnits.
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

// validFile reports whether a stored file keeps the rules the service enforces; a file that does not is corrupt.
func validFile(file prepFile) bool {
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

// resolve checks one stored flag against the current manuscript.
func resolve(flag Flag, book Book) ResolvedFlag {
	result := ResolvedFlag{ID: flag.ID, ChapterID: flag.ChapterID, ParagraphID: flag.ParagraphID, Start: flag.Start, End: flag.End, Quote: flag.Quote, CreatedAt: flag.CreatedAt}
	line, ok := findLine(book, flag.ChapterID, flag.ParagraphID)
	if !ok {
		result.Stale, result.StaleReason = true, StaleParagraphMissing
		return result
	}
	index := line.Index
	result.Paragraph = &index
	quote, fits := slice(line.Text, flag.Start, flag.End)
	switch {
	case !fits:
		result.Stale, result.StaleReason = true, StaleRangeOutOfRange
	case quote != flag.Quote:
		result.Stale, result.StaleReason = true, StaleTextChanged
	}
	return result
}

// readingOrder sorts resolved flags by line, then range; one whose line is gone goes last.
func readingOrder(flags []ResolvedFlag, book Book) {
	position := make(map[string]int, len(book.Lines))
	for index, line := range book.Lines {
		position[line.ChapterID+"\x00"+line.ID] = index
	}
	at := func(flag ResolvedFlag) int {
		if index, ok := position[flag.ChapterID+"\x00"+flag.ParagraphID]; ok {
			return index
		}
		return math.MaxInt
	}
	sort.SliceStable(flags, func(i, j int) bool {
		a, b := flags[i], flags[j]
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
}

// wordOf answers one word with its status and its flags in reading order.
func wordOf(file prepFile, key string, book Book) Word {
	word := Word{Word: key, Flags: []ResolvedFlag{}}
	for _, flag := range file.Flags {
		if flag.Word == key {
			word.Flags = append(word.Flags, resolve(flag, book))
		}
	}
	readingOrder(word.Flags, book)
	word.Status = StatusNotFlagged
	if len(word.Flags) > 0 {
		say := file.Says[key]
		word.Say, word.Source, word.Status = say.Say, say.Source, StatusNotSet
		if say.Say != "" {
			word.Status = StatusSet
		}
	}
	return word
}

// answer lists every manuscript chapter with its state and every flagged word, in reading order of its first flag.
func answer(file prepFile, book Book) ScriptPrep {
	result := emptyPrep()
	for _, chapterID := range book.Chapters {
		state := file.Chapters[chapterID]
		if state == "" {
			state = PrepNone
		}
		result.Chapters = append(result.Chapters, Chapter{ChapterID: chapterID, State: state})
	}
	all := make([]ResolvedFlag, 0, len(file.Flags))
	wordByID := make(map[string]string, len(file.Flags))
	for _, flag := range file.Flags {
		all = append(all, resolve(flag, book))
		wordByID[flag.ID] = flag.Word
	}
	readingOrder(all, book)
	seen := map[string]bool{}
	for _, flag := range all {
		key := wordByID[flag.ID]
		if seen[key] {
			continue
		}
		seen[key] = true
		result.Words = append(result.Words, wordOf(file, key, book))
	}
	return result
}

func newID() string {
	bytes := make([]byte, 16)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// read reads script-prep.json; the caller holds the file's lock. A corrupt file, one over the byte cap, or one that breaks a
// rule is kept aside and a fresh one started (the narrator is told by the reporter); one written by a newer app is refused and
// never overwritten.
func (s *Service) read() (prepFile, error) {
	file := prepFile{SchemaVersion: SchemaVersion, Chapters: map[string]string{}, Flags: []Flag{}, Says: map[string]Say{}}
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
	if decoded.Flags == nil {
		decoded.Flags = []Flag{}
	}
	if decoded.Says == nil {
		decoded.Says = map[string]Say{}
	}
	return decoded, nil
}

// write replaces script-prep.json through a temporary file and a rename; the caller holds the file's lock.
func (s *Service) write(file prepFile) error {
	file.SchemaVersion = SchemaVersion
	path := File(s.config.Project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the project's narration-utils folder: %w", err)
	}
	bytes, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	if len(bytes) > MaxFileBytes {
		return errors.New("the script prep file would be too large, so nothing was saved")
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
