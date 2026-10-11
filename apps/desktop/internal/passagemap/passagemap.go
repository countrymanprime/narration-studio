// Package passagemap is the Booth's passage map: while a take records, the UI notes where in the text each take began and
// where the one before it ended, and when the recording stops it sends that run of marks here. The host checks every mark
// against the manuscript, stamps the run with the ids the DAW gave its item and takes (the UI never sends one), and keeps the
// runs in the project's passagemap.json, so Editing can list a Booth-recorded chapter's passages without aligning the audio.
//
// The file is derived data read through persist: a corrupt one is kept aside and an empty map starts, one written by a newer
// app is refused and never overwritten. Every read checks the marks against the current text: a mark whose paragraph is gone,
// or whose word is past the paragraph's end, is reported stale, never moved. Replacing the manuscript or Clear project data
// removes the file (the manuscript service's resetDerived); a re-import without a reset keeps it.
package passagemap

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// SchemaVersion is the only passagemap.json version this package reads or writes.
const SchemaVersion = 1

// what names the file for the narrator in a persist notice or an error.
const what = "passage map"

// The limits on what a run holds: the file only ever holds numbers, ids and kinds, never a path or free text.
const (
	// MaxMarksPerRun is the most marks one Record-to-Stop run holds: a start, a stop and the rolls between them.
	MaxMarksPerRun = 1000
	// MaxRunsPerChapter is the most runs one chapter holds.
	MaxRunsPerChapter = 200
	// MaxIDLength is the longest chapter, paragraph, item or take id, in bytes.
	MaxIDLength = 64
	// MaxSeconds is the furthest a mark can be into a chapter recording: a day.
	MaxSeconds = 24 * 60 * 60
)

// The kinds of mark. A run is a start, any number of rolls, and a stop.
const (
	KindStart = "start"
	KindRoll  = "roll"
	KindStop  = "stop"
)

// Why a mark is stale.
const (
	// StaleParagraphMissing means the mark's paragraph, or the one its previous place names, is no longer in its chapter.
	StaleParagraphMissing = "paragraph_missing"
	// StaleWordOutOfRange means the paragraph is there but has fewer words than the mark's word, or its previous place's.
	StaleWordOutOfRange = "word_out_of_range"
)

// File is where a project's passage map is kept.
func File(project string) string {
	return filepath.Join(project, "narration-utils", "passagemap.json")
}

// Place is a spot in the text: a paragraph and a word index in it, from 0 to its word count (the reading reached its end).
type Place struct {
	PID  string `json:"pid"`
	Word int    `json:"word"`
}

// MarkInput is one mark as the UI sends it: where a take began, how far into the chapter recording, and for a roll or a
// stop, where the take before it ended.
type MarkInput struct {
	PID  string  `json:"pid"`
	Word int     `json:"word"`
	Sec  float64 `json:"sec"`
	Kind string  `json:"kind"`
	Prev *Place  `json:"prev,omitempty"`
}

// Mark is one mark as stored: the input, the run it belongs to, and the DAW's ids the host stamped at stop ("" when the DAW
// could not be read).
type Mark struct {
	ID        string  `json:"id"`
	Run       string  `json:"run"`
	ChapterID string  `json:"chapterId"`
	PID       string  `json:"pid"`
	Word      int     `json:"word"`
	Sec       float64 `json:"sec"`
	Kind      string  `json:"kind"`
	Prev      *Place  `json:"prev,omitempty"`
	ItemGUID  string  `json:"itemGuid"`
	TakeGUID  string  `json:"takeGuid"`
}

// Resolved is a mark as the UI gets it: whether it still fits the current manuscript.
type Resolved struct {
	Mark
	Stale       bool   `json:"stale"`
	StaleReason string `json:"staleReason,omitempty"`
}

// Line is one paragraph of the manuscript as it currently is, with its word count (runs of non-space characters).
type Line struct {
	ChapterID string
	ID        string
	Words     int
}

// Book is the current manuscript: its chapter ids, and its paragraphs.
type Book struct {
	Chapters []string
	Lines    []Line
}

// Stamp is what the DAW holds for a run that just ended: the item it recorded and its takes, oldest first. Mark i gets
// TakeGUIDs[i], the last take covering the marks past the end of the list. The built-in recorder stamps its take's name.
type Stamp struct {
	ItemGUID  string
	TakeGUIDs []string
}

// Config is what a Service needs.
type Config struct {
	// Project is the project folder; empty means no project is open, and nothing is saved.
	Project string
	// Manuscript reads the current manuscript; an error reads as an empty one, so every run is refused and every mark is stale.
	Manuscript func() (Book, error)
	// Stamp reads the DAW's ids for a chapter's run that just ended; nil or an error leaves the run unstamped.
	Stamp func(chapterID string) (Stamp, error)
	// Reporter tells the narrator about a file that cannot be read (ADR 0069); nil only logs nothing.
	Reporter *persist.Reporter
}

type passageMapFile struct {
	SchemaVersion int    `json:"schemaVersion"`
	Marks         []Mark `json:"marks"`
}

// Service reads and writes a project's passage map. It holds no state of its own, so the host builds one per call; the
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

// List returns a chapter's marks, runs in the order they were recorded and each run's marks in time order, each checked
// against the current manuscript.
func (s *Service) List(chapterID string) ([]Resolved, error) {
	if s.config.Project == "" {
		return []Resolved{}, nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return []Resolved{}, err
	}
	return resolveChapter(file.Marks, chapterID, s.manuscript()), nil
}

// RecordRun stores one run of a chapter: a start, any rolls, and a stop, in time order, each on a paragraph of that chapter.
// The host stamps the DAW's ids onto the marks; a run that breaks a rule is refused with a sentence and nothing is saved.
// It returns the run's marks as stored.
func (s *Service) RecordRun(chapterID string, run []MarkInput) ([]Resolved, error) {
	if s.config.Project == "" {
		return []Resolved{}, errors.New("save the project first")
	}
	book := s.manuscript()
	if err := checkRun(book, chapterID, run); err != nil {
		return []Resolved{}, err
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return []Resolved{}, err
	}
	runs := map[string]bool{}
	for _, mark := range file.Marks {
		if mark.ChapterID == chapterID {
			runs[mark.Run] = true
		}
	}
	if len(runs) >= MaxRunsPerChapter {
		return []Resolved{}, fmt.Errorf("a chapter's passage map holds at most %d recordings", MaxRunsPerChapter)
	}
	runID := chapterID + "." + strconv.Itoa(len(runs)+1)
	for runs[runID] {
		runID += "+"
	}
	stamp := s.stamp(chapterID)
	marks := make([]Mark, 0, len(run))
	for index, input := range run {
		mark := Mark{
			ID: runID + "." + strconv.Itoa(index), Run: runID, ChapterID: chapterID,
			PID: input.PID, Word: input.Word, Sec: input.Sec, Kind: input.Kind, ItemGUID: stamp.ItemGUID,
		}
		if input.Prev != nil {
			prev := *input.Prev
			mark.Prev = &prev
		}
		if len(stamp.TakeGUIDs) > 0 {
			mark.TakeGUID = stamp.TakeGUIDs[min(index, len(stamp.TakeGUIDs)-1)]
		}
		marks = append(marks, mark)
	}
	file.Marks = append(file.Marks, marks...)
	if err := s.write(file); err != nil {
		return []Resolved{}, err
	}
	result := make([]Resolved, 0, len(marks))
	for _, mark := range marks {
		result = append(result, resolve(mark, book))
	}
	return result, nil
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

// stamp reads the DAW's ids for a run that just ended. One that cannot be read, or that holds something other than ids,
// leaves the run unstamped: the marks are still the narrator's record of where each take began.
func (s *Service) stamp(chapterID string) Stamp {
	if s.config.Stamp == nil {
		return Stamp{}
	}
	stamp, err := s.config.Stamp(chapterID)
	if err != nil || !guidOK(stamp.ItemGUID) {
		return Stamp{}
	}
	for _, take := range stamp.TakeGUIDs {
		if !guidOK(take) {
			return Stamp{}
		}
	}
	return stamp
}

// checkRun refuses a run that breaks a rule, with the sentence the narrator sees.
func checkRun(book Book, chapterID string, run []MarkInput) error {
	if !idOK(chapterID) {
		return fmt.Errorf("a chapter id is at most %d characters, with no control characters", MaxIDLength)
	}
	if len(run) > MaxMarksPerRun {
		return fmt.Errorf("a recording's passage map holds at most %d marks", MaxMarksPerRun)
	}
	if len(run) < 2 {
		return errors.New("a recording's passage map needs a start and a stop")
	}
	for _, input := range run {
		if !idOK(input.PID) || (input.Prev != nil && !idOK(input.Prev.PID)) {
			return fmt.Errorf("a paragraph id is at most %d characters, with no control characters", MaxIDLength)
		}
	}
	if !hasChapter(book, chapterID) {
		return errors.New("that chapter is not in the manuscript")
	}
	words := chapterWords(book, chapterID)
	last := 0.0
	for index, input := range run {
		switch {
		case index == 0 && input.Kind != KindStart:
			return errors.New("a recording's passage map begins with a start")
		case index == len(run)-1 && input.Kind != KindStop:
			return errors.New("a recording's passage map ends with a stop")
		case index > 0 && index < len(run)-1 && input.Kind != KindRoll:
			return errors.New("between the start and the stop, every mark is a roll")
		}
		if input.Kind == KindStart && input.Prev != nil {
			return errors.New("a start mark has no take before it")
		}
		if input.Kind != KindStart && input.Prev == nil {
			return errors.New("a roll or a stop says where the take before it ended")
		}
		if err := checkPlace(words, Place{PID: input.PID, Word: input.Word}); err != nil {
			return err
		}
		if input.Prev != nil {
			if err := checkPlace(words, *input.Prev); err != nil {
				return err
			}
		}
		if math.IsNaN(input.Sec) || math.IsInf(input.Sec, 0) || input.Sec < 0 || input.Sec > MaxSeconds {
			return fmt.Errorf("a mark's seconds are a number from 0 to %d", MaxSeconds)
		}
		if input.Sec < last {
			return errors.New("a recording's marks are in time order")
		}
		last = input.Sec
	}
	return nil
}

func checkPlace(words map[string]int, place Place) error {
	count, ok := words[place.PID]
	if !ok {
		return errors.New("that paragraph is not in this chapter")
	}
	if place.Word < 0 || place.Word > count {
		return errors.New("that word is not in the paragraph")
	}
	return nil
}

func hasChapter(book Book, chapterID string) bool {
	for _, id := range book.Chapters {
		if id == chapterID {
			return true
		}
	}
	return false
}

// chapterWords is the word count of each of a chapter's paragraphs, by paragraph id.
func chapterWords(book Book, chapterID string) map[string]int {
	words := map[string]int{}
	for _, line := range book.Lines {
		if line.ChapterID == chapterID {
			words[line.ID] = line.Words
		}
	}
	return words
}

// idOK reports whether an id is a short, non-empty run of printable text.
func idOK(id string) bool {
	return id != "" && textOK(id, MaxIDLength)
}

// guidOK reports whether a stamped id is empty or a short run of printable text.
func guidOK(id string) bool {
	return textOK(id, MaxIDLength)
}

// textOK reports whether text is at most limit bytes of valid UTF-8 with no control characters.
func textOK(text string, limit int) bool {
	if len(text) > limit || !utf8.ValidString(text) {
		return false
	}
	for _, character := range text {
		if unicode.IsControl(character) {
			return false
		}
	}
	return true
}

// valid reports whether a stored mark keeps the rules RecordRun enforces; a file with one that does not is corrupt.
func valid(mark Mark) bool {
	// A run's id is the chapter id and a number, and a mark's the run's and another number.
	if mark.ID == "" || mark.Run == "" || !textOK(mark.ID, 2*MaxIDLength) || !textOK(mark.Run, 2*MaxIDLength) {
		return false
	}
	if !idOK(mark.ChapterID) || !idOK(mark.PID) || mark.Word < 0 {
		return false
	}
	if math.IsNaN(mark.Sec) || math.IsInf(mark.Sec, 0) || mark.Sec < 0 || mark.Sec > MaxSeconds {
		return false
	}
	switch mark.Kind {
	case KindStart:
		if mark.Prev != nil {
			return false
		}
	case KindRoll, KindStop:
		if mark.Prev == nil || !idOK(mark.Prev.PID) || mark.Prev.Word < 0 {
			return false
		}
	default:
		return false
	}
	return guidOK(mark.ItemGUID) && guidOK(mark.TakeGUID)
}

// resolve checks one stored mark against the current manuscript; a stale mark keeps the place it was recorded at.
func resolve(mark Mark, book Book) Resolved {
	result := Resolved{Mark: mark}
	words := chapterWords(book, mark.ChapterID)
	places := []Place{{PID: mark.PID, Word: mark.Word}}
	if mark.Prev != nil {
		places = append(places, *mark.Prev)
	}
	for _, place := range places {
		count, ok := words[place.PID]
		switch {
		case !ok:
			result.Stale, result.StaleReason = true, StaleParagraphMissing
			return result
		case place.Word > count:
			result.Stale, result.StaleReason = true, StaleWordOutOfRange
		}
	}
	return result
}

// resolveChapter resolves a chapter's marks in the order they were stored: runs as recorded, each run's marks in time order.
func resolveChapter(stored []Mark, chapterID string, book Book) []Resolved {
	result := []Resolved{}
	for _, mark := range stored {
		if mark.ChapterID == chapterID {
			result = append(result, resolve(mark, book))
		}
	}
	return result
}

// read reads passagemap.json; the caller holds the file's lock. A corrupt file, or one with a mark that breaks a rule, is
// kept aside and a fresh one started (the narrator is told by the reporter); one written by a newer app is refused and
// never overwritten.
func (s *Service) read() (passageMapFile, error) {
	file := passageMapFile{SchemaVersion: SchemaVersion, Marks: []Mark{}}
	path := File(s.config.Project)
	newer := 0
	var decoded passageMapFile
	outcome := s.config.Reporter.ReadJSON(path, what, persist.NarratorData, func(raw []byte) error {
		var candidate passageMapFile
		if err := json.Unmarshal(raw, &candidate); err != nil {
			return err
		}
		if candidate.SchemaVersion > SchemaVersion {
			newer = candidate.SchemaVersion
			return nil
		}
		seen := make(map[string]bool, len(candidate.Marks))
		for _, mark := range candidate.Marks {
			if !valid(mark) || seen[mark.ID] {
				return errors.New("a mark breaks the file's rules")
			}
			seen[mark.ID] = true
		}
		decoded = candidate
		return nil
	})
	switch outcome {
	case persist.Missing, persist.Quarantined, persist.Healed:
		return file, nil
	case persist.Unreadable:
		return passageMapFile{}, fmt.Errorf("your %s file could not be read, so nothing was changed", what)
	}
	if err := persist.CheckVersion(newer, SchemaVersion, what); err != nil {
		return passageMapFile{}, err
	}
	if decoded.Marks != nil {
		file.Marks = decoded.Marks
	}
	return file, nil
}

// write replaces passagemap.json through a temporary file and a rename; the caller holds the file's lock.
func (s *Service) write(file passageMapFile) error {
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
