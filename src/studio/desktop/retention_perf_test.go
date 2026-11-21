package main

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"testing"
	"time"

	"desktop/internal/stages"
)

// perfRetentionEnv turns TestPrintTheRetentionPass on, over the book NARRATION_PERF_BOOK names.
const perfRetentionEnv = "NARRATION_PERF_RETENTION"

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
	host.mu.RLock()
	ledger, checks := host.ledger, host.coverage
	host.mu.RUnlock()
	step := ledgerRetention{
		project:      dir,
		ledger:       ledger,
		referenced:   stages.NewDecisionStore(dir, host.persist).ReferencedRecordIDs,
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
	after := freshPerfHost(t, dir)
	table := "| Read, first call on a host that has read nothing | Before the pass, ms | After, ms |\n| --- | --- | --- |\n"
	for i, read := range walk {
		table += fmt.Sprintf("| `%s` | %.1f | %.1f |\n", read.name, ms(before[i].elapsed), ms(costOf(t, after, read).elapsed))
	}
	fmt.Printf("\nRetention pass on %s (%s/%s, %d CPUs, %s)\n\n| Pass | ms | Files | MB | Removed |\n| --- | --- | --- | --- | --- |\n%s\n%s", src, runtime.GOOS, runtime.GOARCH, runtime.NumCPU(), runtime.Version(), out, table)
}
