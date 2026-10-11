// Package editlog is the narrator's Editing records (ADR 0856): one file per kind of record under the project's
// narration-utils/editing/ folder, beside the per-chapter source choices. Each names a word by its chapter id, its paragraph
// id and its ordinal among the paragraph's words, together with the text the word had, and is checked against the current
// manuscript on every read: a record whose word is gone or whose text changed is reported stale, never moved to a guess
// (the rule of ADR 0382).
//
// Each file is narrator data, read through persist: a corrupt one is kept aside and an empty list starts, one written by a
// newer app is refused and never overwritten, and a write goes through a temporary file and a rename. Replacing the
// manuscript or Clear project data removes the files (the manuscript service's resetDerived); a re-import without a reset
// keeps them. Nothing here touches the DAW.
package editlog

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/countrymanprime/narration-utils/shell/internal/persist"
)

// Dir is the project's Editing folder.
func Dir(project string) string {
	return filepath.Join(project, "narration-utils", "editing")
}

// Line is one paragraph of the manuscript as it currently is.
type Line struct {
	ChapterID string
	ID        string
	Index     int
	Text      string
}

// Book is the current manuscript: its chapter ids, and its lines in reading order.
type Book struct {
	Chapters []string
	Lines    []Line
}

var fileLocks sync.Map

// lockFile serialises every change to one project's file across services built for the same project.
// +checklocksignore
func lockFile(path string) func() {
	lock, _ := fileLocks.LoadOrStore(filepath.Clean(path), &sync.Mutex{})
	mutex, _ := lock.(*sync.Mutex)
	mutex.Lock()
	return mutex.Unlock
}

// readVersioned reads a versioned record file into *into; the caller holds the file's lock. check is called on a file of a
// version this package reads and returns an error for one that breaks a rule, which makes the file corrupt. found is false
// when there is no usable file (missing, or corrupt and kept aside), and *into is then left as it was.
func readVersioned[T any](reporter *persist.Reporter, path, what string, version int, into *T, check func(T) error) (found bool, err error) {
	newer := 0
	var decoded T
	outcome := reporter.ReadJSON(path, what, persist.NarratorData, func(raw []byte) error {
		var header struct {
			SchemaVersion int `json:"schemaVersion"`
		}
		if err := json.Unmarshal(raw, &header); err != nil {
			return err
		}
		if header.SchemaVersion > version {
			newer = header.SchemaVersion
			return nil
		}
		var candidate T
		if err := json.Unmarshal(raw, &candidate); err != nil {
			return err
		}
		if err := check(candidate); err != nil {
			return err
		}
		decoded = candidate
		return nil
	})
	switch outcome {
	case persist.Missing, persist.Quarantined, persist.Healed:
		return false, nil
	case persist.Unreadable:
		return false, fmt.Errorf("your %s file could not be read, so nothing was changed", what)
	}
	if err := persist.CheckVersion(newer, version, what); err != nil {
		return false, err
	}
	*into = decoded
	return true, nil
}

// writeVersioned replaces a record file through a temporary file and a rename; the caller holds the file's lock.
func writeVersioned(path, what string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("could not create the project's editing folder: %w", err)
	}
	bytes, err := json.MarshalIndent(value, "", "  ")
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

// wordsOf splits a paragraph's text into its words the way the UI does (`text.split(/\s+/).filter(Boolean)`), so an
// ordinal names the same word on both sides.
func wordsOf(text string) []string {
	words := []string{}
	start := -1
	for index, character := range text {
		if isSpace(character) {
			if start >= 0 {
				words = append(words, text[start:index])
				start = -1
			}
			continue
		}
		if start < 0 {
			start = index
		}
	}
	if start >= 0 {
		words = append(words, text[start:])
	}
	return words
}

// isSpace is JavaScript's `\s`: Go's unicode.IsSpace adds U+0085 and leaves out U+FEFF.
func isSpace(character rune) bool {
	switch {
	case character == '\t', character == '\n', character == '\v', character == '\f', character == '\r', character == ' ':
		return true
	case character == 0x00a0, character == 0x1680, character >= 0x2000 && character <= 0x200a, character == 0x2028, character == 0x2029,
		character == 0x202f, character == 0x205f, character == 0x3000, character == 0xfeff:
		return true
	}
	return false
}
