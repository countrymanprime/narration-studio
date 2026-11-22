package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"desktop/internal/evidence"
	"desktop/internal/stages"
)

// perfRetentionEnv turns TestPrintTheRetentionPass on, over the book NARRATION_PERF_BOOK names.
const perfRetentionEnv = "NARRATION_PERF_RETENTION"

// perfCacheEntriesEnv adds that many analysis cache entries of each kind to the copy before the cache step runs (#3816), a third of
// each aged past the kind's limits, so the cache pass has something to remove.
const perfCacheEntriesEnv = "NARRATION_PERF_CACHE_ENTRIES"

// TestPrintTheRetentionPass runs the ledger retention step (#3816) over a copy of the seeded book in NARRATION_PERF_BOOK, twice, and
// prints what each pass cost and removed, with the first call of two reads that walk the ledger before the pass and after it.
// The book is copied first: the pass deletes. scripts/dev/host-read-bench.mjs seeds the book (--checks 3 gives each chapter two
// superseded records) and runs this.
func TestPrintTheRetentionPass(t *testing.T) {
	src := os.Getenv(perfBookDirEnv)
	if src == "" || os.Getenv(perfRetentionEnv) == "" {
		t.Skipf("set %s to a seeded book and %s=1 to time the retention pass", perfBookDirEnv, perfRetentionEnv)
	}
	dir := t.TempDir()
	if err := os.CopyFS(dir, os.DirFS(src)); err != nil {
		t.Fatalf("copying the book: %v", err)
	}
	walk := []perfRead{perfReads[1], perfReads[2], perfReads[3]} // ManuscriptChapters, ProductionOverview, ChapterSyncState
	before := make([]readCost, len(walk))
	host := freshPerfHost(t, dir)
	for i, read := range walk {
		before[i] = costOf(t, host, read)
	}
	// The pass runs on a host of its own, so its first pass meets a ledger store that has decoded nothing.
	cold := freshPerfHost(t, dir)
	cold.mu.RLock()
	ledger, checks := cold.ledger, cold.coverage
	cold.mu.RUnlock()
	step := ledgerRetention{
		project:      dir,
		ledger:       ledger,
		referenced:   stages.NewDecisionStore(dir, cold.persist).ReferencedRecordIDs,
		removeResult: checks.RemoveStoredResult,
		sweep:        checks.SweepOrphanResults,
		measure:      measureDirs(ledgerRetentionDirs(dir)),
	}
	var out string
	for pass := 1; pass <= 2; pass++ {
		started := time.Now()
		report := step.Run(context.Background(), func() bool { return false })
		out += fmt.Sprintf("| %d | %.0f | %d → %d | %.2f → %.2f | %d |\n", pass, ms(time.Since(started)), report.FilesBefore, report.FilesAfter,
			float64(report.BytesBefore)/1e6, float64(report.BytesAfter)/1e6, report.Removed)
		if report.Err != nil {
			t.Fatalf("pass %d: %v", pass, report.Err)
		}
	}
	cacheTable := perfCachePass(t, dir)
	after := freshPerfHost(t, dir)
	table := "| Read, first call on a host that has read nothing | Before the pass, ms | After, ms |\n| --- | --- | --- |\n"
	for i, read := range walk {
		table += fmt.Sprintf("| `%s` | %.1f | %.1f |\n", read.name, ms(before[i].elapsed), ms(costOf(t, after, read).elapsed))
	}
	fmt.Printf("\nRetention pass on %s (%s/%s, %d CPUs, %s)\n\n| Pass | ms | Files | MB | Removed |\n| --- | --- | --- | --- | --- |\n%s\n%s%s", src, runtime.GOOS, runtime.GOARCH, runtime.NumCPU(), runtime.Version(), out, table, cacheTable)
}

// perfCachePass fills the copy's analysis cache with NARRATION_PERF_CACHE_ENTRIES entries of each kind (8 KB blobs; every third file, of any kind,
// last used 400 days ago and the others 0 to 39 hours ago) and runs the cache step twice. It answers "" when none were asked for.
func perfCachePass(t *testing.T, dir string) string {
	t.Helper()
	var each int
	if _, err := fmt.Sscan(os.Getenv(perfCacheEntriesEnv), &each); err != nil || each <= 0 {
		return ""
	}
	store := evidence.NewCacheStore(dir)
	now := time.Now()
	blob := make([]byte, 8<<10)
	for _, policy := range cacheRetentionPolicies {
		for i := range each {
			key := evidence.CacheEntryKey{
				Source:     evidence.SourceIdentity{Path: fmt.Sprintf("media/%d.wav", i), Size: 1000, PartialHash: "h"},
				AnalyzerID: policy.AnalyzerID, AnalyzerVersion: "1", ParamHash: "perf",
			}
			if err := store.Write(key, blob); err != nil {
				t.Fatal(err)
			}
		}
	}
	// Last use by position in the folder, the same mix for every kind: a third long ago, the rest within the last 40 hours.
	files, err := os.ReadDir(evidence.CacheDir(dir))
	if err != nil {
		t.Fatal(err)
	}
	for i, file := range files {
		used := now.Add(-time.Duration(i%40) * time.Hour)
		if i%3 == 0 {
			used = now.Add(-400 * 24 * time.Hour)
		}
		if err := os.Chtimes(filepath.Join(evidence.CacheDir(dir), file.Name()), used, used); err != nil {
			t.Fatal(err)
		}
	}
	step := cacheRetention{cache: store, policies: cacheRetentionPolicies, now: time.Now}
	out := fmt.Sprintf("\n%d cache entries of each of %d kinds (8 KB each)\n\n| Pass | ms | Files | MB | Removed |\n| --- | --- | --- | --- | --- |\n", each, len(cacheRetentionPolicies))
	for pass := 1; pass <= 2; pass++ {
		started := time.Now()
		report := step.Run(context.Background(), func() bool { return false })
		if report.Err != nil {
			t.Fatalf("cache pass %d: %v", pass, report.Err)
		}
		out += fmt.Sprintf("| %d | %.0f | %d \u2192 %d | %.2f \u2192 %.2f | %d |\n", pass, ms(time.Since(started)), report.FilesBefore, report.FilesAfter,
			float64(report.BytesBefore)/1e6, float64(report.BytesAfter)/1e6, report.Removed)
	}
	return out
}
