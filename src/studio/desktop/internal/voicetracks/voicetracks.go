// Package voicetracks is a project's voice setup for recording each character on its own REAPER track
// (docs/prds/booth-voice-tracks.prd.md): whether the project's chapters are flat tracks or folders of voices, which characters
// the narrator assigned to a voice track by its name, and which character the Narrator track also voices (a first-person book).
// A track with no assignment matches characters by name and alias; that matching is not stored here.
//
// Assignments are keyed by the track's name, not its GUID, so one assignment holds in every chapter folder that has a track of
// that name. The file is narrator data, read through persist: a corrupt one is kept aside and the project starts flat, one written
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
	MaxTrackName   = 120
	MaxCharacterID = 120
	MaxCharacters  = 200
	MaxTracks      = 500
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
}

// State is a project's voice setup as the UI gets it: tracks in name order.
type State struct {
	Layout            string            `json:"layout"`
	NarratorCharacter string            `json:"narratorCharacter"`
	Tracks            []TrackAssignment `json:"tracks"`
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
}

type voiceFile struct {
	SchemaVersion     int                   `json:"schemaVersion"`
	Layout            string                `json:"layout"`
	NarratorCharacter string                `json:"narratorCharacter"`
	Tracks            map[string]trackEntry `json:"tracks"`
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
	f.Tracks[name] = trackEntry{Characters: ids}
	return nil
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
	}
	return true
}

func (s *Service) write(file voiceFile) error {
	file.SchemaVersion = SchemaVersion
	path := File(s.config.Project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the app's folder in the project: %w", err)
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

func (f voiceFile) state() State {
	names := make([]string, 0, len(f.Tracks))
	for name := range f.Tracks {
		names = append(names, name)
	}
	sort.Strings(names)
	tracks := make([]TrackAssignment, 0, len(names))
	for _, name := range names {
		tracks = append(tracks, TrackAssignment{Track: name, Characters: append([]string(nil), f.Tracks[name].Characters...)})
	}
	return State{Layout: f.Layout, NarratorCharacter: f.NarratorCharacter, Tracks: tracks}
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
