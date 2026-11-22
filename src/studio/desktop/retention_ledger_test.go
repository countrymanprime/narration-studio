package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"testing"
	"time"

	"desktop/internal/coverage"
	"desktop/internal/evidence"
	"desktop/internal/retention"
	"desktop/internal/stages"
)

// stepRig is the ledger step over a real ledger in a temp project, with the result store and the sweep replaced by recorders.
type stepRig struct {
	t          *testing.T
	project    string
	ledger     *evidence.LedgerStore
	clock      time.Time
	removed    []string
	swept      []string
	sweepRuns  int
	referenced func() (map[string]bool, error)
	removeErr  map[string]error
}

func newStepRig(t *testing.T) *stepRig {
	t.Helper()
	project := t.TempDir()
	return &stepRig{t: t, project: project, ledger: evidence.NewLedgerStore(project), clock: time.Date(2026, 5, 1, 8, 0, 0, 0, time.UTC),
		referenced: func() (map[string]bool, error) { return map[string]bool{}, nil }, removeErr: map[string]error{}}
}

func (r *stepRig) write(id, analyzer string, outcome evidence.LedgerOutcome) {
	r.t.Helper()
	r.clock = r.clock.Add(time.Minute)
	record := evidence.LedgerRecord{
		ID: id, AnalyzerID: analyzer, AnalyzerVersion: "1", Scope: evidence.LedgerScope{DocumentID: "d", ChapterID: "c-0001"},
		StartedAt: r.clock, CompletedAt: r.clock.Add(time.Second), Outcome: outcome,
	}
	if _, err := r.ledger.Write(record); err != nil {
		r.t.Fatal(err)
	}
}

func (r *stepRig) step() ledgerRetention {
	return ledgerRetention{
		project:    r.project,
		ledger:     r.ledger,
		referenced: func() (map[string]bool, error) { return r.referenced() },
		removeResult: func(id string) error {
			if err := r.removeErr[id]; err != nil {
				return err
			}
			r.removed = append(r.removed, id)
			return nil
		},
		sweep:   func() ([]string, error) { r.sweepRuns++; return r.swept, nil },
		measure: measureDirs(ledgerRetentionDirs(r.project)),
	}
}

func (r *stepRig) run(stop func() bool) retention.Report {
	r.t.Helper()
	return r.step().Run(context.Background(), stop)
}

func (r *stepRig) left() []string {
	r.t.Helper()
	all, err := r.ledger.All()
	if err != nil {
		r.t.Fatal(err)
	}
	var ids []string
	for _, record := range all {
		ids = append(ids, record.ID)
	}
	sort.Strings(ids)
	return ids
}

func never() bool { return false }

// A cancelled re-check does not take the chapter's current record with it, and an older complete one goes with its result.
func TestTheLedgerStepDropsASupersededRecordAndItsResultAndKeepsWhatAReaderReads(t *testing.T) {
	rig := newStepRig(t)
	rig.write("c0", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.write("c1", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.write("p2", coverage.AnalyzerID, evidence.LedgerPartial)
	report := rig.run(never)
	if report.Err != nil || report.Removed != 1 || report.Stopped {
		t.Fatalf("report = %+v, want one record removed and no error", report)
	}
	if !slices.Equal(rig.removed, []string{"c0"}) || !slices.Equal(rig.left(), []string{"c1", "p2"}) {
		t.Fatalf("results removed for %v, ledger holds %v; want c0 gone, c1 and p2 kept", rig.removed, rig.left())
	}
	if rig.sweepRuns != 1 {
		t.Fatalf("the orphan sweep ran %d times, want once after the pass", rig.sweepRuns)
	}
}

// A narrator's decision stands on a record: it is kept wherever it stands in the history.
func TestTheLedgerStepKeepsARecordADecisionStandsOn(t *testing.T) {
	rig := newStepRig(t)
	rig.write("c0", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.write("c1", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.referenced = func() (map[string]bool, error) { return map[string]bool{"c0": true}, nil }
	if report := rig.run(never); report.Removed != 0 || report.Err != nil {
		t.Fatalf("report = %+v, want nothing removed", report)
	}
	if !slices.Equal(rig.left(), []string{"c0", "c1"}) || len(rig.removed) != 0 {
		t.Fatalf("ledger holds %v, results removed for %v; want both records and no result removed", rig.left(), rig.removed)
	}
}

// Without the ids a decision stands on, nothing may go: an unreadable decisions file stops the step, and the sweep does not run.
func TestTheLedgerStepDeletesNothingWhenTheDecisionsCannotBeRead(t *testing.T) {
	rig := newStepRig(t)
	rig.write("c0", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.write("c1", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.referenced = func() (map[string]bool, error) { return nil, errors.New("your stage decisions file could not be read") }
	report := rig.run(never)
	if report.Err == nil || report.Removed != 0 {
		t.Fatalf("report = %+v, want an error and nothing removed", report)
	}
	if !slices.Equal(rig.left(), []string{"c0", "c1"}) || len(rig.removed) != 0 || rig.sweepRuns != 0 {
		t.Fatalf("ledger holds %v, results removed %v, sweeps %d; want everything kept and no sweep", rig.left(), rig.removed, rig.sweepRuns)
	}
}

// An analyzer the step has no key for keeps every record, however many there are.
func TestTheLedgerStepKeepsTheRecordsOfAnAnalyzerItHasNoKeyFor(t *testing.T) {
	rig := newStepRig(t)
	rig.write("u0", "diagnostics", evidence.LedgerComplete)
	rig.write("u1", "diagnostics", evidence.LedgerComplete)
	if report := rig.run(never); report.Removed != 0 {
		t.Fatalf("report = %+v, want nothing removed", report)
	}
	if !slices.Equal(rig.left(), []string{"u0", "u1"}) {
		t.Fatalf("ledger holds %v, want both", rig.left())
	}
}

// Only a coverage record has a stored result: an editing record's superseded one goes without asking the result store.
func TestTheLedgerStepAsksTheResultStoreOnlyForCoverageRecords(t *testing.T) {
	rig := newStepRig(t)
	for _, id := range []string{"e0", "e1"} {
		r := rig
		r.clock = r.clock.Add(time.Minute)
		record := evidence.LedgerRecord{
			ID: id, AnalyzerID: "editing.silence", AnalyzerVersion: "1",
			Scope:     evidence.LedgerScope{DocumentID: "d", ChapterID: "c-0001", ItemGUIDs: []string{"i1"}},
			StartedAt: r.clock, CompletedAt: r.clock.Add(time.Second), Outcome: evidence.LedgerComplete,
		}
		if _, err := r.ledger.Write(record); err != nil {
			t.Fatal(err)
		}
	}
	report := rig.run(never)
	if report.Removed != 1 || len(rig.removed) != 0 || !slices.Equal(rig.left(), []string{"e1"}) {
		t.Fatalf("report = %+v, results asked %v, ledger holds %v; want e0 dropped without a result removal", report, rig.removed, rig.left())
	}
}

// A result that cannot be removed leaves its record, and the pass goes on to the rest and reports the error.
func TestTheLedgerStepKeepsARecordWhoseResultCannotBeRemoved(t *testing.T) {
	rig := newStepRig(t)
	rig.write("c0", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.write("c1", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.write("c2", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.removeErr["c0"] = errors.New("the result is held open")
	report := rig.run(never)
	if report.Err == nil || report.Removed != 1 {
		t.Fatalf("report = %+v, want c1 removed and the error for c0", report)
	}
	if !slices.Equal(rig.left(), []string{"c0", "c2"}) {
		t.Fatalf("ledger holds %v, want c0 (its result stayed) and c2", rig.left())
	}
}

// A check that starts stops the step before it deletes anything.
func TestTheLedgerStepDoesNotStartWhenToldToStop(t *testing.T) {
	rig := newStepRig(t)
	rig.write("c0", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.write("c1", coverage.AnalyzerID, evidence.LedgerComplete)
	report := rig.run(func() bool { return true })
	if !report.Stopped || report.Removed != 0 || !slices.Equal(rig.left(), []string{"c0", "c1"}) || rig.sweepRuns != 0 {
		t.Fatalf("report = %+v, ledger holds %v, sweeps %d; want a stopped step that deleted nothing", report, rig.left(), rig.sweepRuns)
	}
}

// The records the sweep removed results for count in what the pass removed.
func TestTheLedgerStepCountsWhatTheSweepRemoved(t *testing.T) {
	rig := newStepRig(t)
	rig.write("c0", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.swept = []string{"orphan-1", "orphan-2"}
	if report := rig.run(never); report.Removed != 2 {
		t.Fatalf("report = %+v, want the two swept records counted", report)
	}
}

// A corrupt stage-decisions.json stops every pass, not only the first: the pass must not move the narrator's file aside, or the next
// pass would read a missing file as no decisions and delete the records the lost decision named.
func TestTheLedgerStepStopsEveryPassWhileTheDecisionsFileIsCorrupt(t *testing.T) {
	rig := newStepRig(t)
	rig.write("c0", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.write("c1", coverage.AnalyzerID, evidence.LedgerComplete)
	path := stages.DecisionsFile(rig.project)
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(`{"schemaVersion": 1, "documentId": "d", "decisions": [{"chapterId": "c-0001", "basis": [{"ledgerRecordIds": ["c0"`), 0o600); err != nil {
		t.Fatal(err)
	}
	store := stages.NewDecisionStore(rig.project, nil)
	rig.referenced = store.ReferencedRecordIDs
	for pass := 1; pass <= 2; pass++ {
		report := rig.run(never)
		if report.Err == nil || report.Removed != 0 {
			t.Fatalf("pass %d: report = %+v, want an error and nothing removed", pass, report)
		}
		if !slices.Equal(rig.left(), []string{"c0", "c1"}) {
			t.Fatalf("pass %d: ledger holds %v, want both records", pass, rig.left())
		}
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("the narrator's decisions file was moved or removed: %v", err)
	}
}

// A check that starts in the middle of the pass (from inside the first removal) stops the removals: the rest of the records are refused.
func TestTheLedgerStepStopsRemovingWhenACheckStartsMidPass(t *testing.T) {
	rig := newStepRig(t)
	// Five chapters, each with an old complete record and a newer one: five records are superseded.
	for i := range 5 {
		chapter := fmt.Sprintf("c-%04d", i+1)
		for _, id := range []string{"old", "new"} {
			rig.clock = rig.clock.Add(time.Minute)
			record := evidence.LedgerRecord{
				ID: chapter + id, AnalyzerID: coverage.AnalyzerID, AnalyzerVersion: "1", Scope: evidence.LedgerScope{DocumentID: "d", ChapterID: chapter},
				StartedAt: rig.clock, CompletedAt: rig.clock.Add(time.Second), Outcome: evidence.LedgerComplete,
			}
			if _, err := rig.ledger.Write(record); err != nil {
				t.Fatal(err)
			}
		}
	}
	checkRunning := false
	step := rig.step()
	inner := step.removeResult
	step.removeResult = func(id string) error { checkRunning = true; return inner(id) } // a check starts as the first result goes
	report := step.Run(context.Background(), func() bool { return checkRunning })
	if !report.Stopped || report.Removed != 1 || report.Err != nil || rig.sweepRuns != 0 {
		t.Fatalf("report = %+v, sweeps %d; want the first record removed, a stopped pass, no error and no sweep", report, rig.sweepRuns)
	}
	if got := len(rig.left()); got != 9 {
		t.Fatalf("ledger holds %d records, want 9", got)
	}
}

// A ledger of another project is refused: Retain would prune it while the results of this project's service are removed.
func TestTheLedgerStepRefusesALedgerOfAnotherProject(t *testing.T) {
	rig := newStepRig(t)
	rig.write("c0", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.write("c1", coverage.AnalyzerID, evidence.LedgerComplete)
	step := rig.step()
	step.project = t.TempDir()
	report := step.Run(context.Background(), never)
	if report.Err == nil || report.Removed != 0 || !slices.Equal(rig.left(), []string{"c0", "c1"}) || len(rig.removed) != 0 {
		t.Fatalf("report = %+v, ledger holds %v, results removed %v; want an error and nothing removed", report, rig.left(), rig.removed)
	}
}

// A decision made after the ids were read, and before the pass reaches its record, keeps that record.
func TestTheLedgerStepKeepsARecordADecisionNamesAfterTheIdsWereRead(t *testing.T) {
	rig := newStepRig(t)
	rig.write("c0", coverage.AnalyzerID, evidence.LedgerComplete)
	rig.write("c1", coverage.AnalyzerID, evidence.LedgerComplete)
	reads := 0
	rig.referenced = func() (map[string]bool, error) {
		reads++
		if reads == 1 {
			return map[string]bool{}, nil // the first read: no decision yet
		}
		return map[string]bool{"c0": true}, nil // a decision named c0 since
	}
	report := rig.run(never)
	if report.Removed != 0 || !slices.Equal(rig.left(), []string{"c0", "c1"}) || len(rig.removed) != 0 || report.Err != nil {
		t.Fatalf("report = %+v, ledger holds %v, results removed %v; want c0 kept", report, rig.left(), rig.removed)
	}
}

// If the decisions cannot be read again mid-pass, the removals stop and the error is reported, not "stopped": no check ran.
func TestTheLedgerStepStopsWhenTheDecisionsCannotBeReadAgain(t *testing.T) {
	rig := newStepRig(t)
	for i := range 2 {
		chapter := fmt.Sprintf("c-%04d", i+1)
		for _, id := range []string{"old", "new"} {
			rig.clock = rig.clock.Add(time.Minute)
			record := evidence.LedgerRecord{
				ID: chapter + id, AnalyzerID: coverage.AnalyzerID, AnalyzerVersion: "1", Scope: evidence.LedgerScope{DocumentID: "d", ChapterID: chapter},
				StartedAt: rig.clock, CompletedAt: rig.clock.Add(time.Second), Outcome: evidence.LedgerComplete,
			}
			if _, err := rig.ledger.Write(record); err != nil {
				t.Fatal(err)
			}
		}
	}
	reads := 0
	rig.referenced = func() (map[string]bool, error) {
		reads++
		if reads == 1 {
			return map[string]bool{}, nil
		}
		return nil, errors.New("the decisions file is being rewritten")
	}
	report := rig.run(never)
	if report.Err == nil || report.Removed != 0 || report.Stopped || len(rig.left()) != 4 || reads != 2 {
		t.Fatalf("report = %+v, ledger holds %v, reads = %d; want an error, nothing removed, not stopped, four records and no read after the failure", report, rig.left(), reads)
	}
}

// A step with no ledger answers an error, not a panic in the background.
func TestTheLedgerStepWithNoLedgerIsAnError(t *testing.T) {
	step := ledgerRetention{project: t.TempDir(), measure: measureDirs(nil)}
	if report := step.Run(context.Background(), never); report.Err == nil || report.Removed != 0 {
		t.Fatalf("report = %+v, want an error", report)
	}
}

// A decision made between two of the pass's records is seen too: the ids are read before each record goes.
func TestTheLedgerStepSeesADecisionMadeBetweenTwoRecords(t *testing.T) {
	rig := newStepRig(t)
	for i := range 30 {
		chapter := fmt.Sprintf("c-%04d", i+1)
		for _, id := range []string{"old", "new"} {
			rig.clock = rig.clock.Add(time.Minute)
			record := evidence.LedgerRecord{
				ID: chapter + id, AnalyzerID: coverage.AnalyzerID, AnalyzerVersion: "1", Scope: evidence.LedgerScope{DocumentID: "d", ChapterID: chapter},
				StartedAt: rig.clock, CompletedAt: rig.clock.Add(time.Second), Outcome: evidence.LedgerComplete,
			}
			if _, err := rig.ledger.Write(record); err != nil {
				t.Fatal(err)
			}
		}
	}
	reads := 0
	rig.referenced = func() (map[string]bool, error) {
		reads++
		if reads <= 5 {
			return map[string]bool{}, nil
		}
		return map[string]bool{"c-0010old": true}, nil // named after five reads, mid-pass, before this record goes
	}
	rig.run(never)
	if !slices.Contains(rig.left(), "c-0010old") {
		t.Fatalf("c-0010old, named by a decision made mid-pass, was removed (reads = %d)", reads)
	}
}
