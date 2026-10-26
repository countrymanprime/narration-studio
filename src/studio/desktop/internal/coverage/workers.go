package coverage

// How many transcriptions a recording check runs at once. The host decides it here, from this computer's processors, its
// free memory and the size of the chosen model, and sends the number to the sidecar (--parallel-workers), so the count
// the Settings page and the Check recordings dialog show is the count that runs.

// ModelMemoryMB is about how much memory one working copy of each Whisper model takes on the processor (int8 weights and
// the decoder's working memory while it transcribes), in MB. These are estimates rounded up from the published model
// sizes, not measurements on this app's recordings; a model not listed counts as the largest.
var ModelMemoryMB = map[string]int{
	"tiny":           300,
	"base":           400,
	"small":          700,
	"medium":         1500,
	"large-v3-turbo": 1500,
	"large-v3":       2600,
}

// largestModelMB is what a model ModelMemoryMB does not list counts as.
const largestModelMB = 2600

// fallbackCopies is the most copies of each model that run at once when the free memory cannot be read: the sidecar's
// own cap before the host planned the count (MAX_WORKERS_BY_MODEL in src/studio/sidecars/transcript-compare/core/compare.py).
var fallbackCopies = map[string]int{"tiny": 8, "base": 6, "small": 4, "medium": 2, "large-v3-turbo": 2, "large-v3": 1}

// usableMemoryShare is the share of the free memory a check may fill: the rest is left to REAPER, the app and the system.
const usableMemoryShare = 0.75

// WorkerLimit is what set a plan's count.
type WorkerLimit string

const (
	// LimitProcessors is half the processors (Automatic), or every processor (a number the narrator named).
	LimitProcessors WorkerLimit = "processors"
	// LimitMemory is the free memory: no more copies of the model fit in it.
	LimitMemory WorkerLimit = "memory"
	// LimitRequested is the number the narrator named, which fits.
	LimitRequested WorkerLimit = "requested"
	// LimitModel is the model's own fixed cap, used when the free memory could not be read.
	LimitModel WorkerLimit = "model"
)

// Machine is what a plan knows about this computer.
type Machine struct {
	// CPUs is the processors the check may use: the whole computer's, or a background check's share.
	CPUs int
	// FreeMemoryMB is the memory free now, in MB; 0 means it could not be read.
	FreeMemoryMB int
}

// WorkerPlan is how many transcriptions one chapter's check runs at once and why.
type WorkerPlan struct {
	// Requested is the number asked for; 0 is Automatic.
	Requested int `json:"requested"`
	// Workers is the number of transcriptions at once (always at least 1): the items checked side by side, or the pieces
	// of one long item, each its own copy of the model.
	Workers int `json:"workers"`
	// ThreadsEach is the processors each transcription decodes with.
	ThreadsEach int `json:"threadsEach"`
	// CPUs is the processors this chapter's check may use.
	CPUs int `json:"cpus"`
	// FreeMemoryMB is the free memory this chapter's check may plan with (0: it could not be read).
	FreeMemoryMB int `json:"freeMemoryMB"`
	// Model is the first-pass model the plan is for, and ModelMemoryMB one copy of it.
	Model         string `json:"model"`
	ModelMemoryMB int    `json:"modelMemoryMB"`
	// Limit is what set Workers.
	Limit WorkerLimit `json:"limit"`
}

// PlanWorkers plans one chapter's check of model on machine. requested 0 is Automatic: half the processors (four workers
// on four processors measured slower than two, as each is left one thread), never more copies of the model than fit in
// three quarters of the free memory. A number the narrator named is kept, up to the processors and the memory. recheck,
// when set, is the larger model that runs alongside in the same check: its copy is set aside first. Nothing is ever below 1.
func PlanWorkers(machine Machine, model, recheck string, requested int) WorkerPlan {
	cpus := max(1, machine.CPUs)
	plan := WorkerPlan{Requested: max(0, requested), CPUs: cpus, FreeMemoryMB: max(0, machine.FreeMemoryMB), Model: model, ModelMemoryMB: memoryOf(model)}

	byCPU, cpuLimit := max(1, cpus/2), LimitProcessors
	if plan.Requested > 0 {
		byCPU, cpuLimit = min(plan.Requested, cpus), LimitRequested
		if plan.Requested > cpus {
			cpuLimit = LimitProcessors
		}
	}
	byMemory, memoryLimit := copiesInMemory(plan.FreeMemoryMB, plan.ModelMemoryMB, recheck), LimitMemory
	if plan.FreeMemoryMB == 0 {
		byMemory, memoryLimit = fallbackCap(model), LimitModel
	}
	plan.Workers, plan.Limit = byCPU, cpuLimit
	if byMemory < byCPU {
		plan.Workers, plan.Limit = byMemory, memoryLimit
	}
	plan.ThreadsEach = max(1, cpus/plan.Workers)
	return plan
}

// SharePlan is the machine one of chapters checked at once may plan with: an equal share of the processors and the memory.
func SharePlan(machine Machine, chapters int) Machine {
	chapters = max(1, chapters)
	return Machine{CPUs: max(1, machine.CPUs/chapters), FreeMemoryMB: machine.FreeMemoryMB / chapters}
}

// copiesInMemory is how many working copies of a model of modelMB fit in the usable share of freeMB once recheck's copy
// and the one copy the sidecar keeps for the short items are set aside; never below 1.
func copiesInMemory(freeMB, modelMB int, recheck string) int {
	usable := int(float64(freeMB) * usableMemoryShare)
	if recheck != "" {
		usable -= memoryOf(recheck)
	}
	return max(1, usable/max(1, modelMB)-1)
}

func memoryOf(model string) int {
	if mb, ok := ModelMemoryMB[model]; ok {
		return mb
	}
	return largestModelMB
}

func fallbackCap(model string) int {
	if copies, ok := fallbackCopies[model]; ok {
		return copies
	}
	return 1
}
