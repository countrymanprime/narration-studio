package main

import (
	"sync"
	"testing"
)

// The background fill changes no answer: the chapter list read while it runs, and after it, is the one read before it,
// and the read after it decodes no ledger record and no stored result (issue 3806).
func TestTheBackgroundFillChangesNoAnswerAndLeavesNothingToDecode(t *testing.T) {
	host := coverageHost(t, coverageProject(t), true, fakeCoverageSidecar(8))
	checkRecording(t, host)
	want, err := host.ManuscriptChapters()
	if err != nil {
		t.Fatal(err)
	}
	var both sync.WaitGroup
	var during string
	both.Go(host.warmProject)
	both.Go(func() { during, _ = host.ManuscriptChapters() })
	both.Wait()
	if during != want {
		t.Fatalf("the chapter list read during the fill differs:\n%s\nwant\n%s", during, want)
	}
	_, decodes := host.coverage.LedgerReads()
	results := host.coverage.ResultsDecoded()
	after, err := host.ManuscriptChapters()
	if err != nil || after != want {
		t.Fatalf("the chapter list read after the fill differs (%v):\n%s\nwant\n%s", err, after, want)
	}
	if _, now := host.coverage.LedgerReads(); now != decodes || host.coverage.ResultsDecoded() != results {
		t.Fatalf("the read after the fill decoded %d ledger records and %d results, want none", now-decodes, host.coverage.ResultsDecoded()-results)
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
