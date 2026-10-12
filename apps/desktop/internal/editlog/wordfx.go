package editlog

import (
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// WordFxVersion is the only wordfx.json version this package reads or writes.
const WordFxVersion = 1

// wordFxWhat names the file for the narrator in a persist notice or an error.
const wordFxWhat = "word effects"

// MaxFxText is the longest an effect's shown words, chain id or name, list source, DAW name, guid, take or backup id may be,
// in characters.
const MaxFxText = 10000

// MaxFxFadeMs bounds the fades at an effect's splits: the app sends 8 ms; a second is far past any fade it offers.
const MaxFxFadeMs = 1000

// ErrBadChainName refuses a chain id or name that could name a file rather than an entry of the DAW's list: the bad_name
// refusal bridge.ErrBadChainName gives. Nothing is saved, and the name is never opened.
var ErrBadChainName = errors.New("that is not the name of an effect chain the DAW lists, so nothing was saved")

// WordFxFile is where a project's word effects are kept.
func WordFxFile(project string) string {
	return filepath.Join(Dir(project), "wordfx.json")
}

// FxWord is one word an effect is on: its ordinal in the effect's paragraph and the text it had when the effect was added.
type FxWord struct {
	Ordinal int    `json:"ordinal"`
	Text    string `json:"text"`
}

// WordFxRequest is what the app sends after the DAW accepted applyFxToRange: the words, the range, the chain as the DAW
// lists it, and the DAW's answer. A, B, Off0 and Off1 are in the chapter recording as it was before any cut (the app
// converts them with origTime), so a later cut moves where the effect is shown, not what is stored.
type WordFxRequest struct {
	ParagraphID string   `json:"pid"`
	TakeID      string   `json:"takeId,omitempty"`
	Keys        []string `json:"keys"`
	Text        string   `json:"text"`
	A           float64  `json:"a"`
	B           float64  `json:"b"`
	Off0        float64  `json:"off0"`
	Off1        float64  `json:"off1"`
	// ChainID is the DAW's own id for the chain (REAPER: its name relative to FXChains, from list_fx_chains), ChainName how
	// the list shows it and Source the list's title. None is ever a path.
	ChainID   string `json:"chainId"`
	ChainName string `json:"chainName"`
	Source    string `json:"source"`
	FadeMs    int    `json:"fadeMs"`
	Daw       string `json:"daw"`
	GUID      string `json:"guid"`
	BackupID  string `json:"backupId,omitempty"`
}

// StoredWordFx is one effect as kept in wordfx.json: the narrator's memory of a chain the DAW put on a range of words. The
// DAW owns the audio and the chain; this never applies or removes anything.
type StoredWordFx struct {
	ID          string    `json:"id"`
	ChapterID   string    `json:"chapterId"`
	ParagraphID string    `json:"pid"`
	TakeID      string    `json:"takeId,omitempty"`
	Words       []FxWord  `json:"words"`
	Text        string    `json:"text"`
	A           float64   `json:"a"`
	B           float64   `json:"b"`
	Off0        float64   `json:"off0"`
	Off1        float64   `json:"off1"`
	ChainID     string    `json:"chainId"`
	ChainName   string    `json:"chainName"`
	Source      string    `json:"source"`
	FadeMs      int       `json:"fadeMs"`
	Daw         string    `json:"daw"`
	GUID        string    `json:"guid"`
	BackupID    string    `json:"backupId,omitempty"`
	At          time.Time `json:"at"`
}

// WordFx is an effect as the UI gets it: the mock's WordFx with the word texts beside the keys, where its line is now, and
// whether it is stale. A stale effect's words changed since it was added: it is reported, never moved to a guess.
type WordFx struct {
	ID          string   `json:"id"`
	ChapterID   string   `json:"chapterId"`
	ParagraphID string   `json:"pid"`
	TakeID      string   `json:"takeId,omitempty"`
	Keys        []string `json:"keys"`
	// Words is the text each key had when the effect was added, in the order of Keys.
	Words     []string  `json:"words"`
	Text      string    `json:"text"`
	A         float64   `json:"a"`
	B         float64   `json:"b"`
	Off0      float64   `json:"off0"`
	Off1      float64   `json:"off1"`
	ChainID   string    `json:"chainId"`
	ChainName string    `json:"chainName"`
	Source    string    `json:"source"`
	FadeMs    int       `json:"fadeMs"`
	Daw       string    `json:"daw"`
	GUID      string    `json:"guid"`
	BackupID  string    `json:"backupId,omitempty"`
	At        time.Time `json:"at"`
	// Paragraph is the line's index in the manuscript, or nil when the line is gone.
	Paragraph   *int   `json:"paragraph"`
	Stale       bool   `json:"stale"`
	StaleReason string `json:"staleReason,omitempty"`
}

// WordFxList is one chapter's word effects in the original recording's time order.
type WordFxList struct {
	ChapterID string   `json:"chapterId"`
	Effects   []WordFx `json:"effects"`
}

// WordFxChange is what Record and Remove answer: the chapter's effects after the call, the ids the call changed (empty when
// a Remove named an effect that is not recorded), and, for a Record, the ids of the effects already on some of the same
// words (a chain on top of a chain is allowed; the page says so).
type WordFxChange struct {
	WordFxList
	Changed []string `json:"changed"`
	Over    []string `json:"over"`
}

type wordFxFile struct {
	SchemaVersion int            `json:"schemaVersion"`
	Effects       []StoredWordFx `json:"effects"`
}

// WordFxList returns a chapter's word effects in time order, each checked against the current manuscript.
func (s *Service) WordFxList(chapterID string) (WordFxList, error) {
	result := WordFxList{ChapterID: chapterID, Effects: []WordFx{}}
	if s.config.Project == "" {
		return result, nil
	}
	unlock := lockFile(WordFxFile(s.config.Project))
	defer unlock()
	file, err := s.readWordFx()
	if err != nil {
		return result, err
	}
	result.Effects = resolveWordFxs(file.Effects, chapterID, s.manuscript())
	return result, nil
}

// WordFxRecord stores an effect the DAW has added. The words must be words of one paragraph's current text, the range must
// be one the app can send, the chain must be named as the DAW lists it and the DAW's result must be given; otherwise
// nothing is saved and the answer says why. An effect on words that already carry one is recorded too, and Over names the
// effects it is on top of.
func (s *Service) WordFxRecord(chapterID string, request WordFxRequest) (WordFxChange, error) {
	if s.config.Project == "" {
		return WordFxChange{}, errors.New("save the project first")
	}
	if err := checkWordFxRequest(request); err != nil {
		return WordFxChange{}, err
	}
	parsed, err := parseKeys(request.Keys)
	if err != nil {
		return WordFxChange{}, err
	}
	book := s.manuscript()
	if !hasChapter(book, chapterID) {
		return WordFxChange{}, errors.New("that chapter is not in the manuscript")
	}
	line, ok := findLine(book, chapterID, request.ParagraphID)
	if !ok {
		return WordFxChange{}, errors.New("that paragraph is not in this chapter")
	}
	words := wordsOf(line.Text)
	fxWords := make([]FxWord, 0, len(parsed))
	for _, key := range parsed {
		if key.paragraphID != request.ParagraphID {
			return WordFxChange{}, errors.New("these words sit in more than one take: an effect needs words from one take")
		}
		if key.ordinal >= len(words) {
			return WordFxChange{}, errors.New("that word is past the end of its line")
		}
		fxWords = append(fxWords, FxWord{Ordinal: key.ordinal, Text: words[key.ordinal]})
	}
	sort.SliceStable(fxWords, func(i, j int) bool { return fxWords[i].Ordinal < fxWords[j].Ordinal })
	unlock := lockFile(WordFxFile(s.config.Project))
	defer unlock()
	file, err := s.readWordFx()
	if err != nil {
		return WordFxChange{}, err
	}
	over := []string{}
	for _, stored := range file.Effects {
		if stored.ChapterID == chapterID && stored.ParagraphID == request.ParagraphID && sharesWord(stored.Words, fxWords) {
			over = append(over, stored.ID)
		}
	}
	fx := StoredWordFx{
		ID: nextWordFxID(file.Effects), ChapterID: chapterID, ParagraphID: request.ParagraphID, TakeID: request.TakeID, Words: fxWords,
		Text: request.Text, A: request.A, B: request.B, Off0: request.Off0, Off1: request.Off1, ChainID: request.ChainID,
		ChainName: request.ChainName, Source: request.Source, FadeMs: request.FadeMs, Daw: request.Daw, GUID: request.GUID,
		BackupID: request.BackupID, At: s.now().UTC(),
	}
	file.Effects = append(file.Effects, fx)
	if err := writeVersioned(WordFxFile(s.config.Project), wordFxWhat, file); err != nil {
		return WordFxChange{}, err
	}
	list := WordFxList{ChapterID: chapterID, Effects: resolveWordFxs(file.Effects, chapterID, book)}
	return WordFxChange{WordFxList: list, Changed: []string{fx.ID}, Over: over}, nil
}

// WordFxRemove forgets a chapter's effect: the inverse the journal calls when the DAW change is undone in the session, or
// what is recorded once the DAW took the chain off. An effect that is not recorded is not an error; Changed is then empty.
func (s *Service) WordFxRemove(chapterID, id string) (WordFxChange, error) {
	if s.config.Project == "" {
		return WordFxChange{}, errors.New("save the project first")
	}
	if id == "" {
		return WordFxChange{}, errors.New("choose an effect first")
	}
	unlock := lockFile(WordFxFile(s.config.Project))
	defer unlock()
	file, err := s.readWordFx()
	if err != nil {
		return WordFxChange{}, err
	}
	changed := []string{}
	kept := make([]StoredWordFx, 0, len(file.Effects))
	for _, fx := range file.Effects {
		if fx.ChapterID == chapterID && fx.ID == id {
			changed = append(changed, fx.ID)
			continue
		}
		kept = append(kept, fx)
	}
	if len(changed) > 0 {
		file.Effects = kept
		if err := writeVersioned(WordFxFile(s.config.Project), wordFxWhat, file); err != nil {
			return WordFxChange{}, err
		}
	}
	list := WordFxList{ChapterID: chapterID, Effects: resolveWordFxs(kept, chapterID, s.manuscript())}
	return WordFxChange{WordFxList: list, Changed: changed, Over: []string{}}, nil
}

// checkWordFxRequest refuses a request the app could not have built from an accepted DAW result and a chain the DAW listed.
func checkWordFxRequest(request WordFxRequest) error {
	switch {
	case strings.TrimSpace(request.GUID) == "" || strings.TrimSpace(request.Daw) == "":
		return errors.New("an effect is recorded only after the DAW added it: its result is missing")
	case !listName(request.ChainID) || !listName(request.ChainName):
		return ErrBadChainName
	case strings.TrimSpace(request.Source) == "":
		return errors.New("an effect must name the list it came from")
	case request.FadeMs < 0 || request.FadeMs > MaxFxFadeMs:
		return fmt.Errorf("an effect's fades must be 0 to %d ms", MaxFxFadeMs)
	case !finiteTime(request.A) || !finiteTime(request.B):
		return errors.New("an effect's times must be seconds from the start of the recording")
	case request.B <= request.A:
		return errors.New("an effect must end after it starts")
	case !finiteOffset(request.Off0) || !finiteOffset(request.Off1) || request.Off1 < request.Off0:
		return errors.New("an effect's place in its take must end after it starts")
	case request.ParagraphID == "" || strings.ContainsRune(request.ParagraphID, ':'):
		return errors.New("that paragraph is not in this chapter")
	case strings.TrimSpace(request.Text) == "":
		return errors.New("an effect must show the words it is on")
	}
	for _, text := range []string{request.Text, request.ChainID, request.ChainName, request.Source, request.Daw, request.GUID, request.TakeID, request.BackupID} {
		if utf8.RuneCountInString(text) > MaxFxText {
			return fmt.Errorf("an effect's text can be at most %d characters", MaxFxText)
		}
	}
	return nil
}

// listName reports whether a chain id or name could only be an entry of the DAW's list, never a path: not blank, no control
// character, no backslash or drive colon, and, split at "/", no empty, "." or ".." part. REAPER lists a chain in a subfolder
// of FXChains as "Folder/Name.RfxChain", which passes; an absolute path or one that climbs out does not.
func listName(name string) bool {
	if strings.TrimSpace(name) == "" || strings.ContainsAny(name, `\:`) {
		return false
	}
	for _, character := range name {
		if unicode.IsControl(character) {
			return false
		}
	}
	for _, part := range strings.Split(name, "/") {
		if part == "" || part == "." || part == ".." {
			return false
		}
	}
	return true
}

func sharesWord(stored, added []FxWord) bool {
	for _, a := range stored {
		for _, b := range added {
			if a.Ordinal == b.Ordinal {
				return true
			}
		}
	}
	return false
}

// nextWordFxID is "fx" and one more than the highest number a stored id carries, so an id is never reused while its effect
// is kept.
func nextWordFxID(effects []StoredWordFx) string {
	highest := 0
	for _, fx := range effects {
		if number, err := strconv.Atoi(strings.TrimPrefix(fx.ID, "fx")); err == nil && number > highest {
			highest = number
		}
	}
	return "fx" + strconv.Itoa(highest+1)
}

// resolveWordFx checks one stored effect against the current manuscript: it holds only while every word it names is the
// same text at the same ordinal of the same line.
func resolveWordFx(fx StoredWordFx, book Book) WordFx {
	result := WordFx{
		ID: fx.ID, ChapterID: fx.ChapterID, ParagraphID: fx.ParagraphID, TakeID: fx.TakeID, Keys: make([]string, 0, len(fx.Words)),
		Words: make([]string, 0, len(fx.Words)), Text: fx.Text, A: fx.A, B: fx.B, Off0: fx.Off0, Off1: fx.Off1, ChainID: fx.ChainID,
		ChainName: fx.ChainName, Source: fx.Source, FadeMs: fx.FadeMs, Daw: fx.Daw, GUID: fx.GUID, BackupID: fx.BackupID, At: fx.At,
	}
	for _, word := range fx.Words {
		result.Keys = append(result.Keys, keyOf(fx.ParagraphID, word.Ordinal))
		result.Words = append(result.Words, word.Text)
	}
	line, ok := findLine(book, fx.ChapterID, fx.ParagraphID)
	if !ok {
		result.Stale, result.StaleReason = true, StaleParagraphMissing
		return result
	}
	index := line.Index
	result.Paragraph = &index
	words := wordsOf(line.Text)
	for _, word := range fx.Words {
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

// resolveWordFxs resolves a chapter's stored effects in the original recording's time order (by start, then id).
func resolveWordFxs(stored []StoredWordFx, chapterID string, book Book) []WordFx {
	result := []WordFx{}
	for _, fx := range stored {
		if fx.ChapterID == chapterID {
			result = append(result, resolveWordFx(fx, book))
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

// validWordFx reports whether every stored effect keeps the rules WordFxRecord enforces; a file with one that does not is
// corrupt.
func validWordFx(file wordFxFile) error {
	seen := make(map[string]bool, len(file.Effects))
	for _, fx := range file.Effects {
		request := WordFxRequest{
			ParagraphID: fx.ParagraphID, TakeID: fx.TakeID, Text: fx.Text, A: fx.A, B: fx.B, Off0: fx.Off0, Off1: fx.Off1,
			ChainID: fx.ChainID, ChainName: fx.ChainName, Source: fx.Source, FadeMs: fx.FadeMs, Daw: fx.Daw, GUID: fx.GUID,
			BackupID: fx.BackupID,
		}
		if fx.ID == "" || fx.ChapterID == "" || len(fx.Words) == 0 || len(fx.Words) > MaxKeys || checkWordFxRequest(request) != nil {
			return errors.New("a word effect breaks the file's rules")
		}
		for _, word := range fx.Words {
			if word.Ordinal < 0 || word.Text == "" {
				return errors.New("a word effect's word breaks the file's rules")
			}
		}
		if seen[fx.ID] {
			return errors.New("a word effect is in the file twice")
		}
		seen[fx.ID] = true
	}
	return nil
}

// readWordFx reads wordfx.json; the caller holds the file's lock.
func (s *Service) readWordFx() (wordFxFile, error) {
	file := wordFxFile{SchemaVersion: WordFxVersion, Effects: []StoredWordFx{}}
	var decoded wordFxFile
	found, err := readVersioned(s.config.Reporter, WordFxFile(s.config.Project), wordFxWhat, WordFxVersion, &decoded, validWordFx)
	if err != nil {
		return wordFxFile{}, err
	}
	if found && decoded.Effects != nil {
		file.Effects = decoded.Effects
	}
	return file, nil
}
