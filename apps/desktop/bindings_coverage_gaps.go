package main

import (
	"fmt"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/gapreview"
)

// The narrator's call on a recording-check gap (ADR 0842). A check only measures: nothing here runs on its own, and
// neither binding is ever called by a run. Each takes ids only, a chapter and a gap of that chapter's latest result,
// and is refused with a sentence (nothing written) when the result is stale or was never made, or the gap is not in it.

// CoverageGapAccept turns one gap of the chapter's current check into a note with the accepted decision, and answers
// that finding. The same gap again answers the same finding and writes nothing.
func (h *Host) CoverageGapAccept(chapterID, gapID string) (string, error) {
	service, err := h.gapReview()
	if err != nil {
		return "", err
	}
	return encodeBinding(service.Accept(chapterID, gapID))
}

// CoverageGapIgnore remembers that the narrator passed on one gap of the chapter's current check. It makes no note.
func (h *Host) CoverageGapIgnore(chapterID, gapID string) (string, error) {
	service, err := h.gapReview()
	if err != nil {
		return "", err
	}
	return encodeBinding(nil, service.Ignore(chapterID, gapID))
}

// CoverageGapReviews answers {gapId: "accepted" | "ignored"} for the gaps of the chapter's current check that have a
// review. A stale or absent result, and a gap without a review, are not in it.
func (h *Host) CoverageGapReviews(chapterID string) (string, error) {
	service, err := h.gapReview()
	if err != nil {
		return encodeBinding(map[string]gapreview.Decision{}, nil)
	}
	return encodeBinding(service.Reviews(chapterID))
}

// gapReview builds the review service over one services() snapshot, so a project switch in the middle of a call never
// mixes two projects.
func (h *Host) gapReview() (*gapreview.Service, error) {
	svc := h.services()
	if svc.coverage == nil || svc.findings == nil || svc.config.projectFolder == "" {
		return nil, errNoProject
	}
	alignment := coverageSettings(svc.settings).Alignment
	return gapreview.New(gapreview.Config{
		Project:  svc.config.projectFolder,
		Findings: svc.findings,
		Reporter: h.persist,
		Current: func(chapterID string) (gapreview.Current, error) {
			result, err := svc.coverage.Result(chapterID, alignment)
			if err != nil {
				return gapreview.Current{}, err
			}
			if !result.Current() || result.Record == nil {
				return gapreview.Current{}, fmt.Errorf("%w", gapreview.ErrNotCurrent)
			}
			gaps, _ := coverage.ClassifyGaps(result.Result.Report)
			return gapreview.Current{EvidenceKey: result.Record.ID, Gaps: gaps}, nil
		},
	}), nil
}
