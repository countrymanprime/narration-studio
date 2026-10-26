package main

import (
	"testing"

	"desktop/internal/contractfile"
)

// TestCoverageEnginesContract pins CoverageEngines' answer for tests/fixtures/contracts/coverage-engines.json
// (UPDATE_CONTRACTS=1 rewrites it): two installed models, one not, the cascade off.
func TestCoverageEnginesContract(t *testing.T) {
	models := whisperCatalog(t, map[string]bool{"tiny": true, "small": true, "large-v3-turbo": false})
	host := coverageHostWithModels(t, coverageProject(t), models, fakeCoverageSidecar(10))
	answer := decodeAnswer(t)(host.CoverageEngines())
	contractfile.Check(t, "coverage-engines", answer)
}

// TestCoverageWorkerPlanContract pins CoverageWorkerPlan's answer for tests/fixtures/contracts/coverage-worker-plan.json
// (UPDATE_CONTRACTS=1 rewrites it): Automatic, the small model on 8 processors with 6000 MB free.
func TestCoverageWorkerPlanContract(t *testing.T) {
	onMachine(t, 8, 6000)
	models := whisperCatalog(t, map[string]bool{"small": true})
	host := coverageHostWithModels(t, coverageProject(t), models, fakeCoverageSidecar(10))
	answer := decodeAnswer(t)(host.CoverageWorkerPlan(map[string]string{"model": "small"}))
	contractfile.Check(t, "coverage-worker-plan", answer)
}
