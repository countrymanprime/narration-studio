package main

import (
	"context"
	"sync"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/coverage"
	"github.com/countrymanprime/narration-studio/shell/internal/evidence"
)

// Background recording checks. Every
// backgroundCheckInterval the host asks coverage.NextBackground whether a linked chapter whose recording changed since
// its check may be checked now, and starts it through the same coverage.Start as a narrator's press, marked Background.
// A narrator's own start pre-empts it (coverageStart), and a chapter the host already tried at its current change is
// not tried again, so a narrator's Cancel sticks until the chapter changes.

const (
	backgroundCheckInterval = 30 * time.Second
	// settingBackgroundChecks is RecordingCoverage.background_checks, on by default.
	settingBackgroundChecks = "background_checks"
)

// chapterSyncBackground is chaptersync:state's word on background checks: whether they are on, and why none runs now
// (a coverage.BackgroundWait: off, busy, model, battery, recording, quiet, nothing; "" when one was just started or
// the host has not looked yet).
type chapterSyncBackground struct {
	Enabled bool   `json:"enabled"`
	Wait    string `json:"wait"`
}

// backgroundChecks is what the loop remembers for the open project.
type backgroundChecks struct {
	mu sync.Mutex
	// +checklocks:mu
	folder string
	// attempted maps a chapter to the change it was last started for (its LastChanged).
	// +checklocks:mu
	attempted map[string]time.Time
	// +checklocks:mu
	last coverage.BackgroundDecision
	// +checklocks:mu
	looked bool
}

// forFolderLocked resets what the loop remembers when the project changed. The caller holds mu.
//
// +checklocks:b.mu
func (b *backgroundChecks) forFolderLocked(folder string) {
	if b.folder != folder || b.attempted == nil {
		b.folder, b.attempted, b.last, b.looked = folder, map[string]time.Time{}, coverage.BackgroundDecision{}, false
	}
}

// stateFor is chaptersync:state's background field for folder.
func (b *backgroundChecks) stateFor(folder string, enabled bool) chapterSyncBackground {
	b.mu.Lock()
	defer b.mu.Unlock()
	state := chapterSyncBackground{Enabled: enabled}
	if b.folder == folder && b.looked {
		state.Wait = string(b.last.Wait)
	}
	return state
}

// backgroundCheckLoop runs the scheduler until ctx ends (ServiceStartup).
func (h *Host) backgroundCheckLoop(ctx context.Context) {
	ticker := time.NewTicker(backgroundCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			h.backgroundCheckTick(now)
		}
	}
}

// backgroundChecksEnabled reads RecordingCoverage.background_checks.
func backgroundChecksEnabled(svc hostServices) bool {
	if svc.settings == nil {
		return false
	}
	value, _ := svc.settings.Effective(coverage.SettingsTool, settingBackgroundChecks, "true")
	return value == "true"
}

// backgroundCheckTick makes one decision and, when it names a chapter, starts that chapter's check. It sends
// chaptersync:state when the reason to wait changes, so the UI can say why nothing runs.
func (h *Host) backgroundCheckTick(now time.Time) coverage.BackgroundDecision {
	svc := h.services()
	folder := svc.config.projectFolder
	if svc.coverage == nil || folder == "" {
		return coverage.BackgroundDecision{}
	}
	_, modelReady := h.backgroundRequest(svc, "")
	var power coverage.Power
	if h.powerState != nil {
		power = h.powerState()
	} else {
		power = platformPower()
	}
	// The heartbeat's transport says whether REAPER is recording; RecordingKnown is false when REAPER is
	// unreachable or its heartbeat has not carried the transport yet (an older script), and NextBackground treats
	// that the same as recording: a running REAPER it cannot read is never assumed idle.
	reaperRunning := svc.reachability != nil && svc.reachability.Reachable()
	var recordingKnown, recording bool
	if reaperRunning {
		if transport, ok := svc.reachability.Transport(); ok {
			recordingKnown, recording = true, transport.Recording
		}
	}
	conditions := coverage.BackgroundConditions{
		Enabled: backgroundChecksEnabled(svc), ModelReady: modelReady, Busy: !h.idle(), Power: power,
		ReaperRunning: reaperRunning, RecordingKnown: recordingKnown, Recording: recording,
		LastActivity: h.chapterSyncWatch.lastActivityFor(folder), Now: now,
	}

	b := &h.backgroundChecks
	candidates := []coverage.BackgroundCandidate{}
	if conditions.Enabled && !conditions.Busy {
		if state, err := h.chapterSyncState(); err == nil {
			b.mu.Lock()
			b.forFolderLocked(folder)
			for _, row := range state.Chapters {
				if row.TrackGUID == "" || row.LastChanged == nil || row.Checking {
					continue
				}
				// A never-checked chapter is a candidate only when a sync saw its track change: a whole book is never
				// checked from scratch on its own.
				if row.Freshness == string(evidence.StateNever) && row.TrackChangedAt == nil {
					continue
				}
				if tried, ok := b.attempted[row.ChapterID]; ok && tried.Equal(*row.LastChanged) {
					continue
				}
				candidates = append(candidates, coverage.BackgroundCandidate{
					ChapterID: row.ChapterID, Freshness: evidence.EvaluatorState(row.Freshness), LastChanged: *row.LastChanged,
				})
			}
			b.mu.Unlock()
		}
	}
	decision := coverage.NextBackground(conditions, candidates)

	b.mu.Lock()
	b.forFolderLocked(folder)
	changed := !b.looked || b.last.Wait != decision.Wait
	b.last, b.looked = decision, true
	for _, candidate := range candidates {
		if candidate.ChapterID == decision.ChapterID {
			b.attempted[candidate.ChapterID] = candidate.LastChanged
		}
	}
	b.mu.Unlock()

	if decision.ChapterID != "" {
		var err error
		if request, ready := h.backgroundRequest(svc, decision.ChapterID); ready {
			_, err = svc.coverage.Start(request)
		}
		if err != nil && h.log != nil {
			_ = h.log.Report("background_check_failed", decision.ChapterID+": "+err.Error())
		}
		changed = true
	}
	if changed {
		h.emitChapterSyncState()
	}
	return decision
}

// backgroundRequest is the check a background run starts: the same choices a press with no options would make
// (resolveCoverageChoices), so a chapter changed in REAPER is re-checked the way the narrator has set the check up. It never
// downloads a model: a first-pass model that is not installed is false (the check waits), and a second-pass model
// that is not installed is dropped, so the first pass still runs alone.
func (h *Host) backgroundRequest(svc hostServices, chapterID string) (coverage.Request, bool) {
	models := h.registry().whisper
	if models == nil {
		return coverage.Request{}, false
	}
	choices, err := resolveCoverageChoices(svc.settings, nil)
	if err != nil {
		return coverage.Request{}, false
	}
	if _, known := models.Model(choices.FirstPass); !known {
		return coverage.Request{}, false
	}
	modelDir, err := models.Dir(choices.FirstPass)
	if err != nil {
		return coverage.Request{}, false
	}
	request := coverage.Request{
		ChapterID: chapterID, Transcription: coverage.Transcription{Model: choices.FirstPass, ModelDir: modelDir},
		Alignment: coverageSettings(svc.settings).Alignment, Parallel: choices.Parallel, Pipeline: choices.Pipeline, Background: true,
	}
	if choices.Recheck != "" {
		if recheck, required, err := resolveCoverageRecheck(models, choices.Recheck); err == nil && required == nil {
			request.Recheck, request.UnsureBelow = recheck, choices.UnsureBelow
		}
	}
	return request, true
}
