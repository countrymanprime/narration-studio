package bridge

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// The edit and proof workspace's REAPER actions (narration_workspace.lua): make a take active; list the narrator's FX
// chains and apply one to a track or the master track; list the installed plug-ins and add one to a passage of a take
// (ADR 0234). All are experimental (actions.go) until the verification pass has confirmed them in a real REAPER.

// ActiveTakeSet is the item and take REAPER now plays, and whether the request changed anything.
type ActiveTakeSet struct {
	ItemGUID, TakeGUID string
	Changed            bool
}

// FXChains are the chains under REAPER's FXChains folder, as paths relative to it with forward slashes, sorted.
// Truncated says the bridge's depth or count limit left some out.
type FXChains struct {
	Names     []string
	Truncated bool
}

// FXChainApplied is the chain REAPER added to a track and how many FX it added. Track is the track's GUID, or
// MasterTrack.
type FXChainApplied struct {
	Chain, Track string
	Added        int
}

// MasterTrack names the master track to ApplyFXChain.
const MasterTrack = "master"

var (
	// ErrBadChainName: the chain is not a plain .RfxChain name relative to FXChains, so nothing was sent.
	ErrBadChainName = errors.New("that is not the name of an FX chain in REAPER's FXChains folder")
	// ErrNoTrack: no track was named, so nothing was sent.
	ErrNoTrack = errors.New("no track was named")
)

// SetActiveTake makes takeGUID the active take of itemGUID in one undo step. An item or take that is gone is a
// *StaleError (reason "item" or "take"); nothing changes while REAPER records (ErrRecording).
func (a *Actions) SetActiveTake(ctx context.Context, itemGUID, takeGUID string) (ActiveTakeSet, error) {
	if itemGUID == "" || takeGUID == "" {
		return ActiveTakeSet{}, ErrNoItemIdentity
	}
	events, err := a.request(ctx, "set_active_take", []string{"ACTIVE_TAKE_SET", "ITEM_STALE"}, itemGUID, takeGUID)
	if err != nil {
		return ActiveTakeSet{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "ITEM_STALE" {
		return ActiveTakeSet{}, &StaleError{GUID: event.Fields[2], Reason: event.Fields[3]}
	}
	if event.Fields[2] != normalizeGUID(itemGUID) || event.Fields[3] != normalizeGUID(takeGUID) {
		return ActiveTakeSet{}, fmt.Errorf("REAPER answered for another item or take than the one this app asked about")
	}
	return ActiveTakeSet{ItemGUID: event.Fields[2], TakeGUID: event.Fields[3], Changed: event.Fields[4] == "1"}, nil
}

// ListFXChains lists the narrator's FX chains by name. It changes nothing.
func (a *Actions) ListFXChains(ctx context.Context) (FXChains, error) {
	events, err := a.request(ctx, "list_fx_chains", []string{"FX_CHAINS_LISTED"})
	if err != nil {
		return FXChains{}, err
	}
	chains := FXChains{Names: []string{}}
	for _, event := range events {
		switch event.Tag {
		case "FX_CHAIN":
			chains.Names = append(chains.Names, event.Fields[2])
		case "FX_CHAINS_LISTED":
			chains.Truncated = event.Fields[3] == "1"
		}
	}
	return chains, nil
}

// ApplyFXChain adds an FX chain, named as ListFXChains names it, to a whole track (its GUID) or the master track
// (MasterTrack), in one undo step. Chains go only on tracks (ADR 0234, the owner's decision of 2026-09-25): a passage of
// a take gets single plug-ins (add_take_fx, which the host no longer sends). The Lua resolves the name inside FXChains itself; this refuses a name
// that could not be one before anything is sent. A track that is gone is a *TrackStaleError.
func (a *Actions) ApplyFXChain(ctx context.Context, track, chain string) (FXChainApplied, error) {
	if track == "" {
		return FXChainApplied{}, ErrNoTrack
	}
	if !plainChainName(chain) {
		return FXChainApplied{}, ErrBadChainName
	}
	events, err := a.request(ctx, "apply_fx_chain", []string{"FX_CHAIN_APPLIED", "TRACK_STALE"}, track, chain)
	if err != nil {
		return FXChainApplied{}, err
	}
	event := events[len(events)-1]
	if event.Tag == "TRACK_STALE" {
		return FXChainApplied{}, &TrackStaleError{GUID: event.Fields[2]}
	}
	return FXChainApplied{Chain: event.Fields[2], Track: event.Fields[3], Added: int(numberAt(event.Fields, 4))}, nil
}

// plainChainName reports whether chain is a relative .RfxChain name with forward slashes and no empty, "." or ".."
// part: the shape list_fx_chains answers.
func plainChainName(chain string) bool {
	if !strings.HasSuffix(strings.ToLower(chain), ".rfxchain") || strings.ContainsAny(chain, `\:`) {
		return false
	}
	for _, part := range strings.Split(chain, "/") {
		if part == "" || part == "." || part == ".." {
			return false
		}
	}
	return true
}
