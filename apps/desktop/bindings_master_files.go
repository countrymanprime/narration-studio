package main

import (
	"context"
	"fmt"
	"path/filepath"
	"strconv"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/measure"
)

// Master & QC's file actions (SN-M97): Play the quietest 5 s and Open in the DAW, over the file bindings
// (bindings_daw_files.go). The page sends a file id, the path a file of the host's last measurement answered; the host plays or
// shows only a file of that run, and works out the stretch to play from the run's own report, so the page names neither a
// path to trust nor a time. Each answer is a DawResult (ADR 0810) with no undo step: the project is unchanged.

// quietestPlaySeconds is how much of a file Play the quietest plays, centred on its quietest noise-floor window.
const quietestPlaySeconds = 5

const masterNotInRunSentence = "That file is not in the last measurement. Check the files again, then try again."

// MasterPlayQuietest plays the 5 s of fileID centred on the quietest window its measurement found, clamped to the file,
// through the DAW's file preview. The file_preview sentence comes first, then a file not in the last measurement (code
// stale), then a file with no quietest window; then the file bindings' own checks and refusals.
func (h *Host) MasterPlayQuietest(fileID string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	support := resolver.Support(dawport.CapFilePreview)
	if !support.Available {
		return encodeBinding(dawport.Refused(support.Message), nil)
	}
	file, ok := h.lastRunFile(fileID)
	if !ok {
		return encodeBinding(dawport.RefusedStale(masterNotInRunSentence), nil)
	}
	start, length, refused := quietestStretch(file)
	if refused != "" {
		return encodeBinding(dawport.Refused(refused), nil)
	}
	ctx, cancel := context.WithTimeout(context.Background(), fileActionTimeout)
	defer cancel()
	clean, picked := h.pickedFile(file.Path)
	result := dawPreviewFileIn(ctx, svc, support, svc.filePreviewer, clean, picked, start, length)
	if result.OK {
		// Shortest exact form for both, as the UI's mock prints them: the start is a whole number of quarter seconds or a clamp.
		seconds := func(value float64) string { return strconv.FormatFloat(value, 'f', -1, 64) }
		result.Message = fmt.Sprintf("Playing the quietest %s s of %s, from %s s.", seconds(length), file.Name, seconds(start))
	}
	return encodeBinding(result, nil)
}

// MasterOpenInDaw shows fileID in the DAW's own file browser, without importing or playing it. The file_reveal sentence
// comes first, then a file not in the last measurement (code stale); then the file bindings' own checks and refusals.
func (h *Host) MasterOpenInDaw(fileID string) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	support := resolver.Support(dawport.CapFileReveal)
	if !support.Available {
		return encodeBinding(dawport.Refused(support.Message), nil)
	}
	file, ok := h.lastRunFile(fileID)
	if !ok {
		return encodeBinding(dawport.RefusedStale(masterNotInRunSentence), nil)
	}
	ctx, cancel := context.WithTimeout(context.Background(), fileActionTimeout)
	defer cancel()
	clean, picked := h.pickedFile(file.Path)
	return encodeBinding(dawRevealFileIn(ctx, svc, support, svc.fileRevealer, clean, picked), nil)
}

// lastRunFile is the file of the host's last measurement whose path is fileID, measured or not.
func (h *Host) lastRunFile(fileID string) (MeasureFileResult, bool) {
	if fileID == "" {
		return MeasureFileResult{}, false
	}
	h.mu.RLock()
	job := h.measureJob
	h.mu.RUnlock()
	if job == nil {
		return MeasureFileResult{}, false
	}
	clean := filepath.Clean(fileID)
	for _, file := range job.snapshot().Files {
		if file.Path == clean {
			return file, true
		}
	}
	return MeasureFileResult{}, false
}

// quietestStretch is the quietestPlaySeconds of file centred on its quietest noise-floor window and moved inside the file
// (all of it when it is shorter), or the sentence saying why there is none: never an invented time (ADR 0015).
func quietestStretch(file MeasureFileResult) (start, length float64, refused string) {
	if file.Report == nil {
		return 0, 0, fmt.Sprintf("%s was not measured, so there is no quiet stretch to play.", file.Name)
	}
	quietest, duration := file.Report.NoiseFloorStartSeconds, file.Report.DurationSeconds
	if quietest == nil || !(duration > 0) {
		return 0, 0, fmt.Sprintf("%s has no quiet stretch to play: the measurement found no room tone in it.", file.Name)
	}
	length = min(quietestPlaySeconds, duration)
	centre := *quietest + measure.NoiseWindowSeconds/2
	return max(0, min(centre-length/2, duration-length)), length, ""
}
