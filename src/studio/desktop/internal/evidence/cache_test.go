package evidence

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func baseCacheKey() CacheEntryKey {
	return CacheEntryKey{
		Source:          SourceIdentity{Path: "media/a.wav", Size: 1000, PartialHash: "hash-a", ModTime: time.Unix(1000, 0)},
		AnalyzerID:      "rc",
		AnalyzerVersion: "1",
		ParamHash:       "params-1",
	}
}

// --- Write/Read round trip ---

func TestWriteThenReadReturnsTheSameBlob(t *testing.T) {
	store := NewCacheStore(t.TempDir())
	key := baseCacheKey()
	blob := []byte(`{"silenceRuns":[[0,1],[4,5]]}`)

	if err := store.Write(key, blob); err != nil {
		t.Fatal(err)
	}
	got, ok := store.Read(key)
	if !ok {
		t.Fatal("Read did not find the entry that was written")
	}
	if string(got) != string(blob) {
		t.Fatalf("Read = %q, want %q", got, blob)
	}
}

func TestReadOnAMissingKeyIsAMiss(t *testing.T) {
	store := NewCacheStore(t.TempDir())
	if _, ok := store.Read(baseCacheKey()); ok {
		t.Fatal("Read on an unwritten key reported a hit")
	}
}

func TestWriteStoresOneFilePerEntryUnderTheCacheDirectory(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	key := baseCacheKey()
	if err := store.Write(key, []byte("x")); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(CacheDir(project), key.hash()+".json")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected a file at %s: %v", path, err)
	}
}

func TestWriteOverwritesAnExistingEntryForTheSameKey(t *testing.T) {
	store := NewCacheStore(t.TempDir())
	key := baseCacheKey()
	if err := store.Write(key, []byte("first")); err != nil {
		t.Fatal(err)
	}
	if err := store.Write(key, []byte("second")); err != nil {
		t.Fatal(err)
	}
	got, ok := store.Read(key)
	if !ok || string(got) != "second" {
		t.Fatalf("Read after overwrite = %q, %v; want \"second\", true", got, ok)
	}
}

func TestDeleteRemovesTheEntrySoItSubsequentlyMisses(t *testing.T) {
	store := NewCacheStore(t.TempDir())
	key := baseCacheKey()
	if err := store.Write(key, []byte("x")); err != nil {
		t.Fatal(err)
	}
	if err := store.Delete(key); err != nil {
		t.Fatal(err)
	}
	if _, ok := store.Read(key); ok {
		t.Fatal("Read found an entry after Delete")
	}
}

func TestDeleteOnAMissingEntryIsNotAnError(t *testing.T) {
	store := NewCacheStore(t.TempDir())
	if err := store.Delete(baseCacheKey()); err != nil {
		t.Fatalf("Delete on a never-written key returned an error: %v", err)
	}
}

// --- Key computation ---

func TestKeyIsStableAcrossSourceModTimeChanges(t *testing.T) {
	// The analysis key (fingerprint.go) deliberately excludes ModTime so a
	// merely-touched file does not always read as changed; the cache key
	// makes the same choice for the same reason.
	key := baseCacheKey()
	touched := key
	touched.Source.ModTime = key.Source.ModTime.Add(24 * time.Hour)
	if key.hash() != touched.hash() {
		t.Fatalf("hash changed when only ModTime changed: %s vs %s", key.hash(), touched.hash())
	}
}

func TestKeyDiffersWhenSourceContentDiffers(t *testing.T) {
	key := baseCacheKey()
	other := key
	other.Source.PartialHash = "hash-b"
	if key.hash() == other.hash() {
		t.Fatal("hash did not change when PartialHash changed")
	}
}

func TestKeyDiffersWhenAnalyzerVersionDiffers(t *testing.T) {
	key := baseCacheKey()
	other := key
	other.AnalyzerVersion = "2"
	if key.hash() == other.hash() {
		t.Fatal("hash did not change when AnalyzerVersion changed")
	}
}

func TestKeyDiffersWhenParamHashDiffers(t *testing.T) {
	key := baseCacheKey()
	other := key
	other.ParamHash = "params-2"
	if key.hash() == other.hash() {
		t.Fatal("hash did not change when ParamHash changed")
	}
}

func TestKeyDiffersBetweenWholeSourceAndAPlayedRange(t *testing.T) {
	key := baseCacheKey()
	ranged := key
	ranged.PlayedRange = &PlayedRange{Start: 0, End: 1}
	if key.hash() == ranged.hash() {
		t.Fatal("hash did not change between a whole-source key and a played-range key")
	}
}

func TestKeyDiffersBetweenTwoDifferentPlayedRanges(t *testing.T) {
	key := baseCacheKey()
	key.PlayedRange = &PlayedRange{Start: 0, End: 1}
	other := key
	other.PlayedRange = &PlayedRange{Start: 2, End: 3}
	if key.hash() == other.hash() {
		t.Fatal("hash did not change between two different played ranges")
	}
}

// --- Survives a trim (the central property: whole-source entries outlive
// a played-range change, unlike a per-range entry would) ---

func TestAWholeSourceEntrySurvivesATrimAndSlicesCorrectlyAfterIt(t *testing.T) {
	store := NewCacheStore(t.TempDir())
	source := SourceIdentity{Path: "media/a.wav", Size: 1000, PartialHash: "hash-a"}
	key := CacheEntryKey{Source: source, AnalyzerID: "rc", AnalyzerVersion: "1", ParamHash: "p1"}

	// The analyzer ran once over the whole source and cached every silence
	// run it found, in source-relative seconds.
	features := []TimedFeature{
		{Start: 0, End: 1},
		{Start: 4, End: 5},
		{Start: 9, End: 9.5},
	}
	blob, err := json.Marshal(features)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Write(key, blob); err != nil {
		t.Fatal(err)
	}

	// Before the trim, the item's played range is [3, 6): only the [4,5)
	// run is visible.
	before, ok := store.Read(key)
	if !ok {
		t.Fatal("Read did not find the whole-source entry before the trim")
	}
	var beforeFeatures []TimedFeature
	if err := json.Unmarshal(before, &beforeFeatures); err != nil {
		t.Fatal(err)
	}
	beforeSliced := SliceFeatures(beforeFeatures, PlayedRange{Start: 3, End: 6})
	if len(beforeSliced) != 1 || beforeSliced[0].Start != 4 {
		t.Fatalf("slice before trim = %#v, want exactly the [4,5) run", beforeSliced)
	}

	// The narrator trims the item's start: the played range narrows to
	// [4.5, 6). The cache key is unchanged (it never depended on the played
	// range for a sliceable entry), so the same entry is still found -
	// nothing was re-analyzed - and slicing it against the new range gives
	// the correct, different answer.
	after, ok := store.Read(key)
	if !ok {
		t.Fatal("Read did not find the whole-source entry after the trim; a whole-source cache entry must survive a trim")
	}
	var afterFeatures []TimedFeature
	if err := json.Unmarshal(after, &afterFeatures); err != nil {
		t.Fatal(err)
	}
	afterSliced := SliceFeatures(afterFeatures, PlayedRange{Start: 4.5, End: 6})
	if len(afterSliced) != 1 || afterSliced[0].Start != 4 {
		t.Fatalf("slice after trim = %#v, want exactly the [4,5) run (it overlaps [4.5,6))", afterSliced)
	}

	// A range that no longer overlaps any feature (a trim past every run)
	// correctly slices to nothing, still without another cache write.
	afterFurtherTrim := SliceFeatures(afterFeatures, PlayedRange{Start: 6, End: 8})
	if len(afterFurtherTrim) != 0 {
		t.Fatalf("slice over a range with no features = %#v, want empty", afterFurtherTrim)
	}
	if store.Misses() != 0 {
		t.Fatalf("Misses = %d, want 0; the whole-source entry must never miss across a trim", store.Misses())
	}
}

func TestAPlayedRangeStyleEntryDoesNotSurviveATrim(t *testing.T) {
	// The contrast case: an analyzer that cannot slice and instead
	// caches one blob per played range (the fallback shape) is
	// correctly invalidated by a trim, because PlayedRange is part of its
	// key.
	store := NewCacheStore(t.TempDir())
	source := SourceIdentity{Path: "media/a.wav", Size: 1000, PartialHash: "hash-a"}
	before := CacheEntryKey{Source: source, AnalyzerID: "er", AnalyzerVersion: "1", ParamHash: "p1", PlayedRange: &PlayedRange{Start: 3, End: 6}}
	if err := store.Write(before, []byte("result-for-3-to-6")); err != nil {
		t.Fatal(err)
	}

	afterTrim := CacheEntryKey{Source: source, AnalyzerID: "er", AnalyzerVersion: "1", ParamHash: "p1", PlayedRange: &PlayedRange{Start: 4.5, End: 6}}
	if _, ok := store.Read(afterTrim); ok {
		t.Fatal("a played-range-keyed entry hit after the played range changed; it should miss")
	}
	if store.Misses() != 1 {
		t.Fatalf("Misses = %d, want 1", store.Misses())
	}
}

// --- Hit/miss counters ---

func TestHitsAndMissesCountReadCallsSeparately(t *testing.T) {
	store := NewCacheStore(t.TempDir())
	key := baseCacheKey()
	if err := store.Write(key, []byte("x")); err != nil {
		t.Fatal(err)
	}

	other := key
	other.AnalyzerID = "unwritten"
	store.Read(other) // miss
	store.Read(key)   // hit
	store.Read(key)   // hit
	store.Read(other) // miss

	if store.Hits() != 2 {
		t.Fatalf("Hits = %d, want 2", store.Hits())
	}
	if store.Misses() != 2 {
		t.Fatalf("Misses = %d, want 2", store.Misses())
	}
}

func TestASecondIdenticalRunReadsEveryEntry(t *testing.T) {
	// The success signal for a per-item cache: writing N
	// entries once, then reading all N keys again, is N hits and 0 misses -
	// nothing needs to be re-analyzed.
	store := NewCacheStore(t.TempDir())
	keys := make([]CacheEntryKey, 0, 5)
	for i := 0; i < 5; i++ {
		key := baseCacheKey()
		key.ParamHash = string(rune('a' + i))
		keys = append(keys, key)
		if err := store.Write(key, []byte("result")); err != nil {
			t.Fatal(err)
		}
	}
	for _, key := range keys {
		if _, ok := store.Read(key); !ok {
			t.Fatalf("Read missed a just-written entry: %+v", key)
		}
	}
	if store.Hits() != 5 || store.Misses() != 0 {
		t.Fatalf("Hits = %d, Misses = %d, want 5, 0", store.Hits(), store.Misses())
	}
}

func TestDeletingOneEntryMissesOnlyThatOne(t *testing.T) {
	store := NewCacheStore(t.TempDir())
	kept := baseCacheKey()
	kept.ParamHash = "kept"
	removed := baseCacheKey()
	removed.ParamHash = "removed"
	if err := store.Write(kept, []byte("k")); err != nil {
		t.Fatal(err)
	}
	if err := store.Write(removed, []byte("r")); err != nil {
		t.Fatal(err)
	}

	if err := store.Delete(removed); err != nil {
		t.Fatal(err)
	}

	if _, ok := store.Read(kept); !ok {
		t.Fatal("Read missed the entry that was not deleted")
	}
	if _, ok := store.Read(removed); ok {
		t.Fatal("Read hit the entry that was deleted")
	}
}

// --- Corrupt / unknown schema entries read as a miss ---

func TestACorruptEntryFileReadsAsAMiss(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	key := baseCacheKey()
	if err := os.MkdirAll(CacheDir(project), 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(CacheDir(project), key.hash()+".json")
	if err := os.WriteFile(path, []byte("not json"), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, ok := store.Read(key); ok {
		t.Fatal("Read returned a hit for a corrupt file")
	}
}

func TestAnEntryWrittenByANewerSchemaReadsAsAMiss(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	key := baseCacheKey()
	if err := os.MkdirAll(CacheDir(project), 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(CacheDir(project), key.hash()+".json")
	future := `{"schemaVersion":999,"blob":"eA=="}`
	if err := os.WriteFile(path, []byte(future), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, ok := store.Read(key); ok {
		t.Fatal("Read returned a hit for a newer-schema file")
	}
}

func TestAStrayTmpFileFromAnInterruptedWriteDoesNotHideThePreviousEntry(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	key := baseCacheKey()
	if err := store.Write(key, []byte("x")); err != nil {
		t.Fatal(err)
	}
	strayPath := filepath.Join(CacheDir(project), "in-flight.json.tmp")
	if err := os.WriteFile(strayPath, []byte(`{"schemaVersion":1`), 0o600); err != nil {
		t.Fatal(err)
	}

	got, ok := store.Read(key)
	if !ok || string(got) != "x" {
		t.Fatalf("Read after a stray .tmp = %q, %v; want \"x\", true", got, ok)
	}
}

// --- Error paths ---

func TestWriteFailsWhenTheCacheDirectoryPathIsBlockedByAFile(t *testing.T) {
	project := t.TempDir()
	// Put a regular file where CacheDir(project) would need to be a
	// directory, so os.MkdirAll cannot create it.
	if err := os.MkdirAll(filepath.Dir(CacheDir(project)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(CacheDir(project), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	store := NewCacheStore(project)
	if err := store.Write(baseCacheKey(), []byte("x")); err == nil {
		t.Fatal("Write did not fail when the cache directory path was blocked by a file")
	}
}

func TestWriteFailsWhenTheEntryPathIsANonEmptyDirectory(t *testing.T) {
	// The temp-file-then-rename write (the same pattern as LedgerStore.Write)
	// fails at the rename step when the final path is already occupied by a
	// non-empty directory, rather than silently succeeding over it.
	project := t.TempDir()
	store := NewCacheStore(project)
	key := baseCacheKey()
	path := filepath.Join(CacheDir(project), key.hash()+".json")
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, "child"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := store.Write(key, []byte("x")); err == nil {
		t.Fatal("Write did not fail when its target path was a non-empty directory")
	}
}

func TestDeleteFailsWhenTheEntryIsANonEmptyDirectory(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	key := baseCacheKey()
	path := filepath.Join(CacheDir(project), key.hash()+".json")
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, "child"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := store.Delete(key); err == nil {
		t.Fatal("Delete did not fail when the entry path was a non-empty directory")
	}
}

// --- PruneKinds (per analyzer: time limit, then size cap, least recently used first) ---

var never = func() bool { return false }

// kindKey is a key of analyzer whose entries differ by name.
func kindKey(analyzer, name string) CacheEntryKey {
	key := baseCacheKey()
	key.AnalyzerID, key.ParamHash = analyzer, name
	return key
}

// writeUsed writes an entry of blobBytes bytes and sets its last use (its file's modification time) to used.
func writeUsed(t *testing.T, store *CacheStore, project string, key CacheEntryKey, blobBytes int, used time.Time) {
	t.Helper()
	if err := store.Write(key, make([]byte, blobBytes)); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(filepath.Join(CacheDir(project), key.hash()+".json"), used, used); err != nil {
		t.Fatal(err)
	}
}

func entryExists(project string, key CacheEntryKey) bool {
	_, err := os.Stat(filepath.Join(CacheDir(project), key.hash()+".json"))
	return err == nil
}

var pruneNow = time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)

func TestPruneKindsRemovesTheLeastRecentlyUsedOfAKindUntilItIsUnderItsCap(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	oldest, middle, newest := kindKey("rc", "oldest"), kindKey("rc", "middle"), kindKey("rc", "newest")
	writeUsed(t, store, project, oldest, 1000, pruneNow.Add(-3*time.Hour))
	writeUsed(t, store, project, middle, 1000, pruneNow.Add(-2*time.Hour))
	writeUsed(t, store, project, newest, 1000, pruneNow.Add(-time.Hour))
	// The entries differ by a byte or two (the length of the written-at stamp), so sizes are taken one by one.
	one := fileSize(t, project, newest)
	all := fileSize(t, project, oldest) + fileSize(t, project, middle) + one

	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "rc", MaxBytes: one}}, pruneNow, never)
	if err != nil {
		t.Fatal(err)
	}
	if entryExists(project, oldest) || entryExists(project, middle) || !entryExists(project, newest) {
		t.Fatalf("kept: oldest %v, middle %v, newest %v; want only the newest", entryExists(project, oldest), entryExists(project, middle), entryExists(project, newest))
	}
	if report.Removed != 2 || report.FilesBefore != 3 || report.FilesAfter != 1 || report.BytesBefore != all || report.BytesAfter != one || report.Stopped {
		t.Fatalf("report = %+v; want 2 removed, 3 files and %d bytes before, 1 and %d after", report, all, one)
	}
}

func TestPruneKindsRemovesWhatWentUnusedForLongerThanItsKindsTimeWhateverTheSize(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	stale, fresh := kindKey("editing.silence", "stale"), kindKey("editing.silence", "fresh")
	writeUsed(t, store, project, stale, 10, pruneNow.Add(-25*time.Hour))
	writeUsed(t, store, project, fresh, 10, pruneNow.Add(-23*time.Hour))

	if _, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "editing.silence", MaxAge: 24 * time.Hour, MaxBytes: 1 << 30}}, pruneNow, never); err != nil {
		t.Fatal(err)
	}
	if entryExists(project, stale) || !entryExists(project, fresh) {
		t.Fatalf("stale kept %v, fresh kept %v; want the entry unused for 25 hours gone and the one unused for 23 kept", entryExists(project, stale), entryExists(project, fresh))
	}
}

func TestPruneKindsBoundsEachKindOnItsOwn(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	words, peaks := kindKey("words", "w"), kindKey("peaks", "p")
	writeUsed(t, store, project, words, 5000, pruneNow.Add(-90*24*time.Hour))
	writeUsed(t, store, project, peaks, 5000, pruneNow.Add(-time.Hour))

	// peaks is over its cap and words has no limit at all: the older words entry stays, the peaks entry goes.
	if _, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "words"}, {AnalyzerID: "peaks", MaxBytes: 10}}, pruneNow, never); err != nil {
		t.Fatal(err)
	}
	if !entryExists(project, words) || entryExists(project, peaks) {
		t.Fatalf("words kept %v, peaks kept %v; want words kept and peaks gone", entryExists(project, words), entryExists(project, peaks))
	}
}

func TestPruneKindsKeepsAnAnalyzerNoPolicyNames(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	unknown, known := kindKey("a-newer-analyzer", "u"), kindKey("rc", "k")
	writeUsed(t, store, project, unknown, 5000, pruneNow.Add(-400*24*time.Hour))
	writeUsed(t, store, project, known, 5000, pruneNow.Add(-400*24*time.Hour))

	if _, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "rc", MaxAge: time.Hour}}, pruneNow, never); err != nil {
		t.Fatal(err)
	}
	if !entryExists(project, unknown) || entryExists(project, known) {
		t.Fatalf("unknown kept %v, known kept %v; want the unnamed analyzer's entry kept however old", entryExists(project, unknown), entryExists(project, known))
	}
}

func TestPruneKindsHoldsAnEntryWithNoAnalyzerToTheEmptyPolicy(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	// An entry written before the envelope named its analyzer has no analyzerId.
	old, young := kindKey("", "old"), kindKey("", "young")
	writeUsed(t, store, project, old, 100, pruneNow.Add(-31*24*time.Hour))
	writeUsed(t, store, project, young, 100, pruneNow.Add(-29*24*time.Hour))
	tagged := kindKey("rc", "t")
	writeUsed(t, store, project, tagged, 100, pruneNow.Add(-31*24*time.Hour))

	// The empty policy limits the entries with no analyzer only: the tagged entry has no limit here.
	if _, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "", MaxAge: 30 * 24 * time.Hour}, {AnalyzerID: "rc"}}, pruneNow, never); err != nil {
		t.Fatal(err)
	}
	if entryExists(project, old) || !entryExists(project, young) || !entryExists(project, tagged) {
		t.Fatalf("old kept %v, young kept %v, tagged kept %v; want only the entry with no analyzer unused for over 30 days gone", entryExists(project, old), entryExists(project, young), entryExists(project, tagged))
	}
}

func TestPruneKindsTakesTheEntriesWithNoAnalyzerLast(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	untagged, tagged := kindKey("", "u"), kindKey("rc", "t")
	writeUsed(t, store, project, untagged, 100, pruneNow.Add(-400*24*time.Hour))
	writeUsed(t, store, project, tagged, 100, pruneNow.Add(-1*time.Hour))
	// The empty policy is listed first. Told to stop after one removal, the pass has taken the tagged kind's entry, not the other.
	calls := 0
	// The first look is the scan's, before it reads anything; the second is before the first removal, the third before the next one.
	stop := func() bool { calls++; return calls > 2 }
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "", MaxAge: time.Hour}, {AnalyzerID: "rc", MaxAge: time.Minute}}, pruneNow, stop)
	if err != nil {
		t.Fatal(err)
	}
	if !report.Stopped || entryExists(project, tagged) || !entryExists(project, untagged) {
		t.Fatalf("report = %+v, tagged kept %v, untagged kept %v; want the tagged entry gone first and the pass stopped", report, entryExists(project, tagged), entryExists(project, untagged))
	}
}

func TestPruneKindsLeavesWhatItCannotPositivelyReadAsItsOwn(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	if err := os.MkdirAll(CacheDir(project), 0o755); err != nil {
		t.Fatal(err)
	}
	old := pruneNow.Add(-400 * 24 * time.Hour)
	files := map[string]string{
		"not-json.json":     "not json",
		"array.json":        `[1, 2]`,
		"no-version.json":   `{"analyzerId": "rc", "blob": ""}`,
		"newer.json":        `{"schemaVersion": 99, "analyzerId": "rc", "blob": ""}`,
		"version-zero.json": `{"schemaVersion": 0, "analyzerId": "rc", "blob": ""}`,
		"no-blob.json":      `{"schemaVersion": 1, "analyzerId": "rc"}`,
		"bad-analyzer.json": `{"schemaVersion": 1, "analyzerId": 7, "blob": ""}`,
		"stray.json.tmp":    `{"schemaVersion": 1, "analyzerId": "rc", "blob": ""}`,
		"note.txt":          "a note",
	}
	for name, content := range files {
		path := filepath.Join(CacheDir(project), name)
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(path, old, old); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(CacheDir(project), "folder.json"), 0o755); err != nil {
		t.Fatal(err)
	}

	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "rc", MaxAge: time.Hour, MaxBytes: 1}, {AnalyzerID: "", MaxAge: time.Hour, MaxBytes: 1}}, pruneNow, never)
	if err != nil {
		t.Fatal(err)
	}
	for name := range files {
		if _, err := os.Stat(filepath.Join(CacheDir(project), name)); err != nil {
			t.Fatalf("%s was removed: %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(CacheDir(project), "folder.json")); err != nil {
		t.Fatalf("a folder was removed: %v", err)
	}
	if report.Removed != 0 {
		t.Fatalf("removed %d files; want none", report.Removed)
	}
}

func TestPruneKindsStopsWhenToldTo(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	first, second := kindKey("rc", "a"), kindKey("rc", "b")
	writeUsed(t, store, project, first, 100, pruneNow.Add(-2*time.Hour))
	writeUsed(t, store, project, second, 100, pruneNow.Add(-time.Hour))

	calls := 0
	// The first look is the scan's, before it reads anything; the second is before the first removal, the third before the next one.
	stop := func() bool { calls++; return calls > 2 }
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "rc", MaxBytes: 1}}, pruneNow, stop)
	if err != nil {
		t.Fatal(err)
	}
	if !report.Stopped || report.Removed != 1 || entryExists(project, first) || !entryExists(project, second) {
		t.Fatalf("report = %+v, first kept %v, second kept %v; want it stopped after removing the first entry only", report, entryExists(project, first), entryExists(project, second))
	}
}

func TestPruneKindsStopsWhileItIsStillReadingALargeCache(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	if err := os.MkdirAll(CacheDir(project), 0o755); err != nil {
		t.Fatal(err)
	}
	old := pruneNow.Add(-400 * 24 * time.Hour)
	for i := range 3 * scanChunk {
		path := filepath.Join(CacheDir(project), fmt.Sprintf("e%04d.json", i))
		if err := os.WriteFile(path, []byte(`{"schemaVersion": 1, "analyzerId": "rc", "blob": ""}`), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(path, old, old); err != nil {
			t.Fatal(err)
		}
	}
	calls := 0
	stop := func() bool { calls++; return true }
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "rc", MaxAge: time.Hour}}, pruneNow, stop)
	if err != nil {
		t.Fatal(err)
	}
	if !report.Stopped || report.Removed != 0 || calls != 1 {
		t.Fatalf("report = %+v after %d looks at stop; want it stopped on the first look, mid-scan, with nothing removed", report, calls)
	}
	entries, _ := os.ReadDir(CacheDir(project))
	if len(entries) != 3*scanChunk {
		t.Fatalf("%d files left, want all %d", len(entries), 3*scanChunk)
	}
}

// A kind named twice in the table is handled once: the second row does not walk entries the first removed and count them again.
func TestPruneKindsHandlesAKindNamedTwiceOnce(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	for i := range 5 {
		writeUsed(t, store, project, kindKey("a", fmt.Sprint(i)), 100, pruneNow.Add(-time.Duration(5-i)*time.Hour))
	}
	// The two newest fit under the cap exactly; entry sizes differ by a byte or two, so the cap is their own sum.
	capBytes := fileSize(t, project, kindKey("a", "3")) + fileSize(t, project, kindKey("a", "4"))

	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxBytes: capBytes}, {AnalyzerID: "a", MaxBytes: capBytes}}, pruneNow, never)
	if err != nil {
		t.Fatal(err)
	}
	if report.Removed != 3 || report.FilesAfter != 2 || report.BytesAfter != capBytes || report.FilesBefore != 5 {
		t.Fatalf("report = %+v; want 3 removed, 2 files and %d bytes left of 5", report, capBytes)
	}
}

// A file already gone when it is reached is not counted as removed.
func TestPruneKindsDoesNotCountAFileThatWasAlreadyGone(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	gone, kept := kindKey("a", "gone"), kindKey("a", "kept")
	writeUsed(t, store, project, gone, 100, pruneNow.Add(-2*time.Hour))
	writeUsed(t, store, project, kept, 100, pruneNow.Add(-time.Hour))
	// The entry is deleted by another store once the pass has listed it: the scan's look at stop is the first, the look before the first
	// removal is the second, so the moment between the two is the second.
	looks := 0
	stop := func() bool {
		if looks++; looks == 2 {
			_ = store.Delete(gone)
		}
		return false
	}
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxBytes: 1}}, pruneNow, stop)
	if err != nil {
		t.Fatal(err)
	}
	if entryExists(project, gone) || entryExists(project, kept) {
		t.Fatalf("gone kept %v, kept kept %v; want both gone (the cap is 1 byte)", entryExists(project, gone), entryExists(project, kept))
	}
	if report.Removed != 1 {
		t.Fatalf("Removed = %d; want 1: the entry another store had already deleted is not this pass's", report.Removed)
	}
}

// A file time in the future (a clock set back, a restored copy) does not keep an entry for ever.
func TestPruneKindsReadsAFileTimeInTheFutureAsNow(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	future, past := kindKey("a", "future"), kindKey("a", "past")
	writeUsed(t, store, project, future, 100, pruneNow.Add(1000*24*time.Hour))
	writeUsed(t, store, project, past, 100, pruneNow.Add(-time.Hour))
	one := fileSize(t, project, future)

	// Under a size cap of one entry the one used an hour ago is the least recently used: the future one is not "newest of all".
	if _, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxBytes: one}}, pruneNow, never); err != nil {
		t.Fatal(err)
	}
	if entryExists(project, past) || !entryExists(project, future) {
		t.Fatalf("past kept %v, future kept %v; want the one used an hour ago gone and the one stamped in the future kept as used now", entryExists(project, past), entryExists(project, future))
	}
	// Past its time limit as of a later now, it expires like any other.
	if _, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxAge: time.Hour}}, pruneNow.Add(2*time.Hour), never); err != nil {
		t.Fatal(err)
	}
	if entryExists(project, future) {
		t.Fatal("an entry with a file time in the future never expired")
	}
}

func TestAHitMovesAFileTimeInTheFutureBackToNow(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	key := kindKey("a", "future")
	writeUsed(t, store, project, key, 10, time.Now().Add(1000*24*time.Hour))
	if _, ok := store.Read(key); !ok {
		t.Fatal("the entry did not read")
	}
	info, err := os.Stat(filepath.Join(CacheDir(project), key.hash()+".json"))
	if err != nil || info.ModTime().After(time.Now().Add(time.Minute)) {
		t.Fatalf("modification time after a hit = %v (%v); want it no later than now", info.ModTime(), err)
	}
}

// The scan reads a few kilobytes of an entry file at most: a stray huge JSON file with no blob key is neither read whole nor removed.
func TestPruneKindsDoesNotReadAHugeFileWhole(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	if err := os.MkdirAll(CacheDir(project), 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(CacheDir(project), "huge.json")
	content := `{"schemaVersion": 1, "junk": "` + strings.Repeat("J", 8<<20) + `"}`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	old := pruneNow.Add(-400 * 24 * time.Hour)
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatal(err)
	}
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	if _, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "", MaxAge: time.Hour}}, pruneNow, never); err != nil {
		t.Fatal(err)
	}
	runtime.ReadMemStats(&after)
	if allocated := after.TotalAlloc - before.TotalAlloc; allocated > 2<<20 {
		t.Fatalf("the scan allocated %d bytes for an 8 MB file; want a bounded read", allocated)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("a file whose envelope header could not be ruled in was removed: %v", err)
	}
}

// A pass told to stop while it reads a large cache counts what it had reached and says so.
func TestPruneKindsStoppedMidScanCountsOnlyWhatItReached(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	if err := os.MkdirAll(CacheDir(project), 0o755); err != nil {
		t.Fatal(err)
	}
	for i := range 2*scanChunk + 10 {
		if err := os.WriteFile(filepath.Join(CacheDir(project), fmt.Sprintf("e%04d.json", i)), []byte(`{"schemaVersion": 1, "analyzerId": "rc", "blob": ""}`), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	looks := 0
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "rc", MaxBytes: 1}}, pruneNow, func() bool { looks++; return looks > 1 })
	if err != nil || !report.Stopped || report.FilesBefore != scanChunk || report.FilesAfter != scanChunk || report.Removed != 0 {
		t.Fatalf("report = %+v, %v; want stopped after the first %d files with nothing removed", report, err, scanChunk)
	}
}

func TestPruneKindsWithNoStopFunctionNeverStops(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	key := kindKey("rc", "old")
	writeUsed(t, store, project, key, 10, pruneNow.Add(-48*time.Hour))
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "rc", MaxAge: time.Hour}}, pruneNow, nil)
	if err != nil || report.Removed != 1 || report.Stopped {
		t.Fatalf("report = %+v, %v; want the entry removed with a nil stop", report, err)
	}
}

// An entry a hit refreshed or a writer wrote again after the pass listed the folder stays: the list is some time old.
func TestPruneKindsKeepsAnEntryUsedOrWrittenAgainSinceItListedTheFolder(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	used, rewritten, idle := kindKey("a", "used"), kindKey("a", "rewritten"), kindKey("a", "idle")
	writeUsed(t, store, project, used, 100, pruneNow.Add(-48*time.Hour))
	writeUsed(t, store, project, rewritten, 100, pruneNow.Add(-47*time.Hour))
	writeUsed(t, store, project, idle, 100, pruneNow.Add(-46*time.Hour))

	// stop is asked once by the scan and then before each removal: the second look is after the listing, the moment another part of the
	// app reads one entry and writes another.
	looks := 0
	stop := func() bool {
		if looks++; looks == 2 { // after the listing, before the first removal
			if _, ok := store.Read(used); !ok {
				t.Error("the entry did not read")
			}
			if err := store.Write(rewritten, []byte("again")); err != nil {
				t.Error(err)
			}
		}
		return false
	}
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxAge: time.Hour}}, time.Now(), stop)
	if err != nil {
		t.Fatal(err)
	}
	if !entryExists(project, used) || !entryExists(project, rewritten) || entryExists(project, idle) || report.Removed != 1 {
		t.Fatalf("used kept %v, rewritten kept %v, idle kept %v, removed %d; want only the idle entry removed", entryExists(project, used), entryExists(project, rewritten), entryExists(project, idle), report.Removed)
	}
}

// A removal that fails leaves its entry and the pass goes on; the pass gives up, saying so, after maxRemovalFailures of them.
func TestPruneKindsGoesOnPastAFailedRemovalAndGivesUpAfterEight(t *testing.T) {
	was := removeEntry
	t.Cleanup(func() { removeEntry = was })
	project := t.TempDir()
	store := NewCacheStore(project)
	var keys []CacheEntryKey
	for i := range 12 {
		key := kindKey("a", fmt.Sprint(i))
		keys = append(keys, key)
		writeUsed(t, store, project, key, 100, pruneNow.Add(-time.Duration(48-i)*time.Hour))
	}
	denied := errors.New("access is denied")
	attempts := 0
	removeEntry = func(root, rel string) (bool, error) {
		attempts++
		if attempts <= 3 {
			return false, denied
		}
		return was(root, rel)
	}
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxAge: time.Hour}}, pruneNow, never)
	if err == nil || !errors.Is(err, denied) || report.Removed != 9 || report.FilesAfter != 3 {
		t.Fatalf("report = %+v, err = %v; want 9 removed, the 3 refused kept and the errors reported", report, err)
	}
	for i := range 3 {
		if !entryExists(project, keys[i]) {
			t.Fatalf("entry %d was removed though its removal failed", i)
		}
	}

	// Every removal refused, over a dozen entries again: it stops at the limit and says so.
	for i, key := range keys {
		writeUsed(t, store, project, key, 100, pruneNow.Add(-time.Duration(48-i)*time.Hour))
	}
	attempts = 0
	removeEntry = func(string, string) (bool, error) { attempts++; return false, denied }
	report, err = store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxAge: time.Hour}}, pruneNow, never)
	if err == nil || attempts != maxRemovalFailures || report.Removed != 0 || !strings.Contains(err.Error(), "gave up") {
		t.Fatalf("after %d attempts: report = %+v, err = %v; want it to give up after %d", attempts, report, err, maxRemovalFailures)
	}
}

// A link named like an entry is not an entry: it is kept, and what it points to is not touched, in or outside the cache folder.
func TestPruneKindsLeavesALinkNamedLikeAnEntryAndItsTarget(t *testing.T) {
	project, elsewhere := t.TempDir(), t.TempDir()
	store := NewCacheStore(project)
	inside := kindKey("a", "inside")
	writeUsed(t, store, project, inside, 100, pruneNow.Add(-400*24*time.Hour))
	outside := filepath.Join(elsewhere, "outside.json")
	if err := os.WriteFile(outside, []byte(`{"schemaVersion": 1, "analyzerId": "a", "blob": ""}`), 0o600); err != nil {
		t.Fatal(err)
	}
	links := map[string]string{
		filepath.Join(CacheDir(project), "link-out.json"):    outside,
		filepath.Join(CacheDir(project), "link-inside.json"): filepath.Join(CacheDir(project), inside.hash()+".json"),
	}
	for link, target := range links {
		if err := os.Symlink(target, link); err != nil {
			t.Skipf("no symbolic links here: %v", err)
		}
	}
	// Only the real entry may go: the links and the outside file stay.
	if _, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxAge: time.Hour}}, pruneNow, never); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(outside); err != nil {
		t.Fatalf("the file behind a link was removed: %v", err)
	}
	for link := range links {
		if _, err := os.Lstat(link); err != nil {
			t.Fatalf("link %s was removed: %v", filepath.Base(link), err)
		}
	}
	if entryExists(project, inside) {
		t.Fatal("the real entry, long unused, was not removed")
	}
}

// A kind named twice is handled by its first row only: a second row with a smaller cap does not trim what the first row kept.
func TestPruneKindsTakesTheFirstRowOfAKindNamedTwice(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	for i := range 3 {
		writeUsed(t, store, project, kindKey("a", fmt.Sprint(i)), 100, pruneNow.Add(-time.Duration(3-i)*time.Hour))
	}
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxBytes: 1 << 20}, {AnalyzerID: "a", MaxBytes: 1}}, pruneNow, never)
	if err != nil || report.Removed != 0 || report.FilesAfter != 3 {
		t.Fatalf("report = %+v, %v; want nothing removed: the first row has room for all three", report, err)
	}
}

// A removal that answers "nothing was there" is not counted as a removal, but the file is gone from the folder's tally.
func TestPruneKindsCountsOnlyWhatItRemoved(t *testing.T) {
	was := removeEntry
	t.Cleanup(func() { removeEntry = was })
	removeEntry = func(string, string) (bool, error) { return false, nil }
	project := t.TempDir()
	store := NewCacheStore(project)
	writeUsed(t, store, project, kindKey("a", "x"), 100, pruneNow.Add(-48*time.Hour))
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxAge: time.Hour}}, pruneNow, never)
	if err != nil || report.Removed != 0 || report.FilesAfter != 0 {
		t.Fatalf("report = %+v, %v; want 0 removed by this pass and 0 files left", report, err)
	}
}

// What another store already deleted frees its share of the cap: the pass does not evict a live entry to make room that is there.
func TestPruneKindsDoesNotEvictToMakeRoomThatAnotherStoreMade(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	gone, second, third := kindKey("a", "gone"), kindKey("a", "second"), kindKey("a", "third")
	writeUsed(t, store, project, gone, 100, pruneNow.Add(-3*time.Hour))
	writeUsed(t, store, project, second, 100, pruneNow.Add(-2*time.Hour))
	writeUsed(t, store, project, third, 100, pruneNow.Add(-time.Hour))
	capBytes := fileSize(t, project, second) + fileSize(t, project, third)

	looks := 0
	stop := func() bool {
		if looks++; looks == 2 { // after the listing, before the first removal
			_ = store.Delete(gone)
		}
		return false
	}
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxBytes: capBytes}}, pruneNow, stop)
	if err != nil {
		t.Fatal(err)
	}
	if !entryExists(project, second) || !entryExists(project, third) || report.Removed != 0 || report.FilesAfter != 2 {
		t.Fatalf("second kept %v, third kept %v, report %+v; want both kept: the third entry's room was made by the other store", entryExists(project, second), entryExists(project, third), report)
	}
}

// An entry that could not be removed still counts against the cap, so the pass goes on to the next one.
func TestPruneKindsKeepsCountingAnEntryItCouldNotRemove(t *testing.T) {
	was := removeEntry
	t.Cleanup(func() { removeEntry = was })
	project := t.TempDir()
	store := NewCacheStore(project)
	keys := []CacheEntryKey{kindKey("a", "1"), kindKey("a", "2"), kindKey("a", "3")}
	for i, key := range keys {
		writeUsed(t, store, project, key, 100, pruneNow.Add(-time.Duration(3-i)*time.Hour))
	}
	first := true
	removeEntry = func(root, rel string) (bool, error) {
		if first {
			first = false
			return false, errors.New("access is denied")
		}
		return was(root, rel)
	}
	// Room for one entry: the oldest cannot go, so both newer ones must.
	_, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxBytes: fileSize(t, project, keys[0])}}, pruneNow, never)
	if err == nil {
		t.Fatal("the refused removal was not reported")
	}
	if !entryExists(project, keys[0]) || entryExists(project, keys[1]) || entryExists(project, keys[2]) {
		t.Fatalf("kept: %v %v %v; want only the oldest, whose removal was refused", entryExists(project, keys[0]), entryExists(project, keys[1]), entryExists(project, keys[2]))
	}
}

// Two entries stamped in the future under a cap of one: the pass moves both to now and removes one in the same pass.
func TestPruneKindsRemovesAClampedEntryOverTheCapInTheSamePass(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	first, second := kindKey("a", "1"), kindKey("a", "2")
	writeUsed(t, store, project, first, 100, time.Now().Add(1000*24*time.Hour))
	writeUsed(t, store, project, second, 100, time.Now().Add(2000*24*time.Hour))
	// Either may be the one kept, and their sizes differ by a byte or two: the cap fits the larger.
	capBytes := max(fileSize(t, project, first), fileSize(t, project, second))
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxBytes: capBytes}}, time.Now(), never)
	if err != nil || report.Removed != 1 || report.FilesAfter != 1 {
		t.Fatalf("report = %+v, %v; want one of the two removed to meet the cap of one", report, err)
	}
}

// A file time that cannot be set (only the file's owner may) must not keep an entry for ever, nor leave it counted against the cap while
// the pass evicts others: the entry becomes the least recently used.
func TestPruneKindsEvictsAFutureEntryWhoseTimeCannotBeSetFirst(t *testing.T) {
	was := touchEntry
	t.Cleanup(func() { touchEntry = was })
	touchEntry = func(string, string, time.Time) error { return errors.New("operation not permitted") }
	project := t.TempDir()
	store := NewCacheStore(project)
	future, recent := kindKey("a", "future"), kindKey("a", "recent")
	writeUsed(t, store, project, future, 100, time.Now().Add(1000*24*time.Hour))
	writeUsed(t, store, project, recent, 100, time.Now().Add(-time.Hour))

	if _, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxBytes: fileSize(t, project, recent)}}, time.Now(), never); err != nil {
		t.Fatal(err)
	}
	if entryExists(project, future) || !entryExists(project, recent) {
		t.Fatalf("future kept %v, recent kept %v; want the entry whose time cannot be fixed evicted first, the recently used one kept", entryExists(project, future), entryExists(project, recent))
	}
	// And with a time limit it expires.
	writeUsed(t, store, project, future, 100, time.Now().Add(1000*24*time.Hour))
	if _, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxAge: time.Hour}}, time.Now(), never); err != nil {
		t.Fatal(err)
	}
	if entryExists(project, future) {
		t.Fatal("a future entry whose time could not be set never expired")
	}
}

// A pass that is already stopped reads no header and sets no file time.
func TestPruneKindsAlreadyStoppedDoesNothing(t *testing.T) {
	was := touchEntry
	t.Cleanup(func() { touchEntry = was })
	touched := 0
	touchEntry = func(dir, name string, at time.Time) error { touched++; return was(dir, name, at) }
	project := t.TempDir()
	store := NewCacheStore(project)
	writeUsed(t, store, project, kindKey("a", "future"), 100, time.Now().Add(1000*24*time.Hour))
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxAge: time.Hour}}, time.Now(), func() bool { return true })
	if err != nil || !report.Stopped || touched != 0 || report.FilesBefore != 0 {
		t.Fatalf("report = %+v, %v, %d file times set; want it stopped before it looked at anything", report, err, touched)
	}
}

// The give-up error says so first and carries one failure, so a log that cuts a long message keeps it.
func TestPruneKindsGiveUpErrorIsOneShortLineThatSaysSoFirst(t *testing.T) {
	was := removeEntry
	t.Cleanup(func() { removeEntry = was })
	removeEntry = func(string, string) (bool, error) { return false, errors.New("access is denied") }
	project := t.TempDir()
	store := NewCacheStore(project)
	for i := range 12 {
		writeUsed(t, store, project, kindKey("a", fmt.Sprint(i)), 100, pruneNow.Add(-48*time.Hour))
	}
	_, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxAge: time.Hour}}, pruneNow, never)
	if err == nil || !strings.HasPrefix(err.Error(), "gave up after 8 failed removals") || strings.Count(err.Error(), "\n") != 0 {
		t.Fatalf("err = %v; want one line beginning \"gave up after 8 failed removals\"", err)
	}
}

// A project path with ".." after a link is listed and deleted from in the same folder (the lexical one), never one folder for each.
func TestPruneKindsOfAProjectPathWithDotDotAfterALinkActsInOneFolder(t *testing.T) {
	base := t.TempDir()
	lexical, physical := filepath.Join(base, "lexical"), filepath.Join(base, "physical", "sub")
	if err := os.MkdirAll(lexical, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(physical, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(physical, filepath.Join(lexical, "link")); err != nil {
		t.Skipf("no symbolic links here: %v", err)
	}
	// Not filepath.Join, which would clean the ".." away before the store ever saw it.
	path := lexical + string(os.PathSeparator) + "link" + string(os.PathSeparator) + ".."
	// A fresh entry in the physical folder the operating system would resolve "..", then the lexical one holding an expired entry.
	fresh, expired := kindKey("a", "fresh"), kindKey("a", "expired")
	writeUsed(t, NewCacheStore(filepath.Join(base, "physical")), filepath.Join(base, "physical"), fresh, 100, time.Now())
	writeUsed(t, NewCacheStore(lexical), lexical, expired, 100, time.Now().Add(-48*time.Hour))

	if _, err := NewCacheStore(path).PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxAge: time.Hour}}, time.Now(), never); err != nil {
		t.Fatal(err)
	}
	if !entryExists(filepath.Join(base, "physical"), fresh) {
		t.Fatal("an entry in the folder the path resolves through the link was removed")
	}
	if entryExists(lexical, expired) {
		t.Fatal("the expired entry in the folder the path names was not removed")
	}
}

// Fewer failures than the limit are one line too: the count and the first.
func TestPruneKindsFewFailuresAreOneLineWithTheCount(t *testing.T) {
	was := removeEntry
	t.Cleanup(func() { removeEntry = was })
	removeEntry = func(string, string) (bool, error) { return false, errors.New("access is denied") }
	project := t.TempDir()
	store := NewCacheStore(project)
	for i := range 3 {
		writeUsed(t, store, project, kindKey("a", fmt.Sprint(i)), 100, pruneNow.Add(-48*time.Hour))
	}
	_, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxAge: time.Hour}}, pruneNow, never)
	if err == nil || !strings.HasPrefix(err.Error(), "3 analysis cache entries could not be removed") || strings.Count(err.Error(), "\n") != 0 {
		t.Fatalf("err = %v; want one line beginning with the count", err)
	}
}

// An entry of an analyzer no policy names is not touched at all: not removed, and its file time is not set either.
func TestPruneKindsDoesNotTouchTheFileTimeOfAnAnalyzerNoPolicyNames(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	key := kindKey("a-newer-analyzer", "future")
	future := time.Now().Add(1000 * 24 * time.Hour).Truncate(time.Second)
	writeUsed(t, store, project, key, 100, future)
	if _, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "rc", MaxAge: time.Hour}}, time.Now(), never); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(CacheDir(project), key.hash()+".json"))
	if err != nil || !info.ModTime().Equal(future) {
		t.Fatalf("modification time = %v (%v); want it left at %v", info.ModTime(), err, future)
	}
}

// An entry written smaller since the listing counts at its size now: the pass does not evict a live entry for the room it no longer takes.
func TestPruneKindsCountsASkippedEntryAtItsSizeNow(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	big, young := kindKey("a", "big"), kindKey("a", "young")
	// Times from the real clock: the pass reads a file time after its own now as "now".
	now := time.Now()
	writeUsed(t, store, project, big, 5000, now.Add(-2*time.Hour))
	writeUsed(t, store, project, young, 100, now.Add(-time.Hour))
	capBytes := int64(2000)

	looks := 0
	stop := func() bool {
		if looks++; looks == 2 { // after the listing, before the first removal: the big entry is written again, much smaller
			if err := store.Write(big, []byte("tiny")); err != nil {
				t.Error(err)
			}
		}
		return false
	}
	report, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "a", MaxBytes: capBytes}}, now.Add(time.Minute), stop)
	if err != nil {
		t.Fatal(err)
	}
	if !entryExists(project, big) || !entryExists(project, young) || report.Removed != 0 {
		t.Fatalf("big kept %v, young kept %v, report %+v; want both kept: together they fit under the cap", entryExists(project, big), entryExists(project, young), report)
	}
	if want := fileSize(t, project, big) + fileSize(t, project, young); report.BytesAfter != want {
		t.Fatalf("BytesAfter = %d, want %d (what is on disk)", report.BytesAfter, want)
	}
}

func TestPruneKindsOfNoStoreOrAnEmptyOneRemovesNothing(t *testing.T) {
	policies := []CacheKindPolicy{{AnalyzerID: "rc", MaxBytes: 1}}
	for name, store := range map[string]*CacheStore{"no cache folder": NewCacheStore(t.TempDir()), "no project": NewCacheStore("")} {
		report, err := store.PruneKinds(policies, pruneNow, never)
		if err != nil || report != (CachePrune{}) {
			t.Fatalf("%s: %+v, %v; want an empty report and no error", name, report, err)
		}
	}
}

func TestPruneKindsRefusesACacheFolderThatIsALink(t *testing.T) {
	project, elsewhere := t.TempDir(), t.TempDir()
	if err := os.WriteFile(filepath.Join(elsewhere, "x.json"), []byte(`{"schemaVersion": 1, "analyzerId": "rc", "blob": ""}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(CacheDir(project)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(elsewhere, CacheDir(project)); err != nil {
		t.Skipf("no symbolic links here: %v", err)
	}
	_, err := NewCacheStore(project).PruneKinds([]CacheKindPolicy{{AnalyzerID: "rc", MaxBytes: 1}}, pruneNow, never)
	if err == nil {
		t.Fatal("a cache folder that is a link was pruned")
	}
	if _, statErr := os.Stat(filepath.Join(elsewhere, "x.json")); statErr != nil {
		t.Fatalf("a file behind the link was removed: %v", statErr)
	}
}

func TestAHitMovesAnOldEntrysLastUseForwardSoItIsNotExpired(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	key := kindKey("editing.silence", "in-use")
	writeUsed(t, store, project, key, 10, time.Now().Add(-48*time.Hour))
	path := filepath.Join(CacheDir(project), key.hash()+".json")

	if _, ok := store.Read(key); !ok {
		t.Fatal("the entry did not read")
	}
	info, err := os.Stat(path)
	if err != nil || time.Since(info.ModTime()) > time.Minute {
		t.Fatalf("modification time after a hit = %v (%v); want now", info.ModTime(), err)
	}
	if _, err := store.PruneKinds([]CacheKindPolicy{{AnalyzerID: "editing.silence", MaxAge: 24 * time.Hour}}, time.Now(), never); err != nil {
		t.Fatal(err)
	}
	if !entryExists(project, key) {
		t.Fatal("an entry read a moment ago was expired")
	}
}

func TestAHitOnAnEntryUsedWithinTheHourLeavesItsTimeAlone(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	key := kindKey("rc", "recent")
	used := time.Now().Add(-10 * time.Minute).Truncate(time.Second)
	writeUsed(t, store, project, key, 10, used)

	if _, ok := store.Read(key); !ok {
		t.Fatal("the entry did not read")
	}
	info, err := os.Stat(filepath.Join(CacheDir(project), key.hash()+".json"))
	if err != nil || !info.ModTime().Equal(used) {
		t.Fatalf("modification time = %v (%v); want it unchanged at %v", info.ModTime(), err, used)
	}
}

func TestAMissOnAnEntryThatIsNotThereTouchesNothing(t *testing.T) {
	store := NewCacheStore(t.TempDir())
	if _, ok := store.Read(kindKey("rc", "none")); ok {
		t.Fatal("a missing entry read as a hit")
	}
	// markUsed on a path that is not there is a no-op, not a failure.
	store.markUsed(filepath.Join(store.dir, "absent.json"))
}

func fileSize(t *testing.T, project string, key CacheEntryKey) int64 {
	t.Helper()
	path := filepath.Join(CacheDir(project), key.hash()+".json")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	return info.Size()
}

// --- SliceFeatures ---

func TestSliceFeaturesExcludesEntriesEntirelyBeforeTheRange(t *testing.T) {
	features := []TimedFeature{{Start: 0, End: 1}}
	got := SliceFeatures(features, PlayedRange{Start: 2, End: 3})
	if len(got) != 0 {
		t.Fatalf("got %#v, want empty (feature ends before the range starts)", got)
	}
}

func TestSliceFeaturesExcludesEntriesEntirelyAfterTheRange(t *testing.T) {
	features := []TimedFeature{{Start: 5, End: 6}}
	got := SliceFeatures(features, PlayedRange{Start: 2, End: 3})
	if len(got) != 0 {
		t.Fatalf("got %#v, want empty (feature starts after the range ends)", got)
	}
}

func TestSliceFeaturesIncludesAFeatureFullyInsideTheRange(t *testing.T) {
	features := []TimedFeature{{Start: 2.2, End: 2.8}}
	got := SliceFeatures(features, PlayedRange{Start: 2, End: 3})
	if len(got) != 1 {
		t.Fatalf("got %#v, want the one contained feature", got)
	}
}

func TestSliceFeaturesIncludesAPartiallyOverlappingFeature(t *testing.T) {
	features := []TimedFeature{{Start: 2.5, End: 4}} // overlaps [2,3) only in [2.5,3)
	got := SliceFeatures(features, PlayedRange{Start: 2, End: 3})
	if len(got) != 1 {
		t.Fatalf("got %#v, want the one overlapping feature", got)
	}
}

func TestSliceFeaturesPreservesOrderAndFiltersAMixedList(t *testing.T) {
	features := []TimedFeature{
		{Start: 0, End: 1},     // before
		{Start: 2.2, End: 2.4}, // inside
		{Start: 2.9, End: 3.5}, // overlapping the end
		{Start: 10, End: 11},   // after
	}
	got := SliceFeatures(features, PlayedRange{Start: 2, End: 3})
	if len(got) != 2 || got[0].Start != 2.2 || got[1].Start != 2.9 {
		t.Fatalf("got %#v, want [2.2,2.4) then [2.9,3.5) in order", got)
	}
}

func TestSliceFeaturesOnAnEmptyListIsEmpty(t *testing.T) {
	got := SliceFeatures(nil, PlayedRange{Start: 0, End: 1})
	if len(got) != 0 {
		t.Fatalf("got %#v, want empty", got)
	}
}

// --- Write failures: a plain file stands where the store needs a folder ---

func TestWriteReportsACacheFolderItCannotCreate(t *testing.T) {
	notAFolder := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(notAFolder, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	store := NewCacheStore(filepath.Join(notAFolder, "cache"))
	if err := store.Write(baseCacheKey(), []byte("blob")); err == nil {
		t.Fatal("Write under a path that is a file: want an error, got nil")
	}
}

func TestWriteReportsAnEntryFileItCannotWrite(t *testing.T) {
	store := NewCacheStore(t.TempDir())
	key := baseCacheKey()
	// A folder with something in it where the entry file goes makes replacing it fail.
	if err := os.MkdirAll(filepath.Join(store.entryPath(key), "keep"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := store.Write(key, []byte("blob")); err == nil {
		t.Fatal("Write with a folder in the file's place: want an error, got nil")
	}
}

// The names are pinned: a change to what hash() hashes, or its order, would orphan every analysis cache file on disk.
func TestAnEntryWrittenBeforeDerivedKeyIsStillFoundByItsName(t *testing.T) {
	key := CacheEntryKey{
		Source:          SourceIdentity{Path: "audio/take.wav", Size: 1234, PartialHash: "abc"},
		AnalyzerID:      "editing.silence",
		AnalyzerVersion: "1",
		ParamHash:       "p",
	}
	ranged := key
	ranged.PlayedRange = &PlayedRange{Start: 1.5, End: 2.25}
	cases := []struct {
		name string
		key  CacheEntryKey
		want string
	}{
		{"whole source", key, "b1f9ae73eb442b5cde33b1e39e99e199ce0cbb434ad32efb914229ace40f6a1d"},
		{"played range", ranged, "71b6726a164c1c8b8bbee0d849bbd6a68f5f5f7a080f2833f8fc7371d933e044"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := tc.key.hash(); got != tc.want {
				t.Fatalf("hash() = %s, want %s", got, tc.want)
			}
			project := t.TempDir()
			if err := os.MkdirAll(CacheDir(project), 0o755); err != nil {
				t.Fatal(err)
			}
			envelope := `{"schemaVersion":1,"writtenAt":"2026-01-01T00:00:00Z","blob":"b2xk"}`
			if err := os.WriteFile(filepath.Join(CacheDir(project), tc.want+".json"), []byte(envelope), 0o600); err != nil {
				t.Fatal(err)
			}
			blob, ok := NewCacheStore(project).Read(tc.key)
			if !ok || string(blob) != "old" {
				t.Fatalf("Read = %q, %v; want the entry stored under the old name", blob, ok)
			}
		})
	}
}

// The envelope names the analyzer that wrote the entry, so an entry can be told apart by kind without its key; an
// entry written before the field reads as it did.
func TestTheEnvelopeNamesItsAnalyzer(t *testing.T) {
	project := t.TempDir()
	store := NewCacheStore(project)
	key := baseCacheKey()
	if err := store.Write(key, []byte("x")); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(CacheDir(project), key.hash()+".json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err := json.Unmarshal(raw, &fields); err != nil {
		t.Fatal(err)
	}
	if fields["analyzerId"] != "rc" || fields["schemaVersion"] != float64(1) {
		t.Fatalf("envelope = %s", raw)
	}

	if err := os.WriteFile(path, []byte(`{"schemaVersion":1,"writtenAt":"2026-01-02T03:04:05Z","blob":"b2xk"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if got, ok := store.Read(key); !ok || string(got) != "old" {
		t.Fatalf("an entry without analyzerId read as %q, found %v", got, ok)
	}
}
