package main

import (
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
)

// TestCoverageEnginesContract pins CoverageEngines' answer for tests/fixtures/contracts/coverage-engines.json
// (UPDATE_CONTRACTS=1 rewrites it): two installed models, one not, the cascade off.
func TestCoverageEnginesContract(t *testing.T) {
	models := whisperCatalog(t, map[string]bool{"tiny": true, "small": true, "large-v3-turbo": false})
	host := coverageHostWithModels(t, coverageProject(t), models, fakeCoverageSidecar(10))
	answer := decodeAnswer(t)(host.CoverageEngines())
	contractfile.Check(t, "coverage-engines", answer)
}
