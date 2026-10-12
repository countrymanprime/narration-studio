package editlog

import (
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// The stack record and the retry choice (ADR 0858): where each take stacked on a passage's first read began before it was
// stacked, so un-stacking can put it back, and whether the narrator keeps a passage's retries stacked or leaves them where they
// were recorded. Both live in stacks.json, apart from the passage list, so re-reading the passages from a newer Booth map
// keeps them. A stack is recorded only after the DAW accepted stackTakes, and recording or removing one changes nothing in the
// DAW.

// StacksVersion is the only stacks.json version this package reads or writes.
const StacksVersion = 1

// stacksWhat names the file for the narrator in a persist notice or an error.
const stacksWhat = "stacked takes"

// MaxStackTakes is the most takes one passage offers or one stack moves: the bridge's MaxStackMoves for a whole request.
const MaxStackTakes = 500

// MaxRetryPassages is the most passages that can have a retry mode of their own: more than any book's passages.
const MaxRetryPassages = 5000

// MaxStackID is the longest a passage, take or backup id may be, in characters.
const MaxStackID = 256

// MaxStackSteps is the most edits a steps DAW's result may list, and MaxStackStepText the longest one, in characters.
const (
	MaxStackSteps    = 64
	MaxStackStepText = 1000
)

// MaxStackUndoSteps is the most undo points a stack's DAW result may report: dawport.MaxUndoSteps.
const MaxStackUndoSteps = 12

// maxStackOffset is the furthest after the first read a stacked take can have begun: 7 days, as a cut's times.
const maxStackOffset = 7 * 24 * 3600

// The ways a DAW makes a change (port.Mode): itself as one undo step, in the app (the built-in recorder), or as edits the app
// performs one after another (Audacity, after a backup).
const (
	StackModeNative = "native"
	StackModeApp    = "app"
	StackModeSteps  = "steps"
)

// RetryMode is how a passage's retries are kept: stacked on the first read's spot, or left where they were recorded. Nothing is
// stacked by itself: the mode decides only what the page offers.
type RetryMode string

// The two retry modes; RetryLeave is the default.
const (
	RetryStack RetryMode = "stack"
	RetryLeave RetryMode = "leave"
)

// The levels a retry mode is set at; a passage's overrides its chapter's, which overrides the project's.
const (
	RetryLevelProject = "project"
	RetryLevelChapter = "chapter"
	RetryLevelPassage = "passage"
	// RetryLevelDefault is where a mode set at no level comes from.
	RetryLevelDefault = "default"
)

// StacksFile is where a project's stacks and retry modes are kept.
func StacksFile(project string) string {
	return filepath.Join(Dir(project), "stacks.json")
}

// StackMove is one take a stack moved onto the first read: its id as WorkspaceTakes offered it, and the seconds after the
// first read's start where it began before it was stacked.
type StackMove struct {
	TakeID string  `json:"takeId"`
	Offset float64 `json:"offset"`
}

// StackRecordRequest is what the app sends after the DAW accepted stackTakes: the passage, its first read, the takes the
// passage offers, the moves, and the DAW's result. UndoSteps is a pointer so a request without it is refused, not read as 0.
type StackRecordRequest struct {
	PassageID string      `json:"passageId"`
	Base      string      `json:"base"`
	Takes     []string    `json:"takes"`
	Moves     []StackMove `json:"moves"`
	Mode      string      `json:"mode"`
	UndoSteps *int        `json:"undoSteps"`
	Steps     []string    `json:"steps,omitempty"`
	BackupID  string      `json:"backupId,omitempty"`
}

// PassageStack is one passage's stack: the mock's PassageStack with its chapter, and the DAW's result for the last record
// that added to it. Offsets are by take id; a take leaves them when it is un-stacked, and the stack goes with its last take.
type PassageStack struct {
	ID        string             `json:"id"`
	ChapterID string             `json:"chapterId"`
	PassageID string             `json:"passageId"`
	Base      string             `json:"base"`
	Offsets   map[string]float64 `json:"offsets"`
	Mode      string             `json:"mode"`
	UndoSteps int                `json:"undoSteps"`
	Steps     []string           `json:"steps,omitempty"`
	BackupID  string             `json:"backupId,omitempty"`
	At        time.Time          `json:"at"`
}

// StackList is one chapter's stacks, by passage id.
type StackList struct {
	ChapterID string         `json:"chapterId"`
	Stacks    []PassageStack `json:"stacks"`
}

// StackChange is what Record and Remove answer: the chapter's stacks after the call and the take ids the call changed (empty
// when a Remove named takes that are not stacked).
type StackChange struct {
	StackList
	Changed []string `json:"changed"`
}

// RetryModeAnswer is a level's retry mode: what applies there (Mode, from the level named by From), and what is set at that
// level itself (Set; absent when it follows the level above).
type RetryModeAnswer struct {
	Level     string    `json:"level"`
	ChapterID string    `json:"chapterId,omitempty"`
	PassageID string    `json:"passageId,omitempty"`
	Mode      RetryMode `json:"mode"`
	From      string    `json:"from"`
	Set       RetryMode `json:"set,omitempty"`
}

type passageRetry struct {
	ChapterID string    `json:"chapterId"`
	PassageID string    `json:"passageId"`
	Mode      RetryMode `json:"mode"`
}

type retryModes struct {
	Project  RetryMode            `json:"project,omitempty"`
	Chapters map[string]RetryMode `json:"chapters"`
	Passages []passageRetry       `json:"passages"`
}

type stacksFile struct {
	SchemaVersion int            `json:"schemaVersion"`
	Stacks        []PassageStack `json:"stacks"`
	Retry         retryModes     `json:"retry"`
}

// StacksList returns a chapter's stacks by passage id.
func (s *Service) StacksList(chapterID string) (StackList, error) {
	result := StackList{ChapterID: chapterID, Stacks: []PassageStack{}}
	if s.config.Project == "" {
		return result, nil
	}
	unlock := lockFile(StacksFile(s.config.Project))
	defer unlock()
	file, err := s.readStacks()
	if err != nil {
		return result, err
	}
	result.Stacks = chapterStacks(file.Stacks, chapterID)
	return result, nil
}

// StackRecord stores the takes the DAW stacked on a passage's first read. The base and every moved take must be takes the
// passage offers, no take is moved twice or onto itself, every offset is finite and not negative, and the DAW's result must be
// given (its undo steps, and for a steps DAW its steps and the backup taken first); otherwise nothing is saved and the answer
// says why. A passage already stacked takes more takes onto the same first read, never a take it already holds.
func (s *Service) StackRecord(chapterID string, request StackRecordRequest) (StackChange, error) {
	if s.config.Project == "" {
		return StackChange{}, errors.New("save the project first")
	}
	if err := checkStackRequest(request); err != nil {
		return StackChange{}, err
	}
	if !hasChapter(s.manuscript(), chapterID) {
		return StackChange{}, errors.New("that chapter is not in the manuscript")
	}
	unlock := lockFile(StacksFile(s.config.Project))
	defer unlock()
	file, err := s.readStacks()
	if err != nil {
		return StackChange{}, err
	}
	index := -1
	for i, stack := range file.Stacks {
		if stack.PassageID == request.PassageID {
			index = i
		}
	}
	stack := PassageStack{ID: "stk-" + request.PassageID, ChapterID: chapterID, PassageID: request.PassageID, Base: request.Base, Offsets: map[string]float64{}}
	if index >= 0 {
		stack = file.Stacks[index]
		stack.Offsets = copyOffsets(stack.Offsets)
		switch {
		case stack.ChapterID != chapterID:
			return StackChange{}, errors.New("that passage is stacked in another chapter")
		case stack.Base != request.Base:
			return StackChange{}, errors.New("this passage is already stacked on another first read: put those takes back first")
		}
	}
	changed := make([]string, 0, len(request.Moves))
	for _, move := range request.Moves {
		if _, stacked := stack.Offsets[move.TakeID]; stacked {
			return StackChange{}, errors.New("that take is already stacked on this passage, so nothing was saved")
		}
		stack.Offsets[move.TakeID] = move.Offset
		changed = append(changed, move.TakeID)
	}
	if len(stack.Offsets) > MaxStackTakes {
		return StackChange{}, fmt.Errorf("a passage can have at most %d stacked takes", MaxStackTakes)
	}
	stack.Mode, stack.UndoSteps, stack.Steps, stack.BackupID = request.Mode, *request.UndoSteps, append([]string(nil), request.Steps...), request.BackupID
	stack.At = s.now().UTC()
	if index >= 0 {
		file.Stacks[index] = stack
	} else {
		file.Stacks = append(file.Stacks, stack)
	}
	if err := writeVersioned(StacksFile(s.config.Project), stacksWhat, file); err != nil {
		return StackChange{}, err
	}
	sort.Strings(changed)
	return StackChange{StackList: StackList{ChapterID: chapterID, Stacks: chapterStacks(file.Stacks, chapterID)}, Changed: changed}, nil
}

// StackRemove forgets stacked takes of a passage once the DAW put them back (unstackTakes), or when the journal undoes the
// stack in the session: a partial un-stack names some takes, and the stack goes with its last one. A take that is not stacked
// is not an error; Changed lists only the takes removed.
func (s *Service) StackRemove(chapterID, passageID string, takeIDs []string) (StackChange, error) {
	if s.config.Project == "" {
		return StackChange{}, errors.New("save the project first")
	}
	if len(takeIDs) == 0 {
		return StackChange{}, errors.New("choose the takes to put back first")
	}
	if len(takeIDs) > MaxStackTakes {
		return StackChange{}, fmt.Errorf("at most %d takes can be put back at once", MaxStackTakes)
	}
	unlock := lockFile(StacksFile(s.config.Project))
	defer unlock()
	file, err := s.readStacks()
	if err != nil {
		return StackChange{}, err
	}
	changed := []string{}
	kept := make([]PassageStack, 0, len(file.Stacks))
	for _, stack := range file.Stacks {
		if stack.ChapterID == chapterID && stack.PassageID == passageID {
			stack.Offsets = copyOffsets(stack.Offsets)
			for _, id := range takeIDs {
				if _, stacked := stack.Offsets[id]; stacked {
					delete(stack.Offsets, id)
					changed = append(changed, id)
				}
			}
			if len(stack.Offsets) == 0 {
				continue
			}
		}
		kept = append(kept, stack)
	}
	if len(changed) > 0 {
		file.Stacks = kept
		if err := writeVersioned(StacksFile(s.config.Project), stacksWhat, file); err != nil {
			return StackChange{}, err
		}
	}
	sort.Strings(changed)
	return StackChange{StackList: StackList{ChapterID: chapterID, Stacks: chapterStacks(file.Stacks, chapterID)}, Changed: changed}, nil
}

// RetryModeGet answers the retry mode at a level: a passage's own, else its chapter's, else the project's, else leave. The
// project level names no chapter or passage, the chapter level a chapter, and the passage level both.
func (s *Service) RetryModeGet(level, chapterID, passageID string) (RetryModeAnswer, error) {
	if err := checkRetryScope(level, chapterID, passageID); err != nil {
		return RetryModeAnswer{}, err
	}
	file := stacksFile{Retry: retryModes{Chapters: map[string]RetryMode{}}}
	if s.config.Project != "" {
		unlock := lockFile(StacksFile(s.config.Project))
		defer unlock()
		read, err := s.readStacks()
		if err != nil {
			return RetryModeAnswer{}, err
		}
		file = read
	}
	return resolveRetry(file.Retry, level, chapterID, passageID), nil
}

// RetryModeSet sets the retry mode at a level, or with an empty mode takes it back so the level follows the one above (the
// project's goes back to leave). The chapter must be in the manuscript.
func (s *Service) RetryModeSet(level, chapterID, passageID string, mode RetryMode) (RetryModeAnswer, error) {
	if s.config.Project == "" {
		return RetryModeAnswer{}, errors.New("save the project first")
	}
	if err := checkRetryScope(level, chapterID, passageID); err != nil {
		return RetryModeAnswer{}, err
	}
	if mode != "" && mode != RetryStack && mode != RetryLeave {
		return RetryModeAnswer{}, errors.New("retries are either stacked or left where they were recorded")
	}
	if level != RetryLevelProject && !hasChapter(s.manuscript(), chapterID) {
		return RetryModeAnswer{}, errors.New("that chapter is not in the manuscript")
	}
	unlock := lockFile(StacksFile(s.config.Project))
	defer unlock()
	file, err := s.readStacks()
	if err != nil {
		return RetryModeAnswer{}, err
	}
	retry := retryModes{Project: file.Retry.Project, Chapters: map[string]RetryMode{}, Passages: []passageRetry{}}
	for id, chapterMode := range file.Retry.Chapters {
		retry.Chapters[id] = chapterMode
	}
	for _, passage := range file.Retry.Passages {
		if level != RetryLevelPassage || passage.ChapterID != chapterID || passage.PassageID != passageID {
			retry.Passages = append(retry.Passages, passage)
		}
	}
	switch level {
	case RetryLevelProject:
		retry.Project = mode
	case RetryLevelChapter:
		delete(retry.Chapters, chapterID)
		if mode != "" {
			retry.Chapters[chapterID] = mode
		}
	case RetryLevelPassage:
		if mode != "" {
			retry.Passages = append(retry.Passages, passageRetry{ChapterID: chapterID, PassageID: passageID, Mode: mode})
		}
	}
	sort.SliceStable(retry.Passages, func(i, j int) bool { return retry.Passages[i].PassageID < retry.Passages[j].PassageID })
	if len(retry.Passages) > MaxRetryPassages {
		return RetryModeAnswer{}, errors.New("too many passages have their own retry mode")
	}
	file.Retry = retry
	if err := writeVersioned(StacksFile(s.config.Project), stacksWhat, file); err != nil {
		return RetryModeAnswer{}, err
	}
	return resolveRetry(file.Retry, level, chapterID, passageID), nil
}

func resolveRetry(retry retryModes, level, chapterID, passageID string) RetryModeAnswer {
	answer := RetryModeAnswer{Level: level, Mode: RetryLeave, From: RetryLevelDefault}
	if retry.Project != "" {
		answer.Mode, answer.From = retry.Project, RetryLevelProject
	}
	if level == RetryLevelProject {
		answer.Set = retry.Project
		return answer
	}
	answer.ChapterID = chapterID
	if chapterMode, ok := retry.Chapters[chapterID]; ok {
		answer.Mode, answer.From = chapterMode, RetryLevelChapter
		if level == RetryLevelChapter {
			answer.Set = chapterMode
		}
	}
	if level == RetryLevelChapter {
		return answer
	}
	answer.PassageID = passageID
	for _, passage := range retry.Passages {
		if passage.ChapterID == chapterID && passage.PassageID == passageID {
			answer.Mode, answer.From, answer.Set = passage.Mode, RetryLevelPassage, passage.Mode
		}
	}
	return answer
}

func checkRetryScope(level, chapterID, passageID string) error {
	switch level {
	case RetryLevelProject:
		if chapterID != "" || passageID != "" {
			return errors.New("the project's retry mode names no chapter or passage")
		}
	case RetryLevelChapter:
		if !plainID(chapterID) || passageID != "" {
			return errors.New("a chapter's retry mode names its chapter and no passage")
		}
	case RetryLevelPassage:
		if !plainID(chapterID) || !plainID(passageID) {
			return errors.New("a passage's retry mode names its chapter and its passage")
		}
	default:
		return errors.New("a retry mode is set for the project, a chapter or a passage")
	}
	return nil
}

// checkStackRequest refuses a request the app could not have built from a passage's takes and an accepted DAW result.
func checkStackRequest(request StackRecordRequest) error {
	if !plainID(request.PassageID) {
		return errors.New("that passage is not one the Takes panel offers")
	}
	if len(request.Takes) > MaxStackTakes {
		return fmt.Errorf("a passage can offer at most %d takes", MaxStackTakes)
	}
	offered := make(map[string]bool, len(request.Takes))
	for _, id := range request.Takes {
		if !plainID(id) {
			return errors.New("a take is named by the id the Takes panel offers")
		}
		offered[id] = true
	}
	if !offered[request.Base] {
		return errors.New("the first read is not a take of this passage")
	}
	if len(request.Moves) == 0 {
		return errors.New("there are no takes to stack")
	}
	moved := make(map[string]bool, len(request.Moves))
	for _, move := range request.Moves {
		switch {
		case !offered[move.TakeID]:
			return errors.New("that take is not a take of this passage")
		case move.TakeID == request.Base:
			return errors.New("the first read stays where it is: it is not stacked on itself")
		case moved[move.TakeID]:
			return errors.New("a take is stacked once")
		case math.IsNaN(move.Offset) || math.IsInf(move.Offset, 0) || move.Offset < 0 || move.Offset > maxStackOffset:
			return errors.New("a stacked take's offset must be the seconds after the first read's start where it began")
		}
		moved[move.TakeID] = true
	}
	return checkStackResult(request.Mode, request.UndoSteps, request.Steps, request.BackupID)
}

// checkStackResult refuses a record without the DAW's accepted result: its undo steps (at least one, except in the app), and for
// a steps DAW its steps and the backup taken before them.
func checkStackResult(mode string, undoSteps *int, steps []string, backupID string) error {
	if undoSteps == nil || *undoSteps < 0 || *undoSteps > MaxStackUndoSteps {
		return errors.New("a stack is recorded only after the DAW stacked the takes: its result is missing")
	}
	if backupID != "" && !plainID(backupID) {
		return errors.New("a backup is named by the id the DAW gave it")
	}
	if len(steps) > MaxStackSteps {
		return fmt.Errorf("a stack's result can list at most %d steps", MaxStackSteps)
	}
	for _, step := range steps {
		if strings.TrimSpace(step) == "" || utf8.RuneCountInString(step) > MaxStackStepText || hasControl(step) {
			return errors.New("each step of a stack's result must say what was done in one line")
		}
	}
	switch mode {
	case StackModeNative:
		if *undoSteps < 1 || len(steps) > 0 {
			return errors.New("a stack the DAW made itself is one undo step or more, and lists no steps")
		}
	case StackModeApp:
		if len(steps) > 0 {
			return errors.New("a stack the app made lists no steps")
		}
	case StackModeSteps:
		if *undoSteps < 1 || len(steps) == 0 || backupID == "" {
			return errors.New("a stack made in steps needs the DAW's steps and the backup taken before them")
		}
	default:
		return errors.New("a stack is recorded only after the DAW stacked the takes: its result is missing")
	}
	return nil
}

// plainID reports whether an id could only be an id the host offered, never a path or markup: not blank, at most MaxStackID
// characters, and no space, control character, slash or backslash.
func plainID(id string) bool {
	if id == "" || utf8.RuneCountInString(id) > MaxStackID || strings.ContainsAny(id, `/\<>`) {
		return false
	}
	for _, character := range id {
		if unicode.IsSpace(character) || unicode.IsControl(character) || character == 0xfeff {
			return false
		}
	}
	return true
}

func hasControl(text string) bool {
	for _, character := range text {
		if unicode.IsControl(character) {
			return true
		}
	}
	return false
}

func copyOffsets(offsets map[string]float64) map[string]float64 {
	copied := make(map[string]float64, len(offsets))
	for id, offset := range offsets {
		copied[id] = offset
	}
	return copied
}

// chapterStacks is a chapter's stacks by passage id.
func chapterStacks(stacks []PassageStack, chapterID string) []PassageStack {
	result := []PassageStack{}
	for _, stack := range stacks {
		if stack.ChapterID == chapterID {
			result = append(result, stack)
		}
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].PassageID < result[j].PassageID })
	return result
}

// validStacks reports whether the file keeps the rules StackRecord and RetryModeSet enforce; a file that does not is corrupt.
func validStacks(file stacksFile) error {
	seen := make(map[string]bool, len(file.Stacks))
	for _, stack := range file.Stacks {
		undoSteps := stack.UndoSteps
		if stack.ID != "stk-"+stack.PassageID || !plainID(stack.ChapterID) || !plainID(stack.PassageID) || !plainID(stack.Base) ||
			len(stack.Offsets) == 0 || len(stack.Offsets) > MaxStackTakes || checkStackResult(stack.Mode, &undoSteps, stack.Steps, stack.BackupID) != nil {
			return errors.New("a stack breaks the file's rules")
		}
		for id, offset := range stack.Offsets {
			if !plainID(id) || id == stack.Base || math.IsNaN(offset) || math.IsInf(offset, 0) || offset < 0 || offset > maxStackOffset {
				return errors.New("a stacked take breaks the file's rules")
			}
		}
		if seen[stack.PassageID] {
			return errors.New("a passage is stacked in the file twice")
		}
		seen[stack.PassageID] = true
	}
	validMode := func(mode RetryMode) bool { return mode == RetryStack || mode == RetryLeave }
	if file.Retry.Project != "" && !validMode(file.Retry.Project) {
		return errors.New("the project's retry mode breaks the file's rules")
	}
	for id, mode := range file.Retry.Chapters {
		if !plainID(id) || !validMode(mode) {
			return errors.New("a chapter's retry mode breaks the file's rules")
		}
	}
	passages := make(map[string]bool, len(file.Retry.Passages))
	for _, passage := range file.Retry.Passages {
		key := passage.ChapterID + "\x00" + passage.PassageID
		if !plainID(passage.ChapterID) || !plainID(passage.PassageID) || !validMode(passage.Mode) || passages[key] {
			return errors.New("a passage's retry mode breaks the file's rules")
		}
		passages[key] = true
	}
	if len(passages) > MaxRetryPassages {
		return errors.New("the file has too many passage retry modes")
	}
	return nil
}

// readStacks reads stacks.json; the caller holds the file's lock.
func (s *Service) readStacks() (stacksFile, error) {
	file := stacksFile{SchemaVersion: StacksVersion, Stacks: []PassageStack{}, Retry: retryModes{Chapters: map[string]RetryMode{}, Passages: []passageRetry{}}}
	var decoded stacksFile
	found, err := readVersioned(s.config.Reporter, StacksFile(s.config.Project), stacksWhat, StacksVersion, &decoded, validStacks)
	if err != nil {
		return stacksFile{}, err
	}
	if !found {
		return file, nil
	}
	if decoded.Stacks != nil {
		file.Stacks = decoded.Stacks
	}
	file.Retry.Project = decoded.Retry.Project
	if decoded.Retry.Chapters != nil {
		file.Retry.Chapters = decoded.Retry.Chapters
	}
	if decoded.Retry.Passages != nil {
		file.Retry.Passages = decoded.Retry.Passages
	}
	return file, nil
}
