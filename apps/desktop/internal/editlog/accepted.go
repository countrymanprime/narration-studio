package editlog

import (
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// AcceptedVersion is the only accepted.json version this package reads or writes.
const AcceptedVersion = 1

// acceptedWhat names the file for the narrator in a persist notice or an error.
const acceptedWhat = "accepted words"

// MaxKeys is the most words one Accept or Unaccept names: more than any chapter's flags.
const MaxKeys = 5000

// Why an accepted word is stale.
const (
	// StaleParagraphMissing means the word's line is no longer in its chapter.
	StaleParagraphMissing = "paragraph_missing"
	// StaleWordMissing means the line is there but has fewer words than the ordinal.
	StaleWordMissing = "word_missing"
	// StaleTextChanged means the word at the ordinal is not the word that was accepted.
	StaleTextChanged = "text_changed"
)

// AcceptedFile is where a project's accepted words are kept.
func AcceptedFile(project string) string {
	return filepath.Join(Dir(project), "accepted.json")
}

// AcceptedWord is one accepted word as stored: a flagged word the narrator said that way on purpose ("It is right", "Keep
// this addition"), so it is no longer flagged. Text is the word as it was when accepted.
type AcceptedWord struct {
	ChapterID   string    `json:"chapterId"`
	ParagraphID string    `json:"paragraphId"`
	Ordinal     int       `json:"ordinal"`
	Text        string    `json:"text"`
	AcceptedAt  time.Time `json:"acceptedAt"`
}

// Accepted is an accepted word as the UI gets it: its key (`paragraphId:ordinal`), where its line is now, and whether it is
// stale. A stale word is not accepted: its flag shows again.
type Accepted struct {
	Key         string    `json:"key"`
	ParagraphID string    `json:"paragraphId"`
	Ordinal     int       `json:"ordinal"`
	Text        string    `json:"text"`
	AcceptedAt  time.Time `json:"acceptedAt"`
	// Paragraph is the line's index in the manuscript, or nil when the line is gone.
	Paragraph   *int   `json:"paragraph"`
	Stale       bool   `json:"stale"`
	StaleReason string `json:"staleReason,omitempty"`
}

// AcceptedWords is one chapter's accepted words in reading order.
type AcceptedWords struct {
	ChapterID string     `json:"chapterId"`
	Words     []Accepted `json:"words"`
}

// AcceptedChange is what Accept and Unaccept answer: the chapter's words after the call, and the keys the call changed
// (empty when every key already was, or was not, accepted).
type AcceptedChange struct {
	AcceptedWords
	Changed []string `json:"changed"`
}

// Config is what a Service needs.
type Config struct {
	// Project is the project folder; empty means no project is open, and nothing is saved.
	Project string
	// Manuscript reads the current manuscript; an error reads as an empty one, so every record shows stale.
	Manuscript func() (Book, error)
	// Reporter tells the narrator about a file that cannot be read (ADR 0069); nil only logs nothing.
	Reporter *persist.Reporter
}

type acceptedFile struct {
	SchemaVersion int            `json:"schemaVersion"`
	Words         []AcceptedWord `json:"words"`
}

// Service reads and writes a project's Editing records. It holds no state of its own, so the host builds one per call; the
// read-modify-write of one file is serialised by lockFile.
type Service struct {
	config Config
	now    func() time.Time
}

// New returns the service for config.
func New(config Config) *Service {
	return &Service{config: config, now: time.Now}
}

// List returns a chapter's accepted words in reading order, each checked against the current manuscript.
func (s *Service) List(chapterID string) (AcceptedWords, error) {
	result := AcceptedWords{ChapterID: chapterID, Words: []Accepted{}}
	if s.config.Project == "" {
		return result, nil
	}
	unlock := lockFile(AcceptedFile(s.config.Project))
	defer unlock()
	file, err := s.readAccepted()
	if err != nil {
		return result, err
	}
	result.Words = resolveChapter(file.Words, chapterID, s.manuscript())
	return result, nil
}

// Accept records words of a chapter as accepted. Every key must name a word of the chapter's current text, or nothing is
// saved. A key already accepted (with the same text) is not recorded twice; Changed lists only the new ones.
func (s *Service) Accept(chapterID string, keys []string) (AcceptedChange, error) {
	if s.config.Project == "" {
		return AcceptedChange{}, errors.New("save the project first")
	}
	parsed, err := parseKeys(keys)
	if err != nil {
		return AcceptedChange{}, err
	}
	book := s.manuscript()
	if !hasChapter(book, chapterID) {
		return AcceptedChange{}, errors.New("that chapter is not in the manuscript")
	}
	texts := make([]string, len(parsed))
	for index, key := range parsed {
		line, ok := findLine(book, chapterID, key.paragraphID)
		if !ok {
			return AcceptedChange{}, errors.New("that word is not in this chapter")
		}
		words := wordsOf(line.Text)
		if key.ordinal >= len(words) {
			return AcceptedChange{}, errors.New("that word is past the end of its line")
		}
		texts[index] = words[key.ordinal]
	}
	unlock := lockFile(AcceptedFile(s.config.Project))
	defer unlock()
	file, err := s.readAccepted()
	if err != nil {
		return AcceptedChange{}, err
	}
	changed := []string{}
	now := s.now().UTC()
	for index, key := range parsed {
		at := -1
		for stored := range file.Words {
			if file.Words[stored].ChapterID == chapterID && file.Words[stored].ParagraphID == key.paragraphID && file.Words[stored].Ordinal == key.ordinal {
				at = stored
				break
			}
		}
		if at >= 0 && file.Words[at].Text == texts[index] {
			continue
		}
		word := AcceptedWord{ChapterID: chapterID, ParagraphID: key.paragraphID, Ordinal: key.ordinal, Text: texts[index], AcceptedAt: now}
		// A stale record of the same key gives way to the word that is there now.
		if at >= 0 {
			file.Words[at] = word
		} else {
			file.Words = append(file.Words, word)
		}
		changed = append(changed, key.key)
	}
	if len(changed) > 0 {
		if err := writeVersioned(AcceptedFile(s.config.Project), acceptedWhat, file); err != nil {
			return AcceptedChange{}, err
		}
	}
	return AcceptedChange{AcceptedWords: AcceptedWords{ChapterID: chapterID, Words: resolveChapter(file.Words, chapterID, book)}, Changed: changed}, nil
}

// Unaccept removes words of a chapter from the accepted list, stale ones included, so their flags show again. A key that is
// not accepted is not an error; Changed lists only the keys removed.
func (s *Service) Unaccept(chapterID string, keys []string) (AcceptedChange, error) {
	if s.config.Project == "" {
		return AcceptedChange{}, errors.New("save the project first")
	}
	parsed, err := parseKeys(keys)
	if err != nil {
		return AcceptedChange{}, err
	}
	unlock := lockFile(AcceptedFile(s.config.Project))
	defer unlock()
	file, err := s.readAccepted()
	if err != nil {
		return AcceptedChange{}, err
	}
	remove := make(map[string]bool, len(parsed))
	for _, key := range parsed {
		remove[key.key] = true
	}
	changed := []string{}
	kept := make([]AcceptedWord, 0, len(file.Words))
	for _, word := range file.Words {
		key := keyOf(word.ParagraphID, word.Ordinal)
		if word.ChapterID == chapterID && remove[key] {
			changed = append(changed, key)
			continue
		}
		kept = append(kept, word)
	}
	if len(changed) > 0 {
		file.Words = kept
		if err := writeVersioned(AcceptedFile(s.config.Project), acceptedWhat, file); err != nil {
			return AcceptedChange{}, err
		}
	}
	return AcceptedChange{AcceptedWords: AcceptedWords{ChapterID: chapterID, Words: resolveChapter(kept, chapterID, s.manuscript())}, Changed: changed}, nil
}

type wordKey struct {
	key         string
	paragraphID string
	ordinal     int
}

func keyOf(paragraphID string, ordinal int) string {
	return paragraphID + ":" + strconv.Itoa(ordinal)
}

// parseKeys reads `paragraphId:ordinal` keys: an ordinal in plain decimal, no sign and no leading zero, so one word has one
// key. A key named twice is read once.
func parseKeys(keys []string) ([]wordKey, error) {
	if len(keys) == 0 {
		return nil, errors.New("choose a word first")
	}
	if len(keys) > MaxKeys {
		return nil, fmt.Errorf("at most %d words can be changed at once", MaxKeys)
	}
	seen := make(map[string]bool, len(keys))
	parsed := make([]wordKey, 0, len(keys))
	for _, key := range keys {
		cut := strings.LastIndexByte(key, ':')
		if cut <= 0 {
			return nil, errors.New("that is not a word of the script")
		}
		digits := key[cut+1:]
		ordinal, err := strconv.Atoi(digits)
		if err != nil || ordinal < 0 || digits != strconv.Itoa(ordinal) {
			return nil, errors.New("that is not a word of the script")
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		parsed = append(parsed, wordKey{key: key, paragraphID: key[:cut], ordinal: ordinal})
	}
	return parsed, nil
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

// resolve checks one stored word against the current manuscript. A word is accepted only while the same text is at the same
// ordinal of the same line; anything else is stale and is never moved to a neighbour.
func resolve(word AcceptedWord, book Book) Accepted {
	result := Accepted{Key: keyOf(word.ParagraphID, word.Ordinal), ParagraphID: word.ParagraphID, Ordinal: word.Ordinal, Text: word.Text, AcceptedAt: word.AcceptedAt}
	line, ok := findLine(book, word.ChapterID, word.ParagraphID)
	if !ok {
		result.Stale, result.StaleReason = true, StaleParagraphMissing
		return result
	}
	index := line.Index
	result.Paragraph = &index
	words := wordsOf(line.Text)
	switch {
	case word.Ordinal >= len(words):
		result.Stale, result.StaleReason = true, StaleWordMissing
	case words[word.Ordinal] != word.Text:
		result.Stale, result.StaleReason = true, StaleTextChanged
	}
	return result
}

// resolveChapter resolves a chapter's stored words and puts them in reading order: by line, then ordinal; a word whose line
// is gone goes last.
func resolveChapter(stored []AcceptedWord, chapterID string, book Book) []Accepted {
	result := []Accepted{}
	for _, word := range stored {
		if word.ChapterID == chapterID {
			result = append(result, resolve(word, book))
		}
	}
	at := func(word Accepted) int {
		if word.Paragraph != nil {
			return *word.Paragraph
		}
		return math.MaxInt
	}
	sort.SliceStable(result, func(i, j int) bool {
		a, b := result[i], result[j]
		if at(a) != at(b) {
			return at(a) < at(b)
		}
		if a.ParagraphID != b.ParagraphID {
			return a.ParagraphID < b.ParagraphID
		}
		return a.Ordinal < b.Ordinal
	})
	return result
}

// validAccepted reports whether a stored word keeps the rules Accept enforces; a file with one that does not is corrupt.
func validAccepted(file acceptedFile) error {
	seen := make(map[string]bool, len(file.Words))
	for _, word := range file.Words {
		if word.ChapterID == "" || word.ParagraphID == "" || strings.ContainsRune(word.ParagraphID, ':') || word.Ordinal < 0 || word.Text == "" {
			return errors.New("an accepted word breaks the file's rules")
		}
		key := word.ChapterID + "\x00" + keyOf(word.ParagraphID, word.Ordinal)
		if seen[key] {
			return errors.New("an accepted word is in the file twice")
		}
		seen[key] = true
	}
	return nil
}

// readAccepted reads accepted.json; the caller holds the file's lock.
func (s *Service) readAccepted() (acceptedFile, error) {
	file := acceptedFile{SchemaVersion: AcceptedVersion, Words: []AcceptedWord{}}
	var decoded acceptedFile
	found, err := readVersioned(s.config.Reporter, AcceptedFile(s.config.Project), acceptedWhat, AcceptedVersion, &decoded, validAccepted)
	if err != nil {
		return acceptedFile{}, err
	}
	if found && decoded.Words != nil {
		file.Words = decoded.Words
	}
	return file, nil
}
