package main

import "desktop/internal/dawport"

// daw_project_edited tells the UI the DAW project was edited: its payload is the heartbeat's change counter (REAPER's
// GetProjectStateChangeCount), which rises on every edit, saved or not, and restarts when a project opens. The Editing page holds a table of where
// each word plays in the project (WorkspaceWordTimes) made at one count and asks for a new one when the count moves. Nothing is sent to the DAW: the
// counter is what the heartbeat already carries (as daw_project_state_changed's unsaved flag is made from it).

// dawProjectEdited is the daw_project_edited payload.
type dawProjectEdited struct {
	ChangeCount int `json:"changeCount"`
}

// pollDawProjectEdited is one tick of transcriptLoop (app.go): it emits daw_project_edited when the counter differs from the last one it saw, and
// not at all while the DAW cannot be read.
func (h *Host) pollDawProjectEdited() {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	if svc.reachability == nil || !resolver.Support(dawport.CapHeartbeat).Available || !svc.reachability.Reachable() {
		return
	}
	count, counted := dawport.Heartbeat(svc.reachability).ChangeCount()
	if !counted {
		return
	}
	h.mu.Lock()
	changed := !h.dawEditSeen || count != h.dawEditCount
	h.dawEditCount, h.dawEditSeen = count, true
	ctx := h.ctx
	h.mu.Unlock()
	if changed && ctx != nil {
		emitEvent("daw_project_edited", dawProjectEdited{ChangeCount: count})
	}
}
