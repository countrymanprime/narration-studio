// This file writes and reads this package's ledger records
// (src/studio/desktop/internal/evidence/ledger.go): one record per
// item per class per decode pass (Architecture Notes: "One decode pass over
// an item writes three records..., each with analyzer version, parameter
// hash, scope, outcome complete|partial|failed, and counts, so a class can
// go stale alone when its detector version changes"). Item-level scoping
// (Scope.ItemGUIDs holding exactly one GUID) is deliberate, not chapter-wide
// like the recording coverage analyzer's one-record-per-chapter-per-run: ER
// needs "editing one item re-decodes only that item" (Success Metrics), so
// staleness has to be checked per item, which needs a record per item.
package editing

import (
	"strconv"
	"time"

	"desktop/internal/evidence"
	"desktop/internal/tracks"
)

// ItemScopeInput is what WriteLedgerRecord and CurrentItemRecord need to
// identify one item's own fingerprint: the parsed item, its
// resolved analysis key (from Resolve/evidence.ComputeAnalysisKey) and the
// project it belongs to.
type ItemScopeInput struct {
	DocumentID string
	ChapterID  string
	TrackGUID  string
	Item       tracks.Item
	Key        evidence.AnalysisKey
	// ScopeKey is the name this item's record gives it (scopeKeys.key): empty means the item's GUID, which every record written before twins
	// were told apart used.
	ScopeKey string
}

// scopeKey is the name a record's scope and fingerprint maps give this item: its GUID unless the caller named it otherwise (ScopeKey).
func (in ItemScopeInput) scopeKey() string {
	if in.ScopeKey != "" {
		return in.ScopeKey
	}
	return in.Item.GUID
}

// itemFingerprint computes in.Item's own single-item LedgerFingerprint,
// reusing EL's exported fingerprint machinery (ComputeItemFingerprint,
// ComputeTrackFingerprint) over a one-entry list: it is a valid, correctly
// comparable fingerprint of exactly this one item, at item scope rather than
// EL's usual chapter scope.
func itemFingerprint(in ItemScopeInput) evidence.LedgerFingerprint {
	itemFP := evidence.ComputeItemFingerprint(in.Key, in.Item)
	entry := evidence.TrackFingerprintEntry{Item: in.Item, Fingerprint: itemFP}
	return evidence.LedgerFingerprint{
		TrackFingerprint: evidence.ComputeTrackFingerprint([]evidence.TrackFingerprintEntry{entry}),
		ItemFingerprints: map[string]evidence.ItemFingerprint{in.scopeKey(): itemFP},
		AnalysisKeys:     map[string]evidence.AnalysisKey{in.scopeKey(): in.Key},
	}
}

// WriteLedgerRecord writes one item-scoped ledger record for analyzerID
// (AnalyzerSilence, AnalyzerClick or AnalyzerBreath), stamping start/end and
// the given outcome and counts.
func WriteLedgerRecord(ledger *evidence.LedgerStore, analyzerID, analyzerVersion, paramHash string, in ItemScopeInput, projectFile evidence.LedgerProjectFile, startedAt, completedAt time.Time, outcome evidence.LedgerOutcome, counts map[string]int) (evidence.LedgerRecord, error) {
	return ledger.Write(evidence.LedgerRecord{
		AnalyzerID: analyzerID, AnalyzerVersion: analyzerVersion, ParamHash: paramHash,
		Scope: evidence.LedgerScope{
			DocumentID: in.DocumentID, ChapterID: in.ChapterID, TrackGUID: in.TrackGUID, ItemGUIDs: []string{in.scopeKey()},
		},
		Fingerprint: itemFingerprint(in),
		ProjectFile: projectFile,
		StartedAt:   startedAt,
		CompletedAt: completedAt,
		Outcome:     outcome,
		Counts:      counts,
	})
}

// ItemStaleness is one item's answer to "is the newest complete record for
// analyzerID still current" (the evidence package's staleness rule, applied at item scope
// rather than chapter scope): never (no complete record at all), stale (an
// item, analyzer or parameter mismatch, named by Reasons), or current.
type ItemStaleness struct {
	State   evidence.EvaluatorState
	Reasons []evidence.EvaluatorReason // set only when State is StateStale
	Record  *evidence.LedgerRecord     // nil for StateNever
}

// CurrentItemRecord finds the newest complete record of analyzerID scoped to
// exactly in.Item.GUID (never a chapter-wide or multi-item record: this
// package only ever writes single-item scopes, so a record naming more than
// one item, or a different one, is never a match for this item) and
// compares its fingerprint, analyzer version and parameter hash against
// in's current ones.
func CurrentItemRecord(ledger evidence.LedgerReader, analyzerID, analyzerVersion, paramHash string, in ItemScopeInput) (ItemStaleness, error) {
	records, err := ledger.List(analyzerID, in.ChapterID)
	if err != nil {
		return ItemStaleness{}, err
	}
	for _, record := range records {
		if record.Outcome != evidence.LedgerComplete || !scopesOneItem(record.Scope, in.scopeKey()) {
			continue
		}
		result := evidence.EvaluateFingerprints(record, itemFingerprint(in), in.TrackGUID, analyzerVersion, paramHash)
		return ItemStaleness{State: result.State, Reasons: result.Reasons, Record: result.Record}, nil
	}
	return ItemStaleness{State: evidence.StateNever}, nil
}

// scopesOneItem reports whether scope names exactly one item, key (ItemScopeInput.scopeKey).
func scopesOneItem(scope evidence.LedgerScope, key string) bool {
	return len(scope.ItemGUIDs) == 1 && scope.ItemGUIDs[0] == key
}

// scopeKeys hands out the names the items of one chapter give their records. An item's GUID is its name, so every record written before
// twins were told apart stays readable; a later item that repeats a GUID (a track copied in from another project) is "GUID#2", "GUID#3", the
// first name no item has taken (a real GUID that already ends in "#2" keeps its own). Keyed by the GUID alone, two twins read each other's
// record and re-scanning one made the other stale (#3617). The scan (scan.go) and the freshness read (provider.go) walk the track's items in
// the same order and ask for a key for every item, including one they then skip, so an item keeps its name whether or not a twin before it can
// be analysed.
type scopeKeys struct {
	taken map[string]bool
	seen  map[string]int
}

func newScopeKeys() *scopeKeys { return &scopeKeys{taken: map[string]bool{}, seen: map[string]int{}} }

// key is the next unused name for an item with this GUID, or "" for the first (its GUID itself).
func (k *scopeKeys) key(guid string) string {
	k.seen[guid]++
	candidate := guid
	for n := k.seen[guid]; k.taken[candidate]; n++ {
		candidate = guid + "#" + strconv.Itoa(n)
	}
	k.taken[candidate] = true
	if candidate == guid {
		return ""
	}
	return candidate
}
