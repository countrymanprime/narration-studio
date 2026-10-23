package main

import (
	"github.com/countrymanprime/narration-utils/shell/internal/extractionport"
)

// The Story Bible's scan on the wire (extraction_job.go): the sources a scan can run, starting it, its state and
// cancelling it. Only source ids cross; the host chooses every path the sources read.

// ExtractionSource is one row of the extraction registry as the UI shows it: Runs is false for a source the narrator
// does not start (an imported file); Reason, when Available is false, is a sentence that says why.
type ExtractionSource struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Icon      string `json:"icon"`
	Runs      bool   `json:"runs"`
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
}

// ExtractionSources returns every extraction source in the registry's order, rules first, with whether it can run now.
func (h *Host) ExtractionSources() (string, error) {
	registry := h.extractionRegistry()
	installed := h.extractionInstalledAssets()
	rows := []ExtractionSource{}
	for _, entry := range registry.Entries() {
		source := entry.New()
		a := extractionport.AvailableNowIn(registry, entry.Name, installed)
		rows = append(rows, ExtractionSource{ID: entry.Name, Label: entry.Descriptor.Label, Icon: source.Icon(), Runs: source.Runs(),
			Available: a.OK, Reason: a.Reason})
	}
	return encodeBinding(rows, nil)
}

// ExtractionScan starts a scan of the manuscript: the rules, then each of sourceIds that can run, in the registry's
// order; one that cannot is skipped with its reason in the job's messages. While a scan runs it returns that scan and
// starts no other. An id that is not a source a scan can start is refused before anything starts.
func (h *Host) ExtractionScan(sourceIds []string) (string, error) {
	return encodeBinding(h.startExtractionScan(sourceIds))
}

// ExtractionScanState returns the running or last scan, or an idle one.
func (h *Host) ExtractionScanState() (string, error) {
	return encodeBinding(h.extractionScanState(), nil)
}

// ExtractionScanCancel stops the running scan and the source it is running. What the sources that finished added is kept.
func (h *Host) ExtractionScanCancel() (string, error) {
	return encodeBinding(h.cancelExtractionScan(), nil)
}
