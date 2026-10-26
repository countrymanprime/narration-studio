package main

import (
	"context"

	"desktop/internal/bridge"
	"desktop/internal/dawport"
)

// The FX in the linked DAW now, for the Editing page's Effects tab (#2251 item 36): the narrator sees many plug-ins on their
// REAPER tracks, so the tab lists them beside the chains the narrator can add. It reads the same command the mastering
// preview reads (master_chain_read, dawport.CapMasterChainRead) and changes nothing.

// masterChainReaderFrom is svc's master chain role, or nil exactly as fxManagerFrom is nil (bindings_workspace.go): no DAW
// port resolver, no adapter, a DAW that does not declare the capability, or the DAW unreachable right now.
func masterChainReaderFrom(svc hostServices) dawport.MasterChainReader {
	if svc.dawPortResolver == nil {
		return nil
	}
	role, err := dawport.Role[dawport.MasterChainReader](svc.dawPortResolver, dawport.CapMasterChainRead)
	if err != nil {
		return nil
	}
	return role
}

// projectFxSlot is one plug-in as the UI receives it.
type projectFxSlot struct {
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

// projectFxTrack is one track's chain, in the DAW's own track order.
type projectFxTrack struct {
	TrackGuid string          `json:"trackGuid"`
	Name      string          `json:"name"`
	Fx        []projectFxSlot `json:"fx"`
}

// workspaceProjectFxAnswer is WorkspaceProjectFx's payload: every track's FX, then the master track's, and how many slots in all.
type workspaceProjectFxAnswer struct {
	Tracks []projectFxTrack `json:"tracks"`
	Master []projectFxSlot  `json:"master"`
	Total  int              `json:"total"`
}

func slotsOf(in []dawport.FXSlot) []projectFxSlot {
	out := make([]projectFxSlot, 0, len(in))
	for _, slot := range in {
		out = append(out, projectFxSlot{Name: slot.Name, Enabled: slot.Enabled})
	}
	return out
}

// projectFxOf is the chain the role read in the UI's shape, with no nil list and every slot counted.
func projectFxOf(chain dawport.MasterChain) workspaceProjectFxAnswer {
	answer := workspaceProjectFxAnswer{Tracks: make([]projectFxTrack, 0, len(chain.Tracks)), Master: slotsOf(chain.Master)}
	for _, track := range chain.Tracks {
		fx := slotsOf(track.FX)
		answer.Tracks = append(answer.Tracks, projectFxTrack{TrackGuid: track.TrackGUID, Name: track.Name, Fx: fx})
		answer.Total += len(fx)
	}
	answer.Total += len(answer.Master)
	return answer
}

func workspaceProjectFxIn(ctx context.Context, svc hostServices) (workspaceProjectFxAnswer, error) {
	role := masterChainReaderFrom(svc)
	if role == nil {
		return workspaceProjectFxAnswer{}, bridge.ErrUnavailable
	}
	chain, err := role.ReadMasterChain(ctx)
	if err != nil {
		return workspaceProjectFxAnswer{}, err
	}
	return projectFxOf(chain), nil
}

// WorkspaceProjectFx lists the FX on the linked DAW's tracks and its master track, in the DAW's own order, each with whether it
// is switched on (master_chain_read). It changes nothing and is refused (bridge.ErrUnavailable) offline or before the DAW port's
// master chain capability is on, exactly as master_chain_read itself already is.
func (h *Host) WorkspaceProjectFx() (string, error) {
	return encodeBinding(workspaceProjectFxIn(context.Background(), h.services()))
}
