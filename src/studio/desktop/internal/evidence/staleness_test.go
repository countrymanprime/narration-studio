package evidence

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"desktop/internal/tracks"
)

// --- fixtures ---

// staleItem returns a minimal, single-take, single-GUID item over sourcePath
// at the given position/length/mute/soffs/playrate, for building "before"
// and "after" item sets by hand in the edit-type table tests below.
func staleItem(guid, sourcePath string, position, length float64, muted bool, soffs, playRate float64) tracks.Item {
	return tracks.Item{
		GUID:       guid,
		Position:   position,
		Length:     length,
		Muted:      muted,
		Supported:  true,
		ActiveTake: 0,
		Takes: []tracks.Take{
			{GUID: guid + "-take", SourceFile: sourcePath, SOFFS: soffs, PlayRate: playRate, Supported: true},
		},
	}
}

// staleIdentity is a source identity for sourcePath: partialHash stands in
// for content, modTime for the file's own modified time (never part of any
// fingerprint - see AnalysisKey's and LedgerItemFact.SourceIdentity's own
// doc comments).
func staleIdentity(sourcePath, partialHash string, size int64, modTime time.Time) SourceIdentity {
	return SourceIdentity{Path: sourcePath, Size: size, PartialHash: partialHash, ModTime: modTime}
}

func fakeIdentify(sources map[string]SourceIdentity) SourceIdentifier {
	return func(path string) (SourceIdentity, error) {
		if identity, ok := sources[path]; ok {
			return identity, nil
		}
		return SourceIdentity{}, fmt.Errorf("no fixture identity for %q", path)
	}
}

// completeRecordFor wraps fingerprint into a complete ledger record with a
// fixed analyzer identity and scope, the shape TestEvaluateFingerprints*
// tests compare current fingerprints against.
func completeRecordFor(fingerprint LedgerFingerprint) LedgerRecord {
	return LedgerRecord{
		AnalyzerID:      "rc",
		AnalyzerVersion: "v1",
		ParamHash:       "params-1",
		Scope:           LedgerScope{DocumentID: "doc-1", ChapterID: "c-0001", TrackGUID: "track-1"},
		Fingerprint:     fingerprint,
		Outcome:         LedgerComplete,
	}
}

func fingerprintOfItems(t *testing.T, items []tracks.Item, sources map[string]SourceIdentity) LedgerFingerprint {
	t.Helper()
	fingerprint, _ := ComputeChapterFingerprint(items, fakeIdentify(sources))
	return fingerprint
}

func reasonSet(reasons []EvaluatorReason) map[EvaluatorReason]bool {
	set := make(map[EvaluatorReason]bool, len(reasons))
	for _, reason := range reasons {
		set[reason] = true
	}
	return set
}

// --- Edit-type table (every edit type and the Evaluator outcome it must give) ---

func TestEvaluateFingerprintsMoveItemInTime(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	before := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)}, sources)
	after := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 10, 2, false, 0.5, 1)}, sources)

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	if result.State != StateStale {
		t.Fatalf("State = %q, want stale", result.State)
	}
	if !reasonSet(result.Reasons)[ReasonItemMoved] {
		t.Fatalf("Reasons = %v, want item_moved", result.Reasons)
	}
	if !result.Recomposable {
		t.Fatal("a position-only move should be recomposable")
	}
	if len(result.ChangedItemGUIDs) != 1 || result.ChangedItemGUIDs[0] != "item-1" {
		t.Fatalf("ChangedItemGUIDs = %v", result.ChangedItemGUIDs)
	}
}

func TestEvaluateFingerprintsTrimStartOrEnd(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	before := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)}, sources)
	after := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 1.5, false, 0.7, 1)}, sources)

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonItemTrimmed] {
		t.Fatalf("State/Reasons = %q/%v, want stale/item_trimmed", result.State, result.Reasons)
	}
	if result.Recomposable {
		t.Fatal("a trim changes the analysis key and must not be recomposable")
	}
}

func TestEvaluateFingerprintsSplitItem(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	before := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 4, false, 0.5, 1)}, sources)
	// Split at the midpoint: item-1 keeps its GUID but shrinks (a trim), and
	// a new item-2 covers the second half (an add), per the edit-type table.
	after := fingerprintOfItems(t, []tracks.Item{
		staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1),
		staleItem("item-2", "a.wav", 6, 2, false, 2.5, 1),
	}, sources)

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	reasons := reasonSet(result.Reasons)
	if result.State != StateStale || !reasons[ReasonItemAdded] || !reasons[ReasonItemTrimmed] {
		t.Fatalf("State/Reasons = %q/%v, want stale/{item_added,item_trimmed}", result.State, result.Reasons)
	}
}

func TestEvaluateFingerprintsDeleteItem(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	before := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)}, sources)
	after := fingerprintOfItems(t, nil, sources)

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonItemRemoved] {
		t.Fatalf("State/Reasons = %q/%v, want stale/item_removed", result.State, result.Reasons)
	}
}

func TestEvaluateFingerprintsAddItem(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	before := fingerprintOfItems(t, nil, sources)
	after := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)}, sources)

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonItemAdded] {
		t.Fatalf("State/Reasons = %q/%v, want stale/item_added", result.State, result.Reasons)
	}
}

func TestEvaluateFingerprintsMuteUnmute(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	before := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)}, sources)
	after := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, true, 0.5, 1)}, sources)

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonItemMuted] {
		t.Fatalf("State/Reasons = %q/%v, want stale/item_muted", result.State, result.Reasons)
	}
	if !result.Recomposable {
		t.Fatal("a mute toggle should be recomposable")
	}
}

func TestEvaluateFingerprintsSwitchActiveTake(t *testing.T) {
	sources := map[string]SourceIdentity{
		"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{}),
		"b.wav": staleIdentity("b.wav", "hash-b", 2000, time.Time{}),
	}
	item := tracks.Item{
		GUID: "item-1", Position: 4, Length: 2, Supported: true, ActiveTake: 0,
		Takes: []tracks.Take{
			{GUID: "take-a", SourceFile: "a.wav", SOFFS: 0.5, PlayRate: 1, Supported: true},
			{GUID: "take-b", SourceFile: "b.wav", SOFFS: 0.25, PlayRate: 1, Supported: true},
		},
	}
	switched := item
	switched.ActiveTake = 1

	before := fingerprintOfItems(t, []tracks.Item{item}, sources)
	after := fingerprintOfItems(t, []tracks.Item{switched}, sources)

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonTakeSwitched] {
		t.Fatalf("State/Reasons = %q/%v, want stale/take_switched", result.State, result.Reasons)
	}
	if result.Recomposable {
		t.Fatal("a take switch changes the analysis key and must not be recomposable")
	}
}

func TestEvaluateFingerprintsChangePlayrate(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	before := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)}, sources)
	after := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1.5)}, sources)

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonItemTrimmed] {
		t.Fatalf("State/Reasons = %q/%v, want stale/item_trimmed (playrate row)", result.State, result.Reasons)
	}
}

func TestEvaluateFingerprintsSourceReplacedOnDisk(t *testing.T) {
	before := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)},
		map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})})
	after := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)},
		map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a-REPLACED", 1000, time.Time{})})

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonSourceChanged] {
		t.Fatalf("State/Reasons = %q/%v, want stale/source_changed", result.State, result.Reasons)
	}
}

func TestEvaluateFingerprintsSourceTouchedIdenticalContentReadsCurrent(t *testing.T) {
	before := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)},
		map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))})
	// Same size and content hash, a later ModTime only (ModTime is
	// deliberately never part of any fingerprint).
	after := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)},
		map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC))})

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	if result.State != StateCurrent {
		t.Fatalf("State = %q, want current (touched but identical content)", result.State)
	}
}

func TestEvaluateFingerprintsCosmeticChangeReadsCurrent(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	item := staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)
	before := fingerprintOfItems(t, []tracks.Item{item}, sources)
	item.Name = "a new cosmetic name" // not part of any fingerprint
	after := fingerprintOfItems(t, []tracks.Item{item}, sources)

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	if result.State != StateCurrent {
		t.Fatalf("State = %q, want current (cosmetic change)", result.State)
	}
}

func TestEvaluateFingerprintsResaveWithNoEditsReadsCurrent(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	items := []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)}
	before := fingerprintOfItems(t, items, sources)
	after := fingerprintOfItems(t, items, sources)

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	if result.State != StateCurrent {
		t.Fatalf("State = %q, want current (re-save, no edits)", result.State)
	}
	if result.Record == nil || result.Record.AnalyzerID != "rc" {
		t.Fatalf("Record = %#v, want the compared-against record", result.Record)
	}
}

// --- Scope-level staleness: analyzer, params, mapping ---

func TestEvaluateFingerprintsAnalyzerVersionChanged(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	fingerprint := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)}, sources)

	result := EvaluateFingerprints(completeRecordFor(fingerprint), fingerprint, "track-1", "v2", "params-1")

	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonAnalyzerChanged] {
		t.Fatalf("State/Reasons = %q/%v, want stale/analyzer_changed", result.State, result.Reasons)
	}
	if result.Recomposable {
		t.Fatal("an analyzer version change must not be recomposable")
	}
}

func TestEvaluateFingerprintsParamsChanged(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	fingerprint := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)}, sources)

	result := EvaluateFingerprints(completeRecordFor(fingerprint), fingerprint, "track-1", "v1", "params-2")

	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonParamsChanged] {
		t.Fatalf("State/Reasons = %q/%v, want stale/params_changed", result.State, result.Reasons)
	}
}

func TestEvaluateFingerprintsMappingChanged(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	fingerprint := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)}, sources)

	result := EvaluateFingerprints(completeRecordFor(fingerprint), fingerprint, "track-2", "v1", "params-1")

	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonMappingChanged] {
		t.Fatalf("State/Reasons = %q/%v, want stale/mapping_changed", result.State, result.Reasons)
	}
}

func TestEvaluateFingerprintsPartialOrFailedRecordNeverReadsCurrent(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{})}
	fingerprint := fingerprintOfItems(t, []tracks.Item{staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1)}, sources)

	for _, outcome := range []LedgerOutcome{LedgerPartial, LedgerFailed} {
		record := completeRecordFor(fingerprint)
		record.Outcome = outcome
		result := EvaluateFingerprints(record, fingerprint, "track-1", "v1", "params-1")
		if result.State != StateNever {
			t.Fatalf("outcome %q: State = %q, want never", outcome, result.State)
		}
	}
}

func TestEvaluateFingerprintsPureReorderIsRecomposable(t *testing.T) {
	// Two items whose own ItemFingerprints are unchanged individually, but
	// whose TrackFingerprint differs because ComputeTrackFingerprint hashes
	// entries in order (Solution Detail: "order changed").
	record := LedgerFingerprint{
		TrackFingerprint: "order-a-then-b",
		ItemFingerprints: map[string]ItemFingerprint{"a": "fp-a", "b": "fp-b"},
		AnalysisKeys:     map[string]AnalysisKey{"a": "key-a", "b": "key-b"},
	}
	current := LedgerFingerprint{
		TrackFingerprint: "order-b-then-a",
		ItemFingerprints: map[string]ItemFingerprint{"a": "fp-a", "b": "fp-b"},
		AnalysisKeys:     map[string]AnalysisKey{"a": "key-a", "b": "key-b"},
	}

	result := EvaluateFingerprints(completeRecordFor(record), current, "track-1", "v1", "params-1")

	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonItemMoved] {
		t.Fatalf("State/Reasons = %q/%v, want stale/item_moved (pure reorder)", result.State, result.Reasons)
	}
	if !result.Recomposable {
		t.Fatal("a pure reorder should be recomposable")
	}
}

func TestEvaluateFingerprintsReasonsAreDeduplicatedAndOrdered(t *testing.T) {
	sources := map[string]SourceIdentity{
		"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{}),
		"b.wav": staleIdentity("b.wav", "hash-b", 1000, time.Time{}),
	}
	before := fingerprintOfItems(t, []tracks.Item{
		staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1),
		staleItem("item-2", "b.wav", 8, 2, false, 0.5, 1),
	}, sources)
	// Both items moved: two item_moved-producing changes should collapse to
	// one reason in the result.
	after := fingerprintOfItems(t, []tracks.Item{
		staleItem("item-1", "a.wav", 5, 2, false, 0.5, 1),
		staleItem("item-2", "b.wav", 9, 2, false, 0.5, 1),
	}, sources)

	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")

	if len(result.Reasons) != 1 || result.Reasons[0] != ReasonItemMoved {
		t.Fatalf("Reasons = %v, want exactly [item_moved]", result.Reasons)
	}
	if len(result.ChangedItemGUIDs) != 2 {
		t.Fatalf("ChangedItemGUIDs = %v, want both items", result.ChangedItemGUIDs)
	}
}

// --- ComputeChapterFingerprint: unsupported/unreadable items are skipped ---

func TestComputeChapterFingerprintSkipsAnUnsupportedItem(t *testing.T) {
	items := []tracks.Item{
		staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1),
		{GUID: "item-2", Position: 8, Length: 1, Supported: false},
	}
	fingerprint, _ := ComputeChapterFingerprint(items, fakeIdentify(map[string]SourceIdentity{
		"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{}),
	}))
	if _, ok := fingerprint.ItemFingerprints["item-2"]; ok {
		t.Fatal("an unsupported item must not be fingerprinted")
	}
	if _, ok := fingerprint.ItemFingerprints["item-1"]; !ok {
		t.Fatal("the supported item must still be fingerprinted")
	}
}

func TestComputeChapterFingerprintSkipsAnItemWhoseSourceCannotBeIdentified(t *testing.T) {
	items := []tracks.Item{staleItem("item-1", "missing.wav", 4, 2, false, 0.5, 1)}
	fingerprint, _ := ComputeChapterFingerprint(items, fakeIdentify(nil))
	if len(fingerprint.ItemFingerprints) != 0 {
		t.Fatalf("ItemFingerprints = %#v, want empty", fingerprint.ItemFingerprints)
	}
}

func TestComputeChapterFingerprintReturnsTheNewestSourceModTime(t *testing.T) {
	older := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	newer := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	items := []tracks.Item{
		staleItem("item-1", "a.wav", 4, 2, false, 0.5, 1),
		staleItem("item-2", "b.wav", 8, 2, false, 0.5, 1),
	}
	_, newest := ComputeChapterFingerprint(items, fakeIdentify(map[string]SourceIdentity{
		"a.wav": staleIdentity("a.wav", "hash-a", 1000, older),
		"b.wav": staleIdentity("b.wav", "hash-b", 1000, newer),
	}))
	if !newest.Equal(newer) {
		t.Fatalf("newest source mod time = %v, want %v", newest, newer)
	}
}

// --- BuildBasis ---

func TestBuildBasisLabelIsAlwaysTheSavedProjectSentence(t *testing.T) {
	modTime := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	basis := BuildBasis(LedgerProjectFile{Path: "p.rpp", ModTime: modTime}, time.Time{}, time.Time{})
	want := "saved project, file modified " + modTime.Format(time.RFC3339)
	if basis.Label != want {
		t.Fatalf("Label = %q, want %q", basis.Label, want)
	}
	if basis.Stale {
		t.Fatal("Stale should be false with no record or source to compare against")
	}
}

func TestBuildBasisWarnsWhenProjectFileIsOlderThanTheNewestLedgerRecord(t *testing.T) {
	projectModTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	recordTime := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	basis := BuildBasis(LedgerProjectFile{ModTime: projectModTime}, recordTime, time.Time{})
	if !basis.Stale {
		t.Fatal("Stale should warn: the saved project predates the newest ledger record")
	}
}

func TestBuildBasisWarnsWhenProjectFileIsOlderThanASourceFile(t *testing.T) {
	projectModTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	sourceModTime := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	basis := BuildBasis(LedgerProjectFile{ModTime: projectModTime}, time.Time{}, sourceModTime)
	if !basis.Stale {
		t.Fatal("Stale should warn: the saved project predates a source file's own modified time")
	}
}

func TestBuildBasisDoesNotWarnWhenProjectFileIsNewest(t *testing.T) {
	projectModTime := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	recordTime := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	sourceModTime := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	basis := BuildBasis(LedgerProjectFile{ModTime: projectModTime}, recordTime, sourceModTime)
	if basis.Stale {
		t.Fatal("Stale should not warn: the saved project is newer than both")
	}
}

// --- EvaluateChapter: end-to-end wiring over real stores and real files ---

// writeTimedSourceFile writes a small real file with an explicit modified
// time, so evidence.Identify (called directly by EvaluateChapter, unlike the
// fakeIdentify used above) has something real to stat and hash. It is
// distinct from identity_test.go's writeSourceFile, which does not control
// mtime.
func writeTimedSourceFile(t *testing.T, dir, name string, content []byte, modTime time.Time) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, modTime, modTime); err != nil {
		t.Fatal(err)
	}
	return path
}

func chapterEvaluationSetup(t *testing.T) (project string, ledger *LedgerStore, mapping *MappingStore) {
	t.Helper()
	project = t.TempDir()
	return project, NewLedgerStore(project), NewMappingStore(project)
}

func TestEvaluateChapterNeverWhenNoMappingExists(t *testing.T) {
	project, ledger, mapping := chapterEvaluationSetup(t)
	req := ChapterEvaluationRequest{
		Project:         tracks.Project{},
		ProjectFolder:   project,
		ProjectFile:     LedgerProjectFile{Path: "p.rpp", ModTime: time.Now()},
		DocumentID:      "doc-1",
		ChapterID:       "c-0001",
		AnalyzerID:      "rc",
		AnalyzerVersion: "v1",
	}
	result, basis, err := EvaluateChapter(ledger, mapping, req)
	if err != nil {
		t.Fatal(err)
	}
	if result.State != StateNever {
		t.Fatalf("State = %q, want never (no confirmed mapping)", result.State)
	}
	if basis.Label == "" {
		t.Fatal("basis label should always be present, even for never")
	}
}

func TestEvaluateChapterNeverWithMappedTrackMissing(t *testing.T) {
	project, ledger, mapping := chapterEvaluationSetup(t)
	if _, err := mapping.Confirm("doc-1", "track-missing", "c-0001", "Chapter One"); err != nil {
		t.Fatal(err)
	}
	req := ChapterEvaluationRequest{
		Project:         tracks.Project{Tracks: []tracks.Track{{GUID: "track-other"}}},
		ProjectFolder:   project,
		ProjectFile:     LedgerProjectFile{Path: "p.rpp", ModTime: time.Now()},
		DocumentID:      "doc-1",
		ChapterID:       "c-0001",
		AnalyzerID:      "rc",
		AnalyzerVersion: "v1",
	}
	result, _, err := EvaluateChapter(ledger, mapping, req)
	if err != nil {
		t.Fatal(err)
	}
	if result.State != StateNever || !reasonSet(result.Reasons)[ReasonMappedTrackMissing] {
		t.Fatalf("State/Reasons = %q/%v, want never/mapped_track_missing", result.State, result.Reasons)
	}
}

func TestEvaluateChapterNeverWhenAmbiguouslyMapped(t *testing.T) {
	project, ledger, mapping := chapterEvaluationSetup(t)
	if _, err := mapping.Confirm("doc-1", "track-a", "c-0001", "Chapter One"); err != nil {
		t.Fatal(err)
	}
	if _, err := mapping.Confirm("doc-1", "track-b", "c-0001", "Chapter One"); err != nil {
		t.Fatal(err)
	}
	req := ChapterEvaluationRequest{
		ProjectFolder: project,
		ProjectFile:   LedgerProjectFile{Path: "p.rpp", ModTime: time.Now()},
		DocumentID:    "doc-1",
		ChapterID:     "c-0001",
		AnalyzerID:    "rc",
	}
	result, _, err := EvaluateChapter(ledger, mapping, req)
	if err != nil {
		t.Fatal(err)
	}
	if result.State != StateNever {
		t.Fatalf("State = %q, want never (two tracks confirmed for one chapter, D5)", result.State)
	}
}

func TestEvaluateChapterNeverWhenNoLedgerRecordExists(t *testing.T) {
	project, ledger, mapping := chapterEvaluationSetup(t)
	writeTimedSourceFile(t, project, "a.wav", []byte("audio-a"), time.Now())
	if _, err := mapping.Confirm("doc-1", "track-1", "c-0001", "Chapter One"); err != nil {
		t.Fatal(err)
	}
	req := ChapterEvaluationRequest{
		Project: tracks.Project{Tracks: []tracks.Track{{
			GUID:  "track-1",
			Items: []tracks.Item{staleItem("item-1", filepath.Join(project, "a.wav"), 0, 1, false, 0, 1)},
		}}},
		ProjectFolder:   project,
		ProjectFile:     LedgerProjectFile{Path: "p.rpp", ModTime: time.Now()},
		DocumentID:      "doc-1",
		ChapterID:       "c-0001",
		AnalyzerID:      "rc",
		AnalyzerVersion: "v1",
	}
	result, _, err := EvaluateChapter(ledger, mapping, req)
	if err != nil {
		t.Fatal(err)
	}
	if result.State != StateNever {
		t.Fatalf("State = %q, want never (no ledger record yet)", result.State)
	}
}

func TestEvaluateChapterCurrentThenStaleAfterAnEdit(t *testing.T) {
	project, ledger, mapping := chapterEvaluationSetup(t)
	sourcePath := writeTimedSourceFile(t, project, "a.wav", []byte("audio-a"), time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	if _, err := mapping.Confirm("doc-1", "track-1", "c-0001", "Chapter One"); err != nil {
		t.Fatal(err)
	}

	item := staleItem("item-1", sourcePath, 0, 1, false, 0, 1)
	project0 := tracks.Project{Tracks: []tracks.Track{{GUID: "track-1", Items: []tracks.Item{item}}}}

	fingerprint, _ := ComputeChapterFingerprint(project0.Tracks[0].Items, func(path string) (SourceIdentity, error) {
		return Identify(path, project)
	})
	record := LedgerRecord{
		AnalyzerID:      "rc",
		AnalyzerVersion: "v1",
		ParamHash:       "params-1",
		Scope:           LedgerScope{DocumentID: "doc-1", ChapterID: "c-0001", TrackGUID: "track-1"},
		Fingerprint:     fingerprint,
		StartedAt:       time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC),
		CompletedAt:     time.Date(2026, 1, 2, 0, 0, 1, 0, time.UTC),
		Outcome:         LedgerComplete,
	}
	if _, err := ledger.Write(record); err != nil {
		t.Fatal(err)
	}

	req := ChapterEvaluationRequest{
		Project:         project0,
		ProjectFolder:   project,
		ProjectFile:     LedgerProjectFile{Path: "p.rpp", ModTime: time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC)},
		DocumentID:      "doc-1",
		ChapterID:       "c-0001",
		AnalyzerID:      "rc",
		AnalyzerVersion: "v1",
		ParamHash:       "params-1",
	}

	result, basis, err := EvaluateChapter(ledger, mapping, req)
	if err != nil {
		t.Fatal(err)
	}
	if result.State != StateCurrent {
		t.Fatalf("State = %q, want current (unedited since the run)", result.State)
	}
	if basis.Stale {
		t.Fatal("basis should not warn: the saved project is newer than the record and the source")
	}

	// Now edit the item (move it) and re-evaluate without re-running the
	// analyzer: the same request should read stale.
	moved := item
	moved.Position = 5
	req.Project = tracks.Project{Tracks: []tracks.Track{{GUID: "track-1", Items: []tracks.Item{moved}}}}

	result, _, err = EvaluateChapter(ledger, mapping, req)
	if err != nil {
		t.Fatal(err)
	}
	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonItemMoved] {
		t.Fatalf("State/Reasons = %q/%v, want stale/item_moved after the edit", result.State, result.Reasons)
	}
}

func TestEvaluateChapterBasisWarnsWhenProjectFilePredatesTheLedgerRecord(t *testing.T) {
	project, ledger, mapping := chapterEvaluationSetup(t)
	if _, err := mapping.Confirm("doc-1", "track-1", "c-0001", "Chapter One"); err != nil {
		t.Fatal(err)
	}
	if _, err := ledger.Write(LedgerRecord{
		AnalyzerID: "rc", AnalyzerVersion: "v1",
		Scope:       LedgerScope{DocumentID: "doc-1", ChapterID: "c-0001", TrackGUID: "track-1"},
		Fingerprint: LedgerFingerprint{TrackFingerprint: "tf-1"},
		StartedAt:   time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC),
		CompletedAt: time.Date(2026, 5, 1, 0, 0, 1, 0, time.UTC),
		Outcome:     LedgerComplete,
	}); err != nil {
		t.Fatal(err)
	}

	req := ChapterEvaluationRequest{
		Project:       tracks.Project{Tracks: []tracks.Track{{GUID: "track-1"}}},
		ProjectFolder: project,
		// Saved before the ledger record - the "record, edit, check without
		// saving" case.
		ProjectFile:     LedgerProjectFile{Path: "p.rpp", ModTime: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)},
		DocumentID:      "doc-1",
		ChapterID:       "c-0001",
		AnalyzerID:      "rc",
		AnalyzerVersion: "v1",
	}
	_, basis, err := EvaluateChapter(ledger, mapping, req)
	if err != nil {
		t.Fatal(err)
	}
	if !basis.Stale {
		t.Fatal("basis should warn: the saved project predates the newest ledger record")
	}
	if basis.Label == "" {
		t.Fatal("basis label should still be present")
	}
}

// #3593: a chapter linked to a folder of voices has its audio on the folder's children, and the plan fingerprints every member
// (tracks.Project.ChapterMembers), so the read must fingerprint the same set or it reads stale whatever happened after the run.
type folderChapter struct {
	project          string
	ledger           *LedgerStore
	mapping          *MappingStore
	narrator, bed    tracks.Item
	folderWithVoices func(narrator, bed tracks.Item) tracks.Project
}

func newFolderChapter(t *testing.T) folderChapter {
	t.Helper()
	project, ledger, mapping := chapterEvaluationSetup(t)
	when := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	voice := writeTimedSourceFile(t, project, "voice.wav", []byte("voice"), when)
	music := writeTimedSourceFile(t, project, "music.wav", []byte("music"), when)
	if _, err := mapping.Confirm("doc-1", "folder", "c-0001", "Chapter One"); err != nil {
		t.Fatal(err)
	}
	return folderChapter{
		project: project, ledger: ledger, mapping: mapping,
		narrator: staleItem("voice-item", voice, 0, 60, false, 0, 1),
		bed:      staleItem("bed-item", music, 0, 120, false, 0, 1),
		folderWithVoices: func(narrator, bed tracks.Item) tracks.Project {
			return tracks.Project{Tracks: []tracks.Track{
				{GUID: "folder", IsFolder: true, Depth: 0},
				{GUID: "narrator", Depth: 1, Items: []tracks.Item{narrator}},
				{GUID: "bed", Depth: 1, Items: []tracks.Item{bed}},
			}}
		},
	}
}

// record writes a complete run whose fingerprint is of what the plan would fingerprint for p: the audio tracks' items together.
func (f folderChapter) record(t *testing.T, p tracks.Project) {
	t.Helper()
	members, _ := p.ChapterMembers("folder")
	var items []tracks.Item
	for _, member := range members {
		items = append(items, member.Items...)
	}
	fingerprint, _ := ComputeChapterFingerprint(items, func(path string) (SourceIdentity, error) { return Identify(path, f.project) })
	_, err := f.ledger.Write(LedgerRecord{
		AnalyzerID: "rc", AnalyzerVersion: "v1", ParamHash: "params-1",
		Scope:       LedgerScope{DocumentID: "doc-1", ChapterID: "c-0001", TrackGUID: "folder"},
		Fingerprint: fingerprint,
		StartedAt:   time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), CompletedAt: time.Date(2026, 1, 2, 0, 0, 1, 0, time.UTC),
		Outcome: LedgerComplete,
	})
	if err != nil {
		t.Fatal(err)
	}
}

func (f folderChapter) read(t *testing.T, p tracks.Project) EvaluatorResult {
	t.Helper()
	result, _, err := EvaluateChapter(f.ledger, f.mapping, ChapterEvaluationRequest{
		Project: p, ProjectFolder: f.project,
		ProjectFile: LedgerProjectFile{Path: "p.rpp", ModTime: time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC)},
		DocumentID:  "doc-1", ChapterID: "c-0001", AnalyzerID: "rc", AnalyzerVersion: "v1", ParamHash: "params-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestAFolderLinkedChapterChecksCurrentWhenNothingChangedSinceTheRun(t *testing.T) {
	f := newFolderChapter(t)
	p := f.folderWithVoices(f.narrator, f.bed)
	f.record(t, p)
	if got := f.read(t, p); got.State != StateCurrent {
		t.Fatalf("State/Reasons = %q/%v, want current: the voices' items are what the run read", got.State, got.Reasons)
	}
}

func TestAFolderLinkedChapterReadsStaleWhenAVoiceItemMoved(t *testing.T) {
	f := newFolderChapter(t)
	f.record(t, f.folderWithVoices(f.narrator, f.bed))
	moved := f.narrator
	moved.Position = 5
	got := f.read(t, f.folderWithVoices(moved, f.bed))
	if got.State != StateStale || !reasonSet(got.Reasons)[ReasonItemMoved] {
		t.Fatalf("State/Reasons = %q/%v, want stale/item_moved", got.State, got.Reasons)
	}
}

func TestMarkingTheMusicBedMovesAFolderLinkedChapterBetweenCurrentAndStaleOnlyWhenTheRunReadIt(t *testing.T) {
	f := newFolderChapter(t)
	unmarked := f.folderWithVoices(f.narrator, f.bed)
	marked := unmarked.WithAudioSkip(func(guid string) bool { return guid == "bed" })

	// A run made with the bed marked did not read it: still current when read marked, and stale (the bed's item is new) when read unmarked.
	f.record(t, marked)
	if got := f.read(t, marked); got.State != StateCurrent {
		t.Fatalf("marked run read marked: State/Reasons = %q/%v, want current", got.State, got.Reasons)
	}
	if got := f.read(t, unmarked); got.State != StateStale {
		t.Fatalf("marked run read unmarked: State = %q, want stale (the bed is now part of the chapter's audio)", got.State)
	}

	// A change to the bed itself never moves a check made without it.
	longer := f.bed
	longer.Length = 200
	if got := f.read(t, f.folderWithVoices(f.narrator, longer).WithAudioSkip(func(guid string) bool { return guid == "bed" })); got.State != StateCurrent {
		t.Fatalf("a changed bed length with the bed marked: State/Reasons = %q/%v, want current", got.State, got.Reasons)
	}
}

func TestAPlainTrackChapterIsFingerprintedByItsOwnItemsAsBefore(t *testing.T) {
	project, ledger, mapping := chapterEvaluationSetup(t)
	source := writeTimedSourceFile(t, project, "a.wav", []byte("a"), time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	if _, err := mapping.Confirm("doc-1", "track-1", "c-0001", "Chapter One"); err != nil {
		t.Fatal(err)
	}
	items := []tracks.Item{staleItem("item-1", source, 0, 1, false, 0, 1)}
	fingerprint, _ := ComputeChapterFingerprint(items, func(path string) (SourceIdentity, error) { return Identify(path, project) })
	if _, err := ledger.Write(LedgerRecord{
		AnalyzerID: "rc", AnalyzerVersion: "v1", ParamHash: "params-1",
		Scope:       LedgerScope{DocumentID: "doc-1", ChapterID: "c-0001", TrackGUID: "track-1"},
		Fingerprint: fingerprint,
		StartedAt:   time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), CompletedAt: time.Date(2026, 1, 2, 0, 0, 1, 0, time.UTC), Outcome: LedgerComplete,
	}); err != nil {
		t.Fatal(err)
	}
	got, _, err := EvaluateChapter(ledger, mapping, ChapterEvaluationRequest{
		Project:       tracks.Project{Tracks: []tracks.Track{{GUID: "track-1", Items: items}}},
		ProjectFolder: project,
		ProjectFile:   LedgerProjectFile{Path: "p.rpp", ModTime: time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC)},
		DocumentID:    "doc-1", ChapterID: "c-0001", AnalyzerID: "rc", AnalyzerVersion: "v1", ParamHash: "params-1",
	})
	if err != nil || got.State != StateCurrent {
		t.Fatalf("State = %q err %v, want current", got.State, err)
	}
}

// #3608: two items of one chapter that share an item GUID (a track copied in from another project) must each be fingerprinted, or the
// second hides the first and a trim of the first reads as a recomposable move.
func TestADuplicateItemGUIDTrimmedReadsTrimmedAndNotRecomposable(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{}), "b.wav": staleIdentity("b.wav", "hash-b", 1000, time.Time{})}
	items := func(firstLength float64) []tracks.Item {
		return []tracks.Item{staleItem("dup", "a.wav", 0, firstLength, false, 0, 1), staleItem("dup", "b.wav", 30, 20, false, 0, 1)}
	}
	before := fingerprintOfItems(t, items(60), sources)
	after := fingerprintOfItems(t, items(55), sources)

	if got := len(before.ItemFingerprints); got != 2 {
		t.Fatalf("%d item fingerprints for two items that share a GUID, want 2", got)
	}
	result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1")
	if result.State != StateStale || !reasonSet(result.Reasons)[ReasonItemTrimmed] || reasonSet(result.Reasons)[ReasonItemMoved] {
		t.Fatalf("State/Reasons = %q/%v, want stale/item_trimmed", result.State, result.Reasons)
	}
	if result.Recomposable {
		t.Fatal("a trim changes the analysis key and must not be recomposable, whatever the GUID")
	}
	if len(result.ChangedItemGUIDs) != 1 || result.ChangedItemGUIDs[0] != "dup" {
		t.Fatalf("ChangedItemGUIDs = %v, want the trimmed first copy named by its own GUID", result.ChangedItemGUIDs)
	}
}

func TestADuplicateItemGUIDChapterReadsCurrentWhenNothingChanged(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{}), "b.wav": staleIdentity("b.wav", "hash-b", 1000, time.Time{})}
	items := []tracks.Item{staleItem("dup", "a.wav", 0, 60, false, 0, 1), staleItem("dup", "b.wav", 30, 20, false, 0, 1)}
	fingerprint := fingerprintOfItems(t, items, sources)
	if result := EvaluateFingerprints(completeRecordFor(fingerprint), fingerprintOfItems(t, items, sources), "track-1", "v1", "params-1"); result.State != StateCurrent {
		t.Fatalf("State/Reasons = %q/%v, want current", result.State, result.Reasons)
	}
}

func TestItemsWithUniqueGUIDsKeepTheirGUIDAsTheKey(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{}), "b.wav": staleIdentity("b.wav", "hash-b", 1000, time.Time{})}
	fingerprint := fingerprintOfItems(t, []tracks.Item{staleItem("one", "a.wav", 0, 60, false, 0, 1), staleItem("two", "b.wav", 30, 20, false, 0, 1)}, sources)
	for _, guid := range []string{"one", "two"} {
		if _, ok := fingerprint.ItemFingerprints[guid]; !ok {
			t.Fatalf("keys = %v, want the item GUID %q as its key (older ledger records stay readable)", fingerprint.ItemFingerprints, guid)
		}
	}
}

// A real item GUID that already ends in "#2" keeps its own key, and a repeat of "x" never lands on it.
func TestAnItemGUIDThatLooksLikeASuffixedKeyNeverCollidesWithADuplicate(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{}), "b.wav": staleIdentity("b.wav", "hash-b", 1000, time.Time{}), "c.wav": staleIdentity("c.wav", "hash-c", 1000, time.Time{})}
	items := func(secondLength float64) []tracks.Item {
		return []tracks.Item{staleItem("x", "a.wav", 0, 10, false, 0, 1), staleItem("x", "b.wav", 20, secondLength, false, 0, 1), staleItem("x#2", "c.wav", 40, 10, false, 0, 1)}
	}
	before := fingerprintOfItems(t, items(10), sources)
	if got := len(before.ItemFingerprints); got != 3 {
		t.Fatalf("%d keys for three items, want 3", got)
	}
	result := EvaluateFingerprints(completeRecordFor(before), fingerprintOfItems(t, items(8), sources), "track-1", "v1", "params-1")
	if !reasonSet(result.Reasons)[ReasonItemTrimmed] || reasonSet(result.Reasons)[ReasonItemMoved] || result.Recomposable {
		t.Fatalf("Reasons/Recomposable = %v/%v, want item_trimmed and not recomposable", result.Reasons, result.Recomposable)
	}
}

// An item that is skipped (its source is gone) takes no key, so its twin keeps the key it had.
func TestASkippedDuplicateDoesNotShiftItsTwinsKey(t *testing.T) {
	sources := map[string]SourceIdentity{"b.wav": staleIdentity("b.wav", "hash-b", 1000, time.Time{})}
	fingerprint := fingerprintOfItems(t, []tracks.Item{staleItem("d", "gone.wav", 0, 10, false, 0, 1), staleItem("d", "b.wav", 20, 10, false, 0, 1)}, sources)
	if _, ok := fingerprint.ItemFingerprints["d"]; !ok || len(fingerprint.ItemFingerprints) != 1 {
		t.Fatalf("keys = %v, want the one fingerprinted copy keyed by its plain GUID", fingerprint.ItemFingerprints)
	}
}

// A later duplicate that moves past its twin keys by order, not identity: it reads stale and not recomposable, which is the safe side.
func TestDuplicatesThatChangeOrderReadStaleAndNeverCurrent(t *testing.T) {
	sources := map[string]SourceIdentity{"a.wav": staleIdentity("a.wav", "hash-a", 1000, time.Time{}), "b.wav": staleIdentity("b.wav", "hash-b", 1000, time.Time{})}
	before := fingerprintOfItems(t, []tracks.Item{staleItem("d", "a.wav", 0, 10, false, 0, 1), staleItem("d", "b.wav", 20, 10, false, 0, 1)}, sources)
	after := fingerprintOfItems(t, []tracks.Item{staleItem("d", "a.wav", 30, 10, false, 0, 1), staleItem("d", "b.wav", 20, 10, false, 0, 1)}, sources)
	if result := EvaluateFingerprints(completeRecordFor(before), after, "track-1", "v1", "params-1"); result.State != StateStale {
		t.Fatalf("State = %q, want stale", result.State)
	}
}
