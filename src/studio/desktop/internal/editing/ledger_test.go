package editing

import (
	"testing"
	"time"

	"desktop/internal/evidence"
	"desktop/internal/tracks"
)

func scopeFor(item tracks.Item) ItemScopeInput {
	identity := evidence.SourceIdentity{Path: "a.wav", Size: 100, PartialHash: "abc"}
	key := evidence.ComputeAnalysisKey(identity, evidence.ItemPlayedRange(item), item.PlayRate)
	return ItemScopeInput{DocumentID: "doc-1", ChapterID: "chapter-1", TrackGUID: "track-1", Item: item, Key: key}
}

func TestCurrentItemRecordNeverWithNoRecord(t *testing.T) {
	ledger := evidence.NewLedgerStore(t.TempDir())
	in := scopeFor(itemWith(nil))
	staleness, err := CurrentItemRecord(ledger, AnalyzerSilence, "v1", "params-1", in)
	if err != nil {
		t.Fatalf("CurrentItemRecord() error = %v", err)
	}
	if staleness.State != evidence.StateNever {
		t.Fatalf("CurrentItemRecord() state = %q, want %q", staleness.State, evidence.StateNever)
	}
}

func TestWriteLedgerRecordThenCurrent(t *testing.T) {
	ledger := evidence.NewLedgerStore(t.TempDir())
	item := itemWith(nil)
	in := scopeFor(item)
	now := time.Now().UTC()

	if _, err := WriteLedgerRecord(ledger, AnalyzerSilence, "v1", "params-1", in, evidence.LedgerProjectFile{}, now, now, evidence.LedgerComplete, map[string]int{"itemsAnalyzed": 1}); err != nil {
		t.Fatalf("WriteLedgerRecord() error = %v", err)
	}

	staleness, err := CurrentItemRecord(ledger, AnalyzerSilence, "v1", "params-1", in)
	if err != nil {
		t.Fatalf("CurrentItemRecord() error = %v", err)
	}
	if staleness.State != evidence.StateCurrent {
		t.Fatalf("CurrentItemRecord() state = %q, want %q", staleness.State, evidence.StateCurrent)
	}
	if staleness.Record == nil {
		t.Fatalf("CurrentItemRecord() record = nil, want the record just written")
	}
}

// TestWriteLedgerRecordScopesToOneItemOnly proves the item-scoping claim
// this file's header makes: a record written for item A must never answer
// "current" for item B, even when both are in the same chapter and analyzer.
func TestWriteLedgerRecordScopesToOneItemOnly(t *testing.T) {
	ledger := evidence.NewLedgerStore(t.TempDir())
	itemA := itemWith(nil)
	itemB := itemWith(func(item *tracks.Item, _ *tracks.Take) { item.GUID = "item-2" })
	inA, inB := scopeFor(itemA), scopeFor(itemB)
	now := time.Now().UTC()

	if _, err := WriteLedgerRecord(ledger, AnalyzerSilence, "v1", "params-1", inA, evidence.LedgerProjectFile{}, now, now, evidence.LedgerComplete, nil); err != nil {
		t.Fatalf("WriteLedgerRecord() error = %v", err)
	}
	staleness, err := CurrentItemRecord(ledger, AnalyzerSilence, "v1", "params-1", inB)
	if err != nil {
		t.Fatalf("CurrentItemRecord() error = %v", err)
	}
	if staleness.State != evidence.StateNever {
		t.Fatalf("CurrentItemRecord() for an unrelated item = %q, want %q (a scan of item A must not cover item B)", staleness.State, evidence.StateNever)
	}
}

// TestCurrentItemRecordStaleAfterMove proves the per-item staleness
// comparison actually tracks edits: moving an item (same audio, new
// Position) must go stale, per the edit-type table (item_moved).
func TestCurrentItemRecordStaleAfterMove(t *testing.T) {
	ledger := evidence.NewLedgerStore(t.TempDir())
	item := itemWith(nil)
	in := scopeFor(item)
	now := time.Now().UTC()
	if _, err := WriteLedgerRecord(ledger, AnalyzerSilence, "v1", "params-1", in, evidence.LedgerProjectFile{}, now, now, evidence.LedgerComplete, nil); err != nil {
		t.Fatalf("WriteLedgerRecord() error = %v", err)
	}

	moved := item
	moved.Position = 42
	movedIn := scopeFor(moved)
	staleness, err := CurrentItemRecord(ledger, AnalyzerSilence, "v1", "params-1", movedIn)
	if err != nil {
		t.Fatalf("CurrentItemRecord() error = %v", err)
	}
	if staleness.State != evidence.StateStale {
		t.Fatalf("CurrentItemRecord() after a move = %q, want %q", staleness.State, evidence.StateStale)
	}
}

// TestCurrentItemRecordStaleAfterAnalyzerVersionChange proves the
// validated-detector gate's mechanism: asking with a
// different analyzerVersion than what was recorded must read as stale, so a
// class can be forced back to unknown just by changing what version this
// package reports itself as.
func TestCurrentItemRecordStaleAfterAnalyzerVersionChange(t *testing.T) {
	ledger := evidence.NewLedgerStore(t.TempDir())
	item := itemWith(nil)
	in := scopeFor(item)
	now := time.Now().UTC()
	if _, err := WriteLedgerRecord(ledger, AnalyzerSilence, "v1", "params-1", in, evidence.LedgerProjectFile{}, now, now, evidence.LedgerComplete, nil); err != nil {
		t.Fatalf("WriteLedgerRecord() error = %v", err)
	}
	staleness, err := CurrentItemRecord(ledger, AnalyzerSilence, "v2", "params-1", in)
	if err != nil {
		t.Fatalf("CurrentItemRecord() error = %v", err)
	}
	if staleness.State != evidence.StateStale {
		t.Fatalf("CurrentItemRecord() after an analyzer version change = %q, want %q", staleness.State, evidence.StateStale)
	}
}

// TestCurrentItemRecordNeverForPartialOrFailed is the Success Metrics gate
// "a partial or failed run is never read as current" (EL's own rule,
// exercised here at item scope).
func TestCurrentItemRecordNeverForPartialOrFailed(t *testing.T) {
	ledger := evidence.NewLedgerStore(t.TempDir())
	item := itemWith(nil)
	in := scopeFor(item)
	now := time.Now().UTC()
	if _, err := WriteLedgerRecord(ledger, AnalyzerSilence, "v1", "params-1", in, evidence.LedgerProjectFile{}, now, now, evidence.LedgerPartial, nil); err != nil {
		t.Fatalf("WriteLedgerRecord() error = %v", err)
	}
	staleness, err := CurrentItemRecord(ledger, AnalyzerSilence, "v1", "params-1", in)
	if err != nil {
		t.Fatalf("CurrentItemRecord() error = %v", err)
	}
	if staleness.State != evidence.StateNever {
		t.Fatalf("CurrentItemRecord() for a partial-only history = %q, want %q", staleness.State, evidence.StateNever)
	}
}

// #3617: two items of one chapter that share an item GUID (a track copied in from another project) each have their own record, so
// analysing one never makes the other read stale and re-scanning one never flip-flops the other.
func twinScopes() (first, second ItemScopeInput) {
	a := itemWith(func(item *tracks.Item, _ *tracks.Take) { item.GUID, item.Position = "dup", 0 })
	b := itemWith(func(item *tracks.Item, _ *tracks.Take) { item.GUID, item.Position = "dup", 30 })
	first, second = scopeFor(a), scopeFor(b)
	second.Occurrence = 1
	return first, second
}

func TestTwoItemsThatShareAGUIDEachReadCurrentAfterBothAreAnalysed(t *testing.T) {
	ledger := evidence.NewLedgerStore(t.TempDir())
	first, second := twinScopes()
	now := time.Now().UTC()
	for _, in := range []ItemScopeInput{first, second} {
		if _, err := WriteLedgerRecord(ledger, AnalyzerSilence, "v1", "params-1", in, evidence.LedgerProjectFile{}, now, now, evidence.LedgerComplete, map[string]int{"silences": 1}); err != nil {
			t.Fatal(err)
		}
	}
	for name, in := range map[string]ItemScopeInput{"first": first, "second": second} {
		got, err := CurrentItemRecord(ledger, AnalyzerSilence, "v1", "params-1", in)
		if err != nil {
			t.Fatal(err)
		}
		if got.State != evidence.StateCurrent {
			t.Fatalf("%s twin: State/Reasons = %q/%v, want current", name, got.State, got.Reasons)
		}
	}
}

func TestRescanningOneTwinNeverMakesTheOtherStale(t *testing.T) {
	ledger := evidence.NewLedgerStore(t.TempDir())
	first, second := twinScopes()
	now := time.Now().UTC()
	write := func(in ItemScopeInput, at time.Time) {
		t.Helper()
		if _, err := WriteLedgerRecord(ledger, AnalyzerSilence, "v1", "params-1", in, evidence.LedgerProjectFile{}, at, at, evidence.LedgerComplete, nil); err != nil {
			t.Fatal(err)
		}
	}
	write(first, now)
	write(second, now.Add(time.Second))
	write(first, now.Add(2*time.Second))
	for name, in := range map[string]ItemScopeInput{"first": first, "second": second} {
		if got, _ := CurrentItemRecord(ledger, AnalyzerSilence, "v1", "params-1", in); got.State != evidence.StateCurrent {
			t.Fatalf("%s twin after a re-scan of the first: State = %q, want current", name, got.State)
		}
	}
}

func TestATwinThatChangedReadsStaleAndItsSiblingStaysCurrent(t *testing.T) {
	ledger := evidence.NewLedgerStore(t.TempDir())
	first, second := twinScopes()
	now := time.Now().UTC()
	for _, in := range []ItemScopeInput{first, second} {
		if _, err := WriteLedgerRecord(ledger, AnalyzerSilence, "v1", "params-1", in, evidence.LedgerProjectFile{}, now, now, evidence.LedgerComplete, nil); err != nil {
			t.Fatal(err)
		}
	}
	moved := first
	moved.Item.Position = 5
	if got, _ := CurrentItemRecord(ledger, AnalyzerSilence, "v1", "params-1", moved); got.State != evidence.StateStale {
		t.Fatalf("a moved twin: State = %q, want stale", got.State)
	}
	if got, _ := CurrentItemRecord(ledger, AnalyzerSilence, "v1", "params-1", second); got.State != evidence.StateCurrent {
		t.Fatalf("its sibling: State = %q, want current", got.State)
	}
}

func TestAnItemWithAUniqueGUIDIsStillScopedByItsGUIDAlone(t *testing.T) {
	ledger := evidence.NewLedgerStore(t.TempDir())
	in := scopeFor(itemWith(nil))
	now := time.Now().UTC()
	record, err := WriteLedgerRecord(ledger, AnalyzerSilence, "v1", "params-1", in, evidence.LedgerProjectFile{}, now, now, evidence.LedgerComplete, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := record.Scope.ItemGUIDs; len(got) != 1 || got[0] != in.Item.GUID {
		t.Fatalf("scope = %v, want the item's GUID alone (records written before this stay readable)", got)
	}
}
