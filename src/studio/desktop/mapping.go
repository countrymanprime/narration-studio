package main

import (
	"desktop/internal/creditsid"
	"fmt"

	"desktop/internal/evidence"
)

// mappingContext resolves the current manuscript document's ID and the
// project's confirmed chapter-track mapping store from one hostServices
// snapshot, so a mapping binding always agrees with the project a request
// was made against even if a project switch lands mid-call (h.services()'s
// own contract). It refuses when there is no project open, or no manuscript
// imported yet - a mapping is scoped to a document, so there is
// nothing to list, confirm or clear without one.
func mappingContext(svc hostServices) (documentID string, store *evidence.MappingStore, err error) {
	folder := svc.config.projectFolder
	if folder == "" {
		return "", nil, fmt.Errorf("open a project before working with chapter-track links")
	}
	if svc.manuscript == nil {
		return "", nil, fmt.Errorf("import a manuscript before working with chapter-track links")
	}
	data, err := svc.manuscript.Load()
	if err != nil {
		return "", nil, err
	}
	documentID, _ = data["documentId"].(string)
	if documentID == "" {
		return "", nil, fmt.Errorf("import a manuscript before working with chapter-track links")
	}
	return documentID, evidence.NewMappingStore(folder), nil
}

// mappingList returns every confirmed trackGuid -> chapterId link for the
// current manuscript document.
func (h *Host) mappingList() (map[string]any, error) {
	svc := h.services()
	documentID, store, err := mappingContext(svc)
	if err != nil {
		return nil, err
	}
	mappings, err := store.List(documentID)
	if err != nil {
		return nil, err
	}
	return map[string]any{"documentId": documentID, "mappings": mappings}, nil
}

// chapterTitle looks up chapterID's title among the current manuscript's
// chapters, reporting false when chapterID is not one of them.
func chapterTitle(svc hostServices, chapterID string) (string, bool, error) {
	// A credits id is never a manuscript chapter, so it never turns up in svc.manuscript.Chapters(); a
	// credits row's link goes through the same ChapterTrackSet/Unlink bindings a manuscript
	// chapter's does (src/studio/desktop/internal/coverage/credits.go: one chapter-track-map.json), and each calls this to validate the id and stamp the
	// stored link with a real title, so it needs the credits titles too, not just the manuscript's own.
	if kind, ok := creditsid.Kind(chapterID); ok {
		return creditsid.Title(kind), true, nil
	}
	// Unmeasured: a title needs no recorded length, and the measured list tokenizes the whole book and reads the project and the coverage results (#3272).
	chapters, err := svc.manuscript.ChaptersUnmeasured()
	if err != nil {
		return "", false, err
	}
	for _, chapter := range chapters {
		if id, _ := chapter["id"].(string); id == chapterID {
			title, _ := chapter["title"].(string)
			return title, true, nil
		}
	}
	return "", false, nil
}
