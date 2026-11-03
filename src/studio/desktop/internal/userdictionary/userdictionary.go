// Package userdictionary is the project's user dictionary (#2595): how the narrator says a word that no dictionary source knows, as
// a pronunciation source of its own. Each word keeps one or more records, each a say-value with its source: "user_dictionary" (the
// narrator's own save, at most one a word) or "script_imported" (a value the Script page kept before schema 2 of script-prep.json,
// written only by the migration). A Story Bible name takes one of these values when the narrator picks it; the dictionary itself
// never holds a story element.
//
// Words are keyed by guide.FoldName, the rule Story Bible names match under, and keep the spelling they were first saved with.
//
// The file is narrator data, read through persist: a corrupt one is kept aside and a fresh one starts, one written by a newer app is
// refused and never overwritten. Clear project data removes it; replacing the manuscript keeps it (the manuscript service).
package userdictionary

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf16"

	"desktop/internal/brand"
	"desktop/internal/guide"
	"desktop/internal/persist"
)

// SchemaVersion is the user-dictionary.json version this package reads and writes.
const SchemaVersion = 1

// The two sources a record can have, and their labels.
const (
	SourceUser   = "user_dictionary"
	SourceScript = "script_imported"
	LabelUser    = "My dictionary"
	LabelScript  = "Script (imported)"
)

// The limits. Text is counted in UTF-16 code units, the unit the UI's maxLength counts; they are script-prep.json's word limits.
const (
	MaxWordUnits = 80
	MaxSayUnits  = 200
	// MaxWords is the most words the dictionary keeps.
	MaxWords = 20000
	// MaxRecords is the most records one word keeps.
	MaxRecords = 50
	// MaxFileBytes is the largest user-dictionary.json that is read or written.
	MaxFileBytes = 8 << 20
)

// what names the file for the narrator in a persist notice or an error.
const what = "user dictionary"

// Label is a source's label, or "" for a source that is not the dictionary's.
func Label(source string) string {
	switch source {
	case SourceUser:
		return LabelUser
	case SourceScript:
		return LabelScript
	}
	return ""
}

// File is where a project's user dictionary is kept, beside script-prep.json.
func File(project string) string {
	return filepath.Join(project, brand.ProjectFolder, "user-dictionary.json")
}

// Record is one way to say a word, where it came from and when it was added.
type Record struct {
	Say     string    `json:"say"`
	Source  string    `json:"source"`
	AddedAt time.Time `json:"addedAt"`
}

// Entry is one word with its records.
type Entry struct {
	Word    string   `json:"word"`
	Records []Record `json:"records"`
}

// Words is what List answers: every word, in key order.
type Words struct {
	Words []Entry `json:"words"`
}

// dictionaryFile is the file.
type dictionaryFile struct {
	SchemaVersion int              `json:"schemaVersion"`
	Words         map[string]Entry `json:"words"`
}

// Config is what a Service needs.
type Config struct {
	// Project is the project folder; empty means no project is open, and nothing is saved.
	Project string
	// Reporter tells the narrator about a file that cannot be read; nil only logs nothing.
	Reporter *persist.Reporter
	// Now is the clock records are stamped with; nil is time.Now.
	Now func() time.Time
}

// Service reads and writes a project's user dictionary. It holds no state, so the host builds one per call; the read-modify-write of
// one file is serialised by lockFile.
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

var errNoProject = errors.New("save the project first")

// List returns every word in key order.
func (s *Service) List() (Words, error) {
	result := Words{Words: []Entry{}}
	if s.config.Project == "" {
		return result, nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return result, err
	}
	keys := make([]string, 0, len(file.Words))
	for key := range file.Words {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	for _, key := range keys {
		result.Words = append(result.Words, file.Words[key])
	}
	return result, nil
}

// Records is the word's records in the order they were added, or none.
func (s *Service) Records(word string) ([]Record, error) {
	if s.config.Project == "" {
		return []Record{}, nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return []Record{}, err
	}
	entry, ok := file.Words[guide.FoldName(word)]
	if !ok {
		return []Record{}, nil
	}
	return entry.Records, nil
}

// Save sets the narrator's own record for word: an earlier one is replaced in its place, a Script value is never touched. It returns
// the word's entry.
func (s *Service) Save(word, say string) (Entry, error) {
	var saved Entry
	err := s.change(word, say, func(entry *Entry, record Record) bool {
		index := slices.IndexFunc(entry.Records, func(r Record) bool { return r.Source == SourceUser })
		if index >= 0 {
			entry.Records[index] = record
		} else {
			entry.Records = append(entry.Records, record)
		}
		saved = *entry
		return true
	}, SourceUser)
	return saved, err
}

// Import adds a Script value for word unless the word has one that says the same, and reports whether it added it. Only the
// migration of script-prep.json schema 1 calls it.
func (s *Service) Import(word, say string) (bool, error) {
	added := false
	err := s.change(word, say, func(entry *Entry, record Record) bool {
		if slices.ContainsFunc(entry.Records, func(r Record) bool { return r.Source == SourceScript && r.Say == record.Say }) {
			return false
		}
		entry.Records = append(entry.Records, record)
		added = true
		return true
	}, SourceScript)
	return added, err
}

// Remove takes away the word's one record with this source and say-value; the word goes when it has none left. It returns the word's
// entry, its records empty when it went.
func (s *Service) Remove(word, source, say string) (Entry, error) {
	if s.config.Project == "" {
		return Entry{}, errNoProject
	}
	if Label(source) == "" {
		return Entry{}, errors.New("that is not a source of your dictionary")
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return Entry{}, err
	}
	key := guide.FoldName(word)
	entry, ok := file.Words[key]
	index := slices.IndexFunc(entry.Records, func(r Record) bool { return r.Source == source && r.Say == strings.TrimSpace(say) })
	if !ok || index < 0 {
		return Entry{}, errors.New("that word is not in your dictionary said that way")
	}
	entry.Records = slices.Delete(slices.Clone(entry.Records), index, index+1)
	if len(entry.Records) == 0 {
		delete(file.Words, key)
	} else {
		file.Words[key] = entry
	}
	if err := s.write(file); err != nil {
		return Entry{}, err
	}
	return entry, nil
}

// change checks word and say, then applies edit to the word's entry (a new one when the word has none) under the file's lock, and
// writes the file when edit reports a change.
func (s *Service) change(word, say string, edit func(*Entry, Record) bool, source string) error {
	if s.config.Project == "" {
		return errNoProject
	}
	word, say = strings.TrimSpace(word), strings.TrimSpace(say)
	if err := checkText(word, MaxWordUnits, "a word"); err != nil {
		return err
	}
	if err := checkText(say, MaxSayUnits, "how a word is said"); err != nil {
		return err
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return err
	}
	key := guide.FoldName(word)
	entry, ok := file.Words[key]
	if !ok {
		if len(file.Words) >= MaxWords {
			return fmt.Errorf("your dictionary can keep at most %d words", MaxWords)
		}
		entry = Entry{Word: word, Records: []Record{}}
	}
	entry.Records = slices.Clone(entry.Records)
	if !edit(&entry, Record{Say: say, Source: source, AddedAt: s.now()}) {
		return nil
	}
	if len(entry.Records) > MaxRecords {
		return fmt.Errorf("a word in your dictionary can keep at most %d ways to say it", MaxRecords)
	}
	file.Words[key] = entry
	return s.write(file)
}

func (s *Service) now() time.Time {
	if s.config.Now != nil {
		return s.config.Now().UTC()
	}
	return time.Now().UTC()
}

// checkText checks a word or say-value, already trimmed: one line of at most limit units with no control character.
func checkText(text string, limit int, name string) error {
	switch {
	case text == "":
		return fmt.Errorf("%s cannot be empty", name)
	case units(text) > limit:
		return fmt.Errorf("%s can be at most %d characters", name, limit)
	}
	for _, character := range text {
		if unicode.IsControl(character) {
			return fmt.Errorf("%s is one line of text", name)
		}
	}
	return nil
}

func units(text string) int {
	count := 0
	for _, character := range text {
		count += utf16.RuneLen(character)
	}
	return count
}

// validFile reports whether a stored file keeps the rules the service enforces when it writes; a file that does not is corrupt.
func validFile(file dictionaryFile) bool {
	if file.SchemaVersion != SchemaVersion || len(file.Words) > MaxWords {
		return false
	}
	for key, entry := range file.Words {
		if entry.Word != strings.TrimSpace(entry.Word) || checkText(entry.Word, MaxWordUnits, "") != nil || key != guide.FoldName(entry.Word) {
			return false
		}
		if len(entry.Records) == 0 || len(entry.Records) > MaxRecords {
			return false
		}
		own := 0
		for _, record := range entry.Records {
			if record.Say != strings.TrimSpace(record.Say) || checkText(record.Say, MaxSayUnits, "") != nil || Label(record.Source) == "" || record.AddedAt.IsZero() {
				return false
			}
			if record.Source == SourceUser {
				own++
			}
		}
		if own > 1 {
			return false
		}
	}
	return true
}

// read reads user-dictionary.json; the caller holds the file's lock.
func (s *Service) read() (dictionaryFile, error) {
	file := dictionaryFile{SchemaVersion: SchemaVersion, Words: map[string]Entry{}}
	newer := 0
	var decoded dictionaryFile
	outcome := s.config.Reporter.ReadJSON(File(s.config.Project), what, persist.NarratorData, func(raw []byte) error {
		if len(raw) > MaxFileBytes {
			return errors.New("the user dictionary file is too large")
		}
		var candidate dictionaryFile
		if err := json.Unmarshal(raw, &candidate); err != nil {
			return err
		}
		if candidate.SchemaVersion > SchemaVersion {
			newer = candidate.SchemaVersion
			return nil
		}
		if !validFile(candidate) {
			return errors.New("a word or record breaks the file's rules")
		}
		decoded = candidate
		return nil
	})
	switch outcome {
	case persist.Missing, persist.Quarantined, persist.Healed:
		return file, nil
	case persist.Unreadable:
		return dictionaryFile{}, fmt.Errorf("your %s file could not be read, so nothing was changed", what)
	}
	if err := persist.CheckVersion(newer, SchemaVersion, what); err != nil {
		return dictionaryFile{}, err
	}
	if decoded.Words == nil {
		decoded.Words = map[string]Entry{}
	}
	return decoded, nil
}

// write replaces user-dictionary.json through a temporary file and a rename; the caller holds the file's lock.
func (s *Service) write(file dictionaryFile) error {
	file.SchemaVersion = SchemaVersion
	path := File(s.config.Project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the app's folder in the project: %w", err)
	}
	bytes, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	if len(bytes) > MaxFileBytes {
		return errors.New("the user dictionary file would be too large, so nothing was saved")
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
