package main

import (
	"context"
	"sync"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/evidence"
	"github.com/countrymanprime/narration-utils/shell/internal/manuscript"
	"github.com/countrymanprime/narration-utils/shell/internal/pickuplist"
	"github.com/countrymanprime/narration-utils/shell/internal/pickups"
	"github.com/countrymanprime/narration-utils/shell/internal/stages"
)

// The pickup list (ADR 0840): the lines to record again, merged from the recording check's gaps, the notes decided
// "Needs pickup" and the lines the narrator added, with the narrator's removals and leave-outs kept in
// <project>/narration-utils/pickups/pickup-list.json. Every binding takes ids and plain text only, never a path, and
// answers the whole list, so the page and the Booth read one shape.

// PickupsList answers the merged list and the chapters whose recording check added nothing, and why.
func (h *Host) PickupsList() (string, error) {
	return encodeBinding(h.pickupList().List())
}

// PickupsAdd adds a line by hand to a chapter, at a time in seconds into the chapter's recording. The paragraph whose
// text starts like the line is found; the same line twice is one pickup.
func (h *Host) PickupsAdd(chapterID string, time float64, line string) (string, error) {
	return encodeBinding(h.pickupList().Add(chapterID, time, line))
}

// PickupsRemove hides a pickup of any source from the list; a note or a check keeps its own record.
func (h *Host) PickupsRemove(id string) (string, error) {
	return encodeBinding(h.pickupList().Remove(id))
}

// PickupsSetIncluded puts a pickup in or leaves it out of the next pickup session.
func (h *Host) PickupsSetIncluded(id string, included bool) (string, error) {
	return encodeBinding(h.pickupList().SetIncluded(id, included))
}

// PickupsSetDone marks a pickup done or open: through its DAW marker when REAPER holds it (a refusal is the answer),
// otherwise kept in the list file until the marker can be written.
func (h *Host) PickupsSetDone(id string, done bool) (string, error) {
	return encodeBinding(h.pickupList().SetDone(id, done))
}

// pickupList builds the list service over one services() snapshot, so a project switch in the middle of a call never
// mixes two projects. The saved project is parsed at most once per call.
func (h *Host) pickupList() *pickuplist.Service {
	svc := h.services()
	config := pickuplist.Config{
		Project:  svc.config.projectFolder,
		Chapters: pickupChapters(svc.manuscript),
		DAW:      pickupMarkers{service: svc.pickups, reachable: svc.reachability != nil && svc.reachability.Reachable()},
		Reporter: h.persist,
	}
	if svc.findings != nil {
		config.Findings = svc.findings
	}
	if svc.coverage != nil {
		alignment := coverageSettings(svc.settings).Alignment
		view := sync.OnceValue(func() stages.EvidenceView {
			return svc.coverage.EvidenceView(context.Background(), manuscriptDocumentID(svc.manuscript))
		})
		config.Speech = func(chapterID string) pickuplist.Speech {
			current := view()
			if current.ProjectErr != nil {
				reason, ok := coverage.ReasonOf(current.ProjectErr)
				if !ok {
					reason = coverage.Reason(current.ProjectErr.Error())
				}
				return pickuplist.Speech{State: string(evidence.StateNever), Reasons: []string{string(reason)}}
			}
			result, err := svc.coverage.ResultIn(current.Project, current.ProjectFile, chapterID, alignment)
			if err != nil {
				return pickuplist.Speech{State: "unreadable", Reasons: []string{err.Error()}}
			}
			return pickupSpeech(result)
		}
		config.Locate = func(_ string, position coverage.RegionPosition) (float64, bool) {
			return locateInProject(view(), position)
		}
	}
	return pickuplist.New(config)
}

// pickupSpeech is a chapter's check as the list reads it: gaps only from a current result.
func pickupSpeech(result coverage.ChapterResult) pickuplist.Speech {
	speech := pickuplist.Speech{State: string(result.State), Reasons: result.Reasons}
	if !result.Current() {
		if result.State == evidence.StateCurrent {
			speech.State = string(evidence.StateStale)
		}
		return speech
	}
	speech.Gaps, _ = coverage.ClassifyGaps(result.Result.Report)
	if result.Record != nil {
		speech.RecordID = result.Record.ID
	}
	return speech
}

// locateInProject places a point of an item's source on the saved project's timeline: the item's position plus the
// source time past the take's start, at the take's rate.
func locateInProject(view stages.EvidenceView, position coverage.RegionPosition) (float64, bool) {
	if view.ProjectErr != nil || position.ItemGUID == "" {
		return 0, false
	}
	for _, track := range view.Project.Tracks {
		for _, item := range track.Items {
			if item.GUID != position.ItemGUID {
				continue
			}
			rate := item.PlayRate
			if rate <= 0 {
				rate = 1
			}
			at := item.Position + (position.SourceTime-item.SourceStart)/rate
			if at < item.Position || at > item.Position+item.Length {
				return 0, false
			}
			return at, true
		}
	}
	return 0, false
}

// pickupChapters reads the manuscript's chapters in order, each with its lines and its recorded length when measured.
func pickupChapters(service *manuscript.Service) func() ([]pickuplist.Chapter, error) {
	return func() ([]pickuplist.Chapter, error) {
		if service == nil {
			return nil, nil
		}
		rows, err := service.Chapters()
		if err != nil {
			return nil, nil
		}
		paragraphs := markupParagraphs(service)
		chapters := make([]pickuplist.Chapter, 0, len(rows))
		for _, row := range rows {
			id, _ := row["id"].(string)
			if id == "" {
				continue
			}
			chapter := pickuplist.Chapter{ID: id}
			if seconds, ok := row["recordedSeconds"].(float64); ok {
				chapter.Seconds = &seconds
			}
			lines, err := paragraphs(id)
			if err != nil {
				return nil, err
			}
			for _, line := range lines {
				chapter.Paragraphs = append(chapter.Paragraphs, pickuplist.Paragraph{ID: line.ID, Index: line.Index, Text: line.Text})
			}
			chapters = append(chapters, chapter)
		}
		return chapters, nil
	}
}

// pickupMarkers is the DAW side of the list over the pickups service (SN-D44): the markers its latest listing still
// holds, and Resolve or Reopen at a marker's position for a done state.
type pickupMarkers struct {
	service   *pickups.Service
	reachable bool
}

func (m pickupMarkers) Reachable() bool { return m.service != nil && m.reachable }

func (m pickupMarkers) Markers() ([]pickuplist.Marker, bool) {
	if m.service == nil {
		return nil, false
	}
	listed, _ := m.service.Snapshot()["markers"].([]any)
	markers := make([]pickuplist.Marker, 0, len(listed))
	for _, raw := range listed {
		marker, _ := raw.(map[string]any)
		start, ok := marker["start"].(float64)
		if !ok {
			continue
		}
		markers = append(markers, pickuplist.Marker{At: start, Done: marker["state"] == "done"})
	}
	return markers, len(markers) > 0
}

func (m pickupMarkers) SetDone(at float64, done bool) error {
	if done {
		return m.service.Resolve(at)
	}
	return m.service.Reopen(at)
}
