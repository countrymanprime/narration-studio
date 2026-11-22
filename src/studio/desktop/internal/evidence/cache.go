// This file holds the per-item result cache: per-source features (a
// silence run over the whole source, a transcript's words over the whole
// source), sliced to an item's played range on read, not per-played-range
// results. A trim changes the played range; a per-range entry would miss after
// every trim, while a whole-source entry survives it, because the cache key
// deliberately excludes the played range for a sliceable analyzer.
//
// Callers: the recording coverage service (src/studio/desktop/internal/coverage,
// words.go) keeps each source's transcript words here;
// src/studio/desktop/internal/manuscript/service.go's resetDerived adds CacheDir to
// the directories a manuscript reset clears. The data schema is a small JSON
// envelope (see cacheEnvelope) wrapping an opaque blob, versioned by its own
// SchemaVersion field (cacheSchemaVersion). The store never looks inside the
// blob: it keys and stores bytes, and each analyzer defines its own format.
package evidence

import (
	"desktop/internal/brand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"sync/atomic"
	"time"

	"desktop/internal/persist"
)

// cacheSchemaVersion is the schema version every entry written by this
// package carries. A file written by a newer version of the app reads as a
// miss, never as an error the narrator has to fix: an unknown version is
// treated as absent.
const cacheSchemaVersion = 1

// CacheEntryKey identifies one cache entry: a
// source's identity, which analyzer produced the entry and at what version,
// and the analyzer's parameter hash. PlayedRange is nil for a sliceable
// entry (a whole-source feature set an analyzer slices itself
// on read, per SliceFeatures below) - deliberately excluding the played
// range from the key so a trim, which only narrows or moves the played
// range, keeps hitting the same entry. PlayedRange is set only for a
// analyzer that cannot slice its own result and instead caches one blob per
// played range (an escape hatch, not the intended shape): such an entry is correctly invalidated by a trim,
// because the trim changes PlayedRange and therefore the key.
type CacheEntryKey struct {
	Source          SourceIdentity
	AnalyzerID      string
	AnalyzerVersion string
	ParamHash       string
	PlayedRange     *PlayedRange
}

// hash returns CacheEntryKey's stable, content-addressed identity: the
// filename an entry is stored under. Two keys that differ only in
// SourceIdentity.ModTime hash the same, matching AnalysisKey's own choice
// (fingerprint.go) to hash Path/Size/PartialHash but never ModTime, so a
// source file that is merely touched does not invalidate a cache entry
// whose sampled content is unchanged.
func (k CacheEntryKey) hash() string {
	scope := []string{"whole-source"}
	if k.PlayedRange != nil {
		scope = []string{"range", formatSeconds(k.PlayedRange.Start), formatSeconds(k.PlayedRange.End)}
	}
	return DerivedKey(SourceInput(k.Source), k.AnalyzerID, k.AnalyzerVersion, k.ParamHash, scope...)
}

// cacheEnvelope is the on-disk shape of one cache file: an opaque blob (the
// analyzer's own format) plus enough metadata for CacheStore.PruneKinds
// and CacheStore.Read to do their job without ever looking inside Blob.
// encoding/json encodes a []byte field as base64 automatically, so Blob's
// bytes round-trip exactly regardless of what they hold. AnalyzerID is the
// key's, so an entry says which analyzer wrote it without its key; an entry
// written before the field has none.
type cacheEnvelope struct {
	SchemaVersion int       `json:"schemaVersion"`
	AnalyzerID    string    `json:"analyzerId,omitempty"`
	WrittenAt     time.Time `json:"writtenAt"`
	Blob          []byte    `json:"blob"`
}

// CacheDir is the result cache's storage directory under a project
// (<app>/analysis/cache/). It is exported so
// manuscript.resetDerived can clear it without this package depending on the
// manuscript package.
func CacheDir(project string) string {
	return filepath.Join(project, brand.ProjectFolder, "analysis", "cache")
}

// CacheStore is the per-item result cache: an opaque, keyed blob store under a
// project, one JSON file per entry, written
// temp-file-then-rename (the same pattern as LedgerStore.Write). Zero value
// is not usable; construct with NewCacheStore.
type CacheStore struct {
	project  string
	dir      string
	mu       sync.Mutex
	hits     atomic.Int64
	misses   atomic.Int64
	Reporter *persist.Reporter
}

// NewCacheStore returns a CacheStore rooted at project's cache directory.
func NewCacheStore(project string) *CacheStore {
	return &CacheStore{project: project, dir: CacheDir(project)}
}

// Write stores blob under key, replacing any existing entry for the same
// key. The store never inspects blob; it is the analyzer's own opaque
// format.
func (s *CacheStore) Write(key CacheEntryKey, blob []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return fmt.Errorf("could not create the analysis cache: %w", err)
	}
	envelope := cacheEnvelope{SchemaVersion: cacheSchemaVersion, AnalyzerID: key.AnalyzerID, WrittenAt: time.Now().UTC(), Blob: blob}
	bytes, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	path := s.entryPath(key)
	if err := persist.WriteFile(path, bytes, 0o600); err != nil {
		return fmt.Errorf("could not write the analysis cache entry: %w", err)
	}
	return nil
}

// Read returns the blob stored under key. It reports a miss (ok=false) when
// the entry is missing, unreadable, not valid JSON, or written by a newer
// schema than this package supports - every one of those is a cache miss,
// never an error the caller has to handle specially, matching LedgerStore's
// own unknown-version rule. Every call updates the Hits/Misses counters
// callers read to measure how often the cache hits.
func (s *CacheStore) Read(key CacheEntryKey) ([]byte, bool) {
	var blob []byte
	outcome := s.Reporter.ReadJSON(s.entryPath(key), "analysis cache entry", persist.Disposable, func(raw []byte) error {
		var envelope cacheEnvelope
		if err := json.Unmarshal(raw, &envelope); err != nil {
			return err
		}
		if envelope.SchemaVersion > cacheSchemaVersion {
			return fmt.Errorf("schema version %d newer than supported %d", envelope.SchemaVersion, cacheSchemaVersion)
		}
		blob = envelope.Blob
		return nil
	})
	if outcome != persist.Loaded {
		s.misses.Add(1)
		return nil, false
	}
	s.hits.Add(1)
	s.markUsed(s.entryPath(key))
	return blob, true
}

// usedRefresh is how often a hit moves an entry's last-used time (its file's modification time) forward: a hit on an entry used
// within the hour costs one stat and no write.
const usedRefresh = time.Hour

// markUsed moves the entry file's modification time to now when it is older than usedRefresh. The modification time is the entry's
// last use for PruneKinds, so an entry the narrator still reads is neither expired nor evicted first, and the blob is not rewritten.
// The time is set through a root on the cache folder, so a link in place of the file is not followed. A failure is ignored: the entry
// then ages as if unused, which costs a recompute, never a wrong answer.
func (s *CacheStore) markUsed(path string) {
	info, err := os.Lstat(path)
	if err != nil {
		return
	}
	// A file time in the future (a clock set back, a restored copy) is not "used within the hour": it is moved to now too.
	if age := time.Since(info.ModTime()); age >= 0 && age < usedRefresh {
		return
	}
	s.setUsed(filepath.Base(path), time.Now())
}

// setUsed sets the modification time of the entry file name to at, through a root on the cache folder so a link in its place is not
// followed. A failure is ignored: the entry then keeps its time, which costs a recompute at worst, never a wrong answer.
func (s *CacheStore) setUsed(name string, at time.Time) {
	root, err := os.OpenRoot(s.dir)
	if err != nil {
		return
	}
	defer func() { _ = root.Close() }()
	_ = root.Chtimes(name, at, at)
}

// Delete removes key's entry, if any. A missing entry is not an error: the
// caller may be deleting a key that was already a miss.
func (s *CacheStore) Delete(key CacheEntryKey) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.Remove(s.entryPath(key)); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("could not delete the analysis cache entry: %w", err)
	}
	return nil
}

// Hits is the number of Read calls that found a valid entry since this
// CacheStore was constructed.
func (s *CacheStore) Hits() int64 { return s.hits.Load() }

// Misses is the number of Read calls that did not find a valid entry since
// this CacheStore was constructed (missing, corrupt, or a newer schema).
func (s *CacheStore) Misses() int64 { return s.misses.Load() }

// CacheKindPolicy bounds the entries of one analyzer: nothing unused for longer than MaxAge (zero: no time limit) and, oldest use first,
// no more than MaxBytes in all (zero: no size cap). An empty AnalyzerID is the policy of the entries written before the envelope
// named its analyzer.
type CacheKindPolicy struct {
	AnalyzerID string
	MaxBytes   int64
	MaxAge     time.Duration
}

// CachePrune is what one PruneKinds pass found and did: the regular files of the cache folder and their bytes before and after, and how
// many entries it removed. Stopped is set when the pass was told to stop before it was done; the counts are then of what it had reached (a pass stopped while still reading the folder counts the files it had read and removes none).
type CachePrune struct {
	FilesBefore, FilesAfter int
	BytesBefore, BytesAfter int64
	Removed                 int
	Stopped                 bool
}

// maxEnvelopeHeader is how much of an entry file's start entryAnalyzer reads looking for the blob's key.
const maxEnvelopeHeader = 4 << 10

// scanChunk is how many entries a prune pass reads between two looks at its stop function.
const scanChunk = 256

// cacheFile is one entry file a prune pass considers: its name, size and last use (its modification time, see markUsed).
type cacheFile struct {
	name string
	size int64
	used time.Time
}

// PruneKinds removes cache entries by what policies say about their analyzer: first the entries unused for longer than the kind's
// MaxAge, then the least recently used until the kind is within MaxBytes. The kinds are taken in the order given, the entries with
// no analyzer (the policy with an empty AnalyzerID) last. Never removed: an entry of an analyzer no policy names, a file whose
// envelope this store cannot read or that a newer build wrote, a stray .tmp, a folder, a link, or anything outside the cache folder
// (the same "never delete a name it cannot positively rule in" rule LedgerStore.Retain follows). Deletes go through
// persist.RemoveRegular on the project folder, and a cache folder that is a link or below one is an error. A removal that fails
// leaves its entry and the pass goes on; the errors are returned together. stop is asked before each removal. The pass does not hold
// the store's lock: another store of the project may write an entry as it goes, which at worst removes an entry that is then
// recomputed.
func (s *CacheStore) PruneKinds(policies []CacheKindPolicy, now time.Time, stop func() bool) (CachePrune, error) {
	var report CachePrune
	if stop == nil {
		stop = func() bool { return false }
	}
	if s.project == "" {
		return report, nil
	}
	rel, err := filepath.Rel(s.project, s.dir)
	if err != nil {
		return report, err
	}
	real, err := persist.RealFolder(s.project, rel)
	if err != nil {
		return report, fmt.Errorf("the analysis cache folder is not a real folder: %w", err)
	}
	if !real {
		return report, nil
	}
	entries, err := persist.ReadDir(s.dir)
	if err != nil {
		return report, fmt.Errorf("could not list the analysis cache: %w", err)
	}
	byKind := map[string][]cacheFile{}
	for i, entry := range entries {
		// Reading each entry's start is the slow part of a large cache: a check that starts is not made to wait for all of it.
		if i%scanChunk == 0 && i > 0 && stop() {
			report.Stopped = true
			report.FilesAfter, report.BytesAfter = report.FilesBefore, report.BytesBefore
			return report, nil
		}
		if !entry.Type().IsRegular() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		report.FilesBefore++
		report.BytesBefore += info.Size()
		if _, ok := recordID(entry.Name()); !ok {
			continue
		}
		if analyzer, ok := s.entryAnalyzer(entry.Name()); ok {
			// A file time after now (a clock set back, a restored copy) is moved to now, so that the entry ages and is evicted like any other
			// from here on; read as now alone it would be "just used" at every pass.
			used := info.ModTime()
			if used.After(now) {
				used = now
				s.setUsed(entry.Name(), now)
			}
			byKind[analyzer] = append(byKind[analyzer], cacheFile{name: entry.Name(), size: info.Size(), used: used})
		}
	}
	report.FilesAfter, report.BytesAfter = report.FilesBefore, report.BytesBefore
	ordered := slices.Clone(policies)
	slices.SortStableFunc(ordered, func(a, b CacheKindPolicy) int { return cmpBool(a.AnalyzerID == "", b.AnalyzerID == "") })
	var failures []error
	for _, policy := range ordered {
		// Taken out of the map, so a kind named twice in the table is handled once.
		files := byKind[policy.AnalyzerID]
		delete(byKind, policy.AnalyzerID)
		slices.SortStableFunc(files, func(a, b cacheFile) int { return a.used.Compare(b.used) })
		var kindBytes int64
		for _, file := range files {
			kindBytes += file.size
		}
		for _, file := range files {
			expired := policy.MaxAge > 0 && now.Sub(file.used) > policy.MaxAge
			over := policy.MaxBytes > 0 && kindBytes > policy.MaxBytes
			if !expired && !over {
				break
			}
			if stop() {
				report.Stopped = true
				return report, errors.Join(failures...)
			}
			removed, err := persist.RemoveRegular(s.project, filepath.Join(rel, file.name))
			if err != nil {
				failures = append(failures, fmt.Errorf("could not remove analysis cache entry %s: %w", file.name, err))
				continue
			}
			kindBytes -= file.size
			if removed {
				report.Removed++
				report.FilesAfter--
				report.BytesAfter -= file.size
			}
		}
	}
	return report, errors.Join(failures...)
}

// cmpBool orders false before true.
func cmpBool(a, b bool) int {
	switch {
	case a == b:
		return 0
	case b:
		return -1
	}
	return 1
}

// entryAnalyzer reads the analyzer an entry file names from the start of its envelope without decoding the blob (an entry can be
// a megabyte), and reports false for a file that is not an envelope this build supports: not JSON, no schema version, or a newer one.
// An entry written before the envelope named its analyzer answers "".
func (s *CacheStore) entryAnalyzer(name string) (string, bool) {
	file, err := persist.Open(filepath.Join(s.dir, name))
	if err != nil {
		return "", false
	}
	defer func() { _ = file.Close() }()
	// The three fields before the blob are a few dozen bytes: a file whose envelope header runs past the limit is not one this store wrote.
	decoder := json.NewDecoder(io.LimitReader(file, maxEnvelopeHeader))
	if token, err := decoder.Token(); err != nil || token != json.Delim('{') {
		return "", false
	}
	var version int
	var analyzer string
	for decoder.More() {
		token, err := decoder.Token()
		key, ok := token.(string)
		if err != nil || !ok {
			return "", false
		}
		switch key {
		case "schemaVersion":
			err = decoder.Decode(&version)
		case "analyzerId":
			err = decoder.Decode(&analyzer)
		case "blob":
			return analyzer, version >= 1 && version <= cacheSchemaVersion
		default:
			var skipped json.RawMessage
			err = decoder.Decode(&skipped)
		}
		if err != nil {
			return "", false
		}
	}
	return "", false
}

func (s *CacheStore) entryPath(key CacheEntryKey) string {
	return s.hashPath(key.hash())
}

func (s *CacheStore) hashPath(hash string) string {
	return filepath.Join(s.dir, hash+".json")
}

// TimedFeature is one entry of a sliceable analyzer's whole-source cache
// blob: a silence run or a transcript word, positioned by its
// own Start/End in the source file's own seconds - the same units and same
// origin as PlayedRange (fingerprint.go), so a feature and an item's played
// range are directly comparable. Payload is the analyzer's own per-feature
// data (the store, and this helper, stay opaque to what a feature
// means); this package only ever looks at Start and End.
type TimedFeature struct {
	Start   float64         `json:"start"`
	End     float64         `json:"end"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// SliceFeatures returns the entries of features that overlap played, in the
// order given, so a caller who cached a source's features once
// can read the subset relevant to one item's current played range without
// recomputing anything - including after a trim moves that range, which is
// exactly the case CacheEntryKey.hash is built to survive (it does not
// depend on played range for a sliceable entry). An entry with
// End <= played.Start or Start >= played.End does not overlap and is
// excluded; a feature that only partially overlaps is still included whole
// (this package does not clip a feature's own boundaries - whether that is
// meaningful, for example for a silence run versus a whole transcript word,
// is the analyzer's call, not this generic helper's).
func SliceFeatures(features []TimedFeature, played PlayedRange) []TimedFeature {
	sliced := make([]TimedFeature, 0, len(features))
	for _, feature := range features {
		if feature.End <= played.Start || feature.Start >= played.End {
			continue
		}
		sliced = append(sliced, feature)
	}
	return sliced
}
