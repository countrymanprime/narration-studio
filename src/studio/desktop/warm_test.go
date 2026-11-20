package main

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"desktop/internal/coverage"
)

// A chapter list read while the background fill runs, on a host that has read nothing yet and a book whose summaries
// are gone, is the list read without a fill, and between the two each ledger record and the one stored result are
// decoded once: the binding waits on the fill's work or finds it done, it does not repeat it (issue 3806). The read
// after it decodes nothing.
func TestAChapterListReadDuringTheBackgroundFillOfAColdHostDecodesNothingTwice(t *testing.T) {
	project := coverageProject(t)
	checked := coverageHost(t, project, true, fakeCoverageSidecar(8))
	checkRecording(t, checked)
	want, err := checked.ManuscriptChapters()
	if err != nil {
		t.Fatal(err)
	}
	records, err := checked.services().ledger.All()
	if err != nil || len(records) == 0 {
		t.Fatalf("the fixture's ledger: %d records, %v", len(records), err)
	}
	checked.chapterSyncEmits.Wait() // the finished check's own chaptersync:state read
	for round := 0; round < 8; round++ {
		if err := os.RemoveAll(filepath.Join(coverage.Dir(project), "summaries")); err != nil {
			t.Fatal(err)
		}
		host := coverageHost(t, project, true, fakeCoverageSidecar(8)) // a new host: no ledger record, result or summary read yet
		var both sync.WaitGroup
		var during string
		both.Go(host.warmProject)
		both.Go(func() { during, _ = host.ManuscriptChapters() })
		both.Wait()
		if during != want {
			t.Fatalf("round %d: the chapter list read during the fill differs:\n%s\nwant\n%s", round, during, want)
		}
		_, decodes := host.coverage.LedgerReads()
		if results := host.coverage.ResultsDecoded(); decodes != len(records) || results != 1 {
			t.Fatalf("round %d: the fill and the read decoded %d ledger files for %d records and %d results for 1 chapter", round, decodes, len(records), results)
		}
		after, err := host.ManuscriptChapters()
		if err != nil || after != want {
			t.Fatalf("round %d: the chapter list read after the fill differs (%v)", round, err)
		}
		if _, now := host.coverage.LedgerReads(); now != decodes || host.coverage.ResultsDecoded() != 1 {
			t.Fatalf("round %d: the read after the fill decoded %d ledger records and %d results more, want none", round, now-decodes, host.coverage.ResultsDecoded()-1)
		}
		host.waitForBackground()
	}
}

// With no project, or a project with no manuscript, the fill returns at once.
func TestTheBackgroundFillOfNoProjectReturns(t *testing.T) {
	t.Setenv("APPDATA", t.TempDir())
	newTestHost(t).warmProject()
	host := newTestHost(t)
	next := host.config
	next.projectFolder = t.TempDir()
	host.mu.Lock()
	attached, reason := host.attachProjectLocked(next)
	host.mu.Unlock()
	if !attached {
		t.Fatalf("attach failed: %s", reason)
	}
	host.warmProject()
	if listings, _ := host.services().coverage.LedgerReads(); listings != 0 {
		t.Fatalf("the fill of a project with no manuscript listed the ledger %d times", listings)
	}
}

// A fill that panics is logged and ends there: the caller, and the app, go on.
func TestABackgroundFillThatPanicsIsLoggedAndTheHostGoesOn(t *testing.T) {
	host := coverageHost(t, coverageProject(t), true, fakeCoverageSidecar(8))
	checkRecording(t, host)
	host.chapterSyncEmits.Wait()
	host.mu.Lock()
	host.settings = nil // warmProject reads the coverage settings through it: a nil store panics
	host.mu.Unlock()
	host.warmProject()
	if _, err := host.ManuscriptChapters(); err != nil {
		t.Fatalf("after a failed fill the chapter list answers %v", err)
	}
}
