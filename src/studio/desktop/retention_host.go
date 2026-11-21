package main

import (
	"fmt"
	"strings"

	"desktop/internal/coverage"
	"desktop/internal/evidence"
	"desktop/internal/retention"
)

// Retention (#3816): the host keeps the project's derived files bounded by a pass in the background, started when a project
// is opened and when a recording check ends, and never while one runs. So far a pass only reports how much each store
// holds, in the host log, and deletes nothing; the stores' own deletes are wired one at a time behind it.

// startRetentionLocked replaces the project's retention runner with one over the stores of the project just configured, and
// kicks it. The previous runner is stopped first, so a pass never outlives its project. Call it with h.mu held.
func (h *Host) startRetentionLocked() {
	h.retention.Close()
	h.retention = nil
	project := h.config.projectFolder
	if project == "" {
		return
	}
	steps := []retention.Step{
		retention.DirStep("ledger", evidence.LedgerDir(project)),
		retention.DirStep("coverage results", coverage.ResultsDir(project)),
		retention.DirStep("coverage summaries", coverage.SummariesDir(project)),
		retention.DirStep("analysis cache", evidence.CacheDir(project)),
	}
	checks := h.coverage
	h.retention = retention.New(steps, checks.Busy, h.logRetention)
	h.retention.Kick("open")
}

// kickRetention asks the current runner for a pass, for the reason given.
func (h *Host) kickRetention(reason string) {
	h.mu.RLock()
	runner := h.retention
	h.mu.RUnlock()
	runner.Kick(reason)
}

// logRetention writes one pass's reports to the host log: one line per store, with sizes only.
func (h *Host) logRetention(reason string, reports []retention.Report) {
	var lines []string
	for _, report := range reports {
		lines = append(lines, fmt.Sprintf("%s: %d files, %d bytes, removed %d", report.Kind, report.FilesAfter, report.BytesAfter, report.Removed))
	}
	if len(lines) > 0 {
		_ = h.log.Report("retention_pass", reason+" | "+strings.Join(lines, "; "))
	}
}

// closeRetention stops the current retention pass and waits for it. The runner then refuses further kicks, so it is for the end of the app.
func (h *Host) closeRetention() {
	h.mu.RLock()
	runner := h.retention
	h.mu.RUnlock()
	runner.Close()
}
