package main

import "desktop/internal/dawport"

// dawTracksChanged is the daw_tracks_changed payload: the track list's revision from REAPER's heartbeat, or "" when none is known (no fresh
// heartbeat, or a bridge script from before the revision). A page showing the track list reads it again on each event, the same
// revision repeated included (another project with the same list), and polls only while the revision is "".
type dawTracksChanged struct {
	Revision string `json:"revision"`
}

// pollDawTracksChanged emits daw_tracks_changed when the heartbeat's track-list revision differs from the last one sent, including to and
// from not known, and when the bridge may have started over (another project open, a gap) with a list of the same revision: the page's
// list may then be another project's. The script sends a heartbeat at once when the list changes (narration_ui_bridge.lua), so this
// follows a track added, removed, renamed or moved in REAPER within one tick. With no heartbeat to read (no DAW linked, an engine without
// one) the revision is not known, so a page that held one is told. It is the transcriptLoop tick's job next to pollDawProjectEdited.
func (h *Host) pollDawTracksChanged() {
	svc := h.services()
	revision, epoch := "", uint64(0)
	if resolver, _ := h.dawResolverFor(svc); svc.reachability != nil && resolver.Support(dawport.CapHeartbeat).Available {
		revision, _ = tracksRevisionOf(svc.reachability)
		if e, ok := svc.reachability.(interface{ Epoch() uint64 }); ok {
			epoch = e.Epoch()
		}
	}
	h.mu.Lock()
	// Nothing is used up before the event can be sent (no context yet in a test), and a new tracker (another project) counts as a restart.
	if h.ctx == nil {
		h.mu.Unlock()
		return
	}
	changed := !h.dawTracksSeen || revision != h.dawTracksRevision || (revision != "" && (epoch != h.dawTracksEpoch || svc.reachability != h.dawTracksFrom))
	h.dawTracksRevision, h.dawTracksEpoch, h.dawTracksSeen, h.dawTracksFrom = revision, epoch, true, svc.reachability
	h.mu.Unlock()
	if changed {
		emitEvent("daw_tracks_changed", dawTracksChanged{Revision: revision})
	}
}
