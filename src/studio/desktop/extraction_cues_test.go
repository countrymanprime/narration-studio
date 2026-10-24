package main

import (
	"context"
	"errors"
	"slices"
	"sync/atomic"
	"testing"
	"time"

	"desktop/internal/extractionport"
	"desktop/internal/guide"
	"desktop/internal/manuscript"
)

// cueSeam counts the refreshes and answers each with counts and err.
func cueSeam(host *Host, counts guide.CueCounts, err error) *atomic.Int32 {
	calls := &atomic.Int32{}
	host.refreshCues = func(context.Context, ...string) (guide.CueCounts, error) {
		calls.Add(1)
		return counts, err
	}
	return calls
}

func TestAScanEndsByWritingTheDialogueCues(t *testing.T) {
	host, _, events := scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: offers(&scanLog{}, "rules")})
	calls := cueSeam(host, guide.CueCounts{Cues: 12, Attributed: 5}, nil)
	decodeScanJob(t)(host.ExtractionScan(nil))
	nextJobEnd(t, events)
	job := waitScan(t, host)
	if calls.Load() != 1 || job.Phase != "success" || !slices.Contains(job.Logs, "Found 12 quoted lines; 5 with a speaker.") {
		t.Fatalf("calls %d, job %+v", calls.Load(), job)
	}
}

func TestACueFailureIsLoggedAndDoesNotFailTheScan(t *testing.T) {
	host, _, events := scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: offers(&scanLog{}, "rules")})
	cueSeam(host, guide.CueCounts{}, errors.New("Import a manuscript first."))
	decodeScanJob(t)(host.ExtractionScan(nil))
	nextJobEnd(t, events)
	job := waitScan(t, host)
	if job.Phase != "success" || !slices.Contains(job.Logs, "Could not find the quoted lines: Import a manuscript first.") {
		t.Fatalf("job %+v", job)
	}
}

func TestACancelledOrFailedScanWritesNoCues(t *testing.T) {
	g := newGate()
	host, _, events := scanHost(t, scanSource{name: extractionport.Rules, runs: true, extract: g.extract()})
	calls := cueSeam(host, guide.CueCounts{}, nil)
	decodeScanJob(t)(host.ExtractionScan(nil))
	waitGate(t, g.started, "the extract")
	if _, err := host.ExtractionScanCancel(); err != nil {
		t.Fatal(err)
	}
	nextJobEnd(t, events)
	host, _, events = scanHost(t, scanSource{name: extractionport.Rules, runs: true,
		extract: func(context.Context, extractionport.Input) ([]extractionport.Raw, error) {
			return nil, errors.New("broken")
		}})
	host.refreshCues = func(context.Context, ...string) (guide.CueCounts, error) { calls.Add(1); return guide.CueCounts{}, nil }
	decodeScanJob(t)(host.ExtractionScan(nil))
	nextJobEnd(t, events)
	if calls.Load() != 0 {
		t.Fatalf("cues were written %d times", calls.Load())
	}
}

func TestCuesSentence(t *testing.T) {
	for want, counts := range map[string]guide.CueCounts{
		"Found 0 quoted lines; 0 with a speaker.": {},
		"Found 1 quoted line; 1 with a speaker.":  {Cues: 1, Attributed: 1},
	} {
		if got := cuesSentence(counts, nil); got != want {
			t.Fatalf("got %q, want %q", got, want)
		}
	}
}

func TestASuccessfulImportWritesTheDialogueCues(t *testing.T) {
	host := &Host{}
	done := make(chan struct{}, 2)
	host.refreshCues = func(context.Context, ...string) (guide.CueCounts, error) {
		done <- struct{}{}
		return guide.CueCounts{}, nil
	}
	host.importJobEnded(manuscript.ImportJob{ID: "failed", Phase: "error"})
	host.importJobEnded(manuscript.ImportJob{ID: "ok", Phase: "success"})
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("the import wrote no cues")
	}
	select {
	case <-done:
		t.Fatal("a failed import wrote cues")
	case <-time.After(50 * time.Millisecond):
	}
}
