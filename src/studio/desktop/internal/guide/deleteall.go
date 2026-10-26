package guide

import (
	"fmt"
	"os"
	"path/filepath"
)

// DeleteAll removes the project's Story Bible and answers how many entries it held: the ManuscriptGuide folder (the Story Bible file
// with its entries, names, pronunciations, review flags, relationships, types, dialogue cues and merge undo records, the preview audio
// and any copy of a file kept aside as unreadable) and the Story Bible's findings. The folder holds nothing else of the project's; the
// scan's suggestions in it are the extraction store's to remove first (store.Service.Clear), under that file's own lock. A file that
// cannot be read, or one from a newer app, is deleted too and counts as no entries: deleting is the narrator's way out of it.
func (s *Service) DeleteAll() (int, error) {
	s.editMu.Lock()
	defer s.editMu.Unlock()
	s.held = nil
	entries := 0
	if document, err := s.document(); err == nil {
		if list, ok := document["entities"].([]any); ok {
			entries = len(list)
		}
	}
	if err := os.RemoveAll(filepath.Dir(s.guidePath())); err != nil {
		return 0, fmt.Errorf("could not delete the Story Bible data: %w", err)
	}
	if store := s.findingsStore.Load(); store != nil {
		if err := store.RemoveAnalyzer(analyzerName); err != nil {
			return entries, err
		}
	}
	return entries, nil
}
