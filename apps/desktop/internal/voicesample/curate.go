package voicesample

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"

	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
)

// view is one stored sample as the page gets it, its provenance checked against book and its clip against the file on disk.
func (s *Service) view(stored Stored, book Book) Sample {
	source := SourceView{ChapterID: stored.Source.ChapterID, Text: stored.Source.Text, StartKey: stored.Source.StartKey, EndKey: stored.Source.EndKey, State: SourceChapterMissing}
	for _, chapter := range book.Chapters {
		if chapter.ID != stored.Source.ChapterID {
			continue
		}
		source.ChapterTitle = chapter.Title
		source.State = SourceTextChanged
		if text, err := editlog.SpanText(book.editlog(), chapter.ID, stored.Source.StartKey, stored.Source.EndKey); err == nil && text == stored.Source.Text {
			source.State = SourceOK
		}
		break
	}
	return Sample{
		ID: stored.ID, CharacterID: stored.CharacterID, Label: stored.Label, Note: stored.Note, Primary: stored.Primary, CreatedAt: stored.CreatedAt,
		DurationMs: stored.Clip.DurationMs, Bytes: stored.Clip.Bytes, ClipState: s.clipSize(stored), Source: source,
	}
}

// clipSize is the clip's state from a look at the file the id names: there, and of the saved size. The hash is checked by Clip.
func (s *Service) clipSize(stored Stored) ClipState {
	path, ok := ClipPath(s.config.Project, stored.ID)
	if !ok {
		return ClipMissing
	}
	info, err := os.Stat(path)
	switch {
	case err != nil || !info.Mode().IsRegular():
		return ClipMissing
	case info.Size() != stored.Clip.Bytes:
		return ClipSizeChanged
	}
	return ClipOK
}

// listOf is the answer for file's samples: sorted by character, then primary first, then newest (of two made at the same moment,
// the later in the file first).
func (s *Service) listOf(file storeFile) List {
	book := s.manuscript()
	order := make([]int, len(file.Samples))
	for index := range order {
		order[index] = index
	}
	sort.SliceStable(order, func(i, j int) bool {
		a, b := file.Samples[order[i]], file.Samples[order[j]]
		switch {
		case a.CharacterID != b.CharacterID:
			return a.CharacterID < b.CharacterID
		case a.Primary != b.Primary:
			return a.Primary
		case !a.CreatedAt.Equal(b.CreatedAt):
			return a.CreatedAt.After(b.CreatedAt)
		}
		return order[i] > order[j]
	})
	list := List{Samples: make([]Sample, 0, len(order)), Limits: Limits()}
	for _, index := range order {
		list.Samples = append(list.Samples, s.view(file.Samples[index], book))
	}
	list.Totals = Totals{Count: len(file.Samples), Bytes: totalBytes(file.Samples)}
	return list
}

// List returns every sample with its provenance and clip state, and what they add up to. It creates nothing.
func (s *Service) List() (List, error) {
	if s.config.Project == "" {
		return List{Samples: []Sample{}, Limits: Limits()}, nil
	}
	file, err := s.readStore()
	if err != nil {
		return List{}, err
	}
	return s.listOf(file), nil
}

// Update changes a sample's label, note and character. Moving it to a character who has no samples makes it that character's
// primary; moving a primary away promotes the newest sample the old character keeps. A move into a character who has twenty is
// refused.
func (s *Service) Update(id string, change Change) (Sample, error) {
	label, note, err := cleanText(change.Label, change.Note)
	if err != nil {
		return Sample{}, err
	}
	character, err := cleanCharacter(change.CharacterID)
	if err != nil {
		return Sample{}, err
	}
	if s.config.Project == "" {
		return Sample{}, errors.New("save the project first")
	}
	unlock := lockFile(storePath(s.config.Project))
	defer unlock()
	file, err := s.readStore()
	if err != nil {
		return Sample{}, err
	}
	index := indexOf(file.Samples, id)
	if index < 0 {
		return Sample{}, refuse(ReasonNotFound)
	}
	before := file.Samples[index]
	updated := before
	updated.Label, updated.Note = label, note
	if character != before.CharacterID {
		if countFor(file.Samples, character) >= MaxPerCharacter {
			return Sample{}, refuse(ReasonCharacterLimit)
		}
		updated.CharacterID = character
		updated.Primary = countFor(file.Samples, character) == 0
	}
	if updated != before {
		file.Samples[index] = updated
		if before.Primary && updated.CharacterID != before.CharacterID {
			promoteNewest(file.Samples, before.CharacterID)
		}
		if err := s.writeStore(file); err != nil {
			return Sample{}, err
		}
	}
	return s.view(file.Samples[index], s.manuscript()), nil
}

// SetPrimary makes a sample its character's primary and every other sample of that character not. A sample that already is the
// only primary changes nothing and writes nothing.
func (s *Service) SetPrimary(id string) (List, error) {
	if s.config.Project == "" {
		return List{}, errors.New("save the project first")
	}
	unlock := lockFile(storePath(s.config.Project))
	defer unlock()
	file, err := s.readStore()
	if err != nil {
		return List{}, err
	}
	index := indexOf(file.Samples, id)
	if index < 0 {
		return List{}, ErrNotFound
	}
	changed := false
	for position := range file.Samples {
		if file.Samples[position].CharacterID != file.Samples[index].CharacterID {
			continue
		}
		if want := position == index; file.Samples[position].Primary != want {
			file.Samples[position].Primary = want
			changed = true
		}
	}
	if changed {
		if err := s.writeStore(file); err != nil {
			return List{}, err
		}
	}
	return s.listOf(file), nil
}

// Remove deletes a sample and its clip. A sample that is not there is not an error: Removed is then 0. Deleting a primary promotes
// the newest sample the character keeps.
func (s *Service) Remove(id string) (Removed, error) {
	if s.config.Project == "" || !idPattern.MatchString(id) {
		return Removed{}, nil
	}
	unlock := lockFile(storePath(s.config.Project))
	defer unlock()
	file, err := s.readStore()
	if err != nil {
		return Removed{}, err
	}
	index := indexOf(file.Samples, id)
	if index < 0 {
		return Removed{}, nil
	}
	gone := file.Samples[index]
	file.Samples = append(file.Samples[:index:index], file.Samples[index+1:]...)
	if gone.Primary {
		promoteNewest(file.Samples, gone.CharacterID)
	}
	if err := s.writeStore(file); err != nil {
		return Removed{}, err
	}
	// The row is gone, so the sample is gone; a clip that will not delete is only a file nothing lists.
	if path, ok := ClipPath(s.config.Project, id); ok {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			s.config.Reporter.Warn("voice_sample_clip_left", fmt.Sprintf("clip %s.wav could not be deleted: %v", id, err))
		}
	}
	return Removed{Removed: 1, Bytes: gone.Clip.Bytes}, nil
}

// RemoveAll deletes every sample and every clip in the clips folder, a clip no row names included.
func (s *Service) RemoveAll() (Removed, error) {
	if s.config.Project == "" {
		return Removed{}, nil
	}
	unlock := lockFile(storePath(s.config.Project))
	defer unlock()
	file, err := s.readStore()
	if err != nil {
		return Removed{}, err
	}
	removed := Removed{Removed: len(file.Samples), Bytes: totalBytes(file.Samples)}
	_, statErr := os.Stat(storePath(s.config.Project))
	if removed.Removed > 0 || statErr == nil {
		if err := s.writeStore(storeFile{SchemaVersion: Version, Samples: []Stored{}}); err != nil {
			return Removed{}, err
		}
	}
	if err := os.RemoveAll(clipsDir(s.config.Project)); err != nil {
		s.config.Reporter.Warn("voice_sample_clip_left", fmt.Sprintf("the clips folder could not be deleted: %v", err))
	}
	return removed, nil
}

// Clip locates a sample's audio for playback: the file the id names, only when it is the file that was saved (its size and its
// SHA-256 match the row). Any other state answers no path, so a changed or swapped file is never served. An id that is not stored is
// ErrNotFound.
func (s *Service) Clip(id string) (ClipFile, error) {
	if s.config.Project == "" || !idPattern.MatchString(id) {
		return ClipFile{}, ErrNotFound
	}
	file, err := s.readStore()
	if err != nil {
		return ClipFile{}, err
	}
	index := indexOf(file.Samples, id)
	if index < 0 {
		return ClipFile{}, ErrNotFound
	}
	stored := file.Samples[index]
	path, _ := ClipPath(s.config.Project, id)
	if state := s.clipSize(stored); state != ClipOK {
		return ClipFile{State: state}, nil
	}
	handle, err := os.Open(path)
	if err != nil {
		return ClipFile{State: ClipMissing}, nil
	}
	defer func() { _ = handle.Close() }()
	hash := sha256.New()
	if _, err := io.Copy(hash, handle); err != nil {
		return ClipFile{}, fmt.Errorf("could not read the voice sample's audio: %w", err)
	}
	if hex.EncodeToString(hash.Sum(nil)) != stored.Clip.SHA256 {
		return ClipFile{State: ClipHashChanged}, nil
	}
	return ClipFile{Path: path, Bytes: stored.Clip.Bytes, State: ClipOK}, nil
}
