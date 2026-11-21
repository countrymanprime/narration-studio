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
	"errors"
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
	return filepath.Join(project, ledgerFolder)
}

// ledgerFolder is LedgerDir below the project folder.
var ledgerFolder = filepath.Join(brand.ProjectFolder, "analysis", "ledger")

// LedgerStore is the one-JSON-file-per-record store. Writes
// are temp-file-then-rename (the saveNotes/SaveHints pattern), so a killed
// write never corrupts or loses a previously-written record. Zero value is
// not usable; construct with NewLedgerStore.
type LedgerStore struct {
	// project is the folder dir is under: a delete is rooted there (deletable).
	project  string
	dir      string
	mu       sync.Mutex
	Reporter *persist.Reporter
	index    ledgerIndex
}

// NewLedgerStore returns a LedgerStore rooted at project's ledger directory.
func NewLedgerStore(project string) *LedgerStore {
	return &LedgerStore{project: project, dir: LedgerDir(project)}
}

// Project is the project folder this store keeps its records under.
func (s *LedgerStore) Project() string { return s.project }

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
	// What is held is the written bytes decoded, not the caller's record: a later read answers what the file holds, and
	// nothing the caller does to its record afterwards reaches it.
	if held, err := decodeRecord(path, bytes); err == nil {
		s.index.put(record.ID, persist.Sum(bytes), held)
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

// All returns every readable record in the store, in no particular order. A record is decoded once and kept while its file's
// bytes are unchanged (ledgerIndex), so the records share their maps and slices with later reads: read them,
// never change them.
// An unreadable or wrong-schema file is skipped, not reported as an error:
// the store is meant to survive a corrupt neighbour (these are derived
// facts a re-analysis can always replace, persist.Disposable's class).
func (s *LedgerStore) All() ([]LedgerRecord, error) {
	return s.index.refresh(s.dir, s.Reporter, decodeRecord)
}

// Reads is the work the store's reads have done so far: how often it listed the folder and how many record files it
// decoded. It is for the tests that guard a read's cost (issue 3749).
func (s *LedgerStore) Reads() (listings, decodes int) {
	s.index.mu.Lock()
	defer s.index.mu.Unlock()
	return s.index.listings, s.index.decodes
}

// RetentionKey names the group a record belongs to for LedgerStore.Retain, beyond its analyzer, document and chapter:
// the part of the record its reader matches on (an item, a render), or "" when the reader matches on nothing more. Each
// package that reads an analyzer's records exports the key for them, beside the reader it has to agree with. ok is
// false for a record the key cannot place (a payload it cannot read), and Retain keeps such a record.
type RetentionKey func(record LedgerRecord) (group string, ok bool)

// Retain deletes the records no reader selects any more, and returns the ones it deleted, oldest first.
//
// keys holds one RetentionKey per analyzer id. Records are grouped by analyzer, document, chapter and that key's
// group. A group keeps every record down to its newest complete one, newest first by StartedAt (a tie included),
// because a reader takes the newest complete record and passes over a newer partial or failed one
// (latestCompleteRecord), or takes the newest of any outcome. It also keeps a record that ended after every record
// kept that way did, which newestRecordTime reads. A group with no complete record keeps everything, and so does an
// analyzer with no key and a record whose key answers false. A record whose id is in referenced is kept wherever it
// stands (the basis of a confirmation or a dismissal).
//
// beforeDelete, when set, is called with each record just before its file is deleted. It is where data stored beside a
// record under its id is removed, so the record goes last: a pass that stops halfway leaves the record, and the next
// pass finds it and what is left of its data. It runs with the store's lock held, so it does not write to this store.
//
// A record whose beforeDelete fails, or whose file cannot be deleted, stays, and the pass goes on to the next one: the
// records returned are the ones that went, and the error joins (errors.Join) one error for each record that stayed. A
// panic in a key or in beforeDelete is not caught: it ends the pass where it is, with the lock released and every
// record not yet deleted still there.
//
// Retain reads the records the way a reader does (All), so a file no reader can decode (corrupt, a newer schema, a
// temporary file of a write, locked) is never deleted and never counts as the complete record that would let older
// ones go; seeing fewer records only ever deletes fewer. Of the records it would drop, it deletes only a regular file
// whose name RecordFileName accepts, through persist.RemoveRegular rooted at the project folder: a link or a folder in
// a record's place is left alone, with no call of beforeDelete. A ledger folder that is a link, or is below one, is
// read by the readers but nothing is deleted through it: that is an error before any record is tried
// (persist.RealFolder). The store's lock keeps a Write through this store out meanwhile; a record another store writes
// in between is newer than every record chosen, so it could not have kept one of them.
func (s *LedgerStore) Retain(keys map[string]RetentionKey, referenced map[string]bool, beforeDelete func(LedgerRecord) error) ([]LedgerRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer persist.Advance()

	records, err := s.All()
	if err != nil {
		return nil, err
	}
	drop := superseded(records, keys, referenced)
	if len(drop) == 0 {
		return nil, nil
	}
	if _, err := persist.RealFolder(s.project, ledgerFolder); err != nil {
		return nil, fmt.Errorf("could not prune the analysis ledger: %w", err)
	}
	var dropped []LedgerRecord
	var kept []error
	for _, record := range drop {
		removed, err := s.drop(record, beforeDelete)
		if err != nil {
			kept = append(kept, err)
		}
		if removed {
			dropped = append(dropped, record)
		}
	}
	return dropped, errors.Join(kept...)
}

// drop is Retain for one record: beforeDelete, then the record's file. It reports whether the file went.
func (s *LedgerStore) drop(record LedgerRecord, beforeDelete func(LedgerRecord) error) (bool, error) {
	project, file, ok := s.deletable(record.ID)
	if !ok {
		return false, nil
	}
	regular, err := persist.IsRegular(project, file)
	if err != nil {
		return false, fmt.Errorf("could not prune analysis ledger record %s: %w", record.ID, err)
	}
	if !regular {
		return false, nil
	}
	if beforeDelete != nil {
		if err := beforeDelete(record); err != nil {
			return false, fmt.Errorf("could not prune what is stored for analysis ledger record %s: %w", record.ID, err)
		}
	}
	removed, err := persist.RemoveRegular(project, file)
	if err != nil {
		return false, fmt.Errorf("could not prune analysis ledger record %s: %w", record.ID, err)
	}
	return removed, nil
}

// deletable is where a delete of the record's file goes: the project folder to root it at and the file's path below
// it. ok is false for an id RecordFileName refuses, whose file Retain did not name and does not delete.
func (s *LedgerStore) deletable(id string) (project, file string, ok bool) {
	name, ok := RecordFileName(id)
	return s.project, filepath.Join(ledgerFolder, name), ok
}

// retentionGroup is what Retain groups records by.
type retentionGroup struct{ analyzerID, documentID, chapterID, group string }

// superseded is Retain's rule over already-read records: the ones to delete, oldest first.
func superseded(records []LedgerRecord, keys map[string]RetentionKey, referenced map[string]bool) []LedgerRecord {
	groups := map[retentionGroup][]LedgerRecord{}
	for _, record := range records {
		key := keys[record.AnalyzerID]
		if key == nil {
			continue
		}
		if group, ok := key(record); ok {
			in := retentionGroup{record.AnalyzerID, record.Scope.DocumentID, record.Scope.ChapterID, group}
			groups[in] = append(groups[in], record)
		}
	}
	var drop []LedgerRecord
	for _, group := range groups {
		complete, found := newestCompleteStart(group)
		if !found {
			continue
		}
		var keptEnd time.Time
		for _, record := range group {
			if !record.StartedAt.Before(complete) && recordEnd(record).After(keptEnd) {
				keptEnd = recordEnd(record)
			}
		}
		for _, record := range group {
			if record.StartedAt.Before(complete) && !recordEnd(record).After(keptEnd) && !referenced[record.ID] {
				drop = append(drop, record)
			}
		}
	}
	sort.Slice(drop, func(i, j int) bool {
		if !drop[i].StartedAt.Equal(drop[j].StartedAt) {
			return drop[i].StartedAt.Before(drop[j].StartedAt)
		}
		return drop[i].ID < drop[j].ID
	})
	return drop
}

// newestCompleteStart is when the newest complete record among records started.
func newestCompleteStart(records []LedgerRecord) (time.Time, bool) {
	var newest time.Time
	found := false
	for _, record := range records {
		if record.Outcome == LedgerComplete && (!found || record.StartedAt.After(newest)) {
			newest, found = record.StartedAt, true
		}
	}
	return newest, found
}

// RecordFileIDs is the id of every entry in the ledger folder that is a record's file or carries a record's file name
// before a further suffix (a write's temporary file), whatever it is and whether or not it can be read. It is for
// deciding that data stored under an id has no record left: an id listed here still has one, readable or not. A ledger
// folder that is not there is an error that is fs.ErrNotExist, and one that is a link, or is below one, is an error
// too (persist.RealFolder): what it lists is another folder's files, which say nothing of this project's records.
func (s *LedgerStore) RecordFileIDs() (map[string]bool, error) {
	if _, err := persist.RealFolder(s.project, ledgerFolder); err != nil {
		return nil, fmt.Errorf("could not list the analysis ledger: %w", err)
	}
	entries, err := persist.ReadDir(s.dir)
	if err != nil {
		return nil, fmt.Errorf("could not list the analysis ledger: %w", err)
	}
	ids := make(map[string]bool, len(entries))
	for _, entry := range entries {
		if id, _, found := strings.Cut(entry.Name(), ".json"); found {
			ids[id] = true
		}
	}
	return ids, nil
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

// readRecord reads and decodes one record file; false is a file that is missing or does not read as a record.
func (s *LedgerStore) readRecord(path string) (LedgerRecord, bool) {
	var record LedgerRecord
	outcome := s.Reporter.ReadJSON(path, ledgerRecordName, persist.Disposable, func(raw []byte) (err error) {
		record, err = decodeRecord(path, raw)
		return err
	})
	return record, outcome == persist.Loaded
}

// decodeRecord decodes the bytes of the record file at path.
func decodeRecord(path string, raw []byte) (LedgerRecord, error) {
	var decoded LedgerRecord
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return LedgerRecord{}, err
	}
	if decoded.SchemaVersion > ledgerSchemaVersion {
		return LedgerRecord{}, fmt.Errorf("schema version %d newer than supported %d", decoded.SchemaVersion, ledgerSchemaVersion)
	}
	// A record is found by its file's name and by the id inside it; a file copied or renamed by hand would answer for both.
	if id, _ := recordID(filepath.Base(path)); decoded.ID != id {
		return LedgerRecord{}, fmt.Errorf("record id %q does not match its file name", decoded.ID)
	}
	return decoded, nil
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
