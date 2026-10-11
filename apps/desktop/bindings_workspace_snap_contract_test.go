package main

import "testing"

// What WorkspaceSnap sends (ADR 0855): a cut moved to the nearest crossing of workspacePeaksProject's real sine, and
// a refusal (an item the project no longer has). UPDATE_CONTRACTS=1 rewrites tests/fixtures/contracts/workspace-snap-*.json.
func TestContractWorkspaceSnapBinding(t *testing.T) {
	host, _ := workspaceSnapHost(t)

	payload, err := host.WorkspaceSnap("c-0001", "{ITEM-1}", 1.0013)
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "workspace-snap-moved", payload)

	payload, err = host.WorkspaceSnap("c-0001", "{ITEM-GONE}", 1.0013)
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "workspace-snap-refused", payload)
}
