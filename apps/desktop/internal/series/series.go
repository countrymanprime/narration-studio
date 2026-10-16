// Package series is a narrator-authored, per-user list of series, each naming
// the project folders that are its member books (ADR 0450), plus read-only
// access to another member project's own approved character references so the
// Series tab can show a character's reference clips across every book they
// appear in (ADR 0565).
//
// Cross-project reads cover the reference data character.ReadOnly returns
// (region GUID, snapshot, character id, note), not a calibrated baseline: the
// acoustic baselines were never wired up after the real-corpus trial failed its
// own reject gate (ADR 0450).
package series

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// seriesSchemaVersion is the only series.json version this package reads or writes.
const seriesSchemaVersion = 1

// what names the file for the narrator in a persist notice.
const what = "series"

// Series is a narrator-named group of projects (books) that share character
// references. MemberProjectPaths are absolute project folder paths, in
// the order the narrator added them.
type Series struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	MemberProjectPaths []string `json:"memberProjectPaths"`
}

type seriesFile struct {
	SchemaVersion int      `json:"schemaVersion"`
	Series        []Series `json:"series"`
}

// Store is the narrator's own series.json: one per-user file, beside
// credit-templates.json and recent-projects.json, written with the same
// write-to-temp-then-rename pattern.
type Store struct {
	mu      sync.Mutex
	path    string
	persist atomic.Pointer[persist.Reporter]
}

// New returns the store backed by path.
func New(path string) *Store { return &Store{path: path} }

// SetPersist says where to log and, for a corrupt file, tell the narrator (ADR 0069). A series list is the
// narrator's own authored data, so a file that cannot be decoded is kept aside rather than silently discarded.
func (s *Store) SetPersist(reporter *persist.Reporter) { s.persist.Store(reporter) }

// List returns every series the narrator has created. A fresh install with no series.json yet returns an empty
// list, not an error.
func (s *Store) List() ([]Series, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	file, err := s.readLocked()
	if err != nil {
		return nil, err
	}
	return file.Series, nil
}

// ForProject returns the series project belongs to, if any, matched case-insensitively against each series'
// member paths (Windows filesystems are case-insensitive, matching recents.Store.Touch). A project that is not
// any series' member reads as ok=false, not an error: this is the check a project-open path would make to stay
// behaviourally unchanged for a narrator not using series.
func (s *Store) ForProject(project string) (Series, bool, error) {
	list, err := s.List()
	if err != nil {
		return Series{}, false, err
	}
	if strings.TrimSpace(project) == "" {
		return Series{}, false, nil
	}
	clean := normalize(project)
	for _, one := range list {
		for _, member := range one.MemberProjectPaths {
			if samePath(member, clean) {
				return one, true, nil
			}
		}
	}
	return Series{}, false, nil
}

// Save creates a new series (empty ID) or updates an existing one in place (an ID that already exists), keeping
// its position. Name is trimmed and required; MemberProjectPaths are cleaned, trimmed of blanks, and
// deduplicated case-insensitively.
func (s *Store) Save(entry Series) (Series, error) {
	entry.Name = strings.TrimSpace(entry.Name)
	if entry.Name == "" {
		return Series{}, errors.New("a series needs a name")
	}
	entry.MemberProjectPaths = cleanPaths(entry.MemberProjectPaths)

	s.mu.Lock()
	defer s.mu.Unlock()
	file, err := s.readLocked()
	if err != nil {
		return Series{}, err
	}
	if entry.ID == "" {
		entry.ID = newSeriesID()
		file.Series = append(file.Series, entry)
	} else {
		found := false
		for i, existing := range file.Series {
			if existing.ID == entry.ID {
				file.Series[i] = entry
				found = true
				break
			}
		}
		if !found {
			file.Series = append(file.Series, entry)
		}
	}
	if err := s.writeLocked(file); err != nil {
		return Series{}, err
	}
	return entry, nil
}

// Delete removes series id. Deleting an id that is not present (already gone, or never existed) is not an error.
func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	file, err := s.readLocked()
	if err != nil {
		return err
	}
	next := make([]Series, 0, len(file.Series))
	for _, existing := range file.Series {
		if existing.ID != id {
			next = append(next, existing)
		}
	}
	file.Series = next
	return s.writeLocked(file)
}

// cleanPaths trims, cleans and case-insensitively deduplicates paths, dropping blanks. Order is preserved
// (first occurrence wins), so a narrator's chosen book order in a series survives a save.
func cleanPaths(paths []string) []string {
	out := make([]string, 0, len(paths))
	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		clean := normalize(path)
		duplicate := false
		for _, kept := range out {
			if samePath(kept, clean) {
				duplicate = true
				break
			}
		}
		if !duplicate {
			out = append(out, clean)
		}
	}
	return out
}

// normalize makes path absolute and clean, so a member means the same folder after the working directory changes (path is
// returned cleaned but relative when the working directory cannot be read).
func normalize(path string) string {
	if absolute, err := filepath.Abs(path); err == nil {
		return absolute
	}
	return filepath.Clean(path)
}

// samePath reports whether two paths name the same project folder: the same spelling ignoring case (Windows is not case-sensitive,
// matching recents.Store.Touch), or the same folder on disk reached another way (a junction, a symlink, a short name).
func samePath(a, b string) bool {
	if strings.EqualFold(a, b) {
		return true
	}
	infoA, errA := os.Stat(a)
	infoB, errB := os.Stat(b)
	return errA == nil && errB == nil && os.SameFile(infoA, infoB)
}

func (s *Store) readLocked() (seriesFile, error) {
	empty := seriesFile{SchemaVersion: seriesSchemaVersion, Series: []Series{}}
	var decoded seriesFile
	newer := 0
	outcome := s.persist.Load().ReadJSON(s.path, what, persist.NarratorData, func(bytes []byte) error {
		var candidate seriesFile
		if err := json.Unmarshal(bytes, &candidate); err != nil {
			return err
		}
		if candidate.SchemaVersion > seriesSchemaVersion {
			newer = candidate.SchemaVersion
			return nil
		}
		decoded = candidate
		return nil
	})
	switch outcome {
	case persist.Missing:
		return empty, nil
	case persist.Quarantined, persist.Healed:
		return seriesFile{}, fmt.Errorf("your %s file could not be read; it was kept aside and a fresh one is started", what)
	case persist.Unreadable:
		return seriesFile{}, fmt.Errorf("your %s file could not be read", what)
	}
	if err := persist.CheckVersion(newer, seriesSchemaVersion, what); err != nil {
		return seriesFile{}, err
	}
	if decoded.Series == nil {
		decoded.Series = []Series{}
	}
	return decoded, nil
}

func (s *Store) writeLocked(file seriesFile) error {
	if err := persist.CanOverwrite(s.path, what); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return fmt.Errorf("could not create the narration-utils folder: %w", err)
	}
	file.SchemaVersion = seriesSchemaVersion
	bytes, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return err
	}
	temporary := s.path + ".tmp"
	if err := os.WriteFile(temporary, bytes, 0o600); err != nil {
		return fmt.Errorf("could not write %s.json: %w", what, err)
	}
	if err := os.Rename(temporary, s.path); err != nil {
		return fmt.Errorf("could not activate %s.json: %w", what, err)
	}
	return nil
}

// newSeriesID returns 32 lowercase hex characters - the same shape as every other random id in this codebase
// (findings, notes, ...), so a series id a contract golden captures is stabilized by internal/contractfile's own
// 32-hex-character rule.
func newSeriesID() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return fmt.Sprintf("%032x", time.Now().UnixNano())
	}
	return hex.EncodeToString(buffer)
}
