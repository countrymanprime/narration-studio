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

// ResultsDir is the folder of the stored results under a project.
func ResultsDir(project string) string { return resultsDir(project) }

// SummariesDir is the folder of the stored result summaries under a project.
func SummariesDir(project string) string { return filepath.Join(project, summariesFolder) }

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

// resultCache keeps the decoded stored results of the latest reads, each held by the hash of the bytes it was decoded from: a read reads and
// hashes the file and decodes it only when its bytes changed. Decoding is most of the cost of reading a chapter's alignment (about 23 of the
// 25 ms for a 9,000-word chapter), and the Editing page reads it again for every edit in the DAW.
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
	held     persist.Held[StoredResult]
}

func newResultCache() *resultCache { return &resultCache{} }

// get is what is held for the record, for the reader to check against the file's bytes (persist.ReadHeld), and nothing when there is none.
// The entry moves to the end, the one kept longest: a sweep over other chapters must not push out the one the page is on.
func (c *resultCache) get(recordID string) persist.Held[StoredResult] {
	if c == nil {
		return persist.Held[StoredResult]{}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for i, entry := range c.entries {
		if entry.recordID == recordID {
			reordered := make([]resultCacheEntry, 0, resultCacheSize+1)
			reordered = append(reordered, c.entries[:i]...)
			reordered = append(reordered, c.entries[i+1:]...)
			c.entries = append(reordered, entry)
			return entry.held
		}
	}
	return persist.Held[StoredResult]{}
}

// now is the cache's epoch, which every drop moves: a reader takes it before it decodes, and put refuses a result decoded across a drop
// (a write of that record, or another reader's decode), so content read before a write is never stored after it.
func (c *resultCache) now() uint64 {
	if c == nil {
		return 0
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.epoch
}

func (c *resultCache) put(recordID string, held persist.Held[StoredResult], epoch uint64) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.epoch != epoch {
		return
	}
	c.dropLocked(recordID)
	entries := append(c.entries, resultCacheEntry{recordID: recordID, held: held})
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
// unreadable, or of another version: derived data a new run replaces. The file is read and hashed on every call and decoded
// only when its bytes are not the ones the cached result came from.
func (s resultStore) read(recordID string) (StoredResult, bool) {
	path, err := s.path(recordID)
	if err != nil {
		return StoredResult{}, false
	}
	epoch := s.cache.now()
	held := s.cache.get(recordID)
	decoded := false
	result, outcome := persist.ReadHeld(s.reporter, path, resultFileName, persist.Disposable, &held, func(raw []byte) (StoredResult, error) {
		decoded = true
		return decodeResult(raw, recordID)
	})
	switch {
	case outcome != persist.Loaded:
		// The file is gone or does not decode: what was cached for the record is not served again.
		s.cache.drop(recordID)
	case decoded:
		s.countDecode()
		s.cache.put(recordID, held, epoch)
	}
	return result.cloned(), outcome == persist.Loaded
}

// readUncached is read past the decoded-result cache, for a caller that reads many results once each (the summaries'
// rebuild): it neither fills the cache nor pushes out the entries the Editing and Booth pages are reading, and several
// may run at once, which the cache's epoch would turn into refused fills.
func (s resultStore) readUncached(recordID string) (StoredResult, bool) {
	path, err := s.path(recordID)
	if err != nil {
		return StoredResult{}, false
	}
	var result StoredResult
	outcome := s.reporter.ReadJSON(path, resultFileName, persist.Disposable, func(raw []byte) (err error) {
		result, err = decodeResult(raw, recordID)
		return err
	})
	if outcome != persist.Loaded {
		return StoredResult{}, false
	}
	s.countDecode()
	return result, true
}

// resultFileName names a result file in the host log.
const resultFileName = "coverage result"

// decodeResult decodes and checks one result file's bytes.
func decodeResult(raw []byte, recordID string) (StoredResult, error) {
	var decoded StoredResult
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return StoredResult{}, err
	}
	if decoded.SchemaVersion != storedResultVersion || decoded.RecordID != recordID {
		return StoredResult{}, fmt.Errorf("coverage result %s is version %d", recordID, decoded.SchemaVersion)
	}
	return decoded, nil
}

func (s resultStore) countDecode() {
	if s.cache != nil {
		s.cache.decoded.Add(1)
	}
}

// RemoveStoredResult deletes what coverage stored for the ledger record recordID: its stored result, then that
// result's summary, from disk and from memory. It is for evidence.LedgerStore.Retain's beforeDelete, which calls it
// before the record's own file goes, so the order for each dropped record is result, summary, record. The result goes
// first because a summary whose result is there is rebuilt by a read (Service.summary); a read that was already
// rebuilding it may store the summary again afterwards, and SweepOrphanResults finds that file once the record is
// gone. A step that fails leaves the later ones undone, and the record with them, so the next pass starts again here.
// Each delete is persist.RemoveRegular rooted at the project folder: a file that is not there is done already, a
// link or folder in its place is left alone, and a results or summaries folder that is a link, or is below one, is an
// error with nothing deleted through it.
func (s *Service) RemoveStoredResult(recordID string) error {
	name, ok := evidence.RecordFileName(recordID)
	if !ok {
		return fmt.Errorf("%q is not a ledger record id", recordID)
	}
	if _, err := persist.RemoveRegular(s.config.Project, filepath.Join(resultsFolder, name)); err != nil {
		return fmt.Errorf("could not remove the coverage result of record %s: %w", recordID, err)
	}
	s.results.cache.drop(recordID)
	s.summaries.forget(recordID)
	if _, err := persist.RemoveRegular(s.config.Project, filepath.Join(summariesFolder, name)); err != nil {
		return fmt.Errorf("could not remove the coverage result summary of record %s: %w", recordID, err)
	}
	return nil
}

// SweepOrphanResults deletes every stored result and summary whose record has no file in the ledger folder, and returns
// the record ids it deleted for. It finishes what a pass of evidence.LedgerStore.Retain left when it stopped between
// a record's steps or a read stored a summary behind it.
//
// A record file that is there protects its result whether or not it can be read (evidence.LedgerStore.RecordFileIDs).
// A ledger folder that is missing, that holds no record file at all, or that cannot be listed protects everything: a
// ledger that is away for a moment (a folder being synced or moved) must not cost every result. The stored files are
// listed before the ledger: a run writes its record before its result, so the record of every result listed is in the
// later ledger listing unless it has been deleted.
//
// It deletes only what this package stored: a regular file in the results or the summaries folder, named by a record
// id, that decodes as a stored result (or summary) of that record. Any other file there is left and not reported. Only
// a file with no record is read for this, so a sweep that finds no orphan decodes nothing. A results, summaries or
// ledger folder that is a link, or is below one, is an error before anything is deleted (persist.RealFolder): it would
// list another folder's files.
func (s *Service) SweepOrphanResults() ([]string, error) {
	// The ledger must be this project's: another project's ledger holds none of this project's records, so every result here would be an orphan.
	if filepath.Clean(s.ledger.Project()) != filepath.Clean(s.config.Project) {
		return nil, fmt.Errorf("could not sweep the stored coverage results: the ledger belongs to another project (%s)", s.ledger.Project())
	}
	stored := map[string]bool{}
	for _, dir := range []string{resultsFolder, summariesFolder} {
		if _, err := persist.RealFolder(s.config.Project, dir); err != nil {
			return nil, fmt.Errorf("could not list the stored coverage results: %w", err)
		}
		entries, err := persist.ReadDir(filepath.Join(s.config.Project, dir))
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return nil, fmt.Errorf("could not list the stored coverage results: %w", err)
		}
		for _, entry := range entries {
			if id, isJSON := strings.CutSuffix(entry.Name(), ".json"); isJSON {
				stored[id] = true
			}
		}
	}
	if s.sweepListed != nil {
		s.sweepListed()
	}
	recorded, err := s.ledger.RecordFileIDs()
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if len(recorded) == 0 {
		return nil, nil
	}
	var removed []string
	for _, id := range slices.Sorted(maps.Keys(stored)) {
		if _, isRecordID := evidence.RecordFileName(id); !isRecordID || recorded[id] {
			continue
		}
		result, err := s.removeOrphan(resultsFolder, id, isStoredResult)
		if err != nil {
			return removed, fmt.Errorf("could not remove the coverage result of record %s: %w", id, err)
		}
		s.results.cache.drop(id)
		s.summaries.forget(id)
		summary, err := s.removeOrphan(summariesFolder, id, isStoredSummary)
		if err != nil {
			return removed, fmt.Errorf("could not remove the coverage result summary of record %s: %w", id, err)
		}
		if result || summary {
			removed = append(removed, id)
		}
	}
	return removed, nil
}

// removeOrphan deletes the file kept for record id in one of the two stores' folders when it is a regular file that
// stored says is that store's own, and reports whether it deleted one. The file is opened only once it is known to be
// a regular file in real folders, so nothing that is not one (a named pipe, a link) is read.
func (s *Service) removeOrphan(dir, id string, stored func(raw []byte, id string) bool) (bool, error) {
	file := filepath.Join(dir, id+".json")
	regular, err := persist.IsRegular(s.config.Project, file)
	if err != nil || !regular {
		return false, err
	}
	own := false
	// No reporter: a file that is not this package's is left as it is found, and is nothing to write to the log.
	(*persist.Reporter)(nil).ReadJSON(filepath.Join(s.config.Project, file), "stored coverage file", persist.Disposable, func(raw []byte) error {
		own = stored(raw, id)
		return nil
	})
	if !own {
		return false, nil
	}
	return persist.RemoveRegular(s.config.Project, file)
}

// isStoredResult reports whether raw is a result this package stored for record id: a StoredResult that names the
// record and carries the version every write stamps (any version, so a result an older build stored is one too).
func isStoredResult(raw []byte, id string) bool {
	var result StoredResult
	return json.Unmarshal(raw, &result) == nil && result.RecordID == id && result.SchemaVersion > 0
}

// isStoredSummary is isStoredResult for a ResultSummary, which also carries the version of the result it was made from.
func isStoredSummary(raw []byte, id string) bool {
	var summary ResultSummary
	return json.Unmarshal(raw, &summary) == nil && summary.RecordID == id && summary.SchemaVersion > 0 && summary.ResultVersion > 0
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
