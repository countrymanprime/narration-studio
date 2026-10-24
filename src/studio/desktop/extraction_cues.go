package main

import (
	"context"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"desktop/internal/guide"
)

// The dialogue cues (the quoted lines and who speaks them) are written without a Story Bible build: at the end of every scan, after
// every manuscript import, and for an entry's chapters when it is filed under or out of a speaking type, against the entries already filed under a speaking type. A failure here never fails the scan or the import;
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
func (h *Host) refreshCuesAfterImport() { h.refreshCuesInBackground("an import") }

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

// speakerSnapshot is where an entry's names appear and whether its type speaks, read before a change that can file it under, or out
// of, a speaking type. Both are empty when there is no Story Bible or no such entry.
type speakerSnapshot struct {
	chapters []string
	speaks   bool
}

func (h *Host) speakerSnapshotOf(ids ...string) speakerSnapshot {
	var snapshot speakerSnapshot
	svc := h.services().guide
	if svc == nil {
		return snapshot
	}
	for _, id := range ids {
		chapters, speaks, err := svc.SpeakerChapters(id)
		if err != nil {
			continue
		}
		snapshot.speaks = snapshot.speaks || speaks
		for _, chapter := range chapters {
			if !slices.Contains(snapshot.chapters, chapter) {
				snapshot.chapters = append(snapshot.chapters, chapter)
			}
		}
	}
	return snapshot
}

// refreshSpeakerCues recomputes, in the background, the cues of the chapters the entries' names appear in, before or after the change,
// when an entry spoke before or speaks now: filing a name under a speaking type attributes its tagged lines, and filing it out takes them
// back. A correction is kept, as on every refresh.
func (h *Host) refreshSpeakerCues(before speakerSnapshot, ids ...string) {
	after := h.speakerSnapshotOf(ids...)
	if !before.speaks && !after.speaks {
		return
	}
	chapters := slices.Clone(before.chapters)
	for _, chapter := range after.chapters {
		if !slices.Contains(chapters, chapter) {
			chapters = append(chapters, chapter)
		}
	}
	if len(chapters) == 0 {
		return
	}
	go h.refreshCuesInBackground("an entry was filed", chapters...)
}

// refreshCuesInBackground runs one cue refresh with its own deadline and logs the outcome; chapterIDs empty means every chapter.
func (h *Host) refreshCuesInBackground(why string, chapterIDs ...string) {
	refresh := h.cueRefresher()
	if refresh == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), cueRefreshTimeout)
	defer cancel()
	counts, err := refresh(ctx, chapterIDs...)
	if err != nil {
		h.runLog.App().Event(slog.LevelWarn, "guide.cues_failed", "the quoted lines were not found after "+why, "chapters", len(chapterIDs))
		return
	}
	h.runLog.App().Event(slog.LevelInfo, "guide.cues", "the quoted lines were found after "+why, "chapters", len(chapterIDs),
		"cues", counts.Cues, "attributed", counts.Attributed)
}

// filesTheEntry is whether an edit can change who the entry's names attribute lines to: its type, its name or its aliases.
func filesTheEntry(values map[string]string) bool {
	for _, field := range []string{"category", "canonical_name", "aliases"} {
		if _, ok := values[field]; ok {
			return true
		}
	}
	return false
}
