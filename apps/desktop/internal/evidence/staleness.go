// This file holds the staleness evaluator (ADR 0100). Given a chapter's current
// fingerprints (from a saved .rpp parse) and the ledger's latest complete
// record for that (analyzer, chapter), it answers whether the result is
// current: a complete chapter-level record whose fingerprints equal the
// current ones is current, anything else is stale or never, with typed reasons
// and a recomposable flag. It also states a basis label, "saved project, file
// modified <time>", and a staleness warning. It writes nothing and starts no
// analysis: the evaluator is a pure read.
//
// Callers: the recording coverage service's result reader
// (apps/desktop/internal/coverage, read.go). The data schema is unchanged
// beyond ledger.go's ItemFacts addition (see that file's header).
package evidence

import (
	"fmt"
	"sort"
	"strconv"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/tracks"
)

// EvaluatorState is the staleness evaluator's top-level answer: current, stale
// or never.
type EvaluatorState string

const (
	// StateCurrent means a complete ledger record exists for this (analyzer,
	// chapter) whose fingerprint equals the chapter's current one, its
	// analyzer version and parameter hash match, and its confirmed mapping is
	// unchanged.
	StateCurrent EvaluatorState = "current"
	// StateStale means a record exists but something about it - an item, the
	// mapping, the analyzer or its parameters - no longer matches the current
	// project.
	StateStale EvaluatorState = "stale"
	// StateNever means there is no complete record to compare at all: never
	// analyzed, no confirmed track for the chapter, or the confirmed track no
	// longer exists in the project.
	StateNever EvaluatorState = "never"
)

// EvaluatorReason is one typed reason a result is stale or never, named by the
// edit-type table's Evaluator column (fingerprint_test.go's TestEditTypeTable).
type EvaluatorReason string

const (
	ReasonItemAdded          EvaluatorReason = "item_added"
	ReasonItemRemoved        EvaluatorReason = "item_removed"
	ReasonItemTrimmed        EvaluatorReason = "item_trimmed"
	ReasonItemMoved          EvaluatorReason = "item_moved"
	ReasonItemMuted          EvaluatorReason = "item_muted"
	ReasonTakeSwitched       EvaluatorReason = "take_switched"
	ReasonSourceChanged      EvaluatorReason = "source_changed"
	ReasonAnalyzerChanged    EvaluatorReason = "analyzer_changed"
	ReasonParamsChanged      EvaluatorReason = "params_changed"
	ReasonMappingChanged     EvaluatorReason = "mapping_changed"
	ReasonMappedTrackMissing EvaluatorReason = "mapped_track_missing"
	ReasonProjectUnreadable  EvaluatorReason = "project_unreadable"
)

// reasonOrder gives dedupeReasons a stable, canonical output order (map
// iteration in diffItemFingerprints is not ordered), roughly scope-first
// (analyzer/params/mapping) then item-level reasons in the edit-type table's
// own row order.
var reasonOrder = map[EvaluatorReason]int{
	ReasonAnalyzerChanged:    0,
	ReasonParamsChanged:      1,
	ReasonMappingChanged:     2,
	ReasonMappedTrackMissing: 3,
	ReasonItemAdded:          4,
	ReasonItemRemoved:        5,
	ReasonItemTrimmed:        6,
	ReasonItemMoved:          7,
	ReasonItemMuted:          8,
	ReasonTakeSwitched:       9,
	ReasonSourceChanged:      10,
	ReasonProjectUnreadable:  11,
}

// EvaluatorResult is the evaluator's answer: state, reasons, whether a stale
// result can be recomposed from the cache without re-decoding, the ledger
// record it compared against (nil for StateNever when nothing was ever found),
// and the item GUIDs that changed.
type EvaluatorResult struct {
	State   EvaluatorState
	Reasons []EvaluatorReason
	// Recomposable is true only when every reason is item_moved or
	// item_muted (only position, mute or order changed) - the cases where every
	// item's AnalysisKey, and therefore its result cache entry, is unaffected. Always false for StateCurrent
	// and StateNever.
	Recomposable     bool
	Record           *LedgerRecord
	ChangedItemGUIDs []string
}

// EvaluationBasis is the basis every result states, regardless of State:
// the saved project file and its modified time, a fixed label, and a
// warning flag for the common "record, edit, check without saving" case.
type EvaluationBasis struct {
	ProjectFile LedgerProjectFile
	// Label is always "saved project, file modified <time>" - the live
	// REAPER state is never the basis, so this text never varies by State.
	Label string
	// Stale warns when ProjectFile.ModTime is older than the
	// newest ledger record for this chapter (any analyzer) or than a source
	// file the chapter's mapped track currently references - the case where
	// the narrator recorded evidence or edited audio after the last save.
	Stale bool
}

// SourceIdentifier resolves a take's source file path to its SourceIdentity.
// ComputeChapterFingerprint takes one as a parameter (rather than calling
// Identify itself) so it stays unit-testable without real files; production
// callers pass a closure over Identify bound to the project's folder (see
// EvaluateChapter).
type SourceIdentifier func(sourceFile string) (SourceIdentity, error)

// ChapterEvaluationRequest bundles what EvaluateChapter needs to answer
// for one chapter: the already-parsed project (tracks.Parse - the evaluator
// never parses the .rpp itself), which analyzer is asking, and the saved
// project file's own path and modified time (the basis, stat'd by the caller
// since it already opened the file to parse it).
type ChapterEvaluationRequest struct {
	Project         tracks.Project
	ProjectFolder   string
	ProjectFile     LedgerProjectFile
	DocumentID      string
	ChapterID       string
	AnalyzerID      string
	AnalyzerVersion string
	ParamHash       string
}

// ComputeChapterFingerprint computes a chapter's LedgerFingerprint (including
// ItemFacts) from its live REAPER track items right
// now, so EvaluateChapter can compare "current" against a stored record
// using exactly the encoding a writer would use. It returns the newest
// active-take source ModTime it saw (zero if none), for the basis warning. An
// item that is unsupported (no playable source, for example MIDI) or whose
// source cannot be identified (deleted, moved, or an empty source path) is
// skipped entirely - it is absent from every map and from the track
// fingerprint, which is the safe default: a chapter that lost a readable
// source reads as changed (item_removed relative to any prior record that
// had it), never as silently current.
func ComputeChapterFingerprint(items []tracks.Item, identify SourceIdentifier) (LedgerFingerprint, time.Time) {
	itemFingerprints := map[string]ItemFingerprint{}
	analysisKeys := map[string]AnalysisKey{}
	itemFacts := map[string]LedgerItemFact{}
	var newestSource time.Time
	entries := make([]TrackFingerprintEntry, 0, len(items))

	for _, item := range items {
		if !item.Supported || item.GUID == "" {
			continue
		}
		take := item.Active()
		if take.SourceFile == "" {
			continue
		}
		identity, err := identify(take.SourceFile)
		if err != nil {
			continue
		}
		if identity.ModTime.After(newestSource) {
			newestSource = identity.ModTime
		}

		played := ItemPlayedRange(item)
		key := ComputeAnalysisKey(identity, played, take.PlayRate)
		fingerprint := ComputeItemFingerprint(key, item)

		itemFingerprints[item.GUID] = fingerprint
		analysisKeys[item.GUID] = key
		itemFacts[item.GUID] = LedgerItemFact{
			Position:       item.Position,
			Length:         item.Length,
			Muted:          item.Muted,
			ActiveTake:     item.ActiveTake,
			SourceIdentity: sourceIdentitySummary(identity),
		}
		entries = append(entries, TrackFingerprintEntry{Item: item, Fingerprint: fingerprint})
	}

	return LedgerFingerprint{
		TrackFingerprint: ComputeTrackFingerprint(entries),
		ItemFingerprints: itemFingerprints,
		AnalysisKeys:     analysisKeys,
		ItemFacts:        itemFacts,
	}, newestSource
}

// sourceIdentitySummary hashes identity's Path, Size and PartialHash - never
// ModTime, the same choice AnalysisKey and CacheEntryKey.hash already make -
// into one comparable string for LedgerItemFact, so a merely-touched source
// file is never mistaken for a replaced one.
func sourceIdentitySummary(identity SourceIdentity) string {
	return hashParts(identity.Path, strconv.FormatInt(identity.Size, 10), identity.PartialHash)
}

// EvaluateFingerprints is the evaluator's pure comparison: given the
// ledger's record and the chapter's current fingerprint, it decides
// current/stale/never and why, without touching disk. EvaluateChapter below
// is the disk-reading wrapper that finds record and current and calls this.
// currentTrackGUID is the chapter's confirmed mapping right now (so a
// changed mapping since the record ran is caught even when every item
// fingerprint still matches).
func EvaluateFingerprints(record LedgerRecord, current LedgerFingerprint, currentTrackGUID, analyzerVersion, paramHash string) EvaluatorResult {
	// A partial or failed run is never read as current: checked first and
	// unconditionally, before any fingerprint comparison.
	if record.Outcome != LedgerComplete {
		return EvaluatorResult{State: StateNever}
	}

	var reasons []EvaluatorReason
	if record.AnalyzerVersion != analyzerVersion {
		reasons = append(reasons, ReasonAnalyzerChanged)
	}
	if record.ParamHash != paramHash {
		reasons = append(reasons, ReasonParamsChanged)
	}
	if record.Scope.TrackGUID != "" && currentTrackGUID != "" && record.Scope.TrackGUID != currentTrackGUID {
		reasons = append(reasons, ReasonMappingChanged)
	}

	itemReasons, changed := diffItemFingerprints(record.Fingerprint, current)
	reasons = append(reasons, itemReasons...)
	// A pure reorder (the order changed) leaves every item's
	// own fingerprint untouched but changes TrackFingerprint, since
	// ComputeTrackFingerprint hashes entries in order - diffItemFingerprints
	// alone would miss it, so fall back to a recomposable item_moved.
	if len(itemReasons) == 0 && record.Fingerprint.TrackFingerprint != current.TrackFingerprint {
		reasons = append(reasons, ReasonItemMoved)
	}

	reasons = dedupeReasons(reasons)
	recordCopy := record
	if len(reasons) == 0 {
		return EvaluatorResult{State: StateCurrent, Record: &recordCopy}
	}
	return EvaluatorResult{
		State:            StateStale,
		Reasons:          reasons,
		Recomposable:     isRecomposable(reasons),
		Record:           &recordCopy,
		ChangedItemGUIDs: changed,
	}
}

// diffItemFingerprints compares record and current's ItemFingerprints maps
// by item GUID, returning one reason per changed, added or removed item
// (duplicates and ordering are dedupeReasons's job) and the sorted set of
// changed GUIDs.
func diffItemFingerprints(record, current LedgerFingerprint) ([]EvaluatorReason, []string) {
	var reasons []EvaluatorReason
	changedSet := map[string]bool{}

	for guid, currentFingerprint := range current.ItemFingerprints {
		recordFingerprint, existed := record.ItemFingerprints[guid]
		if !existed {
			reasons = append(reasons, ReasonItemAdded)
			changedSet[guid] = true
			continue
		}
		if recordFingerprint == currentFingerprint {
			continue
		}
		changedSet[guid] = true
		reasons = append(reasons, itemChangeReason(record, current, guid))
	}
	for guid := range record.ItemFingerprints {
		if _, ok := current.ItemFingerprints[guid]; !ok {
			reasons = append(reasons, ReasonItemRemoved)
			changedSet[guid] = true
		}
	}

	changed := make([]string, 0, len(changedSet))
	for guid := range changedSet {
		changed = append(changed, guid)
	}
	sort.Strings(changed)
	return reasons, changed
}

// itemChangeReason names why one item (present in both record and current,
// with a different ItemFingerprint) changed, per the edit-type table:
//
//   - AnalysisKey unchanged: only position, mute or active-take-index could
//     have moved the fingerprint, and active-take switches almost always
//     change the AnalysisKey too (a different take is a different source or
//     played range) - so an unchanged key is the recomposable case, and
//     ItemFacts.Muted disambiguates a mute toggle from a plain move.
//   - AnalysisKey changed: ItemFacts.ActiveTake tells a take switch apart
//     from a trim or playrate change; ItemFacts.SourceIdentity tells a
//     replaced source file apart from either. When a record predates ItemFacts
//     and carries no ItemFacts for this item, the evaluator cannot
//     disambiguate and reports the safe generic reason for that branch
//     (item_moved when the key is unchanged, item_trimmed when it changed) -
//     still correctly stale, just less specific about which edit it was.
func itemChangeReason(record, current LedgerFingerprint, guid string) EvaluatorReason {
	recordFact, hasRecordFact := record.ItemFacts[guid]
	currentFact, hasCurrentFact := current.ItemFacts[guid]
	haveFacts := hasRecordFact && hasCurrentFact

	if record.AnalysisKeys[guid] == current.AnalysisKeys[guid] {
		if haveFacts && recordFact.Muted != currentFact.Muted {
			return ReasonItemMuted
		}
		return ReasonItemMoved
	}

	if haveFacts {
		if recordFact.ActiveTake != currentFact.ActiveTake {
			return ReasonTakeSwitched
		}
		if recordFact.SourceIdentity != currentFact.SourceIdentity {
			return ReasonSourceChanged
		}
	}
	return ReasonItemTrimmed
}

// isRecomposable is true only when every reason is item_moved or item_muted,
// the cases where no item's AnalysisKey changed and its result cache entry (if
// any) is still valid.
func isRecomposable(reasons []EvaluatorReason) bool {
	if len(reasons) == 0 {
		return false
	}
	for _, reason := range reasons {
		if reason != ReasonItemMoved && reason != ReasonItemMuted {
			return false
		}
	}
	return true
}

// dedupeReasons removes duplicate reasons (several items can produce the
// same reason) and sorts what remains into reasonOrder's canonical order, so
// a result's Reasons slice is deterministic regardless of map iteration
// order upstream.
func dedupeReasons(reasons []EvaluatorReason) []EvaluatorReason {
	seen := map[EvaluatorReason]bool{}
	unique := make([]EvaluatorReason, 0, len(reasons))
	for _, reason := range reasons {
		if seen[reason] {
			continue
		}
		seen[reason] = true
		unique = append(unique, reason)
	}
	sort.Slice(unique, func(i, j int) bool { return reasonOrder[unique[i]] < reasonOrder[unique[j]] })
	return unique
}

// BuildBasis computes the EvaluationBasis: the label is always shown, and
// Stale warns when projectFile's ModTime is older than newestRecordTime (any
// analyzer's newest record for the chapter) or newestSourceModTime (the
// chapter's mapped track's newest source file) - whichever of those two is
// later. A zero time is ignored (nothing to compare against yet, for example
// a chapter that was never analyzed).
func BuildBasis(projectFile LedgerProjectFile, newestRecordTime, newestSourceModTime time.Time) EvaluationBasis {
	stale := (!newestRecordTime.IsZero() && projectFile.ModTime.Before(newestRecordTime)) ||
		(!newestSourceModTime.IsZero() && projectFile.ModTime.Before(newestSourceModTime))
	return EvaluationBasis{
		ProjectFile: projectFile,
		Label:       fmt.Sprintf("saved project, file modified %s", projectFile.ModTime.Format(time.RFC3339)),
		Stale:       stale,
	}
}

// EvaluateChapter is the staleness evaluator's entry point. Given
// req.Project (already parsed by the caller with tracks.Parse - this function
// never reads the .rpp itself), it: finds the chapter's confirmed
// track (mapping.List), computes the chapter's current fingerprints
// (ComputeChapterFingerprint, one stat plus a partial read per source),
// finds the latest complete ledger record for (req.AnalyzerID,
// req.ChapterID), and returns the EvaluatorResult plus the EvaluationBasis
// every result states. It reads the ledger and mapping stores; it never writes
// to either.
func EvaluateChapter(ledger *LedgerStore, mapping *MappingStore, req ChapterEvaluationRequest) (EvaluatorResult, EvaluationBasis, error) {
	recordTime, err := newestRecordTime(ledger, req.ChapterID)
	if err != nil {
		return EvaluatorResult{}, EvaluationBasis{}, err
	}

	links, err := mapping.List(req.DocumentID)
	if err != nil {
		return EvaluatorResult{}, EvaluationBasis{}, err
	}
	// A chapter has one confirmed track; zero or more than one confirmed track
	// for it is a consumer-level "unknown", reported here as StateNever since
	// there is no single track to compute a current fingerprint against.
	link, ok := singleMappingFor(links, req.ChapterID)
	if !ok {
		return EvaluatorResult{State: StateNever}, BuildBasis(req.ProjectFile, recordTime, time.Time{}), nil
	}

	track, ok := findTrack(req.Project, link.TrackGUID)
	if !ok {
		result := EvaluatorResult{State: StateNever, Reasons: []EvaluatorReason{ReasonMappedTrackMissing}}
		return result, BuildBasis(req.ProjectFile, recordTime, time.Time{}), nil
	}

	identify := func(sourceFile string) (SourceIdentity, error) {
		if sourceFile == "" {
			return SourceIdentity{}, fmt.Errorf("item has no source file")
		}
		return Identify(sourceFile, req.ProjectFolder)
	}
	current, newestSource := ComputeChapterFingerprint(track.Items, identify)
	basis := BuildBasis(req.ProjectFile, recordTime, newestSource)

	record, found, err := latestCompleteRecord(ledger, req.AnalyzerID, req.ChapterID)
	if err != nil {
		return EvaluatorResult{}, basis, err
	}
	if !found {
		return EvaluatorResult{State: StateNever}, basis, nil
	}

	result := EvaluateFingerprints(record, current, link.TrackGUID, req.AnalyzerVersion, req.ParamHash)
	return result, basis, nil
}

// singleMappingFor returns links' one entry whose ChapterID is chapterID,
// and false when there is not exactly one.
func singleMappingFor(links []TrackMapping, chapterID string) (TrackMapping, bool) {
	var match TrackMapping
	count := 0
	for _, link := range links {
		if link.ChapterID == chapterID {
			match = link
			count++
		}
	}
	return match, count == 1
}

// findTrack returns project's track with the given GUID.
func findTrack(project tracks.Project, trackGUID string) (tracks.Track, bool) {
	for _, track := range project.Tracks {
		if track.GUID == trackGUID {
			return track, true
		}
	}
	return tracks.Track{}, false
}

// latestCompleteRecord returns the newest record for (analyzerID, chapterID)
// whose Outcome is LedgerComplete - ledger.List already sorts newest first,
// so this is the first complete one, skipping any newer partial or failed
// run (a partial or failed run is never read as current).
func latestCompleteRecord(ledger *LedgerStore, analyzerID, chapterID string) (LedgerRecord, bool, error) {
	records, err := ledger.List(analyzerID, chapterID)
	if err != nil {
		return LedgerRecord{}, false, err
	}
	for _, record := range records {
		if record.Outcome == LedgerComplete {
			return record, true, nil
		}
	}
	return LedgerRecord{}, false, nil
}

// newestRecordTime returns the latest CompletedAt (or StartedAt when
// CompletedAt is zero, for example a partial or failed run) across every
// analyzer's record for chapterID, for the basis warning - deliberately not
// scoped to one analyzer, since any recorded evidence after the last save is
// what the warning cares about, not only the one analyzer currently asking.
func newestRecordTime(ledger *LedgerStore, chapterID string) (time.Time, error) {
	records, err := ledger.List("", chapterID)
	if err != nil {
		return time.Time{}, err
	}
	var newest time.Time
	for _, record := range records {
		at := record.CompletedAt
		if at.IsZero() {
			at = record.StartedAt
		}
		if at.After(newest) {
			newest = at
		}
	}
	return newest, nil
}
