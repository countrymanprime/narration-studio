// Package recents tracks the most recently opened project folders so a
// standalone launch can offer an "open recent" list. It has no OS/Wails
// dependency: the caller resolves and supplies the backing file path, which
// keeps this package trivially testable with t.TempDir().
package recents

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// maxEntries caps the recent-projects list per the product decision to show
// at most the ten most recently opened projects.
const maxEntries = 10

type Entry struct {
	Path       string    `json:"path"`
	Name       string    `json:"name"`
	LastOpened time.Time `json:"lastOpened"`
}

type Store struct {
	mu      sync.Mutex
	path    string
	persist atomic.Pointer[persist.Reporter]
}

func New(path string) *Store { return &Store{path: path} }

// SetPersist says where to log a recents file that cannot be read (ADR 0069). It is disposable: it heals and is not shown to the narrator.
func (s *Store) SetPersist(reporter *persist.Reporter) { s.persist.Store(reporter) }

// normalize makes path absolute and clean, so an entry means the same folder after the working directory changes. An empty path
// is refused: filepath.Abs("") is the working directory, which is not a project the narrator chose.
func normalize(path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("there is no project folder to record")
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	return filepath.Clean(absolute), nil
}

// samePath reports whether two entries name the same folder: the same spelling ignoring case (Windows paths are not
// case-sensitive), or the same folder on disk reached another way (a junction, a symlink, a short name).
func samePath(a, b string) bool {
	if strings.EqualFold(a, b) {
		return true
	}
	infoA, errA := os.Stat(a)
	infoB, errB := os.Stat(b)
	return errA == nil && errB == nil && os.SameFile(infoA, infoB)
}

// isFolder reports whether path is a folder that exists: a missing path and a file are both stale.
func isFolder(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// Touch records path/name as the most recently opened project, deduping any
// existing entry for the same path (case-insensitively, since Windows
// filesystems are case-insensitive), dropping entries whose folder no longer
// exists so a stale entry can't occupy a slot a live project could use, and
// truncating to maxEntries.
func (s *Store) Touch(path, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	cleaned, err := normalize(path)
	if err != nil {
		return err
	}
	entries, err := s.readLocked()
	if err != nil {
		return err
	}
	next := make([]Entry, 0, len(entries)+1)
	next = append(next, Entry{Path: cleaned, Name: name, LastOpened: time.Now()})
	for _, entry := range entries {
		if samePath(entry.Path, cleaned) {
			continue
		}
		if !isFolder(entry.Path) {
			continue
		}
		next = append(next, entry)
	}
	if len(next) > maxEntries {
		next = next[:maxEntries]
	}
	return s.writeLocked(next)
}

// Remove drops the entry for path, if any. Removing a path that is not
// present (already gone, or never existed) is not an error.
func (s *Store) Remove(path string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	cleaned, err := normalize(path)
	if err != nil {
		return nil // nothing that names no folder can be in the list
	}
	entries, err := s.readLocked()
	if err != nil {
		return err
	}
	next := make([]Entry, 0, len(entries))
	for _, entry := range entries {
		if samePath(entry.Path, cleaned) {
			continue
		}
		next = append(next, entry)
	}
	return s.writeLocked(next)
}

// List returns the recent-projects list, silently dropping any entry whose
// folder no longer exists on disk.
func (s *Store) List() ([]Entry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entries, err := s.readLocked()
	if err != nil {
		return nil, err
	}
	result := make([]Entry, 0, len(entries))
	for _, entry := range entries {
		if !isFolder(entry.Path) {
			continue
		}
		result = append(result, entry)
	}
	return result, nil
}

// readLocked treats both a missing file and a corrupted one as "no history
// yet" rather than a hard error - this is disposable, non-critical UI state,
// so self-healing from corruption beats permanently disabling the feature
// until someone manually deletes the file.
func (s *Store) readLocked() ([]Entry, error) {
	var entries []Entry
	outcome := s.persist.Load().ReadJSON(s.path, "recent projects", persist.Disposable, func(bytes []byte) error {
		return json.Unmarshal(bytes, &entries)
	})
	switch outcome {
	case persist.Unreadable:
		return nil, fmt.Errorf("could not read the recent projects list")
	case persist.Loaded:
		return entries, nil
	}
	return []Entry{}, nil
}

func (s *Store) writeLocked(entries []Entry) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	bytes, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	temporary := s.path + ".tmp"
	if err := os.WriteFile(temporary, bytes, 0o600); err != nil {
		return err
	}
	if err := os.Rename(temporary, s.path); err != nil {
		_ = os.Remove(temporary)
		return err
	}
	return nil
}
