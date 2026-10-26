package main

import (
	"desktop/internal/dawport"
)

// gatedReview is the Audacity adapter's review role behind the resolver: the transcript service starts a comparison straight on
// the role, so each request asks the resolver first and Audacity not answering refuses it with the resolver's own sentence, as they do the REAPER actions (internal/bridge/actions.go).
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

// gatedPickups is the Audacity adapter's pickup-list role behind the resolver, as gatedReview is for the comparison: the pickup service
// calls the role straight, so each request asks the resolver first and Audacity not answering refuses in its own sentence.
type gatedPickups struct {
	dawport.PickupList
	allowed func() error
}

func (g gatedPickups) ImportPickups(runID, payloadPath string) error {
	if err := g.allowed(); err != nil {
		return err
	}
	return g.PickupList.ImportPickups(runID, payloadPath)
}

func (g gatedPickups) ExportPickups(runID, outputPath string) error {
	if err := g.allowed(); err != nil {
		return err
	}
	return g.PickupList.ExportPickups(runID, outputPath)
}

func (g gatedPickups) NextPickup(runID string) error {
	if err := g.allowed(); err != nil {
		return err
	}
	return g.PickupList.NextPickup(runID)
}

func (g gatedPickups) ResolvePickup(runID string, position float64) error {
	if err := g.allowed(); err != nil {
		return err
	}
	return g.PickupList.ResolvePickup(runID, position)
}

func (g gatedPickups) ReopenPickup(runID string, position float64) error {
	if err := g.allowed(); err != nil {
		return err
	}
	return g.PickupList.ReopenPickup(runID, position)
}

func (g gatedPickups) ListPickupMarkers(runID, outputPath string) error {
	if err := g.allowed(); err != nil {
		return err
	}
	return g.PickupList.ListPickupMarkers(runID, outputPath)
}

func (g gatedPickups) CountPickups(runID string) error {
	if err := g.allowed(); err != nil {
		return err
	}
	return g.PickupList.CountPickups(runID)
}

// gatedAudacityPickups is conn's pickup-list role, asking the resolver for the open project before each request.
func (h *Host) gatedAudacityPickups(conn *audacityConn) dawport.PickupList {
	role, _ := conn.adapter.Role(dawport.CapPickups).(dawport.PickupList)
	return gatedPickups{PickupList: role, allowed: func() error {
		resolver, _ := h.dawResolverFor(h.services())
		return resolver.Allowed(dawport.CapPickups)
	}}
}
