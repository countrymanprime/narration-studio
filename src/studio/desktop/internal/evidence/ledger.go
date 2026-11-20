// This file holds the ledger record type and its one-JSON-file-per-record store
// under <project>/<app>/analysis/ledger/.
//
// Callers: the recording coverage service (src/studio/desktop/internal/coverage)
// writes one record per run, and the staleness evaluator (staleness.go) reads
// them; src/studio/desktop/internal/manuscript/service.go's resetDerived adds
// LedgerDir to the directories a manuscript reset clears. The data schema is
// LedgerRecord's JSON shape below, versioned by its own SchemaVersion field
// (ledgerSchemaVersion).
//
// A record's ItemFingerprints and AnalysisKeys are opaque hashes by design
// (fingerprints hash a canonical encoding, never the raw chunk text), which is
// right for detecting that an item changed but cannot say why - hashes don't
// invert. The evaluator needs to name the edit type (item_moved vs
// item_trimmed vs item_muted vs take_switched vs source_changed) for the
// narrator, not just flag a mismatch, so LedgerFingerprint.ItemFacts keeps a
// small, plain (non-hashed) snapshot of exactly the fields the fingerprint
// hashes already commit to (Position, Length, Muted, ActiveTake, and a summary
// of SourceIdentity) beside the hash - never anything the fingerprint doesn't
// already cover, so this stays additive to "fingerprint" in spirit, not a
// second, independent record of item state. It is additive and backward
// compatible: ledgerSchemaVersion stays 1, and a record written before this
// field existed decodes with a nil ItemFacts map, which the evaluator treats
// as "identity unknown" and falls back to a coarser but still-correct reason
// (see staleness.go's itemChangeReason).
package evidence

import (
	"crypto/rand"
	"desktop/internal/brand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"desktop/internal/persist"
)

// ledgerSchemaVersion is the schema version every record written by this
// package carries. A record read back with a higher version was written by
// a newer app (an unknown version is treated as absent, never as an error the
// narrator has to fix) - readRecord treats it the same as a missing or corrupt file.
const ledgerSchemaVersion = 1

// LedgerOutcome is how an analyzer run ended. Only a LedgerComplete
// record is meant to be read as a current result; LedgerPartial and
// LedgerFailed exist so "clean" (a completed run that found nothing) is
// never confused with "the run did not finish" (Evidence: measure.Evaluate
// returns an empty slice for a compliant report with nothing recording that
// the run happened at all).
type LedgerOutcome string

const (
	LedgerComplete LedgerOutcome = "complete"
	LedgerPartial  LedgerOutcome = "partial"
	LedgerFailed   LedgerOutcome = "failed"
)

// LedgerScope is what a ledger record's run covered: a chapter of a
// manuscript, optionally narrowed to one track or one set of items (a
// re-analysis of only the items an edit touched still records against the
// same chapter scope, because of the per-item cache).
type LedgerScope struct {
	DocumentID string   `json:"documentId"`
	ChapterID  string   `json:"chapterId"`
	TrackGUID  string   `json:"trackGuid,omitempty"`
	ItemGUIDs  []string `json:"itemGuids,omitempty"`
}

// LedgerFingerprint is the fingerprint state a record was computed against,
// so the evaluator can compare it to the project's fingerprints now.
// ItemFingerprints, AnalysisKeys and ItemFacts are all keyed by item GUID (a second item that repeats a GUID in one chapter is keyed "GUID#2", and so on: itemKey).
type LedgerFingerprint struct {
	TrackFingerprint TrackFingerprint           `json:"trackFingerprint"`
	ItemFingerprints map[string]ItemFingerprint `json:"itemFingerprints,omitempty"`
	AnalysisKeys     map[string]AnalysisKey     `json:"analysisKeys,omitempty"`
	// ItemFacts (see this file's header comment) is a
	// plain, unhashed snapshot of the same fields ItemFingerprints already
	// hashes, so the staleness evaluator can name why an item's fingerprint
	// changed instead of only that it did. Absent (nil) on a record written
	// before ItemFacts existed, which the evaluator treats as "identity unknown".
	ItemFacts map[string]LedgerItemFact `json:"itemFacts,omitempty"`
}

// LedgerItemFact is one item's plain-value snapshot at the moment a ledger
// record was written: exactly the fields ItemFingerprint hashes, plus a
// content-addressed summary of the active take's SourceIdentity (Path, Size,
// PartialHash - never ModTime, matching AnalysisKey's own reasoning in
// fingerprint.go) so the evaluator can tell "source replaced on disk" apart
// from "trimmed" or "playrate changed" without ever storing a raw file path
// or hash it would have to reconcile against a different project checkout.
type LedgerItemFact struct {
	Position       float64 `json:"position"`
	Length         float64 `json:"length"`
	Muted          bool    `json:"muted"`
	ActiveTake     int     `json:"activeTake"`
	SourceIdentity string  `json:"sourceIdentity"`
}

// LedgerProjectFile is the saved .rpp a record was computed against. The
// basis is always the saved project, never live REAPER state, so every result
// can state "saved project, file modified <time>".
type LedgerProjectFile struct {
	Path    string    `json:"path"`
	ModTime time.Time `json:"modTime"`
}

// LedgerRecord is one analyzer run's outcome. It records that a run happened
// and on what, never a verdict: the analyzers decide met/not_met/unknown from
// what they measured, using this record only to answer "is that result
// still current".
type LedgerRecord struct {
	ID              string            `json:"id"`
	SchemaVersion   int               `json:"schemaVersion"`
	AnalyzerID      string            `json:"analyzerId"`
	AnalyzerVersion string            `json:"analyzerVersion"`
	ParamHash       string            `json:"paramHash,omitempty"`
	Scope           LedgerScope       `json:"scope"`
	Fingerprint     LedgerFingerprint `json:"fingerprint"`
	ProjectFile     LedgerProjectFile `json:"projectFile"`
	StartedAt       time.Time         `json:"startedAt"`
	CompletedAt     time.Time         `json:"completedAt"`
	Outcome         LedgerOutcome     `json:"outcome"`
	// Counts is opaque, analyzer-defined tallies (for example
	// "itemsAnalyzed", "cacheHits") - the ledger does not assume what an
	// analyzer counts, the same "store stays opaque" principle the
	// cache applies to its blobs.
	Counts map[string]int `json:"counts,omitempty"`
	// Payload is an analyzer-defined JSON document the ledger stores and
	// returns untouched, for what Counts cannot hold: the proofing signals
	// keep a Transcript Compare run's compared set and a render
	// measurement's values here. Additive and optional: absent on every other analyzer's
	// records, so ledgerSchemaVersion stays 1.
	Payload json.RawMessage `json:"payload,omitempty"`
}

// LedgerDir is the ledger's storage directory under a project
// (<project>/<app>/analysis/ledger/, one JSON file per record). It is exported so
// manuscript.resetDerived can clear it without this package depending on
// the manuscript package.
func LedgerDir(project string) string {
	return filepath.Join(project, brand.ProjectFolder, "analysis", "ledger")
}

// LedgerStore is the one-JSON-file-per-record store. Writes
// are temp-file-then-rename (the saveNotes/SaveHints pattern), so a killed
// write never corrupts or loses a previously-written record. Zero value is
// not usable; construct with NewLedgerStore.
type LedgerStore struct {
	dir      string
	mu       sync.Mutex
	Reporter *persist.Reporter
	index    ledgerIndex
}

// NewLedgerStore returns a LedgerStore rooted at project's ledger directory.
func NewLedgerStore(project string) *LedgerStore {
	return &LedgerStore{dir: LedgerDir(project)}
}

// Write assigns record an ID when it has none, stamps its schema version,
// and writes it to its own file via a temp file plus rename. It returns the
// record as written (with ID and SchemaVersion filled in). A LedgerRecord
// is content-addressed by its ID and, once written, is never rewritten in
// place: a re-analysis writes a new record with a new ID, so Write never
// needs to check what is already on disk before it replaces anything.
func (s *LedgerStore) Write(record LedgerRecord) (LedgerRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if record.ID == "" {
		record.ID = newLedgerID()
	}
	record.SchemaVersion = ledgerSchemaVersion

	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return LedgerRecord{}, fmt.Errorf("could not create the analysis ledger: %w", err)
	}
	bytes, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return LedgerRecord{}, err
	}
	path := s.recordPath(record.ID)
	if err := persist.WriteFile(path, bytes, 0o600); err != nil {
		return LedgerRecord{}, fmt.Errorf("could not write the analysis ledger record: %w", err)
	}
	return record, nil
}

// Get reads the record with the given id. It reports false when the record
// is missing, unreadable, not valid JSON, or written by a schema newer than
// this package supports (ledgerSchemaVersion) - every one of those reads as
// "absent", never as an error the caller has to handle specially, per the
// unknown-version rule.
func (s *LedgerStore) Get(id string) (LedgerRecord, bool) {
	return s.readRecord(s.recordPath(id))
}

// Latest returns the most recently started record whose AnalyzerID and
// Scope.ChapterID match, regardless of Outcome - callers that only want a
// complete result filter Outcome themselves (the evaluator does; this
// package stays a plain store, not a policy).
func (s *LedgerStore) Latest(analyzerID, chapterID string) (LedgerRecord, bool) {
	records, err := s.List(analyzerID, chapterID)
	if err != nil || len(records) == 0 {
		return LedgerRecord{}, false
	}
	return records[0], true
}

// List returns every readable record matching analyzerID and chapterID,
// newest first (by StartedAt). Pass "" for either to match any value.
func (s *LedgerStore) List(analyzerID, chapterID string) ([]LedgerRecord, error) {
	all, err := s.All()
	if err != nil {
		return nil, err
	}
	return matchingRecords(all, analyzerID, chapterID), nil
}

// matchingRecords is List's rule over already-read records: the matches, newest first.
func matchingRecords(all []LedgerRecord, analyzerID, chapterID string) []LedgerRecord {
	matched := make([]LedgerRecord, 0, len(all))
	for _, record := range all {
		if analyzerID != "" && record.AnalyzerID != analyzerID {
			continue
		}
		if chapterID != "" && record.Scope.ChapterID != chapterID {
			continue
		}
		matched = append(matched, record)
	}
	sort.Slice(matched, func(i, j int) bool { return matched[i].StartedAt.After(matched[j].StartedAt) })
	return matched
}

// LedgerReader is what an evaluation reads the ledger through: the store itself, or one LedgerSnapshot shared by a pass
// over many chapters.
type LedgerReader interface {
	List(analyzerID, chapterID string) ([]LedgerRecord, error)
}

// LedgerSnapshot is the ledger as one listing of its folder found it. A pass over every chapter of a book takes one and
// answers each chapter from it, where asking the store lists the folder for every question (issue 3749). It is for one
// pass: take a new one for the next read, so a record written since is seen.
type LedgerSnapshot struct {
	// newestFirst is every record, sorted once; byChapter is the same records in the same order, grouped, so a chapter's
	// question reads its own records and not the book's (issue 3801).
	newestFirst []LedgerRecord
	byChapter   map[string][]LedgerRecord
}

// Snapshot lists the ledger once and returns what it holds now.
func (s *LedgerStore) Snapshot() (LedgerSnapshot, error) {
	all, err := s.All()
	return newLedgerSnapshot(all), err
}

func newLedgerSnapshot(all []LedgerRecord) LedgerSnapshot {
	sorted := matchingRecords(all, "", "")
	byChapter := map[string][]LedgerRecord{}
	for _, record := range sorted {
		byChapter[record.Scope.ChapterID] = append(byChapter[record.Scope.ChapterID], record)
	}
	return LedgerSnapshot{newestFirst: sorted, byChapter: byChapter}
}

// SnapshotWhenAsked is a reader that takes one Snapshot at its first question and answers every later one from it, so a
// read that turns out to ask nothing lists nothing. It is for one pass, as a LedgerSnapshot is; a ledger that cannot be
// listed is the error of every question.
func (s *LedgerStore) SnapshotWhenAsked() LedgerReader {
	return askedSnapshot(sync.OnceValues(s.Snapshot))
}

type askedSnapshot func() (LedgerSnapshot, error)

func (asked askedSnapshot) List(analyzerID, chapterID string) ([]LedgerRecord, error) {
	snapshot, err := asked()
	if err != nil {
		return nil, err
	}
	return snapshot.List(analyzerID, chapterID)
}

// List answers as LedgerStore.List does, from the records the snapshot was taken with.
func (snapshot LedgerSnapshot) List(analyzerID, chapterID string) ([]LedgerRecord, error) {
	records := snapshot.newestFirst
	if chapterID != "" {
		records = snapshot.byChapter[chapterID]
	}
	matched := make([]LedgerRecord, 0, len(records))
	for _, record := range records {
		if analyzerID == "" || record.AnalyzerID == analyzerID {
			matched = append(matched, record)
		}
	}
	return matched, nil
}

// All returns every readable record in the store, in no particular order. A record is decoded once and kept while its file
// is unchanged (ledgerIndex), so the records share their maps and slices with later reads: read them, never change them.
// An unreadable or wrong-schema file is skipped, not reported as an error:
// the store is meant to survive a corrupt neighbour (these are derived
// facts a re-analysis can always replace, persist.Disposable's class).
func (s *LedgerStore) All() ([]LedgerRecord, error) {
	return s.index.refresh(s.dir, func(id string) (LedgerRecord, persist.Outcome) { return s.decodeRecord(s.recordPath(id)) })
}

// Reads is the work the store's reads have done so far: how often it listed the folder and how many record files it
// decoded. It is for the tests that guard a read's cost (issue 3749).
func (s *LedgerStore) Reads() (listings, decodes int) {
	s.index.mu.Lock()
	defer s.index.mu.Unlock()
	return s.index.listings, s.index.decodes
}

// Retain prunes the ledger to its retention rule: the latest record per
// (AnalyzerID, Scope.ChapterID) is always kept, plus every record whose ID
// is in referencedIDs (a confirmation or dismissal's basis - those
// records must outlive newer runs of the same analyzer over the same
// chapter). Every other record file is deleted. It returns the IDs it
// deleted. A referenced ID that no longer exists is silently ignored, and a
// file this store cannot parse (corrupt, wrong schema, or a stray .tmp from
// an interrupted write) is left alone unless its filename's ID is neither
// referenced nor resolvable to a readable "latest" - i.e. Retain never
// deletes a name it cannot positively rule out as safe to keep, matching
// "an interrupted write leaves the previous record readable".
func (s *LedgerStore) Retain(referencedIDs []string) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	referenced := make(map[string]bool, len(referencedIDs))
	for _, id := range referencedIDs {
		referenced[id] = true
	}

	entries, err := os.ReadDir(s.dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("could not list the analysis ledger: %w", err)
	}

	type groupKey struct{ analyzerID, chapterID string }
	latestByGroup := map[groupKey]LedgerRecord{}
	readable := map[string]LedgerRecord{}
	for _, entry := range entries {
		id, ok := recordID(entry.Name())
		if !ok {
			continue
		}
		record, ok := s.readRecord(s.recordPath(id))
		if !ok {
			continue
		}
		readable[id] = record
		key := groupKey{record.AnalyzerID, record.Scope.ChapterID}
		if current, exists := latestByGroup[key]; !exists || record.StartedAt.After(current.StartedAt) {
			latestByGroup[key] = record
		}
	}
	keep := map[string]bool{}
	for _, record := range latestByGroup {
		keep[record.ID] = true
	}

	var deleted []string
	for id := range readable {
		if keep[id] || referenced[id] {
			continue
		}
		if err := os.Remove(s.recordPath(id)); err != nil {
			return deleted, fmt.Errorf("could not prune analysis ledger record %s: %w", id, err)
		}
		deleted = append(deleted, id)
	}
	sort.Strings(deleted)
	return deleted, nil
}

// recordFileName is what a record id may look like to name a file: newLedgerID's 32 hex digits or "ledger-<nanoseconds>".
var recordFileName = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

// RecordFileName is the file name of data kept for one ledger record beside the ledger (a stored result, its summary):
// the record's id and ".json". It reports false for an id that is not one a record can have, so no id read from a file
// becomes part of a path unchecked.
func RecordFileName(recordID string) (string, bool) {
	if !recordFileName.MatchString(recordID) {
		return "", false
	}
	return recordID + ".json", true
}

func (s *LedgerStore) recordPath(id string) string {
	return filepath.Join(s.dir, id+".json")
}

func (s *LedgerStore) readRecord(path string) (LedgerRecord, bool) {
	record, outcome := s.decodeRecord(path)
	return record, outcome == persist.Loaded
}

// decodeRecord reads and decodes one record file, with how the read went: only persist.Loaded carries a record.
func (s *LedgerStore) decodeRecord(path string) (LedgerRecord, persist.Outcome) {
	var record LedgerRecord
	outcome := s.Reporter.ReadJSON(path, "analysis ledger record", persist.Disposable, func(raw []byte) error {
		var decoded LedgerRecord
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return err
		}
		if decoded.SchemaVersion > ledgerSchemaVersion {
			return fmt.Errorf("schema version %d newer than supported %d", decoded.SchemaVersion, ledgerSchemaVersion)
		}
		// A record is found by its file's name and by the id inside it; a file copied or renamed by hand would answer for both.
		if id, _ := recordID(filepath.Base(path)); decoded.ID != id {
			return fmt.Errorf("record id %q does not match its file name", decoded.ID)
		}
		record = decoded
		return nil
	})
	return record, outcome
}

// recordID reports the record ID a ledger file's name carries: any name
// ending in ".json" other than a stray ".tmp" file left by an interrupted
// Write (path+".tmp" never ends in ".json", so it is already excluded by
// the suffix check, but the explicit check documents the intent).
func recordID(name string) (string, bool) {
	if !strings.HasSuffix(name, ".json") || strings.HasSuffix(name, ".tmp") {
		return "", false
	}
	return strings.TrimSuffix(name, ".json"), true
}

func newLedgerID() string {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return fmt.Sprintf("ledger-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(raw)
}
