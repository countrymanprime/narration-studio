package main

import (
	"context"
	"testing"

	"desktop/internal/contractfile"
	"desktop/internal/measure"
)

// The Replace audio payloads as the host sends them (tests/fixtures/contracts/replace-*.json), for the UI's schemas
// (src/studio/ui/src/api/schemas/replace.ts) and wireContracts.test.ts.
func TestReplaceContractPayloads(t *testing.T) {
	stable := func(name string, value any) {
		t.Helper()
		got, err := contractfile.Stabilize(value)
		if err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, name, got)
	}
	f := newReplaceFixture(t)

	list, err := f.deps.log.NarratorsList()
	if err != nil {
		t.Fatal(err)
	}
	stable("replace-narrators", list)
	added, err := f.deps.log.NarratorAdd("إريك 🎙")
	if err != nil {
		t.Fatal(err)
	}
	stable("replace-narrators-change", added)

	refusedFile, err := replaceAddFileIn(t.Context(), f.deps, "n-9", f.file.Path)
	if err != nil {
		t.Fatal(err)
	}
	stable("replace-file-refused", refusedFile)

	plan, err := replacePlanIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53)
	if err != nil {
		t.Fatal(err)
	}
	stable("replace-plan-ok", plan)
	f.deps.measure = func(_ context.Context, _ string, _ measure.Range) (measure.Report, error) {
		return measure.Report{}, measure.ErrDecoderNotAvailable
	}
	unmeasured, _ := replacePlanIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53)
	stable("replace-plan-unmeasured", unmeasured)
	refusedPlan, _ := replacePlanIn(t.Context(), f.deps, replaceChapter, 6, 7, f.fileID(), 50, 53)
	stable("replace-plan-refused", refusedPlan)

	f.deps.measure = newReplaceFixture(t).deps.measure
	replaced, err := dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53, 10, 6)
	if err != nil || !replaced.Result.OK {
		t.Fatalf("replace = %+v, %v", replaced, err)
	}
	stable("replace-range-ok", replaced)
	again, _ := dawReplaceRangeIn(t.Context(), f.deps, replaceChapter, 4, 6, f.fileID(), 50, 53, 10, 6)
	stable("replace-range-refused", again)
	restored, err := dawRestoreReplacementIn(t.Context(), f.deps, replaceChapter, replaced.ReplacementID)
	if err != nil || !restored.Result.OK {
		t.Fatalf("restore = %+v, %v", restored, err)
	}
	stable("replace-restored", restored)
	replacements, err := f.deps.log.ReplacementsList(replaceChapter)
	if err != nil {
		t.Fatal(err)
	}
	stable("replacements-list", replacements)
	removed, err := f.deps.log.ReplacementRemove(replaceChapter, replaced.ReplacementID)
	if err != nil {
		t.Fatal(err)
	}
	stable("replacements-change", removed)

	stable("replace-file-peaks-none", ReplaceFilePeaksView{FileID: "f-1", Length: 796.5, Reason: "no waveform"})
	peaks := measure.Peaks{StartSeconds: 0, BucketsPerSecond: 50, Buckets: 2, MinMax: []byte{0x81, 0x7f, 0xf0, 0x10}, SampleRate: 22050, Channels: 1}
	stable("replace-file-peaks", ReplaceFilePeaksView{FileID: "f-1", Length: 0.04, Peaks: &peaks})
}
