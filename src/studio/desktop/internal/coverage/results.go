package coverage

import (
	"desktop/internal/brand"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"desktop/internal/evidence"
	"desktop/internal/persist"
)

// storedResultVersion is the version of a stored coverage result.
const storedResultVersion = 1

// Dir is where coverage keeps its own data under a project: the stored results
// and, while a run is going, its working folder. manuscript.resetDerived clears
// it with the ledger and cache, since results name chapter and paragraph ids a
// re-import resets.
func Dir(project string) string {
	return filepath.Join(project, folder)
}

// folder is Dir below the project folder, and resultsFolder and summariesFolder are the two stores' folders there.
var (
	folder          = filepath.Join(brand.ProjectFolder, "analysis", "coverage")
	resultsFolder   = filepath.Join(folder, "results")
	summariesFolder = filepath.Join(folder, "summaries")
)

func resultsDir(project string) string { return filepath.Join(project, resultsFolder) }

func summariesDir(project string) string { return filepath.Join(project, summariesFolder) }

func runsDir(project string) string { return filepath.Join(Dir(project), "runs") }

// StoredResult is a complete run's report and the labels that go with it,
// stored beside its ledger record (the record holds counts only). The labels
// the record's parameter hash leaves out on purpose - model and language (Q13)
// - are here, so the evidence can name them.
type StoredResult struct {
	SchemaVersion    int             `json:"schemaVersion"`
	RecordID         string          `json:"recordId"`
	DocumentID       string          `json:"documentId"`
	ChapterID        string          `json:"chapterId"`
	ManuscriptHash   string          `json:"manuscriptHash"`
	Model            string          `json:"model"`
	Language         string          `json:"language,omitempty"`
	HotwordsHash     string          `json:"hotwordsHash,omitempty"`
	EquivalencesHash string          `json:"equivalencesHash,omitempty"`
	Alignment        AlignmentParams `json:"alignment"`
	Report           Report          `json:"report"`
	// Recheck is the model cascade's second pass over this report (MC5):
	// set only when the run asked for one (Request.Recheck.Model) and the first pass reported at least one region,
	// so Report's remaining regions are exactly what the stronger model still could not hear. Nil for a plain,
	// single-model check, keeping an older stored result reading exactly as it always did.
	Recheck *Recheck `json:"recheck,omitempty"`
}

// Recheck names the model cascade's second pass (MC5: the result names both models and how many windows were
// re-checked): Model stays the first pass's own model (Q13 compatibility), so this is the other one.
type Recheck struct {
	Model        string  `json:"model"`
	WholeChapter bool    `json:"wholeChapter"`
	Windows      int     `json:"windows"`
	Seconds      float64 `json:"seconds"`
}

// resultStore keeps one StoredResult per complete ledger record.
type resultStore struct {
	dir      string
	reporter *persist.Reporter
	cache    *resultCache
}

// resultCacheSize is how many decoded results stay in memory: the chapters the Editing and Booth pages switch between.
const resultCacheSize = 4

// resultCache keeps the decoded stored results of the latest reads, each valid for the file's size and modification time. A stored result is
// written once, atomically, under its record's id, so a read of an unchanged file is the same answer; decoding it is most of the cost of
// reading a chapter's alignment (about 23 of the 25 ms for a 9,000-word chapter), and the Editing page reads it again for every edit in the DAW.
type resultCache struct {
	mu sync.Mutex
	// +checklocks:mu
	entries []resultCacheEntry
	// +checklocks:mu
	epoch uint64
	// decoded counts the result files decoded, for the tests that guard what a read of every chapter costs.
	decoded atomic.Int64
}

type resultCacheEntry struct {
	recordID string
	modTime  time.Time
	size     int64
	result   StoredResult
}

func newResultCache() *resultCache { return &resultCache{} }

func (c *resultCache) get(recordID string, info os.FileInfo) (StoredResult, bool) {
	if c == nil {
		return StoredResult{}, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for i, entry := range c.entries {
		if entry.recordID == recordID && entry.modTime.Equal(info.ModTime()) && entry.size == info.Size() {
			// The entry read last is the one kept longest: a sweep over other chapters must not push out the one the page is on.
			reordered := make([]resultCacheEntry, 0, resultCacheSize+1)
			reordered = append(reordered, c.entries[:i]...)
			reordered = append(reordered, c.entries[i+1:]...)
			c.entries = append(reordered, entry)
			return entry.result.cloned(), true
		}
	}
	return StoredResult{}, false
}

// now is the cache's epoch, which every drop moves: a reader takes it before it decodes, and put refuses a result decoded across a drop
// (a write of that record, or another reader's miss), so content read before a write is never stored after it.
func (c *resultCache) now() uint64 {
	if c == nil {
		return 0
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.epoch
}

func (c *resultCache) put(recordID string, info os.FileInfo, result StoredResult, epoch uint64) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.epoch != epoch {
		return
	}
	c.dropLocked(recordID)
	entries := append(c.entries, resultCacheEntry{recordID: recordID, modTime: info.ModTime(), size: info.Size(), result: result.cloned()})
	if len(entries) > resultCacheSize {
		entries = entries[len(entries)-resultCacheSize:]
	}
	// A slice of its own, so an entry that left is not kept alive by the backing array.
	c.entries = append(make([]resultCacheEntry, 0, resultCacheSize+1), entries...)
}

func (c *resultCache) drop(recordID string) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.dropLocked(recordID)
}

// +checklocks:c.mu
func (c *resultCache) dropLocked(recordID string) {
	c.epoch++
	kept := make([]resultCacheEntry, 0, resultCacheSize+1)
	for _, entry := range c.entries {
		if entry.recordID != recordID {
			kept = append(kept, entry)
		}
	}
	c.entries = kept
}

// cloned is the result with its own slices, so a caller that changes the lists it was given changes nothing another read will see. The
// lines inside them are copied by value (their pointers are shared and never written).
func (r StoredResult) cloned() StoredResult {
	r.Report.Items = append([]ItemLine(nil), r.Report.Items...)
	r.Report.Paragraphs = append([]ParagraphLine(nil), r.Report.Paragraphs...)
	r.Report.Regions = append([]RegionLine(nil), r.Report.Regions...)
	r.Report.Tokens = append([]TokenLine(nil), r.Report.Tokens...)
	r.Report.Extras = append([]ExtraLine(nil), r.Report.Extras...)
	if r.Recheck != nil {
		recheck := *r.Recheck
		r.Recheck = &recheck
	}
	return r
}

func (s resultStore) path(recordID string) (string, error) {
	name, ok := evidence.RecordFileName(recordID)
	if !ok {
		return "", fmt.Errorf("%q is not a ledger record id", recordID)
	}
	return filepath.Join(s.dir, name), nil
}

func (s resultStore) write(result StoredResult) error {
	path, err := s.path(result.RecordID)
	if err != nil {
		return err
	}
	result.SchemaVersion = storedResultVersion
	encoded, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return err
	}
	s.cache.drop(result.RecordID)
	if err := writeAtomically(path, encoded); err != nil {
		return fmt.Errorf("could not store the coverage result: %w", err)
	}
	return nil
}

// exists reports whether the record's result file is there, without reading it.
func (s resultStore) exists(recordID string) bool {
	path, err := s.path(recordID)
	if err != nil {
		return false
	}
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}

// read returns the stored result for a record, or false when it is missing,
// unreadable, or of another version: derived data a new run replaces.
func (s resultStore) read(recordID string) (StoredResult, bool) {
	path, err := s.path(recordID)
	if err != nil {
		return StoredResult{}, false
	}
	info, statErr := os.Stat(path)
	if statErr == nil {
		if cached, ok := s.cache.get(recordID, info); ok {
			return cached, true
		}
	}
	// The file is gone or is not the one cached: what was cached for the record is not served again, whatever the file now holds.
	s.cache.drop(recordID)
	epoch := s.cache.now()
	result, outcome := s.decode(path, recordID)
	if outcome == persist.Loaded && statErr == nil {
		s.cache.put(recordID, info, result, epoch)
	}
	return result, outcome == persist.Loaded
}

// readUncached is read past the decoded-result cache, for a caller that reads many results once each (the summaries'
// rebuild): it neither fills the cache nor pushes out the entries the Editing and Booth pages are reading, and several
// may run at once, which the cache's epoch would turn into refused fills.
func (s resultStore) readUncached(recordID string) (StoredResult, bool) {
	path, err := s.path(recordID)
	if err != nil {
		return StoredResult{}, false
	}
	result, outcome := s.decode(path, recordID)
	return result, outcome == persist.Loaded
}

// decode reads and checks one result file.
func (s resultStore) decode(path, recordID string) (StoredResult, persist.Outcome) {
	var result StoredResult
	outcome := s.reporter.ReadJSON(path, "coverage result", persist.Disposable, func(raw []byte) error {
		var decoded StoredResult
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return err
		}
		if decoded.SchemaVersion != storedResultVersion || decoded.RecordID != recordID {
			return fmt.Errorf("coverage result %s is version %d", recordID, decoded.SchemaVersion)
		}
		result = decoded
		return nil
	})
	if outcome == persist.Loaded && s.cache != nil {
		s.cache.decoded.Add(1)
	}
	return result, outcome
}

// RemoveStoredResult deletes what coverage stored for the ledger record recordID: its stored result, then that
// result's summary, from disk and from memory. It is for evidence.LedgerStore.Retain's beforeDelete, which calls it
// before the record's own file goes, so the order for each dropped record is result, summary, record. The result goes
// first because a summary whose result is there is rebuilt by a read (Service.summary); a read that was already
// rebuilding it may store the summary again afterwards, and SweepOrphanResults finds that file once the record is
// gone. A step that fails leaves the later ones undone, and the record with them, so the next pass starts again here.
// Each delete is persist.RemoveRegular rooted at the project folder: a file that is not there is done already, and a
// link or folder in its place is left alone.
func (s *Service) RemoveStoredResult(recordID string) error {
	_, err := s.removeStored(recordID)
	return err
}

// removeStored is RemoveStoredResult, reporting whether it deleted a file.
func (s *Service) removeStored(recordID string) (bool, error) {
	name, ok := evidence.RecordFileName(recordID)
	if !ok {
		return false, fmt.Errorf("%q is not a ledger record id", recordID)
	}
	result, err := persist.RemoveRegular(s.config.Project, filepath.Join(resultsFolder, name))
	if err != nil {
		return false, fmt.Errorf("could not remove the coverage result of record %s: %w", recordID, err)
	}
	s.results.cache.drop(recordID)
	s.summaries.forget(recordID)
	summary, err := persist.RemoveRegular(s.config.Project, filepath.Join(summariesFolder, name))
	if err != nil {
		return result, fmt.Errorf("could not remove the coverage result summary of record %s: %w", recordID, err)
	}
	return result || summary, nil
}

// SweepOrphanResults deletes every stored result and summary whose record has no file in the ledger folder, and returns
// the record ids it deleted for. It finishes what a pass of evidence.LedgerStore.Retain left when it stopped between
// a record's steps or a read stored a summary behind it. A record file that is there protects its result whether or
// not it can be read (evidence.LedgerStore.RecordFileIDs), and a ledger folder that is missing or cannot be listed
// protects everything. The stored files are listed before the ledger: a run writes its record before its result, so
// the record of every result listed is in the later ledger listing unless it has been deleted.
func (s *Service) SweepOrphanResults() ([]string, error) {
	stored := map[string]bool{}
	for _, dir := range []string{s.results.dir, s.summaries.dir} {
		entries, err := persist.ReadDir(dir)
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return nil, fmt.Errorf("could not list the stored coverage results: %w", err)
		}
		for _, entry := range entries {
			if id, isJSON := strings.CutSuffix(entry.Name(), ".json"); isJSON {
				stored[id] = true
			}
		}
	}
	recorded, err := s.ledger.RecordFileIDs()
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var removed []string
	for _, id := range slices.Sorted(maps.Keys(stored)) {
		if _, isRecordID := evidence.RecordFileName(id); !isRecordID || recorded[id] {
			continue
		}
		deleted, err := s.removeStored(id)
		if err != nil {
			return removed, err
		}
		if deleted {
			removed = append(removed, id)
		}
	}
	return removed, nil
}

// ChapterResult is what the result reader answers for a chapter: whether the
// newest complete coverage run is still current for the saved project, the
// manuscript and the alignment parameters, and its stored report.
type ChapterResult struct {
	// State is current, stale or never (evidence.EvaluatorState).
	State evidence.EvaluatorState `json:"state"`
	// Reasons are the evaluator's reasons (item_trimmed, params_changed, ...)
	// plus this package's own (manuscript_changed, result_missing), and for a
	// chapter that cannot be evaluated at all, one refusal Reason.
	Reasons []string `json:"reasons"`
	// Basis is "saved project, file modified <time>" (Q6), when there is one.
	Basis *evidence.EvaluationBasis `json:"basis,omitempty"`
	// Record is the ledger record compared against, when there is one.
	Record *evidence.LedgerRecord `json:"record,omitempty"`
	// Result is that record's stored report and labels, when readable.
	Result *StoredResult `json:"result,omitempty"`
}

// Current reports whether the result can be read as a measurement of the
// chapter as it is now (the only case that may fill recordedFraction or feed
// the recording signal).
func (r ChapterResult) Current() bool {
	return r.State == evidence.StateCurrent && r.Result != nil
}
