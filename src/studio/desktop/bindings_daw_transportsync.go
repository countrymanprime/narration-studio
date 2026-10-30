package main

import (
	"context"

	"desktop/internal/dawport"
	"desktop/internal/transportsync"
)

// DawTransportSync and its live event daw_position_changed are the host's side of the Editing page's transport sync
// (docs/design/editing-daw-transport-sync.md). What each action does is internal/transportsync's; this file only gives it the launch's
// transport_sync support and role, and the project REAPER should have open. The wire schema, golden payloads, wireContracts rows and mock live in
// src/studio/ui/src/api (docs/architecture/wire-contracts.md).

// DawTransportSync runs one action on the DAW's transport: "cursor" puts the edit cursor at seconds, "play" starts the transport at seconds, "stop"
// stops it, "playRange" plays from seconds to until and has the DAW stop itself at until, and "watch" takes or renews the lease on the
// daw_position_changed stream (seconds is ignored by "stop" and "watch", until by all but "playRange"). The answer is a DawResult:
// the capability's own sentence when the resolver refuses it, a DAW that has another project open, a recording in progress, or a time that is not
// usable, each with nothing changed. It adds no undo step. For "play" and "playRange", chapterID names the chapter whose linked track the DAW plays
// alone: the host resolves the track from the chapter's link, the DAW selects it and solos it in place, and puts the narrator's selection, solos
// and mute back when the play ends. A chapter with no (or several) linked tracks, or whose track has no audio at the start, is refused with
// nothing changed and nothing played. An empty chapterID plays the project as it is.
func (h *Host) DawTransportSync(action string, seconds, until float64, chapterID string) (string, error) {
	svc := h.services()
	trackGUID := ""
	if chapterID != "" && (action == transportsync.ActionPlay || action == transportsync.ActionPlayRange) {
		links, err := chapterTrackLinksIn(svc)
		if err != nil {
			return encodeBinding(dawport.Refused("The app could not read which track this chapter is linked to, so it did not ask the DAW to play: "+err.Error()), nil)
		}
		guid, refusal := linkedTrackGUID(links, chapterID)
		if refusal != "" {
			return encodeBinding(dawport.Refused(refusal+" Nothing was played in the DAW."), nil)
		}
		trackGUID = guid
	}
	resolver, _ := h.dawResolverFor(svc)
	ctx, cancel := context.WithTimeout(context.Background(), transportsync.Timeout)
	defer cancel()
	same := func() bool {
		path := h.rememberSyncProject(svc)
		return path != "" && svc.reachability != nil && svc.reachability.Matches(path)
	}
	result := transportsync.Do(ctx, readAloudAdapterName(svc), resolver.Support(dawport.CapTransportSync), svc.transportSyncer, same, action, seconds, until, trackGUID)
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
