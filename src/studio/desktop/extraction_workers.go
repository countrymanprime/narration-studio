package main

import (
	"slices"

	"desktop/internal/coverage"
	"desktop/internal/extractionport"
)

// How many chapters GLiNER reads at once in a Story Bible scan. The host plans the number from this computer's processors and
// free memory and sends it to the sidecar (--workers), as a recording check does (coverage.PlanWorkers), so the number of
// processes the Settings page names is the number that runs. Measured on 4 processors in
// docs/research/studio-next-extraction-chunking-benchmark.md: torch already spreads one process over the cores, so two
// workers get most of the gain and four add little at twice the memory.
const (
	// glinerWorkerMB is about what one GLiNER process takes (2.1 GB measured), rounded up.
	glinerWorkerMB = 2200
	// booknlpReserveMB is set aside while BookNLP reads the whole book beside GLiNER: its memory grows with the book (2 GB at
	// 19k words, 4.2 GB at 93k, 6.1 GB at 168k words on the small weights).
	booknlpReserveMB = 6200
)

// scanWorkerPlan is how many chapters GLiNER reads at once in one scan and what set the number.
type scanWorkerPlan struct {
	Workers int
	Limit   coverage.WorkerLimit
	// Threads is the torch threads each sidecar source may use: half the processors when GLiNER and BookNLP read at once, else
	// 0 (no limit).
	Threads int
}

// planScanWorkers plans GLiNER's workers for a scan that runs sources. requested is the Parallel processes setting (0 is
// Automatic: half the processors). When BookNLP runs beside GLiNER, its share of the processors and its memory are set aside
// first. The number is never below 1, and 1 means the book is read whole.
func planScanWorkers(machine coverage.Machine, requested int, sources []string) scanWorkerPlan {
	plan := planWorkerCount(machine, requested, sources)
	if slices.Contains(sources, extractionport.BookNLP) && slices.Contains(sources, extractionport.Gliner) {
		plan.Threads = max(1, machine.CPUs/2)
	}
	return plan
}

func planWorkerCount(machine coverage.Machine, requested int, sources []string) scanWorkerPlan {
	cpus := max(1, machine.CPUs)
	byCPU, limit := max(1, cpus/2), coverage.LimitProcessors
	if requested > 0 {
		byCPU, limit = min(requested, cpus), coverage.LimitRequested
		if requested > cpus {
			limit = coverage.LimitProcessors
		}
	}
	alongside := slices.Contains(sources, extractionport.BookNLP)
	if alongside {
		byCPU = max(1, min(byCPU, cpus/4))
	}
	if machine.FreeMemoryMB == 0 {
		return scanWorkerPlan{Workers: min(byCPU, 2), Limit: coverage.LimitModel}
	}
	usable := int(float64(machine.FreeMemoryMB) * 0.75)
	if alongside {
		usable -= booknlpReserveMB
	}
	if byMemory := max(1, usable/glinerWorkerMB); byMemory < byCPU {
		return scanWorkerPlan{Workers: byMemory, Limit: coverage.LimitMemory}
	}
	return scanWorkerPlan{Workers: byCPU, Limit: limit}
}
