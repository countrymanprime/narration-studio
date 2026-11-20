package main

import "testing"

// What a page's read asks of the analysis ledger does not grow with the book (issue 3749): each read lists the ledger's
// folder once per pass over the chapters, where each chapter's evaluation used to list it twice, and decodes no record it
// has decoded before.
func TestAPagesReadsListTheLedgerOncePerPassAndDecodeNothingTwice(t *testing.T) {
	project := coverageProject(t)
	host := coverageHost(t, project, true, fakeCoverageSidecar(8))
	checkRecording(t, host)
	reads := []struct {
		name     string
		read     func() (string, error)
		listings int
	}{
		// One pass gives the chapter list both its recorded fractions and the proof lines for how far a chapter is recorded.
		{"the chapter list", host.ManuscriptChapters, 1},
		{"chapter sync", host.ChapterSyncState, 1},
		// The pickup list reads the chapter list, then makes a pass of its own.
		{"the pickup list", host.PickupsList, 2},
		{"the Production overview", host.ProductionOverview, 1},
	}
	for _, each := range reads { // the first read of each decodes what it needs
		if _, err := each.read(); err != nil {
			t.Fatalf("%s: %v", each.name, err)
		}
	}
	for _, each := range reads {
		listings, decodes := host.coverage.LedgerReads()
		if _, err := each.read(); err != nil {
			t.Fatalf("%s: %v", each.name, err)
		}
		listingsAfter, decodesAfter := host.coverage.LedgerReads()
		if got := listingsAfter - listings; got != each.listings {
			t.Errorf("%s listed the ledger %d times, want %d", each.name, got, each.listings)
		}
		if decodesAfter != decodes {
			t.Errorf("%s decoded %d ledger files it had decoded before", each.name, decodesAfter-decodes)
		}
	}
}
