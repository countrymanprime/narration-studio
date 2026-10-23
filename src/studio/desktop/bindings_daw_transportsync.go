package main

import (
	"context"

	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
	"github.com/countrymanprime/narration-utils/shell/internal/transportsync"
)

// DawTransportSync and its live event daw_position_changed are the host's side of the Editing page's transport sync
// (docs/design/editing-daw-transport-sync.md). What each action does is internal/transportsync's; this file only gives it the launch's
// transport_sync support and role, and the project REAPER should have open. The wire schema, golden payloads, wireContracts rows and mock live in
// apps/ui/src/api (docs/architecture/wire-contracts.md).

// DawTransportSync runs one action on the DAW's transport: "cursor" puts the edit cursor at seconds, "play" starts the transport at seconds, "stop"
// stops it, and "watch" takes or renews the lease on the daw_position_changed stream (seconds is ignored by the last two). The answer is a DawResult:
// the capability's own sentence when the resolver refuses it, a DAW that has another project open, a recording in progress, or a time that is not
// usable, each with nothing changed. It adds no undo step.
func (h *Host) DawTransportSync(action string, seconds float64) (string, error) {
	svc := h.services()
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), transportsync.Timeout)
	defer cancel()
	same := func() bool {
		path := h.rememberSyncProject(svc)
		return path != "" && svc.reachability != nil && svc.reachability.Matches(path)
	}
	result := transportsync.Do(ctx, readAloudAdapterName(svc), resolver.Support(dawport.CapTransportSync), svc.transportSyncer, same, action, seconds)
	return encodeBinding(result, nil)
}

// rememberSyncProject resolves the .rpp that is this book's project and keeps it for emitDawPosition; "" when the folder has none or several unchosen.
func (h *Host) rememberSyncProject(svc hostServices) string {
	path := ""
	if folder := svc.config.projectFolder; folder != "" {
		if selected, err := selectedProjectFile(folder, svc.settings); err == nil {
			path = selected
		}
	}
	h.dawSyncProject.mu.Lock()
	h.dawSyncProject.path = path
	h.dawSyncProject.mu.Unlock()
	return path
}

// emitDawPosition relays one streamed position as daw_position_changed. It runs on the bridge loop, so it only reads what is already in memory.
func (h *Host) emitDawPosition(position dawport.TransportPosition) {
	h.dawSyncProject.mu.Lock()
	path := h.dawSyncProject.path
	h.dawSyncProject.mu.Unlock()
	svc := h.services()
	same := path != "" && svc.reachability != nil && svc.reachability.Matches(path)
	emitEvent("daw_position_changed", transportsync.Payload(position, same))
}
