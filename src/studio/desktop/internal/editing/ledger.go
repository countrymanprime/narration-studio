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
	// Occurrence is which of the items of this chapter that share Item's GUID this one is, counting from 0 in the order the chapter lists them.
	Occurrence int
}

// scopeKey is the name a record's scope and fingerprint maps give this item: its GUID, so every record written before twins were told apart
// stays readable, and "GUID#2", "GUID#3" for the later items of a chapter that share it (a track copied in from another project). Keyed by the
// GUID alone, two twins read each other's record, and re-scanning one made the other stale (#3617).
func (in ItemScopeInput) scopeKey() string {
	if in.Occurrence <= 0 {
		return in.Item.GUID
	}
	return in.Item.GUID + "#" + strconv.Itoa(in.Occurrence+1)
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
func CurrentItemRecord(ledger *evidence.LedgerStore, analyzerID, analyzerVersion, paramHash string, in ItemScopeInput) (ItemStaleness, error) {
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

// occurrences counts, per item GUID, the items of one chapter seen so far, so the scan and the freshness read give the same item the same
// ItemScopeInput.Occurrence: both walk the chapter's items in the order the track lists them.
type occurrences map[string]int

func newOccurrences() occurrences { return occurrences{} }

// next is how many items with this GUID came before this one, and counts this one.
func (o occurrences) next(guid string) int {
	n := o[guid]
	o[guid] = n + 1
	return n
}
