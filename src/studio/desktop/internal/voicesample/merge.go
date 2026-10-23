package voicesample

import (
	"errors"
	"sort"
)

// Followed is what following a merge, or undoing that, did to the samples: how many moved, and how many stayed where they were
// because the other entry was at its limit (Left is always 0 when undoing).
type Followed struct {
	Moved int `json:"moved"`
	Left  int `json:"left"`
}

// FollowMerge moves every sample of the absorbed Story Bible entry from to the surviving entry to, after the Story Bible merged
// them (undoID is the id it answered). The survivor keeps its own primary: a moved sample becomes primary only when the survivor
// had none, and then it is the absorbed entry's own primary, which goes first. A survivor has at most MaxPerCharacter samples, so
// when they do not all fit the primary and then the newest move, and the rest stay with the absorbed entry, which is no longer
// in the Story Bible: the page lists them under "a character who is no longer in the Story Bible" with a way to move them.
// Each moved sample records the merge so UndoFollow can take it back. Nothing is written when nothing moves.
func (s *Service) FollowMerge(undoID, from, to string) (Followed, error) {
	if !undoPattern.MatchString(undoID) {
		return Followed{}, errors.Join(ErrInvalid, errors.New("that is not a merge id"))
	}
	from, errFrom := cleanEntity(from)
	to, errTo := cleanEntity(to)
	if err := errors.Join(errFrom, errTo); err != nil {
		return Followed{}, err
	}
	if from == to {
		return Followed{}, errors.Join(ErrInvalid, errors.New("an entry cannot be merged into itself"))
	}
	if s.config.Project == "" {
		return Followed{}, errors.New("save the project first")
	}
	unlock := lockFile(storePath(s.config.Project))
	defer unlock()
	file, err := s.readStore()
	if err != nil {
		return Followed{}, err
	}
	var mine []int
	for index, sample := range file.Samples {
		if sample.CharacterID == from {
			mine = append(mine, index)
		}
	}
	if len(mine) == 0 {
		return Followed{}, nil
	}
	// The absorbed primary first, then the newest; of two made at the same moment, the later in the file first.
	sort.SliceStable(mine, func(a, b int) bool {
		left, right := file.Samples[mine[a]], file.Samples[mine[b]]
		if left.Primary != right.Primary {
			return left.Primary
		}
		if !left.CreatedAt.Equal(right.CreatedAt) {
			return left.CreatedAt.After(right.CreatedAt)
		}
		return mine[a] > mine[b]
	})
	room := MaxPerCharacter - countFor(file.Samples, to)
	if room < 0 {
		room = 0
	}
	hasPrimary := false
	for _, sample := range file.Samples {
		if sample.CharacterID == to && sample.Primary {
			hasPrimary = true
		}
	}
	followed := Followed{}
	for _, index := range mine {
		if followed.Moved >= room {
			followed.Left++
			continue
		}
		sample := &file.Samples[index]
		sample.Merge = &StoredMerge{UndoID: undoID, From: from, To: to, WasPrimary: sample.Primary}
		sample.CharacterID = to
		if sample.Primary && hasPrimary {
			sample.Primary = false
		}
		hasPrimary = hasPrimary || sample.Primary
		followed.Moved++
	}
	if followed.Moved == 0 {
		return followed, nil
	}
	promoteNewest(file.Samples, from) // the ones left behind keep a primary
	if err := s.writeStore(file); err != nil {
		return Followed{}, err
	}
	return followed, nil
}

// UndoFollow moves the samples a merge moved back to the entry they came from, after the Story Bible took that merge back. A sample
// the narrator has since moved by hand, or deleted, is not touched. Each goes back with the primary mark it had if the entry it
// returns to has none; an entry left with samples and no primary gets its newest as primary. A merge this store does not know
// moves nothing and writes nothing.
func (s *Service) UndoFollow(undoID string) (Followed, error) {
	if !undoPattern.MatchString(undoID) {
		return Followed{}, errors.Join(ErrInvalid, errors.New("that is not a merge id"))
	}
	if s.config.Project == "" {
		return Followed{}, errors.New("save the project first")
	}
	unlock := lockFile(storePath(s.config.Project))
	defer unlock()
	file, err := s.readStore()
	if err != nil {
		return Followed{}, err
	}
	followed := Followed{}
	touched := map[string]bool{}
	for index := range file.Samples {
		sample := &file.Samples[index]
		// A row with a record sits at merge.To: a move by hand clears the record, and a file where they differ is not read (validMerge).
		merge := sample.Merge
		if merge == nil || merge.UndoID != undoID {
			continue
		}
		touched[merge.To] = true
		touched[merge.From] = true
		wasPrimary := merge.WasPrimary
		sample.CharacterID = merge.From
		sample.Merge = nil
		sample.Primary = false
		if wasPrimary && !hasPrimaryFor(file.Samples, merge.From) {
			sample.Primary = true
		}
		followed.Moved++
	}
	if followed.Moved == 0 {
		return followed, nil
	}
	for character := range touched {
		promoteNewest(file.Samples, character)
	}
	if err := s.writeStore(file); err != nil {
		return Followed{}, err
	}
	return followed, nil
}

func hasPrimaryFor(samples []Stored, characterID string) bool {
	for _, sample := range samples {
		if sample.CharacterID == characterID && sample.Primary {
			return true
		}
	}
	return false
}
