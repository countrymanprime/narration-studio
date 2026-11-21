package main

import "desktop/internal/dawport"

// dawTracksChanged is the daw_tracks_changed payload: the track list's revision from REAPER's heartbeat, or "" when none is known (no fresh
// heartbeat, or a bridge script from before the revision). A page showing the track list reads it again on each event, and polls only while
// the revision is "".
type dawTracksChanged struct {
	Revision string `json:"revision"`
}

// pollDawTracksChanged emits daw_tracks_changed when the heartbeat's track-list revision differs from the last one sent, including to and
// from not known. The script sends a heartbeat at once when the list changes (narration_ui_bridge.lua), so this follows a track added,
// removed, renamed or moved in REAPER within one tick. It is the transcriptLoop tick's job next to pollDawProjectEdited.
func (h *Host) pollDawTracksChanged() {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	if svc.reachability == nil || !resolver.Support(dawport.CapHeartbeat).Available {
		return
	}
	revision, _ := tracksRevisionOf(svc.reachability)
	h.mu.Lock()
	changed := !h.dawTracksSeen || revision != h.dawTracksRevision
	h.dawTracksRevision, h.dawTracksSeen = revision, true
	ctx := h.ctx
	h.mu.Unlock()
	if changed && ctx != nil {
		emitEvent("daw_tracks_changed", dawTracksChanged{Revision: revision})
	}
}
