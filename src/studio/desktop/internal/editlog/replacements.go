package editlog

import (
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"regexp"
	"sort"
	"time"
	"unicode/utf8"
)

// The replacement record (#2251, Replace audio): which of the narrator's words another narrator's audio plays in place of, whose it
// is, and what the DAW answered, so the page can name the other narrator on the words and Put my audio back works after a restart.
// A replacement is recorded only after the DAW made it. Put back keeps the record, marked restored; the app's Undo of the edit
// itself removes it.

// ReplacementsVersion is the only replacements.json version this package reads or writes.
const ReplacementsVersion = 1

const replacementsWhat = "replaced words"

// MaxReplaceGainDB is the largest level change a replacement records, either way (dawport.MaxReplaceGainDB).
const MaxReplaceGainDB = 24

// ReplacementsFile is where a project's replacements are kept.
func ReplacementsFile(project string) string {
	return filepath.Join(Dir(project), "replacements.json")
}

// ReplacedWord is one word a replacement names: its line, its ordinal there and the text it had.
type ReplacedWord struct {
	ParagraphID string `json:"pid"`
	Ordinal     int    `json:"ordinal"`
	Text        string `json:"text"`
}

// ReplacementRequest is what the host records after the DAW replaced the words: the words, their stretch, the level change and the
// DAW's answer. Start and End are the words' project seconds when they were replaced; SourceStart and SourceEnd are seconds into
// their file.
type ReplacementRequest struct {
	// ID is the host's id for the replacement, the one the DAW stamped on its item: 1 to 64 letters, digits, '-' or '_'.
	ID           string   `json:"id"`
	Keys         []string `json:"keys"`
	Start        float64  `json:"start"`
	End          float64  `json:"end"`
	NarratorID   string   `json:"narratorId"`
	FileID       string   `json:"fileId"`
	SourceStart  float64  `json:"sourceStart"`
	SourceEnd    float64  `json:"sourceEnd"`
	GainDB       float64  `json:"gainDb"`
	MeasuredLUFS *float64 `json:"measuredLufs"`
	TargetLUFS   float64  `json:"targetLufs"`
	FadeMs       int      `json:"fadeMs"`
	Shift        float64  `json:"shift"`
	Daw          string   `json:"daw"`
	Item         string   `json:"item"`
	CutItem      string   `json:"cutItem"`
	UndoSteps    int      `json:"undoSteps"`
}

// StoredReplacement is one replacement as kept in replacements.json. RestoredAt is set once the narrator's audio was put back.
type StoredReplacement struct {
	ID           string         `json:"id"`
	ChapterID    string         `json:"chapterId"`
	Words        []ReplacedWord `json:"words"`
	Start        float64        `json:"start"`
	End          float64        `json:"end"`
	NarratorID   string         `json:"narratorId"`
	NarratorName string         `json:"narratorName"`
	FileID       string         `json:"fileId"`
	SourceStart  float64        `json:"sourceStart"`
	SourceEnd    float64        `json:"sourceEnd"`
	GainDB       float64        `json:"gainDb"`
	MeasuredLUFS *float64       `json:"measuredLufs"`
	TargetLUFS   float64        `json:"targetLufs"`
	FadeMs       int            `json:"fadeMs"`
	Shift        float64        `json:"shift"`
	Daw          string         `json:"daw"`
	Item         string         `json:"item"`
	CutItem      string         `json:"cutItem"`
	UndoSteps    int            `json:"undoSteps"`
	At           time.Time      `json:"at"`
	RestoredAt   *time.Time     `json:"restoredAt"`
}

// Replacement is a replacement as the UI gets it: the record, the words' keys, the line the first word is on now, whether any word
// changed since (stale: reported, never moved to a guess), and whether it is still in place.
type Replacement struct {
	ID           string     `json:"id"`
	ChapterID    string     `json:"chapterId"`
	Keys         []string   `json:"keys"`
	Words        []string   `json:"words"`
	Start        float64    `json:"start"`
	End          float64    `json:"end"`
	NarratorID   string     `json:"narratorId"`
	NarratorName string     `json:"narratorName"`
	FileID       string     `json:"fileId"`
	SourceStart  float64    `json:"sourceStart"`
	SourceEnd    float64    `json:"sourceEnd"`
	GainDB       float64    `json:"gainDb"`
	MeasuredLUFS *float64   `json:"measuredLufs"`
	TargetLUFS   float64    `json:"targetLufs"`
	FadeMs       int        `json:"fadeMs"`
	Shift        float64    `json:"shift"`
	Daw          string     `json:"daw"`
	UndoSteps    int        `json:"undoSteps"`
	At           time.Time  `json:"at"`
	RestoredAt   *time.Time `json:"restoredAt"`
	Active       bool       `json:"active"`
	Paragraph    *int       `json:"paragraph"`
	Stale        bool       `json:"stale"`
	StaleReason  string     `json:"staleReason,omitempty"`
}

// Replacements is one chapter's replacements in the order they were made.
type Replacements struct {
	ChapterID    string        `json:"chapterId"`
	Replacements []Replacement `json:"replacements"`
}

// ReplacementsChange is what Record, Restored and Remove answer: the chapter's replacements after the call and the ids it changed.
type ReplacementsChange struct {
	Replacements
	Changed []string `json:"changed"`
}

type replacementsFile struct {
	SchemaVersion int                 `json:"schemaVersion"`
	Replacements  []StoredReplacement `json:"replacements"`
}

// ReplacementsList returns a chapter's replacements, each checked against the current manuscript.
func (s *Service) ReplacementsList(chapterID string) (Replacements, error) {
	result := Replacements{ChapterID: chapterID, Replacements: []Replacement{}}
	if s.config.Project == "" {
		return result, nil
	}
	unlock := lockFile(ReplacementsFile(s.config.Project))
	defer unlock()
	file, err := s.readReplacements()
	if err != nil {
		return result, err
	}
	result.Replacements = resolveReplacements(file.Replacements, chapterID, s.manuscript())
	return result, nil
}

// ReplacementActive finds a chapter's replacement still in place by its id.
func (s *Service) ReplacementActive(chapterID, id string) (StoredReplacement, bool, error) {
	if s.config.Project == "" || id == "" {
		return StoredReplacement{}, false, nil
	}
	unlock := lockFile(ReplacementsFile(s.config.Project))
	defer unlock()
	file, err := s.readReplacements()
	if err != nil {
		return StoredReplacement{}, false, err
	}
	for _, stored := range file.Replacements {
		if stored.ChapterID == chapterID && stored.ID == id && stored.RestoredAt == nil {
			return stored, true, nil
		}
	}
	return StoredReplacement{}, false, nil
}

// ReplacedWords answers whether any of keys (`paragraphId:ordinal`) is a word of a chapter's replacement still in place, and which.
func (s *Service) ReplacedWords(chapterID string, keys []string) (string, bool, error) {
	if s.config.Project == "" {
		return "", false, nil
	}
	unlock := lockFile(ReplacementsFile(s.config.Project))
	defer unlock()
	file, err := s.readReplacements()
	if err != nil {
		return "", false, err
	}
	wanted := map[string]bool{}
	for _, key := range keys {
		wanted[key] = true
	}
	for _, stored := range file.Replacements {
		if stored.ChapterID != chapterID || stored.RestoredAt != nil {
			continue
		}
		for _, word := range stored.Words {
			if wanted[keyOf(word.ParagraphID, word.Ordinal)] {
				return stored.ID, true, nil
			}
		}
	}
	return "", false, nil
}

// ReplacementRecord stores a replacement the DAW made, naming narratorName as whose audio it is. The words must be words of the
// chapter's current text and not already in a replacement still in place; otherwise nothing is saved and the answer says why.
func (s *Service) ReplacementRecord(chapterID, narratorName string, request ReplacementRequest) (ReplacementsChange, error) {
	if s.config.Project == "" {
		return ReplacementsChange{}, errors.New("save the project first")
	}
	if err := checkReplacementRequest(request); err != nil {
		return ReplacementsChange{}, err
	}
	if !ValidNarratorName(narratorName) {
		return ReplacementsChange{}, errors.New("the replacement does not name whose audio it is")
	}
	parsed, err := parseKeys(request.Keys)
	if err != nil {
		return ReplacementsChange{}, err
	}
	book := s.manuscript()
	if !hasChapter(book, chapterID) {
		return ReplacementsChange{}, errors.New("that chapter is not in the manuscript")
	}
	words := make([]ReplacedWord, 0, len(parsed))
	for _, key := range parsed {
		line, ok := findLine(book, chapterID, key.paragraphID)
		if !ok {
			return ReplacementsChange{}, errors.New("that paragraph is not in this chapter")
		}
		texts := wordsOf(line.Text)
		if key.ordinal >= len(texts) {
			return ReplacementsChange{}, errors.New("that word is past the end of its line")
		}
		words = append(words, ReplacedWord{ParagraphID: key.paragraphID, Ordinal: key.ordinal, Text: texts[key.ordinal]})
	}
	unlock := lockFile(ReplacementsFile(s.config.Project))
	defer unlock()
	file, err := s.readReplacements()
	if err != nil {
		return ReplacementsChange{}, err
	}
	for _, stored := range file.Replacements {
		if stored.ID == request.ID {
			return ReplacementsChange{}, errors.New("a replacement with that id is already recorded")
		}
		if stored.ChapterID == chapterID && stored.RestoredAt == nil && sharesReplacedWord(stored.Words, words) {
			return ReplacementsChange{}, errors.New("some of these words are already replaced: put your audio back first")
		}
	}
	replacement := StoredReplacement{
		ID: request.ID, ChapterID: chapterID, Words: words, Start: request.Start, End: request.End,
		NarratorID: request.NarratorID, NarratorName: narratorName, FileID: request.FileID, SourceStart: request.SourceStart,
		SourceEnd: request.SourceEnd, GainDB: request.GainDB, MeasuredLUFS: request.MeasuredLUFS, TargetLUFS: request.TargetLUFS,
		FadeMs: request.FadeMs, Shift: request.Shift, Daw: request.Daw, Item: request.Item, CutItem: request.CutItem,
		UndoSteps: request.UndoSteps, At: s.now().UTC(),
	}
	file.Replacements = append(file.Replacements, replacement)
	if err := writeVersioned(ReplacementsFile(s.config.Project), replacementsWhat, file); err != nil {
		return ReplacementsChange{}, err
	}
	list := Replacements{ChapterID: chapterID, Replacements: resolveReplacements(file.Replacements, chapterID, book)}
	return ReplacementsChange{Replacements: list, Changed: []string{replacement.ID}}, nil
}

// ReplacementRestored marks a chapter's replacement as put back: the DAW returned the narrator's audio. One already put back, or not
// recorded, is not an error; Changed is then empty.
func (s *Service) ReplacementRestored(chapterID, id string) (ReplacementsChange, error) {
	return s.changeReplacement(chapterID, id, func(file *replacementsFile, index int) bool {
		if file.Replacements[index].RestoredAt != nil {
			return false
		}
		at := s.now().UTC()
		file.Replacements[index].RestoredAt = &at
		return true
	})
}

// ReplacementRemove forgets a chapter's replacement: the inverse the journal calls when the app's Undo took the DAW edit back. One
// that is not recorded is not an error; Changed is then empty.
func (s *Service) ReplacementRemove(chapterID, id string) (ReplacementsChange, error) {
	return s.changeReplacement(chapterID, id, func(file *replacementsFile, index int) bool {
		file.Replacements = append(file.Replacements[:index], file.Replacements[index+1:]...)
		return true
	})
}

func (s *Service) changeReplacement(chapterID, id string, change func(file *replacementsFile, index int) bool) (ReplacementsChange, error) {
	if s.config.Project == "" {
		return ReplacementsChange{}, errors.New("save the project first")
	}
	if id == "" {
		return ReplacementsChange{}, errors.New("choose a replacement first")
	}
	unlock := lockFile(ReplacementsFile(s.config.Project))
	defer unlock()
	file, err := s.readReplacements()
	if err != nil {
		return ReplacementsChange{}, err
	}
	changed := []string{}
	for index, stored := range file.Replacements {
		if stored.ChapterID == chapterID && stored.ID == id {
			if change(&file, index) {
				changed = append(changed, id)
			}
			break
		}
	}
	if len(changed) > 0 {
		if err := writeVersioned(ReplacementsFile(s.config.Project), replacementsWhat, file); err != nil {
			return ReplacementsChange{}, err
		}
	}
	list := Replacements{ChapterID: chapterID, Replacements: resolveReplacements(file.Replacements, chapterID, s.manuscript())}
	return ReplacementsChange{Replacements: list, Changed: changed}, nil
}

func sharesReplacedWord(a, b []ReplacedWord) bool {
	for _, x := range a {
		for _, y := range b {
			if x.ParagraphID == y.ParagraphID && x.Ordinal == y.Ordinal {
				return true
			}
		}
	}
	return false
}

func checkReplacementRequest(r ReplacementRequest) error {
	short := func(text string, most int) bool {
		return text != "" && utf8.ValidString(text) && utf8.RuneCountInString(text) <= most
	}
	switch {
	case !replacementIDShape.MatchString(r.ID):
		return errors.New("the replacement has no usable id")
	case !finiteTime(r.Start) || !finiteTime(r.End) || r.End <= r.Start:
		return errors.New("the words' times are not a usable pair")
	case !finiteTime(r.SourceStart) || !finiteTime(r.SourceEnd) || r.SourceEnd <= r.SourceStart:
		return errors.New("the stretch of their audio is not a usable pair of times")
	case math.IsNaN(r.GainDB) || math.Abs(r.GainDB) > MaxReplaceGainDB:
		return fmt.Errorf("the level change must be from -%d to %d dB", MaxReplaceGainDB, MaxReplaceGainDB)
	case r.MeasuredLUFS != nil && (math.IsNaN(*r.MeasuredLUFS) || math.IsInf(*r.MeasuredLUFS, 0)):
		return errors.New("the measured loudness is not a number")
	case math.IsNaN(r.TargetLUFS) || r.TargetLUFS < -70 || r.TargetLUFS > 0:
		return errors.New("the loudness target must be from -70 to 0 LUFS")
	case r.FadeMs < 0 || r.FadeMs > 500:
		return errors.New("the fade must be from 0 to 500 milliseconds")
	case !finiteOffset(r.Shift) || math.Abs(r.Shift) > MaxCutSeconds:
		return errors.New("the shift is not a usable number of seconds")
	case !short(r.NarratorID, MaxStackID) || !short(r.FileID, MaxStackID):
		return errors.New("the replacement does not name whose audio it is")
	case !short(r.Daw, MaxCutText) || !short(r.Item, MaxStackID) || !short(r.CutItem, MaxStackID):
		return errors.New("the replacement carries no DAW answer")
	case r.UndoSteps < 0 || r.UndoSteps > MaxStackUndoSteps:
		return errors.New("the DAW's undo steps are out of range")
	}
	return nil
}

// replacementIDShape is the bridge's rule for a replacement's id (narration_replace.lua's valid_id).
var replacementIDShape = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// resolveReplacements checks a chapter's replacements against the current manuscript, in the order they were made.
func resolveReplacements(stored []StoredReplacement, chapterID string, book Book) []Replacement {
	out := []Replacement{}
	for _, r := range stored {
		if r.ChapterID != chapterID {
			continue
		}
		view := Replacement{
			ID: r.ID, ChapterID: r.ChapterID, Keys: make([]string, 0, len(r.Words)), Words: make([]string, 0, len(r.Words)),
			Start: r.Start, End: r.End, NarratorID: r.NarratorID, NarratorName: r.NarratorName, FileID: r.FileID,
			SourceStart: r.SourceStart, SourceEnd: r.SourceEnd, GainDB: r.GainDB, MeasuredLUFS: r.MeasuredLUFS, TargetLUFS: r.TargetLUFS,
			FadeMs: r.FadeMs, Shift: r.Shift, Daw: r.Daw, UndoSteps: r.UndoSteps, At: r.At, RestoredAt: r.RestoredAt, Active: r.RestoredAt == nil,
		}
		for i, word := range r.Words {
			view.Keys = append(view.Keys, keyOf(word.ParagraphID, word.Ordinal))
			view.Words = append(view.Words, word.Text)
			line, ok := findLine(book, chapterID, word.ParagraphID)
			if !ok {
				view.Stale, view.StaleReason = true, StaleParagraphMissing
				continue
			}
			if i == 0 {
				index := line.Index
				view.Paragraph = &index
			}
			texts := wordsOf(line.Text)
			switch {
			case word.Ordinal >= len(texts):
				view.Stale, view.StaleReason = true, StaleWordMissing
			case texts[word.Ordinal] != word.Text && !view.Stale:
				view.Stale, view.StaleReason = true, StaleTextChanged
			}
		}
		out = append(out, view)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].At.Before(out[j].At) })
	return out
}

func validReplacements(file replacementsFile) error {
	seen := map[string]bool{}
	for _, r := range file.Replacements {
		request := ReplacementRequest{ID: r.ID, Start: r.Start, End: r.End, NarratorID: r.NarratorID, FileID: r.FileID, SourceStart: r.SourceStart,
			SourceEnd: r.SourceEnd, GainDB: r.GainDB, MeasuredLUFS: r.MeasuredLUFS, TargetLUFS: r.TargetLUFS, FadeMs: r.FadeMs, Shift: r.Shift,
			Daw: r.Daw, Item: r.Item, CutItem: r.CutItem, UndoSteps: r.UndoSteps}
		if r.ID == "" || seen[r.ID] || r.ChapterID == "" || len(r.Words) == 0 || len(r.Words) > MaxKeys || !ValidNarratorName(r.NarratorName) ||
			checkReplacementRequest(request) != nil {
			return errors.New("a replacement breaks the file's rules")
		}
		for _, word := range r.Words {
			if word.ParagraphID == "" || word.Ordinal < 0 || word.Text == "" {
				return errors.New("a replaced word breaks the file's rules")
			}
		}
		seen[r.ID] = true
	}
	return nil
}

// readReplacements reads replacements.json; the caller holds the file's lock.
func (s *Service) readReplacements() (replacementsFile, error) {
	file := replacementsFile{SchemaVersion: ReplacementsVersion, Replacements: []StoredReplacement{}}
	var decoded replacementsFile
	found, err := readVersioned(s.config.Reporter, ReplacementsFile(s.config.Project), replacementsWhat, ReplacementsVersion, &decoded, validReplacements)
	if err != nil {
		return replacementsFile{}, err
	}
	if found && decoded.Replacements != nil {
		file.Replacements = decoded.Replacements
	}
	return file, nil
}
