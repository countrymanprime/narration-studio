package main

import "testing"

// What the review and colour bindings send to the UI: nothing (the UI's voidResult). What they change reaches the UI through
// GuideEntities, pinned in guide-review-marked.json and guide-review-flagged.json (internal/guide/contract_test.go).
func TestContractGuideReviewBindingsReturnNothing(t *testing.T) {
	two := 2
	for name, call := range map[string]func(*Host) (string, error){
		"GuideMarkReviewed":    func(h *Host) (string, error) { return h.GuideMarkReviewed("entity-1", nil) },
		"GuideFlagReview":      func(h *Host) (string, error) { return h.GuideFlagReview("entity-1", &two) },
		"GuideSetSpeakerColor": func(h *Host) (string, error) { return h.GuideSetSpeakerColor("entity-1", &two) },
	} {
		service, _ := countingGuide(t)
		if got, err := call(&Host{guide: service}); err != nil || got != "null" {
			t.Fatalf("%s = %q, %v", name, got, err)
		}
	}
}
