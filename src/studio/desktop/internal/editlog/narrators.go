package editlog

import (
	"desktop/internal/brand"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// The project's other narrators (#2251, Replace audio): a duet partner, a stand-in, or a cast, named once for the project, and the
// files of theirs the narrator brought into the DAW. A replaced stretch of words names one of them. A file stays where it is: the
// DAW's track holds it, and the record keeps its facts (name, size, SHA-256, time) so the page can say when it moved or changed.

// NarratorsVersion is the only narrators.json version this package reads or writes.
const NarratorsVersion = 1

const narratorsWhat = "other narrators"

// MaxNarrators is the most other narrators a project names, MaxNarratorFiles the most files one has, and MaxNarratorName the
// longest name, in characters (the bridge's MaxNarratorName).
const (
	MaxNarrators     = 50
	MaxNarratorFiles = 200
	MaxNarratorName  = 80
)

// maxNarratorPath is the longest path a file record keeps, in bytes.
const maxNarratorPath = 4096

// The states of a narrator's file, read from disk on every list: as recorded, gone, or changed since it was chosen (its size or
// time differ).
const (
	FileOK      = "ok"
	FileMissing = "missing"
	FileChanged = "changed"
)

var sha256Hex = regexp.MustCompile(`^[0-9a-f]{64}$`)

// NarratorsFile is where a project's other narrators are kept: in the project's own folder, not under editing/, which replacing the
// manuscript removes. They are named for the project, and their audio stays in the DAW whatever happens to the script.
func NarratorsFile(project string) string {
	return filepath.Join(project, brand.ProjectFolder, "narrators.json")
}

// NarratorFile is one file of a narrator's, as the narrator chose it and the DAW holds it: Track and Item are the DAW's ids of the
// track and item it put the file on, and Length its length in seconds as the DAW read it.
type NarratorFile struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	Size    int64     `json:"size"`
	SHA256  string    `json:"sha256"`
	ModTime time.Time `json:"modTime"`
	Daw     string    `json:"daw"`
	Track   string    `json:"track"`
	Item    string    `json:"item"`
	Length  float64   `json:"length"`
	AddedAt time.Time `json:"addedAt"`
}

// StoredNarrator is one other narrator as kept in narrators.json.
type StoredNarrator struct {
	ID      string         `json:"id"`
	Name    string         `json:"name"`
	AddedAt time.Time      `json:"addedAt"`
	Files   []NarratorFile `json:"files"`
}

// NarratorFileView is a file as the UI gets it: the record, and what is on disk now. The path is not sent: the page shows the name.
type NarratorFileView struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Size    int64     `json:"size"`
	Length  float64   `json:"length"`
	Daw     string    `json:"daw"`
	AddedAt time.Time `json:"addedAt"`
	State   string    `json:"state"`
}

// Narrator is an other narrator as the UI gets it.
type Narrator struct {
	ID      string             `json:"id"`
	Name    string             `json:"name"`
	AddedAt time.Time          `json:"addedAt"`
	Files   []NarratorFileView `json:"files"`
}

// Narrators is the project's other narrators in the order they were named.
type Narrators struct {
	Narrators []Narrator `json:"narrators"`
}

// NarratorsChange is what Add, Remove and FileAdd answer: the list after the call and the ids the call changed (a narrator's, or a
// file's).
type NarratorsChange struct {
	Narrators
	Changed []string `json:"changed"`
}

type narratorsFile struct {
	SchemaVersion int              `json:"schemaVersion"`
	Narrators     []StoredNarrator `json:"narrators"`
}

// ValidNarratorName is the rule for an other narrator's name: 1 to MaxNarratorName characters, not all space, no bar or control
// character (the bar separates the DAW bridge's fields).
func ValidNarratorName(name string) bool {
	if !utf8.ValidString(name) || strings.TrimSpace(name) == "" || utf8.RuneCountInString(name) > MaxNarratorName {
		return false
	}
	for _, r := range name {
		if r == '|' || unicode.IsControl(r) {
			return false
		}
	}
	return true
}

// NarratorsList returns the project's other narrators, each file checked against the disk.
func (s *Service) NarratorsList() (Narrators, error) {
	if s.config.Project == "" {
		return Narrators{Narrators: []Narrator{}}, nil
	}
	unlock := lockFile(NarratorsFile(s.config.Project))
	defer unlock()
	file, err := s.readNarrators()
	if err != nil {
		return Narrators{Narrators: []Narrator{}}, err
	}
	return viewNarrators(file.Narrators), nil
}

// NarratorAdd names another narrator for the project. A name already there (ignoring case and the space around it) is not added
// twice: Changed is then empty.
func (s *Service) NarratorAdd(name string) (NarratorsChange, error) {
	if s.config.Project == "" {
		return NarratorsChange{}, errors.New("save the project first")
	}
	name = strings.TrimSpace(name)
	if !ValidNarratorName(name) {
		return NarratorsChange{}, fmt.Errorf("a name is 1 to %d characters, with no bar or control character", MaxNarratorName)
	}
	unlock := lockFile(NarratorsFile(s.config.Project))
	defer unlock()
	file, err := s.readNarrators()
	if err != nil {
		return NarratorsChange{}, err
	}
	for _, narrator := range file.Narrators {
		if strings.EqualFold(narrator.Name, name) {
			return NarratorsChange{Narrators: viewNarrators(file.Narrators), Changed: []string{}}, nil
		}
	}
	if len(file.Narrators) >= MaxNarrators {
		return NarratorsChange{}, fmt.Errorf("a project names at most %d other narrators", MaxNarrators)
	}
	narrator := StoredNarrator{ID: nextNarratorID(file.Narrators), Name: name, AddedAt: s.now().UTC(), Files: []NarratorFile{}}
	file.Narrators = append(file.Narrators, narrator)
	if err := writeVersioned(NarratorsFile(s.config.Project), narratorsWhat, file); err != nil {
		return NarratorsChange{}, err
	}
	return NarratorsChange{Narrators: viewNarrators(file.Narrators), Changed: []string{narrator.ID}}, nil
}

// NarratorRemove forgets an other narrator who has no files. One with files is refused: their audio is still in the DAW, and a
// replaced stretch may name them. A narrator who is not there is not an error; Changed is then empty.
func (s *Service) NarratorRemove(id string) (NarratorsChange, error) {
	if s.config.Project == "" {
		return NarratorsChange{}, errors.New("save the project first")
	}
	unlock := lockFile(NarratorsFile(s.config.Project))
	defer unlock()
	file, err := s.readNarrators()
	if err != nil {
		return NarratorsChange{}, err
	}
	kept := make([]StoredNarrator, 0, len(file.Narrators))
	changed := []string{}
	for _, narrator := range file.Narrators {
		if narrator.ID != id {
			kept = append(kept, narrator)
			continue
		}
		if len(narrator.Files) > 0 {
			return NarratorsChange{}, fmt.Errorf("%s's audio is in the project, so they stay on the list", narrator.Name)
		}
		changed = append(changed, narrator.ID)
	}
	if len(changed) > 0 {
		file.Narrators = kept
		if err := writeVersioned(NarratorsFile(s.config.Project), narratorsWhat, file); err != nil {
			return NarratorsChange{}, err
		}
	}
	return NarratorsChange{Narrators: viewNarrators(file.Narrators), Changed: changed}, nil
}

// NarratorFileAdd records a file the DAW took in for narratorID. The file's id is given here; the rest is the caller's: the facts it
// read from the file and what the DAW answered.
func (s *Service) NarratorFileAdd(narratorID string, record NarratorFile) (NarratorsChange, error) {
	if s.config.Project == "" {
		return NarratorsChange{}, errors.New("save the project first")
	}
	unlock := lockFile(NarratorsFile(s.config.Project))
	defer unlock()
	file, err := s.readNarrators()
	if err != nil {
		return NarratorsChange{}, err
	}
	for i := range file.Narrators {
		narrator := &file.Narrators[i]
		if narrator.ID != narratorID {
			continue
		}
		if len(narrator.Files) >= MaxNarratorFiles {
			return NarratorsChange{}, fmt.Errorf("a narrator has at most %d files", MaxNarratorFiles)
		}
		record.ID = nextFileID(file.Narrators)
		record.AddedAt = s.now().UTC()
		if err := checkNarratorFile(record); err != nil {
			return NarratorsChange{}, err
		}
		narrator.Files = append(narrator.Files, record)
		if err := writeVersioned(NarratorsFile(s.config.Project), narratorsWhat, file); err != nil {
			return NarratorsChange{}, err
		}
		return NarratorsChange{Narrators: viewNarrators(file.Narrators), Changed: []string{record.ID}}, nil
	}
	return NarratorsChange{}, errors.New("that narrator is not on the project's list")
}

// NarratorFileOf finds a file by its id: the narrator it is theirs, the record, and false when no narrator has it.
func (s *Service) NarratorFileOf(fileID string) (StoredNarrator, NarratorFile, bool, error) {
	if s.config.Project == "" || fileID == "" {
		return StoredNarrator{}, NarratorFile{}, false, nil
	}
	unlock := lockFile(NarratorsFile(s.config.Project))
	defer unlock()
	file, err := s.readNarrators()
	if err != nil {
		return StoredNarrator{}, NarratorFile{}, false, err
	}
	for _, narrator := range file.Narrators {
		for _, record := range narrator.Files {
			if record.ID == fileID {
				return narrator, record, true, nil
			}
		}
	}
	return StoredNarrator{}, NarratorFile{}, false, nil
}

// FileState reads what is at a file's path now: FileOK while the size and time are as recorded, FileMissing when nothing is there,
// FileChanged otherwise.
func FileState(record NarratorFile) string {
	info, err := os.Stat(record.Path)
	switch {
	case err != nil || !info.Mode().IsRegular():
		return FileMissing
	case info.Size() != record.Size || !info.ModTime().Equal(record.ModTime):
		return FileChanged
	}
	return FileOK
}

func viewNarrators(stored []StoredNarrator) Narrators {
	out := Narrators{Narrators: make([]Narrator, 0, len(stored))}
	for _, narrator := range stored {
		view := Narrator{ID: narrator.ID, Name: narrator.Name, AddedAt: narrator.AddedAt, Files: make([]NarratorFileView, 0, len(narrator.Files))}
		for _, record := range narrator.Files {
			view.Files = append(view.Files, NarratorFileView{ID: record.ID, Name: record.Name, Size: record.Size, Length: record.Length,
				Daw: record.Daw, AddedAt: record.AddedAt, State: FileState(record)})
		}
		out.Narrators = append(out.Narrators, view)
	}
	return out
}

func checkNarratorFile(record NarratorFile) error {
	switch {
	case record.ID == "" || record.Name == "" || utf8.RuneCountInString(record.Name) > MaxCutText || !utf8.ValidString(record.Name):
		return errors.New("the file has no usable name")
	case !filepath.IsAbs(record.Path) || len(record.Path) > maxNarratorPath || strings.ContainsAny(record.Path, "|\x00\r\n"):
		return errors.New("the file's path is not a full path on this computer")
	case record.Size <= 0 || !sha256Hex.MatchString(record.SHA256):
		return errors.New("the file's size or fingerprint is not usable")
	case record.Daw == "" || utf8.RuneCountInString(record.Daw) > MaxCutText:
		return errors.New("the file was not taken in by a DAW")
	case record.Track == "" || record.Item == "" || len(record.Track) > MaxStackID || len(record.Item) > MaxStackID:
		return errors.New("the DAW did not say where it put the file")
	case !finiteTime(record.Length) || record.Length <= 0:
		return errors.New("the DAW did not say how long the file is")
	}
	return nil
}

func validNarrators(file narratorsFile) error {
	seen := map[string]bool{}
	if len(file.Narrators) > MaxNarrators {
		return errors.New("too many narrators")
	}
	for _, narrator := range file.Narrators {
		if narrator.ID == "" || seen[narrator.ID] || !ValidNarratorName(narrator.Name) || len(narrator.Files) > MaxNarratorFiles {
			return errors.New("a narrator breaks the file's rules")
		}
		seen[narrator.ID] = true
		for _, record := range narrator.Files {
			if seen[record.ID] || checkNarratorFile(record) != nil {
				return errors.New("a narrator's file breaks the file's rules")
			}
			seen[record.ID] = true
		}
	}
	return nil
}

func nextNarratorID(narrators []StoredNarrator) string {
	used := map[string]bool{}
	for _, narrator := range narrators {
		used[narrator.ID] = true
	}
	return nextID("n", used)
}

func nextFileID(narrators []StoredNarrator) string {
	used := map[string]bool{}
	for _, narrator := range narrators {
		for _, record := range narrator.Files {
			used[record.ID] = true
		}
	}
	return nextID("f", used)
}

// nextID is the first prefix-<n> not in used.
func nextID(prefix string, used map[string]bool) string {
	for n := 1; ; n++ {
		id := prefix + "-" + strconv.Itoa(n)
		if !used[id] {
			return id
		}
	}
}

// readNarrators reads narrators.json; the caller holds the file's lock.
func (s *Service) readNarrators() (narratorsFile, error) {
	file := narratorsFile{SchemaVersion: NarratorsVersion, Narrators: []StoredNarrator{}}
	var decoded narratorsFile
	found, err := readVersioned(s.config.Reporter, NarratorsFile(s.config.Project), narratorsWhat, NarratorsVersion, &decoded, validNarrators)
	if err != nil {
		return narratorsFile{}, err
	}
	if found && decoded.Narrators != nil {
		file.Narrators = decoded.Narrators
		for i := range file.Narrators {
			if file.Narrators[i].Files == nil {
				file.Narrators[i].Files = []NarratorFile{}
			}
		}
	}
	return file, nil
}
