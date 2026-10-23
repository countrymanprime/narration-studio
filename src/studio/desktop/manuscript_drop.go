package main

import (
	"path/filepath"

	"github.com/countrymanprime/narration-utils/shell/internal/manuscript"
)

// manuscriptDroppedEvent tells the window what became of a file dropped on the import's drop zone: {jobId, name} when the import began,
// {message} when it could not. It never carries the path: the page learns the file's name and a job id, and the host holds the path.
const manuscriptDroppedEvent = "manuscript:dropped"

// beginDropped starts the import of a file the operating system dropped on the window, or says in a sentence why it cannot.
func (h *Host) beginDropped(paths []string) map[string]any {
	path, err := manuscript.DroppedFile(paths)
	if err != nil {
		return map[string]any{"message": err.Error()}
	}
	job := h.services().manuscript.Begin(path)
	h.jobRuns.begin(h.runLog, job.ID, jobKindManuscriptImport, "source", path)
	return map[string]any{"jobId": job.ID, "name": filepath.Base(path)}
}

// onFilesDropped is the window's FilesDropped hook (wailsapp.go watchFileDrop).
func (h *Host) onFilesDropped(paths []string) {
	emitEvent(manuscriptDroppedEvent, h.beginDropped(paths))
}
