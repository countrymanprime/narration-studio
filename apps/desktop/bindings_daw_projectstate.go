package main

import (
	"encoding/json"
	"os"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// DawProjectState and its live event daw_project_state_changed tell the UI the DAW project as last saved against the live
// one: when the saved file was written, whether REAPER has edits it does not have, and the transport. Everything is read
// from what the host already has, through the Heartbeat role the resolver hands out (as daw_transport_changed is,
// bindings_daw_transport.go): the open .rpp and the edit counter from the heartbeat, and the file's modification time
// from a stat here, never from Lua. The wire schema, golden payloads, wireContracts row and mock live in apps/ui/src/api
// (docs/architecture/wire-contracts.md).

// DawProjectState answers {savedAt, unsavedChanges, playState, playPosition} (dawport.ProjectState). With no DAW, the
// heartbeat capability unavailable or turned off, or a DAW not answering, it is the idle payload: stopped, 0, null, false.
func (h *Host) DawProjectState() (string, error) {
	return encodeBinding(h.dawProjectState(), nil)
}

func (h *Host) dawProjectState() dawport.ProjectState {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	in := dawport.ProjectStateInput{KeepsSavedProject: true}
	if svc.reachability == nil || !resolver.Support(dawport.CapHeartbeat).Available || !svc.reachability.Reachable() {
		h.observeUnsaved("", time.Time{}, 0, false)
		return dawport.NewProjectState(in)
	}
	heartbeat := dawport.Heartbeat(svc.reachability)
	path, _ := heartbeat.CurrentProject()
	var modTime time.Time
	if path != "" {
		if info, err := os.Stat(path); err == nil {
			modTime = info.ModTime()
			in.SavedAt = &modTime
		} else {
			path = ""
		}
	}
	count, counted := heartbeat.ChangeCount()
	in.UnsavedChanges = h.observeUnsaved(path, modTime, count, counted)
	in.Transport, in.HasTransport = heartbeat.Transport()
	return dawport.NewProjectState(in)
}

// observeUnsaved feeds one look to the host's UnsavedTracker under h.mu.
func (h *Host) observeUnsaved(path string, savedAt time.Time, count int, counted bool) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.dawUnsavedTracker.Observe(path, savedAt, count, counted)
}

// dawProjectStateChanged computes the payload and reports whether it differs from the last one it saw (a marshalled
// JSON comparison, as dawTransportChanged does), recording it as the new last one.
func (h *Host) dawProjectStateChanged() (dawport.ProjectState, bool) {
	payload := h.dawProjectState()
	encodedBytes, err := json.Marshal(payload)
	if err != nil {
		return payload, false
	}
	encoded := string(encodedBytes)
	h.mu.Lock()
	defer h.mu.Unlock()
	changed := encoded != h.dawProjectStateSnapshot
	h.dawProjectStateSnapshot = encoded
	return payload, changed
}

// pollDawProjectState is one tick of transcriptLoop (app.go), next to pollDawTransport: it emits
// daw_project_state_changed on the first tick after launch and then only when the payload changed.
func (h *Host) pollDawProjectState() {
	payload, changed := h.dawProjectStateChanged()
	h.mu.RLock()
	ctx := h.ctx
	h.mu.RUnlock()
	if changed && ctx != nil {
		emitEvent("daw_project_state_changed", payload)
	}
}
