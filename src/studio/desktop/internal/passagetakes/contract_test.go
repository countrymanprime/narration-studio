package passagetakes

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	"desktop/internal/contractfile"
	"desktop/internal/coverage"
	"desktop/internal/passagemap"
)

// pin writes (UPDATE_CONTRACTS=1) or checks the payload the host really sends for a binding, as
// bindings_findings_contract_test.go's checkBindingContract does: the host encodes exactly these types.
func pin(t *testing.T, name string, value any) {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var decoded any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	stable, err := contractfile.Stabilize(decoded)
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, name, stable)
}

// What WorkspaceTakes sends: a passage with a take from each source (the item itself and fixed-lane retakes), then a
// passage nothing was heard on.
func TestContractWorkspaceTakes(t *testing.T) {
	// The passage was heard on item B, a retake on a fixed lane with a second take of its own: a candidate from each of
	// EP6's sources.
	mixed := resolve(t, func(in *Input) {
		in.View.Items[0] = coverage.AlignmentItem{Index: 0, ItemGUID: guidB, Live: true, TakeGUID: take3}
		second := take("lane-b-second.wav", "lane-b-second.wav", 1, false)
		second.GUID = "{66666666-0000-0000-0000-000000000006}"
		in.Project.Tracks[1].Items[0].Takes = append(in.Project.Tracks[1].Items[0].Takes, second)
	})
	pin(t, "workspace-takes", mixed.View)

	nothing := resolve(t, func(in *Input) { in.FirstToken, in.LastToken = 5, 5 })
	pin(t, "workspace-takes-none", nothing.View)
}

// What WorkspaceUseTake sends: each outcome the schema and the mock promise.
func TestContractWorkspaceUseTake(t *testing.T) {
	fake := &fakeActors{setChanged: true}
	pin(t, "workspace-use-take-done", Use(context.Background(), fake.actors(), choiceFor(t, SourceItemTake, nil)))
	pin(t, "workspace-use-take-started", Use(context.Background(), fake.actors(), choiceFor(t, SourceLaneRetake, nil)))
	stale := &fakeActors{setErr: errStale()}
	pin(t, "workspace-use-take-refused", Use(context.Background(), stale.actors(), choiceFor(t, SourceItemTake, nil)))
}

// What WorkspaceTakeEvidence sends (SNE-5a): every figure measured on two readable takes, some figures as reasons (a
// take never aligned, a lane retake whose file is gone, a take whose file was never written), and a passage
// nothing was heard on.
func TestContractWorkspaceTakeEvidence(t *testing.T) {
	dir := t.TempDir()
	cache := NewMeasureCache(MeasureRange)
	full := evidenceOf(t, cache, fourWords, recorded(t, dir), func(in *Input) {
		in.View.Items = append(in.View.Items, coverage.AlignmentItem{Index: 1, ItemGUID: guidA, Live: true, TakeGUID: take2})
		in.View.Tokens[3].Item = intptr(1)
		in.View.Tokens[0].Item = intptr(1)
	})
	pin(t, "workspace-take-evidence-full", full)

	partial := evidenceOf(t, cache, fourWords, recorded(t, dir), func(in *Input) {
		in.Project.Tracks[0].Items[0].Takes[1].SourceFile = filepath.Join(dir, "never.wav")
	})
	pin(t, "workspace-take-evidence-partial", partial)

	none := evidenceOf(t, cache, func(in *Input) { in.FirstToken, in.LastToken = 5, 5 })
	pin(t, "workspace-take-evidence-none", none)

	// A passage the Booth recorded with a roll back (TK-1 part 2): both of item A's takes read it, so both are placed from
	// the map.
	mapped := evidenceOf(t, cache, fourWords, recorded(t, dir), func(in *Input) {
		in.Marks = []passagemap.Resolved{
			mark("ch-1.1", passagemap.KindStart, "p-1", 0, 0, nil, guidA, take1),
			mark("ch-1.1", passagemap.KindRoll, "p-1", 2, 4, place("p-1", 3), guidA, take2),
			mark("ch-1.1", passagemap.KindStop, "p-1", 4, 6, place("p-1", 4), guidA, take2),
		}
	})
	pin(t, "workspace-take-evidence-map", mapped)
}
