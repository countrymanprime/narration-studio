package stages

import (
	"slices"
	"testing"

	"desktop/internal/contractfile"
)

// Every cause an unknown signal can carry, pinned so the UI's schema lists the same words.
func TestContractUnknownCauses(t *testing.T) {
	causes := make([]string, 0, len(knownCauses))
	for cause := range knownCauses {
		causes = append(causes, string(cause))
	}
	slices.Sort(causes)
	contractfile.Check(t, "stages-causes", causes)
}
