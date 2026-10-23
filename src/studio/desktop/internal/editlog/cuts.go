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
	"unicode/utf8"
)

// CutsVersion is the only cuts.json version this package reads or writes.
const CutsVersion = 1

// cutsWhat names the file for the narrator in a persist notice or an error.
const cutsWhat = "cuts"

// The modes of a cut.
const (
	// CutClose moves the audio that follows up by the cut's length.
	CutClose = "close"
	// CutGap keeps the length, filled with room tone: nothing after it moves.
	CutGap = "gap"
)

// FadeChoices are the crossfades at a cut's join the Delete words dialog offers, in milliseconds (0 is none).
var FadeChoices = []int{0, 6, 12, 25}

// MaxCutText is the longest a cut's shown words, its DAW name, guid, take or backup id may be, in characters.
const MaxCutText = 10000

// MaxCutSeconds bounds a cut's times: no chapter recording is a week long, and it keeps a hand-edited number finite.
const MaxCutSeconds = 7 * 24 * 3600

// CutsFile is where a project's cuts are kept.
func CutsFile(project string) string {
	return filepath.Join(Dir(project), "cuts.json")
}

// CutWord is one word a cut names: its ordinal in the cut's paragraph and the text it had when the cut was made.
type CutWord struct {
	Ordinal int    `json:"ordinal"`
	Text    string `json:"text"`
}

// CutRequest is what the app sends after the DAW accepted a deleteRange: the words, the range and the DAW's answer. A, B,
// Off0 and Off1 are already in the chapter recording as it was before any cut (the app converts them with origTime); the
// host stores the numbers and computes nothing from them. A wordless cut (a gap between words that Clean up shortened,
// SN-E112) has no paragraph and no keys; it has no take either, so its offsets are its times.
type CutRequest struct {
	ParagraphID string   `json:"pid"`
	TakeID      string   `json:"takeId,omitempty"`
	Keys        []string `json:"keys"`
	Text        string   `json:"text"`
	A           float64  `json:"a"`
	B           float64  `json:"b"`
	Off0        float64  `json:"off0"`
	Off1        float64  `json:"off1"`
	Mode        string   `json:"mode"`
	FadeMs      int      `json:"fadeMs"`
	Daw         string   `json:"daw"`
	GUID        string   `json:"guid"`
	// UndoSteps is how many undo points the DAW added (0 where the app keeps its own edit list); nil means the request
	// carries no DAW result and is refused.
	UndoSteps *int   `json:"undoSteps"`
	BackupID  string `json:"backupId,omitempty"`
}

// StoredCut is one cut as kept in cuts.json: the narrator's memory of audio the DAW hid. It never deletes anything.
type StoredCut struct {
	ID          string    `json:"id"`
	ChapterID   string    `json:"chapterId"`
	ParagraphID string    `json:"pid"`
	TakeID      string    `json:"takeId,omitempty"`
	Words       []CutWord `json:"words"`
	Text        string    `json:"text"`
	A           float64   `json:"a"`
	B           float64   `json:"b"`
	Off0        float64   `json:"off0"`
	Off1        float64   `json:"off1"`
	Mode        string    `json:"mode"`
	FadeMs      int       `json:"fadeMs"`
	Daw         string    `json:"daw"`
	GUID        string    `json:"guid"`
	UndoSteps   int       `json:"undoSteps"`
	BackupID    string    `json:"backupId,omitempty"`
	At          time.Time `json:"at"`
}

// Cut is a cut as the UI gets it: the mock's EditCut with the word texts beside the keys, where its line is now, and whether
// it is stale. A stale cut's words changed since it was made: it is reported, never applied to a guess.
type Cut struct {
	ID          string   `json:"id"`
	ChapterID   string   `json:"chapterId"`
	ParagraphID string   `json:"pid"`
	TakeID      string   `json:"takeId,omitempty"`
	Keys        []string `json:"keys"`
	// Words is the text each key had when the cut was made, in the order of Keys.
	Words     []string  `json:"words"`
	Text      string    `json:"text"`
	A         float64   `json:"a"`
	B         float64   `json:"b"`
	Off0      float64   `json:"off0"`
	Off1      float64   `json:"off1"`
	Mode      string    `json:"mode"`
	FadeMs    int       `json:"fadeMs"`
	Daw       string    `json:"daw"`
	GUID      string    `json:"guid"`
	UndoSteps int       `json:"undoSteps"`
	BackupID  string    `json:"backupId,omitempty"`
	At        time.Time `json:"at"`
	// Paragraph is the line's index in the manuscript, or nil when the line is gone or the cut is wordless (no ParagraphID).
	Paragraph   *int   `json:"paragraph"`
	Stale       bool   `json:"stale"`
	StaleReason string `json:"staleReason,omitempty"`
}

// Cuts is one chapter's cuts in the original recording's time order.
type Cuts struct {
	ChapterID string `json:"chapterId"`
	Cuts      []Cut  `json:"cuts"`
}

// CutsChange is what Record and Remove answer: the chapter's cuts after the call and the ids the call changed (empty when a
// Remove named a cut that is not recorded).
type CutsChange struct {
	Cuts
	Changed []string `json:"changed"`
}

type cutsFile struct {
	SchemaVersion int         `json:"schemaVersion"`
	Cuts          []StoredCut `json:"cuts"`
}

// CutsList returns a chapter's cuts in time order, each checked against the current manuscript.
func (s *Service) CutsList(chapterID string) (Cuts, error) {
	result := Cuts{ChapterID: chapterID, Cuts: []Cut{}}
	if s.config.Project == "" {
		return result, nil
	}
	unlock := lockFile(CutsFile(s.config.Project))
	defer unlock()
	file, err := s.readCuts()
	if err != nil {
		return result, err
	}
	result.Cuts = resolveCuts(file.Cuts, chapterID, s.manuscript())
	return result, nil
}

// CutRecord stores a cut the DAW has made. The words must be words of the paragraph's current text, or the cut wordless (no
// paragraph and no keys); the range and options must be ones the app can send, the DAW's result must be given, and the range must
// not overlap a cut already stored on the same take, or any cut of the chapter when either is wordless; otherwise nothing is saved
// and the answer says why.
func (s *Service) CutRecord(chapterID string, request CutRequest) (CutsChange, error) {
	if s.config.Project == "" {
		return CutsChange{}, errors.New("save the project first")
	}
	if err := checkCutRequest(request); err != nil {
		return CutsChange{}, err
	}
	book := s.manuscript()
	if !hasChapter(book, chapterID) {
		return CutsChange{}, errors.New("that chapter is not in the manuscript")
	}
	cutWords := []CutWord{}
	if request.ParagraphID != "" || len(request.Keys) > 0 {
		var err error
		if cutWords, err = wordsOfCut(book, chapterID, request); err != nil {
			return CutsChange{}, err
		}
	}
	wordless := len(cutWords) == 0
	unlock := lockFile(CutsFile(s.config.Project))
	defer unlock()
	file, err := s.readCuts()
	if err != nil {
		return CutsChange{}, err
	}
	for _, stored := range file.Cuts {
		sameTake := stored.TakeID == request.TakeID || wordless || len(stored.Words) == 0
		if stored.ChapterID == chapterID && sameTake && request.A < stored.B && stored.A < request.B {
			return CutsChange{}, fmt.Errorf("that audio overlaps cut %s, which is recorded already", stored.ID)
		}
	}
	cut := StoredCut{
		ID: nextCutID(file.Cuts), ChapterID: chapterID, ParagraphID: request.ParagraphID, TakeID: request.TakeID, Words: cutWords,
		Text: request.Text, A: request.A, B: request.B, Off0: request.Off0, Off1: request.Off1, Mode: request.Mode,
		FadeMs: request.FadeMs, Daw: request.Daw, GUID: request.GUID, UndoSteps: *request.UndoSteps, BackupID: request.BackupID,
		At: s.now().UTC(),
	}
	file.Cuts = append(file.Cuts, cut)
	if err := writeVersioned(CutsFile(s.config.Project), cutsWhat, file); err != nil {
		return CutsChange{}, err
	}
	return CutsChange{Cuts: Cuts{ChapterID: chapterID, Cuts: resolveCuts(file.Cuts, chapterID, book)}, Changed: []string{cut.ID}}, nil
}

// wordsOfCut is a cut's words, checked against the paragraph's current text, in ordinal order.
func wordsOfCut(book Book, chapterID string, request CutRequest) ([]CutWord, error) {
	parsed, err := parseKeys(request.Keys)
	if err != nil {
		return nil, err
	}
	line, ok := findLine(book, chapterID, request.ParagraphID)
	if request.ParagraphID == "" || !ok {
		return nil, errors.New("that paragraph is not in this chapter")
	}
	words := wordsOf(line.Text)
	cutWords := make([]CutWord, 0, len(parsed))
	for _, key := range parsed {
		if key.paragraphID != request.ParagraphID {
			return nil, errors.New("a cut's words must all be in its paragraph")
		}
		if key.ordinal >= len(words) {
			return nil, errors.New("that word is past the end of its line")
		}
		cutWords = append(cutWords, CutWord{Ordinal: key.ordinal, Text: words[key.ordinal]})
	}
	sort.SliceStable(cutWords, func(i, j int) bool { return cutWords[i].Ordinal < cutWords[j].Ordinal })
	return cutWords, nil
}

// CutRemove forgets a chapter's cut: the inverse the journal calls when the DAW change is undone in the session, or the
// narrator's choice once they have undone an earlier session's cut in the DAW. A cut that is not recorded is not an error;
// Changed is then empty.
func (s *Service) CutRemove(chapterID, id string) (CutsChange, error) {
	if s.config.Project == "" {
		return CutsChange{}, errors.New("save the project first")
	}
	if id == "" {
		return CutsChange{}, errors.New("choose a cut first")
	}
	unlock := lockFile(CutsFile(s.config.Project))
	defer unlock()
	file, err := s.readCuts()
	if err != nil {
		return CutsChange{}, err
	}
	changed := []string{}
	kept := make([]StoredCut, 0, len(file.Cuts))
	for _, cut := range file.Cuts {
		if cut.ChapterID == chapterID && cut.ID == id {
			changed = append(changed, cut.ID)
			continue
		}
		kept = append(kept, cut)
	}
	if len(changed) > 0 {
		file.Cuts = kept
		if err := writeVersioned(CutsFile(s.config.Project), cutsWhat, file); err != nil {
			return CutsChange{}, err
		}
	}
	return CutsChange{Cuts: Cuts{ChapterID: chapterID, Cuts: resolveCuts(kept, chapterID, s.manuscript())}, Changed: changed}, nil
}

// checkCutRequest refuses a request the app could not have built from an accepted DAW result.
func checkCutRequest(request CutRequest) error {
	switch {
	case request.UndoSteps == nil || strings.TrimSpace(request.GUID) == "" || strings.TrimSpace(request.Daw) == "":
		return errors.New("a cut is recorded only after the DAW made it: its result is missing")
	case *request.UndoSteps < 0:
		return errors.New("the DAW's undo steps cannot be negative")
	case request.Mode != CutClose && request.Mode != CutGap:
		return errors.New("a cut either closes the gap or leaves it")
	case !fadeAllowed(request.FadeMs):
		return errors.New("that crossfade is not one of the choices")
	case !finiteTime(request.A) || !finiteTime(request.B):
		return errors.New("a cut's times must be seconds from the start of the recording")
	case request.B <= request.A:
		return errors.New("a cut must end after it starts")
	case !finiteOffset(request.Off0) || !finiteOffset(request.Off1) || request.Off1 < request.Off0:
		return errors.New("a cut's place in its take must end after it starts")
	case strings.ContainsRune(request.ParagraphID, ':'):
		return errors.New("that paragraph is not in this chapter")
	case strings.TrimSpace(request.Text) == "":
		return errors.New("a cut must show the words it hides")
	}
	for _, text := range []string{request.Text, request.Daw, request.GUID, request.TakeID, request.BackupID} {
		if utf8.RuneCountInString(text) > MaxCutText {
			return fmt.Errorf("a cut's text can be at most %d characters", MaxCutText)
		}
	}
	return nil
}

func fadeAllowed(ms int) bool {
	for _, choice := range FadeChoices {
		if ms == choice {
			return true
		}
	}
	return false
}

func finiteTime(seconds float64) bool {
	return !math.IsNaN(seconds) && seconds >= 0 && seconds <= MaxCutSeconds
}

func finiteOffset(seconds float64) bool {
	return !math.IsNaN(seconds) && math.Abs(seconds) <= MaxCutSeconds
}

// nextCutID is "cut" and one more than the highest number a stored id carries, so an id is never reused while its cut is
// kept.
func nextCutID(cuts []StoredCut) string {
	highest := 0
	for _, cut := range cuts {
		if number, err := strconv.Atoi(strings.TrimPrefix(cut.ID, "cut")); err == nil && number > highest {
			highest = number
		}
	}
	return "cut" + strconv.Itoa(highest+1)
}

// resolveCut checks one stored cut against the current manuscript: it holds only while every word it names is the same text
// at the same ordinal of the same line. A wordless cut names no line, so it has no paragraph and is never stale.
func resolveCut(cut StoredCut, book Book) Cut {
	result := Cut{
		ID: cut.ID, ChapterID: cut.ChapterID, ParagraphID: cut.ParagraphID, TakeID: cut.TakeID, Keys: make([]string, 0, len(cut.Words)),
		Words: make([]string, 0, len(cut.Words)), Text: cut.Text, A: cut.A, B: cut.B, Off0: cut.Off0, Off1: cut.Off1, Mode: cut.Mode,
		FadeMs: cut.FadeMs, Daw: cut.Daw, GUID: cut.GUID, UndoSteps: cut.UndoSteps, BackupID: cut.BackupID, At: cut.At,
	}
	for _, word := range cut.Words {
		result.Keys = append(result.Keys, keyOf(cut.ParagraphID, word.Ordinal))
		result.Words = append(result.Words, word.Text)
	}
	if len(cut.Words) == 0 {
		return result
	}
	line, ok := findLine(book, cut.ChapterID, cut.ParagraphID)
	if !ok {
		result.Stale, result.StaleReason = true, StaleParagraphMissing
		return result
	}
	index := line.Index
	result.Paragraph = &index
	words := wordsOf(line.Text)
	for _, word := range cut.Words {
		if word.Ordinal >= len(words) {
			result.Stale, result.StaleReason = true, StaleWordMissing
			return result
		}
		if words[word.Ordinal] != word.Text {
			result.Stale, result.StaleReason = true, StaleTextChanged
			return result
		}
	}
	return result
}

// resolveCuts resolves a chapter's stored cuts in the original recording's time order (by start, then id).
func resolveCuts(stored []StoredCut, chapterID string, book Book) []Cut {
	result := []Cut{}
	for _, cut := range stored {
		if cut.ChapterID == chapterID {
			result = append(result, resolveCut(cut, book))
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].A != result[j].A {
			return result[i].A < result[j].A
		}
		return result[i].ID < result[j].ID
	})
	return result
}

// validCuts reports whether every stored cut keeps the rules CutRecord enforces; a file with one that does not is corrupt.
func validCuts(file cutsFile) error {
	seen := make(map[string]bool, len(file.Cuts))
	for _, cut := range file.Cuts {
		undo := cut.UndoSteps
		request := CutRequest{
			ParagraphID: cut.ParagraphID, TakeID: cut.TakeID, Text: cut.Text, A: cut.A, B: cut.B, Off0: cut.Off0, Off1: cut.Off1,
			Mode: cut.Mode, FadeMs: cut.FadeMs, Daw: cut.Daw, GUID: cut.GUID, UndoSteps: &undo, BackupID: cut.BackupID,
		}
		wordless := len(cut.Words) == 0
		if cut.ID == "" || cut.ChapterID == "" || wordless != (cut.ParagraphID == "") || len(cut.Words) > MaxKeys || checkCutRequest(request) != nil {
			return errors.New("a cut breaks the file's rules")
		}
		for _, word := range cut.Words {
			if word.Ordinal < 0 || word.Text == "" {
				return errors.New("a cut's word breaks the file's rules")
			}
		}
		if seen[cut.ID] {
			return errors.New("a cut is in the file twice")
		}
		seen[cut.ID] = true
	}
	return nil
}

// readCuts reads cuts.json; the caller holds the file's lock.
func (s *Service) readCuts() (cutsFile, error) {
	file := cutsFile{SchemaVersion: CutsVersion, Cuts: []StoredCut{}}
	var decoded cutsFile
	found, err := readVersioned(s.config.Reporter, CutsFile(s.config.Project), cutsWhat, CutsVersion, &decoded, validCuts)
	if err != nil {
		return cutsFile{}, err
	}
	if found && decoded.Cuts != nil {
		file.Cuts = decoded.Cuts
	}
	return file, nil
}
