package main

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"desktop/internal/evidence"
)

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
		// The pickup list makes one pass: it reads the chapters without their recorded fractions (issue 3804).
		{"the pickup list", host.PickupsList, 1},
		{"the open pickups count", host.PickupsOpenCount, 1},
		{"the Production overview", host.ProductionOverview, 1},
	}
	for _, each := range reads { // the first read of each decodes what it needs
		if _, err := each.read(); err != nil {
			t.Fatalf("%s: %v", each.name, err)
		}
	}
	results := host.coverage.ResultsDecoded()
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
	// None of them reads a stored result itself: the figures and the gaps come from each result's summary.
	if decoded := host.coverage.ResultsDecoded() - results; decoded != 0 {
		t.Errorf("the reads decoded %d stored results, want 0", decoded)
	}
}

// ledgerStoreMakers are the only places that make a ledger store: the host makes the project's one, and the two services
// make their own only when they are built without it (their package tests). A second store in the host would decode every
// record again and hold a second copy of the ledger (issue 3801): take Host.ledger, or hostServices.ledger, and pass it in.
var ledgerStoreMakers = []string{"app.go", "internal/coverage/service.go", "internal/editing/service.go"}

func TestTheHostMakesOneLedgerStorePerProject(t *testing.T) {
	var found []string
	err := filepath.WalkDir(".", func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		slash := filepath.ToSlash(path) // Windows walks with backslashes
		if !strings.HasSuffix(slash, ".go") || strings.HasSuffix(slash, "_test.go") || strings.HasPrefix(slash, "internal/evidence/") {
			return nil
		}
		text, err := os.ReadFile(path)
		if err == nil && strings.Contains(string(text), "evidence.NewLedgerStore(") {
			found = append(found, slash)
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	slices.Sort(found)
	if !slices.Equal(found, ledgerStoreMakers) {
		t.Errorf("evidence.NewLedgerStore is called in %v, want only %v: a project has one ledger store (Host.ledger)", found, ledgerStoreMakers)
	}
}

// A record any part of the host writes goes through the project's one store, so the next read of a page decodes that one
// file and nothing else, and sees it.
func TestARecordWrittenThroughTheProjectsStoreIsDecodedOnceByTheNextRead(t *testing.T) {
	host := coverageHost(t, coverageProject(t), true, fakeCoverageSidecar(8))
	checkRecording(t, host)
	if _, err := host.ManuscriptChapters(); err != nil {
		t.Fatal(err)
	}
	svc := host.services()
	at := time.Now().UTC()
	written, err := svc.ledger.Write(evidence.LedgerRecord{AnalyzerID: "editing.silence", AnalyzerVersion: "1", Scope: evidence.LedgerScope{DocumentID: "d", ChapterID: "c-0001"}, StartedAt: at, CompletedAt: at, Outcome: evidence.LedgerComplete})
	if err != nil {
		t.Fatal(err)
	}
	_, decodes := svc.coverage.LedgerReads()
	if _, err := host.ManuscriptChapters(); err != nil {
		t.Fatal(err)
	}
	if _, after := svc.coverage.LedgerReads(); after-decodes != 1 {
		t.Errorf("the read after one write decoded %d ledger files, want 1", after-decodes)
	}
	if listings, total := svc.ledger.Reads(); func() bool { l, d := svc.coverage.LedgerReads(); return l != listings || d != total }() {
		t.Error("the coverage service reads a ledger store of its own, not the project's")
	}
	if _, found := svc.ledger.Get(written.ID); !found {
		t.Error("the written record is not in the project's store")
	}
}

// A stage evaluation lists the ledger once for every provider and chapter it asks, and not at all when no chapter is at a
// stage that is judged (issue 3801); each chapter's recording signal used to list it three times.
func TestAStageEvaluationListsTheLedgerOnce(t *testing.T) {
	host := stagesHost(t, 8)
	checkRecording(t, host)
	stageChapters(t, host)
	listings, decodes := host.coverage.LedgerReads()
	chapters := stageChapters(t, host)
	if len(chapters) == 0 {
		t.Fatal("no chapter was evaluated")
	}
	after, decodesAfter := host.coverage.LedgerReads()
	if after-listings != 1 || decodesAfter != decodes {
		t.Errorf("the stage recommendations listed the ledger %d times and decoded %d files again, want 1 and 0", after-listings, decodesAfter-decodes)
	}
}
