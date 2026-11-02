package scriptprep

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"math"
	"os"
	"sort"
)

// LegacyWords is the words a schema-1 file kept, for the migration that moves them into the Story Bible: each key with its say-value,
// source and flags in reading order of the current manuscript (a flag whose line is gone goes last), the words in reading order of
// their first flag. A schema-2 file, a missing one and no project have none.
func (s *Service) LegacyWords() ([]LegacyWord, error) {
	if s.config.Project == "" {
		return nil, nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil || !file.legacy() {
		return nil, err
	}
	flags := append([]legacyFlag(nil), file.Flags...)
	position := map[string]int{}
	for index, line := range s.manuscript().Lines {
		position[line.ChapterID+"\x00"+line.ID] = index
	}
	at := func(flag legacyFlag) int {
		if index, ok := position[flag.ChapterID+"\x00"+flag.ParagraphID]; ok {
			return index
		}
		return math.MaxInt
	}
	sort.SliceStable(flags, func(i, j int) bool {
		a, b := flags[i], flags[j]
		if at(a) != at(b) {
			return at(a) < at(b)
		}
		if a.Start != b.Start {
			return a.Start < b.Start
		}
		if a.End != b.End {
			return a.End < b.End
		}
		if !a.CreatedAt.Equal(b.CreatedAt) {
			return a.CreatedAt.Before(b.CreatedAt)
		}
		return a.ID < b.ID
	})
	words := []LegacyWord{}
	index := map[string]int{}
	for _, flag := range flags {
		at, seen := index[flag.Word]
		if !seen {
			say := file.Says[flag.Word]
			at = len(words)
			index[flag.Word] = at
			words = append(words, LegacyWord{Word: flag.Word, Say: say.Say, Source: say.Source})
		}
		words[at].Flags = append(words[at].Flags, LegacyFlag{ChapterID: flag.ChapterID, ParagraphID: flag.ParagraphID, Start: flag.Start, End: flag.End, Quote: flag.Quote})
	}
	return words, nil
}

// Backup copies a schema-1 file that still holds words to a backup: BackupFile, or when that holds other bytes (a backup from an
// earlier cycle) the first of script-prep.v1-2.json, script-prep.v1-3.json and so on that is not there yet. A backup with the same
// bytes is reused, and no backup is ever overwritten. Anything else is left alone.
func (s *Service) Backup() error {
	if s.config.Project == "" {
		return nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	raw, legacy, err := s.legacyBytes()
	if err != nil || !legacy {
		return err
	}
	if found, err := s.findBackup(raw); err != nil || found {
		return err
	}
	for n := 1; n <= maxBackups; n++ {
		backup := backupName(s.config.Project, n)
		written, err := writeNew(backup, raw)
		if err != nil {
			return fmt.Errorf("could not write the %s backup: %w", what, err)
		}
		if written {
			return nil
		}
		// Another writer's backup: the same bytes are the backup, other bytes are left alone.
		if existing, err := os.ReadFile(backup); err == nil && bytes.Equal(existing, raw) {
			return nil
		}
	}
	return fmt.Errorf("could not write the %s backup: %d backups are there already", what, maxBackups)
}

// BackedUp is whether a schema-1 file that still holds words is in a backup byte for byte. The migration backs up only after the
// words are in the Story Bible, so it means only the rewrite is left.
func (s *Service) BackedUp() (bool, error) {
	if s.config.Project == "" {
		return false, nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	raw, legacy, err := s.legacyBytes()
	if err != nil || !legacy {
		return false, err
	}
	return s.findBackup(raw)
}

// maxBackups bounds how many names Backup tries.
const maxBackups = 1000

// legacyBytes is the file's bytes when it is a schema-1 file that still holds words.
func (s *Service) legacyBytes() ([]byte, bool, error) {
	file, err := s.read()
	if err != nil || !file.legacy() {
		return nil, false, err
	}
	raw, err := os.ReadFile(File(s.config.Project))
	if err != nil {
		return nil, false, fmt.Errorf("could not read the %s file: %w", what, err)
	}
	return raw, true, nil
}

// findBackup is whether a backup holds raw.
func (s *Service) findBackup(raw []byte) (bool, error) {
	backups, err := BackupFiles(s.config.Project)
	if err != nil {
		return false, fmt.Errorf("could not check the %s backup: %w", what, err)
	}
	for _, backup := range backups {
		existing, err := os.ReadFile(backup)
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return false, fmt.Errorf("could not check the %s backup: %w", what, err)
		}
		if err == nil && bytes.Equal(existing, raw) {
			return true, nil
		}
	}
	return false, nil
}

// writeNew writes raw to a file that is not there yet, and reports false, writing nothing, when it is there already.
func writeNew(path string, raw []byte) (bool, error) {
	// O_EXCL: a backup another writer made in between is kept, never replaced.
	out, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if errors.Is(err, fs.ErrExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if _, err := out.Write(raw); err != nil {
		_ = out.Close()
		_ = os.Remove(path)
		return false, err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(path)
		return false, err
	}
	return true, nil
}

// FinishMigration rewrites a schema-1 file that still holds words as schema 2: its chapters, and nothing else. Call it after Backup
// and after the words are in the Story Bible. Anything else is left alone.
func (s *Service) FinishMigration() error {
	if s.config.Project == "" {
		return nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil || !file.legacy() {
		return err
	}
	raw, err := os.ReadFile(File(s.config.Project))
	if err != nil {
		return fmt.Errorf("could not read the %s file: %w", what, err)
	}
	if found, err := s.findBackup(raw); err != nil || !found {
		if err == nil {
			err = errors.New("no backup holds it")
		}
		return fmt.Errorf("the %s file has no backup yet, so its words were kept: %w", what, err)
	}
	file.Flags, file.Says = nil, nil
	return s.write(file)
}
