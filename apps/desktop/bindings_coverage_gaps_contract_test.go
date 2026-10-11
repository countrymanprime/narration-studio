package main

import (
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
)

// TestCoverageGapReviewContract pins the answers of the gap review bindings for
// tests/fixtures/contracts/coverage-gap-review-*.json (UPDATE_CONTRACTS=1 rewrites them): the finding an accepted gap
// becomes, and the reviews map after one gap was accepted and another ignored. The ledger record's id, the finding id
// made from it and the decision time are the only values that vary, so they are fixed.
func TestCoverageGapReviewContract(t *testing.T) {
	f := newGapFixture(t)
	accepted := decodeAnswer(t)(f.host.CoverageGapAccept("c-0001", f.gapID))
	accepted["id"] = "gap-finding-1"
	accepted["evidence"].(map[string]any)["evidence_key"] = "record-1"
	accepted["review"].(map[string]any)["timestamp"] = "2026-10-11T12:00:00Z"
	stable, err := contractfile.Stabilize(accepted)
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "coverage-gap-review-accepted", stable)

	reviews := f.reviews(t)
	if len(reviews) != 1 {
		t.Fatalf("reviews = %v", reviews)
	}
	contractfile.Check(t, "coverage-gap-review-reviews", reviews)
}
