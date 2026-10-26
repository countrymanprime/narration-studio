package main

import "fmt"

// storyBibleDeleted is what GuideDeleteAll answers: how many entries the Story Bible held and how many suggestions the manuscript scan
// had stored, accepted and rejected ones included, before both were deleted.
type storyBibleDeleted struct {
	Entries     int `json:"entries"`
	Suggestions int `json:"suggestions"`
}

// GuideDeleteAll deletes the project's Story Bible data and nothing else: every entry with its names, pronunciations, notes,
// relationships, review flags and speaker colour, the types, the dialogue cues and their corrections, the merge undo records, the
// preview audio, the scan's suggestions and the Story Bible's findings. The manuscript, the takes and recordings, the settings, the
// voice samples and the voice references stay; a sample or reference names an entry by id, and a build that finds the same name gives
// it the same id. There is no undo. Refused unless confirmed, and while a build or a scan is running, since either writes the files
// this removes.
func (h *Host) GuideDeleteAll(confirmed bool) (string, error) {
	if !confirmed {
		return "", fmt.Errorf("deleting the Story Bible data requires confirmation")
	}
	svc := h.services()
	if svc.guide == nil {
		return "", fmt.Errorf("the Story Bible is unavailable")
	}
	if h.storyBibleWorkRunning() {
		return "", fmt.Errorf("wait for the Story Bible build or the manuscript scan to finish, then delete the Story Bible data")
	}
	extractionDecisions.Lock()
	defer extractionDecisions.Unlock()
	// Counted, not changed: the one delete below removes the suggestions with their folder, so a failure leaves them all in place.
	suggestions := 0
	if listed, err := h.extractionStore().List(); err == nil {
		suggestions = len(listed)
	}
	entries, err := svc.guide.DeleteAll()
	if err != nil {
		return "", err
	}
	return encodeBinding(storyBibleDeleted{Entries: entries, Suggestions: suggestions}, nil)
}

// storyBibleWorkRunning says whether a Story Bible build or a manuscript scan is running.
func (h *Host) storyBibleWorkRunning() bool {
	h.mu.RLock()
	build, scan := h.guideJob, h.extractionJob
	h.mu.RUnlock()
	if scan != nil && scan.running() {
		return true
	}
	if build == nil {
		return false
	}
	build.mu.RLock()
	defer build.mu.RUnlock()
	return build.phase == "running"
}
