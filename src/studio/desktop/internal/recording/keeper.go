package recording

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

// The "keeper" mark on a native take: the narrator marks one take among several as the read to keep, as a
// narrator-confirmed change to the take's metadata that can be undone. Mirrors identity.go's sidecar pattern (a project-owned file in the
// Recordings folder, keyed by take name), but a separate file: keeper status and line identity are independent
// facts about a take, and a corrupt keeper file must never lose a narrator's line assignments (or the other way
// round) - the same reasoning that keeps line-identity.json its own file rather than a field on the take itself.

// keeperFileName is the sidecar file inside a project's Recordings folder.
const keeperFileName = "keeper.json"

func keeperPath(folder string) string { return filepath.Join(folder, keeperFileName) }

// readKeepers reads folder's keeper sidecar: take name -> true for every take marked keeper (a take absent from the
// map is not one). A missing or corrupt file yields none, the same laissez-faire treatment readIdentities gives an
// unreadable sidecar of its own.
func readKeepers(folder string) map[string]bool {
	raw, err := os.ReadFile(keeperPath(folder))
	if err != nil {
		return map[string]bool{}
	}
	var keepers map[string]bool
	if err := json.Unmarshal(raw, &keepers); err != nil || keepers == nil {
		return map[string]bool{}
	}
	return keepers
}

// writeKeepers writes folder's sidecar, temp-file-then-rename like writeIdentities, so a reader never sees a
// half-written file.
func writeKeepers(folder string, keepers map[string]bool) error {
	return writeSidecar(keeperPath(folder), keepers)
}

// writeSidecar writes value as JSON to path, temp-file-then-rename in path's folder.
func writeSidecar(path string, value any) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(raw); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}

// setTakeKeeper marks or unmarks takeName the keeper. Marking it clears every other take that shares its line
// (identities, from readIdentities): the narrator marks one keeper per line, and handing the mark to a different
// take is exactly the same confirmed, undoable action as unmarking it. A take with no line assigned yet has no
// group to clear, so it is marked (or unmarked) alone; it never touches the take's audio file.
func setTakeKeeper(folder, takeName string, keeper bool, identities map[string]string) error {
	if takeName == "" {
		return errors.New("choose a take before marking it the keeper")
	}
	keepers := readKeepers(folder)
	if keeper {
		if lineID, hasLine := identities[takeName]; hasLine {
			for other, otherLine := range identities {
				if other != takeName && otherLine == lineID {
					delete(keepers, other)
				}
			}
		}
		keepers[takeName] = true
	} else {
		delete(keepers, takeName)
	}
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return fmt.Errorf("could not prepare the Recordings folder: %w", err)
	}
	return writeKeepers(folder, keepers)
}

// The built-in recorder's two edits on its own takes. Both are sidecars like keeper.json, and neither ever opens a take's
// audio file for writing: a take is hidden (kept, never deleted, never played in place of the keeper) and a cut is an edit list
// the recorder plays and exports past (docs/reference/daw/builtin-recorder.md).
const (
	hiddenFileName = "hidden.json"
	editsFileName  = "edits.json"
)

// TakeCut is one cut in a take's edit list: seconds into the take, from Start to End. Mode is "gap" (the length is kept, the span
// is room tone) or "close" (the audio after it moves up).
type TakeCut struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Mode  string  `json:"mode"`
}

func readHidden(folder string) map[string]bool {
	var hidden map[string]bool
	if raw, err := os.ReadFile(filepath.Join(folder, hiddenFileName)); err != nil || json.Unmarshal(raw, &hidden) != nil || hidden == nil {
		return map[string]bool{}
	}
	return hidden
}

func readEdits(folder string) map[string][]TakeCut {
	var edits map[string][]TakeCut
	if raw, err := os.ReadFile(filepath.Join(folder, editsFileName)); err != nil || json.Unmarshal(raw, &edits) != nil || edits == nil {
		return map[string][]TakeCut{}
	}
	return edits
}

// hideOtherTakes marks keeper the keeper of its line and hides every other take that shares the line, returning how many it newly
// hid. The keeper itself is shown. A take with no line has no others to hide.
func hideOtherTakes(folder, keeper string, identities map[string]string) (int, error) {
	if err := setTakeKeeper(folder, keeper, true, identities); err != nil {
		return 0, err
	}
	hidden := readHidden(folder)
	delete(hidden, keeper)
	count := 0
	if lineID, ok := identities[keeper]; ok {
		for other, otherLine := range identities {
			if other != keeper && otherLine == lineID && !hidden[other] {
				hidden[other] = true
				count++
			}
		}
	}
	return count, writeSidecar(filepath.Join(folder, hiddenFileName), hidden)
}

// cutTakeRange adds [start, end) to take's edit list, merging it into any cut it overlaps (a cut of the same mode), so the list
// stays ordered and disjoint. The take file is not touched.
func cutTakeRange(folder, take string, start, end float64, mode string) error {
	if take == "" {
		return errors.New("choose a take before cutting it")
	}
	if !(start >= 0) || !(end > start) {
		return fmt.Errorf("a cut needs an end after its start (got %.3f to %.3f seconds)", start, end)
	}
	if mode != "gap" && mode != "close" {
		return fmt.Errorf("a cut is a gap or a close, not %q", mode)
	}
	edits := readEdits(folder)
	cuts := append(edits[take], TakeCut{Start: start, End: end, Mode: mode})
	sort.SliceStable(cuts, func(i, j int) bool { return cuts[i].Start < cuts[j].Start })
	merged := cuts[:1]
	for _, c := range cuts[1:] {
		last := &merged[len(merged)-1]
		if c.Start <= last.End && c.Mode == last.Mode {
			last.End = max(last.End, c.End)
			continue
		}
		merged = append(merged, c)
	}
	edits[take] = merged
	return writeSidecar(filepath.Join(folder, editsFileName), edits)
}

// HideOtherTakes keeps takeName as its line's keeper and hides the line's other takes; their files stay where they are. It
// returns how many it newly hid and publishes the new state.
func (s *Service) HideOtherTakes(takeName string) (int, error) {
	folder := s.Folder()
	if folder == "" {
		return 0, errors.New("open a project before hiding takes")
	}
	if err := s.takeExists(folder, takeName); err != nil {
		return 0, err
	}
	count, err := hideOtherTakes(folder, takeName, readIdentities(folder))
	if err != nil {
		return 0, err
	}
	s.publish()
	return count, nil
}

// CutTakeRange adds a cut to takeName's edit list; the take's audio file is not rewritten. mode is "gap" or "close".
func (s *Service) CutTakeRange(takeName string, start, end float64, mode string) error {
	folder := s.Folder()
	if folder == "" {
		return errors.New("open a project before cutting a take")
	}
	if err := s.takeExists(folder, takeName); err != nil {
		return err
	}
	if err := cutTakeRange(folder, takeName, start, end, mode); err != nil {
		return err
	}
	s.publish()
	return nil
}

// takeExists refuses a take the folder does not hold, so a stale name is never written into a sidecar.
func (s *Service) takeExists(folder, takeName string) error {
	takes, _, err := listTakes(folder, "")
	if err != nil {
		return err
	}
	for _, take := range takes {
		if take.Name == takeName {
			return nil
		}
	}
	return fmt.Errorf("%s is no longer in the Recordings folder", takeName)
}
