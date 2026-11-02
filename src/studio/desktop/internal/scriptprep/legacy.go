package scriptprep

import (
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

// Backup copies a schema-1 file that still holds words to BackupFile, unless a backup is there already: the first one is never
// overwritten. Anything else is left alone.
func (s *Service) Backup() error {
	if s.config.Project == "" {
		return nil
	}
	unlock := lockFile(File(s.config.Project))
	defer unlock()
	file, err := s.read()
	if err != nil || !file.legacy() {
		return err
	}
	backup := BackupFile(s.config.Project)
	if _, err := os.Lstat(backup); err == nil {
		return nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("could not check the %s backup: %w", what, err)
	}
	raw, err := os.ReadFile(File(s.config.Project))
	if err != nil {
		return fmt.Errorf("could not read the %s file: %w", what, err)
	}
	// O_EXCL: a backup another writer made in between is kept, never replaced.
	out, err := os.OpenFile(backup, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if errors.Is(err, fs.ErrExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("could not write the %s backup: %w", what, err)
	}
	if _, err := out.Write(raw); err != nil {
		_ = out.Close()
		_ = os.Remove(backup)
		return fmt.Errorf("could not write the %s backup: %w", what, err)
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(backup)
		return fmt.Errorf("could not write the %s backup: %w", what, err)
	}
	return nil
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
	if _, err := os.Stat(BackupFile(s.config.Project)); err != nil {
		return fmt.Errorf("the %s file has no backup yet, so its words were kept: %w", what, err)
	}
	file.Flags, file.Says = nil, nil
	return s.write(file)
}
