package coverage

import "testing"

func TestPlanWorkersAutomaticFollowsTheModelTheProcessorsAndTheMemory(t *testing.T) {
	const gb = 1024
	for _, tc := range []struct {
		name          string
		cpus, freeMB  int
		model         string
		recheck       string
		requested     int
		workers, each int
		limit         WorkerLimit
	}{
		{"tiny on 8 cores and 16 GB: half the cores", 8, 16 * gb, "tiny", "", 0, 4, 2, LimitProcessors},
		{"large-v3 on 8 cores and 16 GB: half the cores still fit", 8, 16 * gb, "large-v3", "", 0, 3, 2, LimitMemory},
		{"large-v3 on 8 cores and 4 GB: one copy", 8, 4 * gb, "large-v3", "", 0, 1, 8, LimitMemory},
		{"small on 16 cores and 4 GB: memory before cores", 16, 4 * gb, "small", "", 0, 3, 5, LimitMemory},
		{"small on 32 cores and 64 GB: half the cores", 32, 64 * gb, "small", "", 0, 16, 2, LimitProcessors},
		{"a larger model alongside takes its copy first", 8, 4 * gb, "small", "large-v3-turbo", 0, 1, 8, LimitMemory},
		{"one core", 1, 16 * gb, "tiny", "", 0, 1, 1, LimitProcessors},
		{"memory not read: the model's fixed cap", 16, 0, "medium", "", 0, 2, 8, LimitModel},
		{"memory not read, an unknown model: one", 16, 0, "mystery", "", 0, 1, 16, LimitModel},
		{"a named number that fits is kept", 8, 16 * gb, "small", "", 6, 6, 1, LimitRequested},
		{"a named number above the cores stops at the cores", 4, 16 * gb, "tiny", "", 12, 4, 1, LimitProcessors},
		{"a named number above the memory stops at the memory", 16, 4 * gb, "large-v3", "", 8, 1, 16, LimitMemory},
		{"zero cores and negative memory still plan one", 0, -5, "tiny", "", -3, 1, 1, LimitProcessors},
	} {
		t.Run(tc.name, func(t *testing.T) {
			plan := PlanWorkers(Machine{CPUs: tc.cpus, FreeMemoryMB: tc.freeMB}, tc.model, tc.recheck, tc.requested)
			if plan.Workers != tc.workers || plan.ThreadsEach != tc.each || plan.Limit != tc.limit {
				t.Fatalf("plan = %+v, want %d workers x %d threads (%s)", plan, tc.workers, tc.each, tc.limit)
			}
			if plan.Workers*plan.ThreadsEach > max(1, tc.cpus) && plan.Workers > 1 {
				t.Fatalf("plan %+v uses more processors than the %d it has", plan, tc.cpus)
			}
		})
	}
}

func TestPlanWorkersNeverFillsMoreThanTheUsableMemory(t *testing.T) {
	for model, mb := range ModelMemoryMB {
		for _, free := range []int{512, 2048, 6000, 16384, 65536} {
			plan := PlanWorkers(Machine{CPUs: 64, FreeMemoryMB: free}, model, "", 64)
			// The copies at once plus the one the sidecar keeps for short items.
			if plan.Workers > 1 && (plan.Workers+1)*mb > int(float64(free)*usableMemoryShare) {
				t.Errorf("%s with %d MB free: %d copies of %d MB do not fit", model, free, plan.Workers+1, mb)
			}
		}
	}
}

func TestSharePlanSplitsTheProcessorsAndTheMemoryBetweenChapters(t *testing.T) {
	if got := SharePlan(Machine{CPUs: 12, FreeMemoryMB: 9000}, 3); got.CPUs != 4 || got.FreeMemoryMB != 3000 {
		t.Fatalf("share = %+v", got)
	}
	if got := SharePlan(Machine{CPUs: 2, FreeMemoryMB: 0}, 8); got.CPUs != 1 || got.FreeMemoryMB != 0 {
		t.Fatalf("never below one processor, unknown memory stays unknown: %+v", got)
	}
}
