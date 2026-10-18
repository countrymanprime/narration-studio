// Package voicesample keeps the clips a narrator marks as how a character sounds: a stretch of one take, copied out of the
// recording into <project>/narration-utils/voice-samples/ with a short record of where it came from, so it plays anywhere,
// with no DAW, no source file and no project of the right version (docs/prds/character-voice-samples.prd.md, What is stored).
//
// The page names a stretch by chapter, item and take GUIDs, a range in seconds and two word keys, never a path. The host finds
// the audio file in the saved REAPER project by GUID, checks the stretch against the chapter's current recording check and the
// cuts the narrator made, adds a 150 ms handle each side, cuts both ends at the nearest zero crossing and copies the window in
// the source's own format: no resampling, no dithering, no ffmpeg. The clip is written before its row, and the row is written
// through a temporary file and a rename.
//
// samples.json is narrator data read through persist: a file that does not decode or breaks a rule is kept aside and a fresh
// one starts; one written by a newer app is refused and never overwritten. The clip's file name is derived from the sample's
// 32-hex id and nothing stored names a path the host opens: source.sourceFile is provenance only. Whether the words still read as
// they did (SourceState) and whether the clip is still the file that was saved (ClipState) are computed on every read and never
// stored. Kept through a manuscript replace; removed by Clear project data and by deleting the sample. Nothing here touches the
// DAW.
package voicesample

import (
	"errors"
	"sync"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// Version is the only samples.json version this package reads or writes.
const Version = 1

// NarrationCharacterID is the reserved character id for plain narration, as in internal/character. Any other character id is a
// Story Bible entity id this package never validates against the Story Bible.
const NarrationCharacterID = "narration"

// The limits the owner decided (PRD, Open Questions 6).
const (
	// MinSeconds and MaxSeconds bound one clip's length, handles included.
	MinSeconds = 0.5
	MaxSeconds = 30.0
	// HandleSeconds is the audio kept beyond the marked words on each side, clamped to the played range and to any cut.
	HandleSeconds = 0.15
	// MaxPerCharacter is how many samples one character may have.
	MaxPerCharacter = 20
	// MaxProjectBytes is how much clip audio a project may hold: 200 MiB.
	MaxProjectBytes = 200 << 20
	// MaxLabelUnits and MaxNoteUnits are the bookmark limits, in UTF-16 units (a JS string's length).
	MaxLabelUnits = 60
	MaxNoteUnits  = 500
)

// maxCharacterID bounds a character id: far longer than any entity id.
const maxCharacterID = 128

// ErrInvalid wraps a request the page could not have built: a missing id, a range that is not finite, text over its limit. It is
// an error, not a Refusal: a refusal is the host saying no to a well-formed request.
var ErrInvalid = errors.New("that request is not valid")

// ErrNotFound is the answer for a sample id that is not stored.
var ErrNotFound = errors.New("that voice sample is no longer there")

// Reason is why the host refused a request, the stable code the page switches on.
type Reason string

// The reasons a mark is refused (PRD, States), and the two an update adds.
const (
	ReasonStaleAlignment    Reason = "stale_alignment"
	ReasonNotHeard          Reason = "not_heard"
	ReasonSpansTakes        Reason = "spans_takes"
	ReasonSpansCut          Reason = "spans_cut"
	ReasonTooShort          Reason = "too_short"
	ReasonTooLong           Reason = "too_long"
	ReasonUnsupportedSource Reason = "unsupported_source"
	ReasonSourceMissing     Reason = "source_missing"
	ReasonProjectUnreadable Reason = "project_unreadable"
	ReasonCharacterLimit    Reason = "character_limit"
	ReasonProjectLimit      Reason = "project_limit"
	// ReasonNotFound is an update of a sample that is gone.
	ReasonNotFound Reason = "not_found"
)

// Reasons lists every reason, in the order the PRD names them.
func Reasons() []Reason {
	return []Reason{
		ReasonStaleAlignment, ReasonNotHeard, ReasonSpansTakes, ReasonSpansCut, ReasonTooShort, ReasonTooLong,
		ReasonUnsupportedSource, ReasonSourceMissing, ReasonProjectUnreadable, ReasonCharacterLimit, ReasonProjectLimit, ReasonNotFound,
	}
}

// Refusal is the host saying no to a well-formed request, with the sentence the page shows. Nothing was saved.
type Refusal struct {
	Reason  Reason
	Message string
}

func refuse(reason Reason) *Refusal { return &Refusal{Reason: reason, Message: sentence(reason)} }

func (r *Refusal) Error() string { return r.Sentence() }

// Sentence is the refusal's sentence for the narrator.
func (r *Refusal) Sentence() string {
	if r.Message != "" {
		return r.Message
	}
	return sentence(r.Reason)
}

func sentence(reason Reason) string {
	switch reason {
	case ReasonStaleAlignment:
		return "The recording changed since this chapter was checked. Check it again, then mark the sample."
	case ReasonNotHeard:
		return "These words were not heard in the recording."
	case ReasonSpansTakes:
		return "Choose words inside one take."
	case ReasonSpansCut:
		return "Restore the cut words or choose words without them."
	case ReasonTooShort:
		return "A sample is at least half a second."
	case ReasonTooLong:
		return "A sample is at most 30 seconds."
	case ReasonUnsupportedSource:
		return "Only WAV recordings can be copied."
	case ReasonSourceMissing:
		return "The audio file for these words is missing."
	case ReasonProjectUnreadable:
		return "The saved REAPER project could not be read. Save the project in REAPER, then try again."
	case ReasonCharacterLimit:
		return "This character already has 20 samples. Delete one first."
	case ReasonProjectLimit:
		return "Voice samples already use the 200 MiB a project may hold. Delete one first."
	case ReasonNotFound:
		return "That voice sample is no longer there."
	}
	return "The sample could not be saved."
}

// ClipState says whether a clip is still the file that was saved. Computed on every read, never stored.
type ClipState string

const (
	// ClipOK is a file of the size and, where it was checked, the hash that was saved.
	ClipOK ClipState = "ok"
	// ClipMissing is no file (or a folder) where the clip goes.
	ClipMissing ClipState = "missing"
	// ClipSizeChanged is a file of another size. Every list checks it.
	ClipSizeChanged ClipState = "size_changed"
	// ClipHashChanged is a file of the saved size whose content differs. Clip checks it before a clip is served.
	ClipHashChanged ClipState = "hash_changed"
)

// SourceState says whether the words the sample was marked on still read as they did. Computed against the current manuscript on
// every read, never stored.
type SourceState string

const (
	// SourceOK is the same words, in the same place.
	SourceOK SourceState = "ok"
	// SourceTextChanged is a line or word that is not where the keys say, or reads differently.
	SourceTextChanged SourceState = "text_changed"
	// SourceChapterMissing is a chapter the manuscript no longer has.
	SourceChapterMissing SourceState = "chapter_missing"
)

// Chapter is a manuscript chapter as the provenance check needs it.
type Chapter struct {
	ID    string
	Title string
}

// Book is the current manuscript: its chapters, and its lines in reading order.
type Book struct {
	Chapters []Chapter
	Lines    []editlog.Line
}

func (b Book) editlog() editlog.Book {
	book := editlog.Book{Chapters: make([]string, 0, len(b.Chapters)), Lines: b.Lines}
	for _, chapter := range b.Chapters {
		book.Chapters = append(book.Chapters, chapter.ID)
	}
	return book
}

// HeardWord is where one word was heard: the item and take of the saved project the recording check placed it on.
type HeardWord struct {
	ItemGUID string
	TakeGUID string
}

// Heard is what the chapter's current recording check says about the two words of a stretch. RecordID is the check's record, and
// empty when the chapter has no current check (never checked, or the manuscript or the audio changed since). First and Last are
// nil for a word nothing was heard for.
type Heard struct {
	RecordID    string
	First, Last *HeardWord
}

// Alignment answers Heard from the chapter's stored recording check. The host reads it; this package never runs a check.
type Alignment interface {
	Heard(chapterID, startKey, endKey string) (Heard, error)
}

// Hidden is audio a cut hid: a range of one item's source file, in seconds.
type Hidden struct {
	ItemGUID string
	Start    float64
	End      float64
}

// Cuts lists the audio the narrator cut out of a chapter, as ranges of the source files the items play.
type Cuts interface {
	Hidden(chapterID string) ([]Hidden, error)
}

// Config is what a Service needs.
type Config struct {
	// Project is the project folder; empty means no project is open.
	Project string
	// ProjectFile resolves the narrator's chosen, saved REAPER project file.
	ProjectFile func() (string, error)
	// ProjectReader reads that file; nil falls back to tracks.Parse.
	ProjectReader dawport.ProjectReader
	// Manuscript reads the current manuscript; an error reads as an empty one, so every sample's source shows its chapter missing.
	Manuscript func() (Book, error)
	// Alignment is the chapter's stored recording check; nil means none, and every mark is refused as stale.
	Alignment Alignment
	// Cuts lists the audio the narrator cut; nil means none.
	Cuts Cuts
	// Reporter tells the narrator about a file that cannot be read; nil only keeps it aside.
	Reporter *persist.Reporter
}

// Service reads and writes a project's voice samples. It holds no state of its own, so the host builds one per call; the
// read-modify-write of the file is serialised by lockFile.
type Service struct {
	config Config
	now    func() time.Time
	// newID makes a sample id: 32 lowercase hex characters.
	newID func() string
	// rename is a test seam for the atomic writes; nil is os.Rename.
	rename func(oldPath, newPath string) error
}

// New returns the service for config.
func New(config Config) *Service {
	return &Service{config: config, now: time.Now, newID: randomID}
}

var fileLocks sync.Map

// lockFile serialises every change to one project's samples.json across services built for the same project.
// +checklocksignore
func lockFile(path string) func() {
	lock, _ := fileLocks.LoadOrStore(cleanKey(path), &sync.Mutex{})
	mutex, _ := lock.(*sync.Mutex)
	mutex.Lock()
	return mutex.Unlock
}

// MarkRequest is what the page sends to mark a stretch: ids and numbers, never a path. SourceStart and SourceEnd are seconds in
// the item's source file, from the playlist segment under the first and last heard word; the keys are `paragraphId:ordinal`.
type MarkRequest struct {
	ChapterID         string  `json:"chapterId"`
	ItemGUID          string  `json:"itemGuid"`
	TakeGUID          string  `json:"takeGuid"`
	SourceStart       float64 `json:"sourceStart"`
	SourceEnd         float64 `json:"sourceEnd"`
	StartKey          string  `json:"startKey"`
	EndKey            string  `json:"endKey"`
	CharacterID       string  `json:"characterId"`
	Label             string  `json:"label"`
	Note              string  `json:"note"`
	MakePrimary       bool    `json:"makePrimary"`
	AlignmentRecordID string  `json:"alignmentRecordId"`
}

// Change is what an update sets: all three fields, as the page shows them.
type Change struct {
	Label       string `json:"label"`
	Note        string `json:"note"`
	CharacterID string `json:"characterId"`
}

// SourceView is where a sample came from, as the page gets it: the words and their state, never the file or the item and take
// GUIDs.
type SourceView struct {
	ChapterID    string      `json:"chapterId"`
	ChapterTitle string      `json:"chapterTitle"`
	Text         string      `json:"text"`
	StartKey     string      `json:"startKey"`
	EndKey       string      `json:"endKey"`
	State        SourceState `json:"state"`
}

// Sample is one voice sample as the page gets it.
type Sample struct {
	ID          string     `json:"id"`
	CharacterID string     `json:"characterId"`
	Label       string     `json:"label"`
	Note        string     `json:"note"`
	Primary     bool       `json:"primary"`
	CreatedAt   time.Time  `json:"createdAt"`
	DurationMs  int        `json:"durationMs"`
	Bytes       int64      `json:"bytes"`
	ClipState   ClipState  `json:"clipState"`
	Source      SourceView `json:"source"`
}

// Totals is what the samples add up to.
type Totals struct {
	Count int   `json:"count"`
	Bytes int64 `json:"bytes"`
}

// LimitsView is the limits the page shows and checks before it asks.
type LimitsView struct {
	MinSeconds   float64 `json:"minSeconds"`
	MaxSeconds   float64 `json:"maxSeconds"`
	PerCharacter int     `json:"perCharacter"`
	ProjectBytes int64   `json:"projectBytes"`
	LabelUnits   int     `json:"labelUnits"`
	NoteUnits    int     `json:"noteUnits"`
}

// Limits is the limits in force.
func Limits() LimitsView {
	return LimitsView{MinSeconds: MinSeconds, MaxSeconds: MaxSeconds, PerCharacter: MaxPerCharacter, ProjectBytes: MaxProjectBytes, LabelUnits: MaxLabelUnits, NoteUnits: MaxNoteUnits}
}

// List is every sample, sorted by character, then primary first, then newest; with what they add up to and the limits.
type List struct {
	Samples []Sample   `json:"samples"`
	Totals  Totals     `json:"totals"`
	Limits  LimitsView `json:"limits"`
}

// Removed is what a remove or a remove-all took away.
type Removed struct {
	Removed int   `json:"removed"`
	Bytes   int64 `json:"bytes"`
}

// ClipFile is a clip located for playback. Path is set only when State is ClipOK: a file that is not the one that was saved is
// never named.
type ClipFile struct {
	Path  string
	Bytes int64
	State ClipState
}
