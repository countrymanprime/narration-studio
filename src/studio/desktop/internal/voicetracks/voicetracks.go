// Package voicetracks is a project's voice setup for recording each character on its own REAPER track
// (docs/prds/booth-voice-tracks.prd.md): whether the project's chapters are flat tracks or folders of voices, which characters
// the narrator assigned to a voice track by its name, and which character the Narrator track also voices (a first-person book).
// A track with no assignment matches characters by name and alias; that matching is not stored here.
//
// Assignments are keyed by the voice's name, so one assignment holds in every chapter folder that has a track of that name. Each
// also remembers the GUIDs of the tracks it was seen on (Learn), so a track renamed to a name no assignment has keeps its
// assignment: the name is a label, the GUID is the track. A track renamed to a name that has an assignment takes that one. The same
// goes for the Narrator track (key 0). The file is narrator data, read through persist: a corrupt one is kept aside and the project starts flat, one written
// by a newer app is refused and never overwritten.
package voicetracks

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"desktop/internal/brand"
	"desktop/internal/persist"
)

// SchemaVersion is the only voice-tracks.json version this package reads or writes.
const SchemaVersion = 1

// what names the file for the narrator in a persist notice or an error.
const what = "voice tracks"

// The project's chapter layout. A project with no file is flat (decision G of the PRD): nothing changes until the narrator
// switches Voice folders on.
const (
	LayoutFlat    = "flat"
	LayoutFolders = "folders"
)

// The limits on what is stored, in runes.
const (
	MaxTrackName = 120
	// MaxSkipName bounds a voice name left out of a new chapter folder: a child of a folder can have any name in the engine, longer than a name assigned here.
	MaxSkipName    = 1000
	MaxCharacterID = 120
	MaxCharacters  = 200
	MaxTracks      = 500
	// MaxGUIDs bounds the track GUIDs remembered per assignment and for the Narrator; Learn drops the ones the project no longer has.
	MaxGUIDs = 2000
	// MaxGUID is the longest track GUID stored, in runes.
	MaxGUID = 64
)

var (
	// ErrInvalid is a layout, track name or character id outside the rules above; nothing is written.
	ErrInvalid = errors.New("that voice setup is not valid")
	// ErrNewer is a file written by a newer version of the app: it is never read as something else or overwritten.
	ErrNewer = errors.New("the voice tracks file was written by a newer version of the app")
	// ErrNoProject is a change with no project open.
	ErrNoProject = errors.New("open a project first")
)

// File is where a project's voice setup is kept.
func File(project string) string {
	return filepath.Join(project, brand.ProjectFolder, "voice-tracks.json")
}

// TrackAssignment is the characters the narrator assigned to a voice track, by the track's name.
type TrackAssignment struct {
	Track      string   `json:"track"`
	Characters []string `json:"characters"`
	// GUIDs are the tracks (lower case) this assignment was seen on, so a rename to an unassigned name keeps it.
	GUIDs []string `json:"guids"`
}

// State is a project's voice setup as the UI gets it: tracks in name order.
type State struct {
	Layout            string            `json:"layout"`
	NarratorCharacter string            `json:"narratorCharacter"`
	Tracks            []TrackAssignment `json:"tracks"`
	// NarratorGUIDs are the tracks (lower case) seen named Narrator, so renaming the Narrator track keeps it key 0.
	NarratorGUIDs []string `json:"narratorGuids"`
	// NotVoiceGUIDs are the tracks (lower case) the narrator marked as not a voice (a music bed, room tone): never a chapter's recording
	// target, and not listed as a voice. A GUID survives a rename of the track in the DAW (#3331).
	NotVoiceGUIDs []string `json:"notVoiceGuids"`
}

// Config is what a Service needs.
type Config struct {
	// Project is the project folder; empty means no project is open: reads answer flat, and nothing is saved.
	Project string
	// Reporter tells the narrator about a file that cannot be read; nil only keeps it.
	Reporter *persist.Reporter
}

type trackEntry struct {
	Characters []string `json:"characters"`
	GUIDs      []string `json:"guids,omitempty"`
}

type voiceFile struct {
	SchemaVersion     int                   `json:"schemaVersion"`
	Layout            string                `json:"layout"`
	NarratorCharacter string                `json:"narratorCharacter"`
	Tracks            map[string]trackEntry `json:"tracks"`
	Narrators         []string              `json:"narrators,omitempty"`
	// NotVoices are the tracks (lower case GUIDs) the narrator marked as not a voice; absent in a file written before the mark existed.
	NotVoices []string `json:"notVoices,omitempty"`
	// NewChapter is the choice remembered for what a new chapter folder is made with (#3748); absent until a create chose one, which reads as every voice and Extras.
	NewChapter *NewChapter `json:"newChapter,omitempty"`
}

// NewChapter is what a new chapter folder is made with besides the Narrator (#3748): every known voice and Extras unless named here. A voice the
// narrator unticked is in SkipVoices, so a voice that appears later starts ticked; NoExtras is Extras unticked.
type NewChapter struct {
	SkipVoices []string `json:"skipVoices"`
	NoExtras   bool     `json:"noExtras"`
}

// Service reads and writes a project's voice setup. It holds no state, so the host builds one per call; a read-modify-write of
// one file is serialised by fileLocks.
type Service struct {
	config Config
}

// New answers a Service over config.
func New(config Config) *Service { return &Service{config: config} }

var fileLocks sync.Map

// lockFile serialises every change to one project's file across services built for the same project.
// +checklocksignore
func lockFile(path string) func() {
	lock, _ := fileLocks.LoadOrStore(filepath.Clean(path), &sync.Mutex{})
	mutex, _ := lock.(*sync.Mutex)
	mutex.Lock()
	return mutex.Unlock
}

// Get answers the project's voice setup.
func (s *Service) Get() (State, error) {
	file, err := s.read()
	if err != nil {
		return State{}, err
	}
	return file.state(), nil
}

// SetLayout sets the project's chapter layout, LayoutFlat or LayoutFolders. It converts no chapter.
func (s *Service) SetLayout(layout string) (State, error) {
	if layout != LayoutFlat && layout != LayoutFolders {
		return State{}, fmt.Errorf("%w: unknown layout", ErrInvalid)
	}
	return s.change(func(file *voiceFile) error {
		file.Layout = layout
		return nil
	})
}

// SetTrackCharacters replaces the characters assigned to the voice track named track (trimmed, as REAPER shows it). An empty list
// clears the assignment, so the track matches by name again. A repeated id is kept once, in first-seen order.
func (s *Service) SetTrackCharacters(track string, characters []string) (State, error) {
	name, ids, err := validAssignment(track, characters)
	if err != nil {
		return State{}, err
	}
	return s.change(func(file *voiceFile) error {
		if len(ids) == 0 {
			delete(file.Tracks, name)
			return nil
		}
		return file.assign(name, ids)
	})
}

// AddTrackCharacters adds characters to those already assigned to the voice track named track, keeping the ones it had first (a
// track the Booth adds for characters, or a character the narrator puts on an existing track). An empty list changes nothing.
func (s *Service) AddTrackCharacters(track string, characters []string) (State, error) {
	name, ids, err := validAssignment(track, characters)
	if err != nil {
		return State{}, err
	}
	return s.change(func(file *voiceFile) error {
		if len(ids) == 0 {
			return nil
		}
		merged := append([]string{}, file.Tracks[name].Characters...)
		for _, id := range ids {
			if !slices.Contains(merged, id) {
				merged = append(merged, id)
			}
		}
		if len(merged) > MaxCharacters {
			return fmt.Errorf("%w: more than %d characters on one track", ErrInvalid, MaxCharacters)
		}
		return file.assign(name, merged)
	})
}

// validAssignment is a track name, trimmed, and its character ids with each repeat kept once, or ErrInvalid.
func validAssignment(track string, characters []string) (string, []string, error) {
	name := strings.TrimSpace(track)
	if !validText(name, MaxTrackName) {
		return "", nil, fmt.Errorf("%w: the track name", ErrInvalid)
	}
	if len(characters) > MaxCharacters {
		return "", nil, fmt.Errorf("%w: more than %d characters on one track", ErrInvalid, MaxCharacters)
	}
	ids := make([]string, 0, len(characters))
	seen := make(map[string]bool, len(characters))
	for _, id := range characters {
		if !validText(id, MaxCharacterID) {
			return "", nil, fmt.Errorf("%w: a character id", ErrInvalid)
		}
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	return name, ids, nil
}

// CheckAssignment is nil when SetTrackCharacters or AddTrackCharacters would accept track and characters as given (ErrInvalid
// otherwise), so a caller can refuse before it changes anything else.
func CheckAssignment(track string, characters []string) error {
	_, _, err := validAssignment(track, characters)
	return err
}

// assign sets the characters of the track named name, refusing a new track past MaxTracks.
func (f *voiceFile) assign(name string, ids []string) error {
	if _, ok := f.Tracks[name]; !ok && len(f.Tracks) >= MaxTracks {
		return fmt.Errorf("%w: more than %d voice tracks", ErrInvalid, MaxTracks)
	}
	f.Tracks[name] = trackEntry{Characters: ids, GUIDs: f.Tracks[name].GUIDs}
	return nil
}

// SetNotVoice marks the track with guid as not a voice (notVoice true) or a voice again (false). A mark on a track the project no longer
// has stays with the project, so the track comes back marked; unmarking removes it. A GUID is kept lower case and once.
func (s *Service) SetNotVoice(guid string, notVoice bool) (State, error) {
	id := strings.ToLower(strings.TrimSpace(guid))
	if !validText(id, MaxGUID) {
		return State{}, fmt.Errorf("%w: the track GUID", ErrInvalid)
	}
	return s.change(func(file *voiceFile) error {
		index := slices.Index(file.NotVoices, id)
		switch {
		case notVoice && index < 0:
			if len(file.NotVoices) >= MaxGUIDs {
				return fmt.Errorf("%w: more than %d tracks marked as not a voice", ErrInvalid, MaxGUIDs)
			}
			file.NotVoices = append(file.NotVoices, id)
			sort.Strings(file.NotVoices)
		case !notVoice && index >= 0:
			file.NotVoices = slices.Delete(file.NotVoices, index, index+1)
		}
		return nil
	})
}

// IsNotVoice reports whether the track with guid is marked as not a voice (GUIDs compared without case).
func (s State) IsNotVoice(guid string) bool {
	return slices.Contains(s.NotVoiceGUIDs, strings.ToLower(strings.TrimSpace(guid)))
}

// NewChapter is the remembered choice for a new chapter folder: every voice and Extras when none was made. It is read with no change to the file.
func (s *Service) NewChapter() (NewChapter, error) {
	file, err := s.read()
	if err != nil {
		return NewChapter{}, err
	}
	if file.NewChapter == nil {
		return NewChapter{SkipVoices: []string{}}, nil
	}
	return NewChapter{SkipVoices: append([]string{}, file.NewChapter.SkipVoices...), NoExtras: file.NewChapter.NoExtras}, nil
}

// SetNewChapter remembers the voices a new chapter folder is not made with and whether it has no Extras. Names are trimmed, kept once (compared
// without case) and bounded like the track names they stand for; a choice that is every voice and Extras removes the entry.
func (s *Service) SetNewChapter(skipVoices []string, noExtras bool) (State, error) {
	kept := make([]string, 0, len(skipVoices))
	for _, name := range skipVoices {
		name = strings.TrimSpace(name)
		if !validText(name, MaxSkipName) {
			return State{}, fmt.Errorf("%w: a voice name", ErrInvalid)
		}
		if !slices.ContainsFunc(kept, func(have string) bool { return strings.EqualFold(have, name) }) {
			kept = append(kept, name)
		}
	}
	if len(kept) > MaxTracks {
		return State{}, fmt.Errorf("%w: more than %d voices left out", ErrInvalid, MaxTracks)
	}
	return s.change(func(file *voiceFile) error {
		if len(kept) == 0 && !noExtras {
			file.NewChapter = nil
			return nil
		}
		file.NewChapter = &NewChapter{SkipVoices: kept, NoExtras: noExtras}
		return nil
	})
}

// SetNarratorCharacter sets the character the Narrator track also voices, or clears it with "".
func (s *Service) SetNarratorCharacter(id string) (State, error) {
	if id != "" && !validText(id, MaxCharacterID) {
		return State{}, fmt.Errorf("%w: a character id", ErrInvalid)
	}
	return s.change(func(file *voiceFile) error {
		file.NarratorCharacter = id
		return nil
	})
}

func (s *Service) change(apply func(*voiceFile) error) (State, error) {
	if s.config.Project == "" {
		return State{}, ErrNoProject
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil {
		return State{}, err
	}
	if err := apply(&file); err != nil {
		return State{}, err
	}
	if err := s.write(file); err != nil {
		return State{}, err
	}
	return file.state(), nil
}

func emptyFile() voiceFile {
	return voiceFile{SchemaVersion: SchemaVersion, Layout: LayoutFlat, Tracks: map[string]trackEntry{}}
}

func (s *Service) read() (voiceFile, error) {
	file := emptyFile()
	if s.config.Project == "" {
		return file, nil
	}
	newer := 0
	var decoded voiceFile
	outcome := s.config.Reporter.ReadJSON(File(s.config.Project), what, persist.NarratorData, func(raw []byte) error {
		var candidate voiceFile
		if err := json.Unmarshal(raw, &candidate); err != nil {
			return err
		}
		if candidate.SchemaVersion > SchemaVersion {
			newer = candidate.SchemaVersion
			return nil
		}
		if !candidate.valid() {
			return errors.New("the voice tracks file breaks its rules")
		}
		decoded = candidate
		return nil
	})
	if newer > 0 {
		return voiceFile{}, ErrNewer
	}
	if outcome == persist.Loaded {
		if decoded.Tracks == nil {
			decoded.Tracks = map[string]trackEntry{}
		}
		file = decoded
	}
	return file, nil
}

func (f voiceFile) valid() bool {
	if f.Layout != LayoutFlat && f.Layout != LayoutFolders {
		return false
	}
	if f.NarratorCharacter != "" && !validText(f.NarratorCharacter, MaxCharacterID) {
		return false
	}
	if len(f.Tracks) > MaxTracks {
		return false
	}
	for name, entry := range f.Tracks {
		if name != strings.TrimSpace(name) || !validText(name, MaxTrackName) || len(entry.Characters) == 0 || len(entry.Characters) > MaxCharacters {
			return false
		}
		for _, id := range entry.Characters {
			if !validText(id, MaxCharacterID) {
				return false
			}
		}
		if !validGUIDs(entry.GUIDs) {
			return false
		}
	}
	if f.NewChapter != nil {
		if len(f.NewChapter.SkipVoices) > MaxTracks {
			return false
		}
		for _, name := range f.NewChapter.SkipVoices {
			if name != strings.TrimSpace(name) || !validText(name, MaxSkipName) {
				return false
			}
		}
	}
	return validGUIDs(f.Narrators) && validGUIDs(f.NotVoices)
}

func (s *Service) write(file voiceFile) error {
	file.SchemaVersion = SchemaVersion
	path := File(s.config.Project)
	if err := persist.CanOverwrite(path, what); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the app's folder in the project: %w", err)
	}
	bytes, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	if err := persist.WriteFile(path, bytes, 0o600); err != nil {
		return fmt.Errorf("could not write the %s file: %w", what, err)
	}
	return nil
}

func (f voiceFile) state() State {
	names := make([]string, 0, len(f.Tracks))
	for name := range f.Tracks {
		names = append(names, name)
	}
	sort.Strings(names)
	tracks := make([]TrackAssignment, 0, len(names))
	for _, name := range names {
		tracks = append(tracks, TrackAssignment{Track: name, Characters: append([]string(nil), f.Tracks[name].Characters...), GUIDs: append([]string{}, f.Tracks[name].GUIDs...)})
	}
	return State{Layout: f.Layout, NarratorCharacter: f.NarratorCharacter, Tracks: tracks, NarratorGUIDs: append([]string{}, f.Narrators...), NotVoiceGUIDs: append([]string{}, f.NotVoices...)}
}

func validGUIDs(guids []string) bool {
	if len(guids) > MaxGUIDs {
		return false
	}
	for _, guid := range guids {
		if guid != strings.ToLower(guid) || !validText(guid, MaxGUID) {
			return false
		}
	}
	return true
}

// validText is one line of text, not blank, at most limit runes, with no control character.
func validText(text string, limit int) bool {
	if strings.TrimSpace(text) == "" || !utf8.ValidString(text) || utf8.RuneCountInString(text) > limit {
		return false
	}
	for _, r := range text {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}

// Seen is a track of the project as the engine has it now.
type Seen struct {
	GUID string
	Name string
}

// narratorName is the track name that is the Narrator, whatever its case.
const narratorName = "narrator"

// IsNarrator reports whether the track named name with guid is a Narrator track: it is named so, or it was seen named so and renamed.
// A caller choosing one Narrator among tracks prefers one named so (NamedNarrator) over a remembered one.
func (s State) IsNarrator(guid, name string) bool {
	return NamedNarrator(name) || slices.Contains(s.NarratorGUIDs, strings.ToLower(guid))
}

// NamedNarrator reports whether name is the Narrator track's name, whatever its case.
func NamedNarrator(name string) bool { return strings.EqualFold(strings.TrimSpace(name), narratorName) }

// Learn records which tracks carry which assignment, from the tracks the project has now, and reports whether the file changed. A track
// named as an assignment is that assignment's (moving it from another it was recorded under); a track with another name keeps the
// assignment it was recorded under, so renaming it loses nothing. The Narrator track is remembered the same way. Nothing is dropped: the
// list may be the saved file's (lacking a track not saved yet) or one .rpp of several in the folder, and a deleted track's GUID is never
// seen again, so it costs only its few bytes (MaxGUIDs bounds them).
//
// It only ever adds to a setup that already exists and reads cleanly: no file is made (a project nobody set up has nothing to keep), and a
// file that is corrupt, unreadable, or from a newer app is left exactly as it is for the readers that tell the narrator about it. An
// empty list changes nothing. Nothing is written when nothing changed.
func (s *Service) Learn(project []Seen) (bool, error) {
	if s.config.Project == "" || len(project) == 0 {
		return false, nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	raw, err := persist.ReadFile(File(s.config.Project))
	if err != nil {
		return false, nil
	}
	var file voiceFile
	if json.Unmarshal(raw, &file) != nil || file.SchemaVersion > SchemaVersion || !file.valid() {
		return false, nil
	}
	if file.Tracks == nil {
		file.Tracks = map[string]trackEntry{}
	}
	before, _ := json.Marshal(file)
	file.learn(project)
	after, _ := json.Marshal(file)
	if string(before) == string(after) {
		return false, nil
	}
	return true, s.write(file)
}

func (f *voiceFile) learn(project []Seen) {
	present := make(map[string]string, len(project))
	for _, track := range project {
		present[strings.ToLower(track.GUID)] = strings.TrimSpace(track.Name)
	}
	holder := map[string]string{}
	names := make([]string, 0, len(f.Tracks))
	for name := range f.Tracks {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		for _, guid := range f.Tracks[name].GUIDs {
			if _, taken := holder[guid]; !taken {
				holder[guid] = name
			}
		}
	}
	for guid, name := range present {
		if _, assigned := f.Tracks[name]; assigned {
			holder[guid] = name
		}
	}
	for _, name := range names {
		entry := f.Tracks[name]
		entry.GUIDs = nil
		f.Tracks[name] = entry
	}
	guids := make([]string, 0, len(holder))
	for guid := range holder {
		guids = append(guids, guid)
	}
	sort.Strings(guids)
	for _, guid := range guids {
		entry := f.Tracks[holder[guid]]
		if len(entry.GUIDs) < MaxGUIDs && validText(guid, MaxGUID) {
			entry.GUIDs = append(entry.GUIDs, guid)
		}
		f.Tracks[holder[guid]] = entry
	}
	var narrators []string
	for guid, name := range present {
		if strings.EqualFold(name, narratorName) || slices.Contains(f.Narrators, guid) {
			if validText(guid, MaxGUID) {
				narrators = append(narrators, guid)
			}
		}
	}
	for _, guid := range f.Narrators {
		if !slices.Contains(narrators, guid) {
			narrators = append(narrators, guid)
		}
	}
	sort.Strings(narrators)
	if len(narrators) > MaxGUIDs {
		narrators = narrators[:MaxGUIDs]
	}
	f.Narrators = narrators
}
