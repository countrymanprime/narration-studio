package main

import (
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// gatedReview is the Audacity adapter's review role behind the resolver: the transcript service starts a comparison straight on
// the role, so each request asks the resolver first and the narrator's capability switches (Experimental, the review toggle) and
// Audacity not answering refuse it with the resolver's own sentence, as they do the REAPER actions (internal/bridge/actions.go).
type gatedReview struct {
	dawport.ReviewSession
	allowed func() error
}

func (g gatedReview) PrepareReview(runID, projectFolder string) error {
	if err := g.allowed(); err != nil {
		return err
	}
	return g.ReviewSession.PrepareReview(runID, projectFolder)
}

func (g gatedReview) InspectFindings(runID, findingsPath string) error {
	if err := g.allowed(); err != nil {
		return err
	}
	return g.ReviewSession.InspectFindings(runID, findingsPath)
}

func (g gatedReview) NavigateToFinding(runID, findingID string) error {
	if err := g.allowed(); err != nil {
		return err
	}
	return g.ReviewSession.NavigateToFinding(runID, findingID)
}

func (g gatedReview) ExportFindings(runID, findingsPath string, colors dawport.MarkerColors) error {
	if err := g.allowed(); err != nil {
		return err
	}
	return g.ReviewSession.ExportFindings(runID, findingsPath, colors)
}

// gatedAudacityReview is conn's review role, asking the resolver for the open project before each request. The resolver is built
// when the request comes, from the services then, so a switch the narrator made in Settings applies to the next click.
func (h *Host) gatedAudacityReview(conn *audacityConn) dawport.ReviewSession {
	role, _ := conn.adapter.Role(dawport.CapReview).(dawport.ReviewSession)
	return gatedReview{ReviewSession: role, allowed: func() error {
		resolver, _ := h.dawResolverFor(h.services())
		return resolver.Allowed(dawport.CapReview)
	}}
}
