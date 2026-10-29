package main

import (
	"testing"

	"desktop/internal/coverage"
	"desktop/internal/extractionport"
)

func TestPlanScanWorkers(t *testing.T) {
	gliner := []string{extractionport.Rules, extractionport.Gliner}
	both := []string{extractionport.Gliner, extractionport.BookNLP}
	cases := []struct {
		name      string
		machine   coverage.Machine
		requested int
		sources   []string
		want      int
		limit     coverage.WorkerLimit
	}{
		{"automatic is half the processors", coverage.Machine{CPUs: 4, FreeMemoryMB: 14000}, 0, gliner, 2, coverage.LimitProcessors},
		{"a named number is kept up to the processors", coverage.Machine{CPUs: 4, FreeMemoryMB: 30000}, 3, gliner, 3, coverage.LimitRequested},
		{"more than the processors is the processors", coverage.Machine{CPUs: 4, FreeMemoryMB: 30000}, 9, gliner, 4, coverage.LimitProcessors},
		{"memory bounds the workers", coverage.Machine{CPUs: 16, FreeMemoryMB: 6000}, 0, gliner, 2, coverage.LimitMemory},
		{"never below one when memory is short", coverage.Machine{CPUs: 8, FreeMemoryMB: 1000}, 0, gliner, 1, coverage.LimitMemory},
		{"unreadable memory caps the pool at two", coverage.Machine{CPUs: 16}, 0, gliner, 2, coverage.LimitModel},
		{"one processor reads whole", coverage.Machine{CPUs: 1, FreeMemoryMB: 8000}, 0, gliner, 1, coverage.LimitProcessors},
		{"beside BookNLP a quarter of the processors", coverage.Machine{CPUs: 8, FreeMemoryMB: 32000}, 0, both, 2, coverage.LimitProcessors},
		{"beside BookNLP on four processors reads whole", coverage.Machine{CPUs: 4, FreeMemoryMB: 14000}, 0, both, 1, coverage.LimitProcessors},
		{"beside BookNLP its memory is set aside", coverage.Machine{CPUs: 16, FreeMemoryMB: 14000}, 0, both, 1, coverage.LimitMemory},
	}
	for _, c := range cases {
		got := planScanWorkers(c.machine, c.requested, c.sources)
		if got.Workers != c.want || got.Limit != c.limit {
			t.Errorf("%s: got %d (%s), want %d (%s)", c.name, got.Workers, got.Limit, c.want, c.limit)
		}
	}
}

func TestPlanScanThreadsAreLimitedOnlyWhenTwoSidecarSourcesReadAtOnce(t *testing.T) {
	machine := coverage.Machine{CPUs: 8, FreeMemoryMB: 32000}
	if got := planScanWorkers(machine, 0, []string{extractionport.Gliner, extractionport.BookNLP}).Threads; got != 4 {
		t.Fatalf("threads beside BookNLP = %d, want half the processors", got)
	}
	for _, only := range [][]string{{extractionport.Gliner}, {extractionport.BookNLP}, {extractionport.Rules}} {
		if got := planScanWorkers(machine, 0, only).Threads; got != 0 {
			t.Fatalf("threads for %v = %d, want no limit", only, got)
		}
	}
}
