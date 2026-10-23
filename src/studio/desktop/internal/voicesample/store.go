package voicesample

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
	"strings"
	"time"
	"unicode"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/countrymanprime/narration-studio/shell/internal/persist"
)

// what names the file for the narrator in a persist notice or an error.
const what = "voice samples"

// Bounds on what a file read back may hold, so a hand edit cannot make the host build something huge.
const (
	maxFileBytes   = 8 << 20
	maxSamples     = 10000
	maxText        = 10000
	maxGUID        = 256
	maxKey         = 256
	maxSourceFile  = 4096
	maxSourceTime  = 7 * 24 * 3600
	maxSampleRate  = 768000
	maxClipSeconds = MaxSeconds
)

var (
	idPattern     = regexp.MustCompile(`^[0-9a-f]{32}$`)
	sha256Pattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
	// undoPattern is the Story Bible's own undo id: 16 lowercase hexadecimal characters (guide.isUndoID).
	undoPattern = regexp.MustCompile(`^[0-9a-f]{16}$`)
)

// Dir is where this package keeps its data under a project. manuscript.Service.Clear removes it; a replace keeps it.
func Dir(project string) string {
	return filepath.Join(project, "narration-studio", "voice-samples")
}

func storePath(project string) string { return filepath.Join(Dir(project), "samples.json") }

func clipsDir(project string) string { return filepath.Join(Dir(project), "clips") }

// ClipPath is where the clip of sample id lives, derived from the id alone: a stored file name is never read. It answers false for
// anything that is not a 32-character lowercase hex id, so no path can be built from a hand edit or a request.
func ClipPath(project, id string) (string, bool) {
	if !idPattern.MatchString(id) {
		return "", false
	}
	return filepath.Join(clipsDir(project), id+".wav"), true
}

func cleanKey(path string) string { return filepath.Clean(path) }

func randomID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		// crypto/rand does not fail on a supported platform; a time-derived id is unique enough to keep a save from crashing.
		return fmt.Sprintf("%032x", time.Now().UnixNano())
	}
	return hex.EncodeToString(raw[:])
}

// StoredClip is the clip's format and checksum as saved. Its file name is not stored: it comes from the id.
type StoredClip struct {
	Bytes         int64  `json:"bytes"`
	DurationMs    int    `json:"durationMs"`
	SampleRate    int    `json:"sampleRate"`
	Channels      int    `json:"channels"`
	BitsPerSample int    `json:"bitsPerSample"`
	SHA256        string `json:"sha256"`
}

// StoredSource is where a sample came from, kept as provenance only: nothing here is ever opened.
type StoredSource struct {
	ChapterID   string  `json:"chapterId"`
	StartKey    string  `json:"startKey"`
	EndKey      string  `json:"endKey"`
	Text        string  `json:"text"`
	ItemGUID    string  `json:"itemGuid"`
	TakeGUID    string  `json:"takeGuid"`
	SourceFile  string  `json:"sourceFile"`
	SourceStart float64 `json:"sourceStart"`
	SourceEnd   float64 `json:"sourceEnd"`
}

// StoredMerge says that a sample was moved to another character by a Story Bible merge, so an undo of that merge can move it back.
// It is host-only: the page never sees it. It is cleared when the narrator moves the sample by hand.
type StoredMerge struct {
	// UndoID is the id the Story Bible answered for the merge.
	UndoID string `json:"undoId"`
	// From is the absorbed entry the sample belonged to, and To the entry it moved to.
	From string `json:"from"`
	To   string `json:"to"`
	// WasPrimary is whether it was From's primary sample before the merge.
	WasPrimary bool `json:"wasPrimary"`
}

// Stored is one sample as kept in samples.json.
type Stored struct {
	ID          string       `json:"id"`
	CharacterID string       `json:"characterId"`
	Label       string       `json:"label"`
	Note        string       `json:"note"`
	Primary     bool         `json:"primary"`
	CreatedAt   time.Time    `json:"createdAt"`
	Clip        StoredClip   `json:"clip"`
	Source      StoredSource `json:"source"`
	// Merge is set while the sample sits where a Story Bible merge put it (nil otherwise and on every sample made before merges were followed).
	Merge *StoredMerge `json:"merge,omitempty"`
}

type storeFile struct {
	SchemaVersion int      `json:"schemaVersion"`
	Samples       []Stored `json:"samples"`
}

// units is the length of text in UTF-16 units, as a JavaScript string counts it.
func units(text string) int {
	count := 0
	for _, character := range text {
		count += utf16.RuneLen(character)
	}
	return count
}

// checkText checks a label or a note against its limit: valid UTF-8, no control characters (a note may hold line breaks and tabs).
func checkText(text, name string, limit int, multiline bool) error {
	if !utf8.ValidString(text) {
		return fmt.Errorf("%w: a sample's %s is not text", ErrInvalid, name)
	}
	if units(text) > limit {
		return fmt.Errorf("%w: a sample's %s can be at most %d characters", ErrInvalid, name, limit)
	}
	for _, character := range text {
		if multiline && (character == '\n' || character == '\t') {
			continue
		}
		if unicode.IsControl(character) {
			if multiline {
				return fmt.Errorf("%w: a sample's %s can hold only text, line breaks and tabs", ErrInvalid, name)
			}
			return fmt.Errorf("%w: a sample's %s is one line of text", ErrInvalid, name)
		}
	}
	return nil
}

// cleanText trims a label and a note (a note's line ends become \n) and checks them.
func cleanText(label, note string) (string, string, error) {
	label = strings.TrimSpace(label)
	note = strings.TrimSpace(strings.ReplaceAll(note, "\r\n", "\n"))
	if err := checkText(label, "label", MaxLabelUnits, false); err != nil {
		return "", "", err
	}
	if err := checkText(note, "note", MaxNoteUnits, true); err != nil {
		return "", "", err
	}
	return label, note, nil
}

func cleanCharacter(id string) (string, error) {
	id = strings.TrimSpace(id)
	switch {
	case id == "":
		return "", fmt.Errorf("%w: choose a character", ErrInvalid)
	case !utf8.ValidString(id) || utf8.RuneCountInString(id) > maxCharacterID || strings.IndexFunc(id, unicode.IsControl) >= 0:
		return "", fmt.Errorf("%w: that is not a character", ErrInvalid)
	}
	return id, nil
}

// cleanEntity checks the id of a Story Bible entry named by a merge: a character id that is neither padded nor the reserved narration.
func cleanEntity(id string) (string, error) {
	clean, err := cleanCharacter(id)
	if err != nil {
		return "", err
	}
	if clean != id || clean == NarrationCharacterID {
		return "", fmt.Errorf("%w: that is not a Story Bible entry", ErrInvalid)
	}
	return clean, nil
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

// valid reports whether a file's samples keep the rules Mark and Update enforce; a file with one that does not is corrupt.
func valid(file storeFile) error {
	if len(file.Samples) > maxSamples {
		return errors.New("too many samples")
	}
	seen := make(map[string]bool, len(file.Samples))
	primary := map[string]bool{}
	for _, sample := range file.Samples {
		if !idPattern.MatchString(sample.ID) || seen[sample.ID] {
			return errors.New("a sample has a bad or repeated id")
		}
		seen[sample.ID] = true
		if _, err := cleanCharacter(sample.CharacterID); err != nil || sample.CharacterID != strings.TrimSpace(sample.CharacterID) {
			return errors.New("a sample has no character")
		}
		if checkText(sample.Label, "label", MaxLabelUnits, false) != nil || checkText(sample.Note, "note", MaxNoteUnits, true) != nil {
			return errors.New("a sample's text breaks the limits")
		}
		if sample.Primary {
			if primary[sample.CharacterID] {
				return errors.New("a character has two primary samples")
			}
			primary[sample.CharacterID] = true
		}
		if sample.CreatedAt.IsZero() {
			return errors.New("a sample has no time")
		}
		if err := validClip(sample.Clip); err != nil {
			return err
		}
		if err := validSource(sample.Source); err != nil {
			return err
		}
		if err := validMerge(sample); err != nil {
			return err
		}
	}
	return nil
}

// validMerge checks a sample's merge record: the undo id the Story Bible gives, two different entries, the sample sitting at the
// second.
func validMerge(sample Stored) error {
	merge := sample.Merge
	if merge == nil {
		return nil
	}
	if !undoPattern.MatchString(merge.UndoID) {
		return errors.New("a sample has a bad merge record")
	}
	from, errFrom := cleanEntity(merge.From)
	to, errTo := cleanEntity(merge.To)
	if errFrom != nil || errTo != nil || from == to || from != merge.From || to != merge.To || sample.CharacterID != merge.To {
		return errors.New("a sample has a bad merge record")
	}
	return nil
}

func validClip(clip StoredClip) error {
	switch {
	case clip.Bytes < 1 || clip.Bytes > MaxProjectBytes:
		return errors.New("a clip's size is outside the limits")
	case clip.DurationMs < 1 || float64(clip.DurationMs) > maxClipSeconds*1000:
		return errors.New("a clip's length is outside the limits")
	case clip.SampleRate < 1 || clip.SampleRate > maxSampleRate || clip.Channels < 1 || clip.Channels > 2 || clip.BitsPerSample < 1 || clip.BitsPerSample > 64:
		return errors.New("a clip's format is not one the host writes")
	case !sha256Pattern.MatchString(clip.SHA256):
		return errors.New("a clip's checksum is not a SHA-256")
	}
	return nil
}

func validSource(source StoredSource) error {
	switch {
	case source.ChapterID == "" || len(source.ChapterID) > maxGUID || source.StartKey == "" || len(source.StartKey) > maxKey || source.EndKey == "" || len(source.EndKey) > maxKey:
		return errors.New("a sample does not say where it came from")
	case !utf8.ValidString(source.Text) || utf8.RuneCountInString(source.Text) > maxText || len(source.ItemGUID) > maxGUID || len(source.TakeGUID) > maxGUID || len(source.SourceFile) > maxSourceFile:
		return errors.New("a sample's provenance is too long")
	case !finite(source.SourceStart) || !finite(source.SourceEnd) || source.SourceStart < 0 || source.SourceEnd <= source.SourceStart || source.SourceEnd > maxSourceTime:
		return errors.New("a sample's source range is not a range of seconds")
	}
	return nil
}

// readStore reads samples.json; no file, or one kept aside as corrupt, is an empty store. A newer file or one that cannot be read
// is an error, and the file is left as it is. Reading creates nothing.
func (s *Service) readStore() (storeFile, error) {
	empty := storeFile{SchemaVersion: Version, Samples: []Stored{}}
	var decoded storeFile
	newer := 0
	outcome := s.config.Reporter.ReadJSON(storePath(s.config.Project), what, persist.NarratorData, func(raw []byte) error {
		if len(raw) > maxFileBytes {
			return errors.New("the file is too large")
		}
		var header struct {
			SchemaVersion int `json:"schemaVersion"`
		}
		if err := json.Unmarshal(raw, &header); err != nil {
			return err
		}
		if header.SchemaVersion > Version {
			newer = header.SchemaVersion
			return nil
		}
		if header.SchemaVersion != Version {
			return errors.New("the file has no version this app reads")
		}
		var candidate storeFile
		if err := json.Unmarshal(raw, &candidate); err != nil {
			return err
		}
		if err := valid(candidate); err != nil {
			return err
		}
		decoded = candidate
		return nil
	})
	switch outcome {
	case persist.Missing, persist.Quarantined, persist.Healed:
		return empty, nil
	case persist.Unreadable:
		return storeFile{}, fmt.Errorf("your %s file could not be read, so nothing was changed", what)
	}
	if err := persist.CheckVersion(newer, Version, what); err != nil {
		return storeFile{}, err
	}
	if decoded.Samples == nil {
		decoded.Samples = []Stored{}
	}
	return decoded, nil
}

func (s *Service) renameFile(from, to string) error {
	if s.rename != nil {
		return s.rename(from, to)
	}
	return os.Rename(from, to)
}

// writeStore replaces samples.json through a temporary file and a rename; the caller holds the file's lock.
func (s *Service) writeStore(file storeFile) error {
	file.SchemaVersion = Version
	if file.Samples == nil {
		file.Samples = []Stored{}
	}
	path := storePath(s.config.Project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the project's voice samples folder: %w", err)
	}
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, raw, 0o600); err != nil {
		return fmt.Errorf("could not write the %s file: %w", what, err)
	}
	if err := s.renameFile(temporary, path); err != nil {
		_ = os.Remove(temporary)
		return fmt.Errorf("could not activate the %s file: %w", what, err)
	}
	return nil
}

// promoteNewest makes the newest sample of characterID the primary when it has samples and none is primary. Of two made at the
// same moment, the one later in the file wins.
func promoteNewest(samples []Stored, characterID string) {
	newest := -1
	for index, sample := range samples {
		if sample.CharacterID != characterID {
			continue
		}
		if sample.Primary {
			return
		}
		if newest < 0 || !sample.CreatedAt.Before(samples[newest].CreatedAt) {
			newest = index
		}
	}
	if newest >= 0 {
		samples[newest].Primary = true
	}
}

func countFor(samples []Stored, characterID string) int {
	count := 0
	for _, sample := range samples {
		if sample.CharacterID == characterID {
			count++
		}
	}
	return count
}

func totalBytes(samples []Stored) int64 {
	var total int64
	for _, sample := range samples {
		total += sample.Clip.Bytes
	}
	return total
}

func indexOf(samples []Stored, id string) int {
	for index, sample := range samples {
		if sample.ID == id {
			return index
		}
	}
	return -1
}
