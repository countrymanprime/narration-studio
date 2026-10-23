package main

import (
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/editlog"
)

// The stack and retry-mode bindings' payloads, the goldens the UI's schemas are checked against: a record that adds a take
// made in steps (Audacity, after a backup) to a passage with a stack of its own, the chapter's list, a partial un-stack, and a
// passage's retry mode set over its chapter's.
func TestEditStacksContractGoldens(t *testing.T) {
	host, _ := editLogHost(t)
	decodeStackChange(t)(host.EditingStackRecord("c-0001", stackRequest("passage-2")))
	three := 3
	first := stackRequest("passage-1")
	first.Moves = first.Moves[:1]
	decodeStackChange(t)(host.EditingStackRecord("c-0001", first))
	steps := stackRequest("passage-1")
	steps.Moves = steps.Moves[1:]
	steps.Mode, steps.UndoSteps, steps.BackupID = editlog.StackModeSteps, &three, "bk1"
	steps.Steps = []string{"Moved the read at 41.2 s onto the first read", "Closed the gap it left", "Muted the read's old place"}
	payload, err := host.EditingStackRecord("c-0001", steps)
	checkBindingContract(t, "edit-stacks-record", payload)
	if change := decodeStackChange(t)(payload, err); strings.Join(change.Changed, ",") != "take:{ITEM-1}:{TAKE-3}" || len(change.Stacks) != 2 || len(change.Stacks[0].Offsets) != 2 {
		t.Fatalf("record = %s", payload)
	}

	payload, err = host.EditingStacksList("c-0001")
	checkBindingContract(t, "edit-stacks-list", payload)
	if list := decodeStackList(t)(payload, err); len(list.Stacks) != 2 || list.Stacks[0].PassageID != "passage-1" {
		t.Fatalf("list = %s", payload)
	}

	payload, err = host.EditingStackRemove("c-0001", "passage-1", []string{"take:{ITEM-1}:{TAKE-2}"})
	checkBindingContract(t, "edit-stacks-remove", payload)
	if change := decodeStackChange(t)(payload, err); strings.Join(change.Changed, ",") != "take:{ITEM-1}:{TAKE-2}" || len(change.Stacks[0].Offsets) != 1 {
		t.Fatalf("remove = %s", payload)
	}

	decodeRetryMode(t)(host.EditingRetryModeSet("chapter", "c-0001", "", "leave"))
	payload, err = host.EditingRetryModeSet("passage", "c-0001", "passage-1", "stack")
	checkBindingContract(t, "edit-stacks-retry-mode", payload)
	if answer := decodeRetryMode(t)(payload, err); answer.Mode != editlog.RetryStack || answer.From != "passage" {
		t.Fatalf("retry mode = %s", payload)
	}
}
