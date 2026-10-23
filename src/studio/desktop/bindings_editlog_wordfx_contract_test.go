package main

import (
	"path/filepath"
	"strings"
	"testing"
)

// The three word-effects bindings' payloads, the goldens the UI's schemas are checked against: a record of a chain on top of
// a chain (after one already stored later in the recording, so the list is in time order and over names the one underneath),
// the list after a re-import changed the later effect's words (stale, not moved), an effect bypassed, and what a remove leaves.
func TestEditWordFxContractGoldens(t *testing.T) {
	host, project := editLogHost(t)
	decodeWordFxChange(t)(host.EditingWordFxRecord("c-0001", silentFxRequest()))
	decodeWordFxChange(t)(host.EditingWordFxRecord("c-0001", polishFxRequest()))
	payload, err := host.EditingWordFxRecord("c-0001", shoutedFxRequest())
	checkBindingContract(t, "edit-wordfx-record", payload)
	if change := decodeWordFxChange(t)(payload, err); strings.Join(change.Changed, ",") != "fx3" || strings.Join(change.Over, ",") != "fx2" || wordFxIDsOf(change.Effects) != "fx2,fx3,fx1" {
		t.Fatalf("record = %s", payload)
	}

	// The narrator re-imports without a reset and "silent." became "still.": that effect is stale, never moved.
	edited := strings.Replace(bookmarksManuscript, "The soldiers were silent.", "The soldiers were still.", 1)
	writeNested(t, filepath.Join(project, "narration-utils", "manuscript", "manuscript.json"), edited)
	payload, err = host.EditingWordFxList("c-0001")
	checkBindingContract(t, "edit-wordfx-list", payload)
	if list := decodeWordFx(t)(payload, err); list.Effects[0].Stale || !list.Effects[2].Stale || list.Effects[2].StaleReason != "text_changed" || list.Effects[2].A != 20 {
		t.Fatalf("list = %s", payload)
	}

	// The narrator bypassed the effect in the DAW: the flag is kept, and the list says so.
	payload, err = host.EditingWordFxBypass("c-0001", "fx2", true)
	checkBindingContract(t, "edit-wordfx-bypass", payload)
	if change := decodeWordFxChange(t)(payload, err); strings.Join(change.Changed, ",") != "fx2" || !change.Effects[0].Bypassed || change.Effects[1].Bypassed {
		t.Fatalf("bypass = %s", payload)
	}

	payload, err = host.EditingWordFxRemove("c-0001", "fx3")
	checkBindingContract(t, "edit-wordfx-remove", payload)
	if change := decodeWordFxChange(t)(payload, err); wordFxIDsOf(change.Effects) != "fx2,fx1" {
		t.Fatalf("remove = %s", payload)
	}
}
