package main

import (
	"fmt"
	"os"
	"runtime"
	"slices"
	"strings"
	"testing"
	"time"

	"desktop/internal/persist"
)

// perfRead is one read binding a page calls when it opens, as the page calls it.
type perfRead struct {
	name string
	call func(h *Host) (string, error)
}

// perfReads are the read bindings the pages call on opening, slowest first on a checked book. PickupsCount needs a live
// bridge and WorkspacePeaks needs audio; neither is here.
var perfReads = []perfRead{
	{"PickupsList", (*Host).PickupsList},
	{"ManuscriptChapters", (*Host).ManuscriptChapters},
	{"ProductionOverview", (*Host).ProductionOverview},
	{"ChapterSyncState", (*Host).ChapterSyncState},
	{"FindingsList({})", func(h *Host) (string, error) { return h.FindingsList(FindingsQuery{}) }},
	{"FindingsSummary", (*Host).FindingsSummary},
	{"WorkspaceAlignment(c-0001)", func(h *Host) (string, error) { return h.WorkspaceAlignment(perfChapterID(0)) }},
	{"StageRecommendations", (*Host).StageRecommendations},
	{"ChapterTrackLinks", (*Host).ChapterTrackLinks},
	{"GuideEntities", (*Host).GuideEntities},
	{"GuideDialogueCues", (*Host).GuideDialogueCues},
	{"MarksList", (*Host).MarksList},
	{"Bootstrap", func(h *Host) (string, error) { return encodeBinding(h.Bootstrap(), nil) }},
	{"ManuscriptParagraphs(c-0001)", func(h *Host) (string, error) { return h.ManuscriptParagraphs(perfChapterID(0)) }},
	{"SystemSettingsForScope(project)", func(h *Host) (string, error) { return h.SystemSettingsForScope("project") }},
}

// readCost is what one call of a read binding cost the host: the files it read and decoded and the record folders it
// listed (persist.Work), what it allocated, how long it took and the size of its answer. The counts are of the whole
// process, so nothing else may run beside the call.
type readCost struct {
	decodes, listings int64
	allocations       uint64
	allocatedBytes    uint64
	elapsed           time.Duration
	answerBytes       int
}

func costOf(t *testing.T, host *Host, read perfRead) readCost {
	t.Helper()
	var before, after runtime.MemStats
	decodes, listings := persist.Work()
	runtime.ReadMemStats(&before)
	started := time.Now()
	answer, err := read.call(host)
	elapsed := time.Since(started)
	runtime.ReadMemStats(&after)
	if err != nil {
		t.Fatalf("%s: %v", read.name, err)
	}
	nowDecodes, nowListings := persist.Work()
	return readCost{
		decodes: nowDecodes - decodes, listings: nowListings - listings,
		allocations: after.Mallocs - before.Mallocs, allocatedBytes: after.TotalAlloc - before.TotalAlloc,
		elapsed: elapsed, answerBytes: len(answer),
	}
}

// freshPerfHost is a host over the book that has read nothing yet: what a page's first read meets after the app starts.
func freshPerfHost(t *testing.T, dir string) *Host {
	t.Helper()
	savedProjects.reset()
	return perfHost(t, dir)
}

// perfReadsEnv turns TestPrintTheHostReadTable on, over the book NARRATION_PERF_BOOK names.
const perfReadsEnv = "NARRATION_PERF_READS"

// TestPrintTheHostReadTable times every read binding of perfReads on the seeded book in NARRATION_PERF_BOOK and prints a
// Markdown table: the first call on a host that has read nothing, the median of the calls after it, and the first call's
// answer size, decodes, folder listings and allocations. scripts/dev/host-read-bench.mjs seeds the book and runs it.
func TestPrintTheHostReadTable(t *testing.T) {
	dir := os.Getenv(perfBookDirEnv)
	if dir == "" || os.Getenv(perfReadsEnv) == "" {
		t.Skipf("set %s to a seeded book and %s=1 to time its reads", perfBookDirEnv, perfReadsEnv)
	}
	var table strings.Builder
	table.WriteString("| Binding | First call, ms | Warm median, ms (calls) | Answer, bytes | Decodes, first / warm | Listings, first / warm | Allocations, first / warm | Allocated, MB, first |\n")
	table.WriteString("| --- | --- | --- | --- | --- | --- | --- | --- |\n")
	for _, read := range perfReads {
		host := freshPerfHost(t, dir)
		first := costOf(t, host, read)
		// As many warm calls as the first call's cost allows: 9, 3 after a second, 1 after five.
		calls := 9
		if first.elapsed > 5*time.Second {
			calls = 1
		} else if first.elapsed > time.Second {
			calls = 3
		}
		var warm []readCost
		for range calls {
			warm = append(warm, costOf(t, host, read))
		}
		slices.SortFunc(warm, func(a, b readCost) int { return int(a.elapsed - b.elapsed) })
		median := warm[len(warm)/2]
		fmt.Fprintf(&table, "| `%s` | %.1f | %.1f (%d) | %d | %d / %d | %d / %d | %d / %d | %.1f |\n",
			read.name, ms(first.elapsed), ms(median.elapsed), calls, first.answerBytes,
			first.decodes, median.decodes, first.listings, median.listings, first.allocations, median.allocations, float64(first.allocatedBytes)/1e6)
	}
	// What the host keeps in memory once every read has been made: the heap in use after a collection, less the same on a
	// host that has read nothing. It is the size of every cache the reads fill, together.
	idle := freshPerfHost(t, dir)
	before := heapInUse()
	for _, read := range perfReads {
		costOf(t, idle, read)
	}
	held := float64(heapInUse()-before) / 1e6
	runtime.KeepAlive(idle)
	fmt.Printf("\nHost reads on %s (%s/%s, %d CPUs, %s)\n\n%s\nHeld in memory after every read: %.1f MB\n", dir, runtime.GOOS, runtime.GOARCH, runtime.NumCPU(), runtime.Version(), table.String(), held)
}

func heapInUse() int64 {
	var stats runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&stats)
	return int64(stats.HeapAlloc)
}

func ms(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }

// readBudget is the most one call of a read binding may cost on budgetBook: on a host that has read nothing (first) and
// on the call after it (warm).
type readBudget struct {
	name        string
	first, warm workBudget
}

// workBudget caps the files decoded, the record folders listed and the allocations of one call.
type workBudget struct {
	decodes, listings int64
	allocations       uint64
}

// budgetBook is the 17 hour book of the performance research (44 chapters, a recording check on each) with short
// chapters and few takes: 4 paragraphs and 10 items each, so seeding it under the race detector stays in seconds. The
// decodes and listings a read makes follow the chapters and their checks, not the words, so they are the real book's; the
// allocations are this small book's own.
var budgetBook = perfBook{Chapters: 44, Paragraphs: 4, Items: 10, Checked: 44, Checks: 1}

// readBudgets are the five reads every page waits for (docs/research/performance-architecture-2026-11.md). Decodes and
// listings are what main costs today, exactly; allocations are that with half as much again, since the runtime's own vary.
// A change that makes a read cheaper lowers its row; one that needs a row raised says why in its pull request.
var readBudgets = []readBudget{
	{"ManuscriptChapters", workBudget{341, 178, 480000}, workBudget{298, 178, 440000}},
	{"ProductionOverview", workBudget{391, 178, 510000}, workBudget{348, 178, 470000}},
	{"PickupsList", workBudget{528, 268, 710000}, workBudget{481, 268, 660000}},
	{"ChapterSyncState", workBudget{199, 88, 260000}, workBudget{155, 88, 220000}},
	{"FindingsSummary", workBudget{44, 2, 22000}, workBudget{44, 2, 22000}},
}

// The budgets count work, not time: a shared runner's clock varies by more than a regression would move it, and the same
// counts hold on Windows, the platform the app ships on, where CI runs this test.
func TestTheSlowReadsStayInsideTheirBudgetsOnA44ChapterBook(t *testing.T) {
	dir := t.TempDir()
	seedPerfBook(t, dir, budgetBook)
	for _, budget := range readBudgets {
		index := slices.IndexFunc(perfReads, func(read perfRead) bool { return read.name == budget.name })
		read := perfReads[index]
		host := freshPerfHost(t, dir)
		first := costOf(t, host, read)
		warm := costOf(t, host, read)
		t.Logf("%s: first %d decodes, %d listings, %d allocations; warm %d, %d, %d",
			read.name, first.decodes, first.listings, first.allocations, warm.decodes, warm.listings, warm.allocations)
		for _, check := range []struct {
			when string
			got  readCost
			most workBudget
		}{{"first", first, budget.first}, {"warm", warm, budget.warm}} {
			if check.got.decodes > check.most.decodes {
				t.Errorf("%s, %s call: decoded %d files, budget %d", read.name, check.when, check.got.decodes, check.most.decodes)
			}
			if check.got.listings > check.most.listings {
				t.Errorf("%s, %s call: listed %d folders, budget %d", read.name, check.when, check.got.listings, check.most.listings)
			}
			if check.got.allocations > check.most.allocations {
				t.Errorf("%s, %s call: %d allocations, budget %d", read.name, check.when, check.got.allocations, check.most.allocations)
			}
		}
	}
}
