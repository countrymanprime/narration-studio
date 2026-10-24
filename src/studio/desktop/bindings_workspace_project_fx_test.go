package main

import (
	"context"
	"errors"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/dawport"
)

// WorkspaceProjectFx: what the Effects tab lists as the FX in the linked DAW now (#2251 item 36), over the DAW port's
// MasterChainReader role (master_chain_read), as WorkspaceListFXChains is over FXManager.

func TestMasterChainReaderFromComesFromTheResolver(t *testing.T) {
	resolver, fake := fakeResolver(dawport.Supported)
	role := masterChainReaderFrom(hostServices{dawPortResolver: resolver})
	if role == nil {
		t.Fatal("no role from a resolver with a live adapter")
	}
	if _, err := role.ReadMasterChain(context.Background()); err != nil {
		t.Fatalf("ReadMasterChain: %v", err)
	}
	if calls := fake.Calls(); len(calls) != 1 || calls[0] != "master_chain_read.ReadMasterChain" {
		t.Fatalf("the role did not come from the resolver: calls = %v", calls)
	}
}

func TestWorkspaceProjectFxErrorsUnavailableWithNoResolver(t *testing.T) {
	if _, err := workspaceProjectFxIn(context.Background(), hostServices{}); !errors.Is(err, bridge.ErrUnavailable) {
		t.Fatalf("error = %v, want bridge.ErrUnavailable", err)
	}
}

func TestWorkspaceProjectFxNeverReturnsNilLists(t *testing.T) {
	resolver, fake := fakeResolver(dawport.Supported)

	answer, err := workspaceProjectFxIn(context.Background(), hostServices{dawPortResolver: resolver})
	if err != nil {
		t.Fatal(err)
	}
	if answer.Tracks == nil || len(answer.Tracks) != 0 || answer.Master == nil || len(answer.Master) != 0 {
		t.Fatalf("answer = %+v, want empty (never nil) lists from the fake's zero-value chain", answer)
	}
	if calls := fake.Calls(); len(calls) != 1 || calls[0] != "master_chain_read.ReadMasterChain" {
		t.Fatalf("calls = %v, want ReadMasterChain through the resolved role", calls)
	}
}

func TestWorkspaceProjectFxKeepsTheChainsOrderAndEachSlotsState(t *testing.T) {
	chain := dawport.MasterChain{
		Tracks: []dawport.TrackFX{
			{TrackGUID: "{T1}", Name: "Chapter One", FX: []dawport.FXSlot{{Name: "ReaEQ", Enabled: true}, {Name: "ReaComp", Enabled: false}}},
			{TrackGUID: "{T2}", Name: "Chapter Two", FX: nil},
		},
		Master: []dawport.FXSlot{{Name: "ReaLimit", Enabled: true}},
	}
	answer := projectFxOf(chain)
	if len(answer.Tracks) != 2 || answer.Tracks[0].Name != "Chapter One" || answer.Tracks[1].Fx == nil || len(answer.Tracks[1].Fx) != 0 {
		t.Fatalf("tracks = %+v", answer.Tracks)
	}
	if second := answer.Tracks[0].Fx[1]; second.Name != "ReaComp" || second.Enabled {
		t.Fatalf("slot = %+v, want ReaComp switched off", second)
	}
	if len(answer.Master) != 1 || !answer.Master[0].Enabled || answer.Master[0].Name != "ReaLimit" {
		t.Fatalf("master = %+v", answer.Master)
	}
	if answer.Total != 3 {
		t.Fatalf("total = %d, want every slot counted", answer.Total)
	}
}

// The wire contract (`.claude/rules/wire-contracts.md`): the answer shape WorkspaceProjectFx sends, read by
// src/studio/ui/src/api/wireContracts.test.ts against its Zod schema.
func TestWorkspaceProjectFxContract(t *testing.T) {
	contractfile.Check(t, "workspace-project-fx", projectFxOf(dawport.MasterChain{
		Tracks: []dawport.TrackFX{{TrackGUID: "{T1}", Name: "Chapter One", FX: []dawport.FXSlot{{Name: "ReaEQ (Cockos)", Enabled: true}, {Name: "ReaComp (Cockos)", Enabled: false}}}},
		Master: []dawport.FXSlot{{Name: "ReaLimit (Cockos)", Enabled: true}},
	}))
}
