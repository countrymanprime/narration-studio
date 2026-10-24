package main

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"desktop/internal/guide"
)

// The dialogue cues (the quoted lines and who speaks them) are written without a Story Bible build: at the end of every scan and after
// every manuscript import, against the entries already filed under a speaking type. A failure here never fails the scan or the import;
// the scan's log says it, and an import's is in the run log.

// cueRefreshTimeout bounds one cue refresh after an import, which has no job of its own to cancel.
const cueRefreshTimeout = 2 * time.Minute

// cueRefresher is the seam, else the open project's guide service, else nil.
func (h *Host) cueRefresher() func(ctx context.Context, chapterIDs ...string) (guide.CueCounts, error) {
	if h.refreshCues != nil {
		return h.refreshCues
	}
	if svc := h.services().guide; svc != nil {
		return svc.RefreshCues
	}
	return nil
}

// refreshCuesAfterImport writes the cues for the manuscript just imported.
func (h *Host) refreshCuesAfterImport() {
	refresh := h.cueRefresher()
	if refresh == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), cueRefreshTimeout)
	defer cancel()
	counts, err := refresh(ctx)
	if err != nil {
		h.runLog.App().Event(slog.LevelWarn, "guide.cues_failed", "the quoted lines were not found after an import")
		return
	}
	h.runLog.App().Event(slog.LevelInfo, "guide.cues", "the quoted lines were found after an import", "cues", counts.Cues, "attributed", counts.Attributed)
}

// cuesSentence is the scan log's line for a cue refresh.
func cuesSentence(counts guide.CueCounts, err error) string {
	if err != nil {
		return "Could not find the quoted lines: " + err.Error()
	}
	lines := "quoted lines"
	if counts.Cues == 1 {
		lines = "quoted line"
	}
	return fmt.Sprintf("Found %d %s; %d with a speaker.", counts.Cues, lines, counts.Attributed)
}
