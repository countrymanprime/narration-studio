package main

import (
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/findings"
)

// The take review and its comparison no longer run (#2765), but a project may still hold what they saved. Those
// findings stay plain notes: listed and decided like any other, and Go to takes the narrator to the finding's own
// item. Nothing reads their reads any more.

const (
	retiredItem = "{11111111-0000-4000-8000-000000000001}"
	retiredTake = "{22222222-0000-4000-8000-000000000001}"
)

// retiredFindings are a take-review group and a take comparison in the shape the retired analyzers saved them.
func retiredFindings() map[string]findings.Finding {
	member := map[string]any{"item_guid": retiredItem, "take_guid": retiredTake, "source_file": "a.wav", "source_start": 0.0, "source_length": 4.5}
	return map[string]findings.Finding{
		"take-review": {
			SchemaVersion: findings.SchemaVersion, ID: "take-review-group", Analyzer: "take-review", Category: findings.CategoryPickup,
			Severity: findings.SeverityInfo, Source: findings.Source{File: "a.wav", ItemGUID: retiredItem, TakeGUID: retiredTake},
			Manuscript:       &findings.Manuscript{ChapterID: "chapter-1"},
			ConfidenceReason: "saved by the retired take review",
			Evidence:         map[string]any{"kind": "pickup", "matched_span_first": 3, "matched_span_last": 7, "members": []any{member, member}},
			SuggestedAction:  &findings.SuggestedAction{Kind: "create_take", RequiresConfirmation: true},
			Review:           findings.ReviewState{Status: findings.StatusUnreviewed},
		},
		"take-comparison": {
			SchemaVersion: findings.SchemaVersion, ID: "take-comparison-1", Analyzer: "take-comparison", Category: findings.CategoryTakeComparison,
			Severity: findings.SeverityInfo, Source: findings.Source{File: "a.wav", ItemGUID: retiredItem, TakeGUID: retiredTake},
			Manuscript:       &findings.Manuscript{ChapterID: "chapter-1"},
			ConfidenceReason: "saved by the retired take comparison",
			Evidence:         map[string]any{"model": "small", "compared": 2, "members": []any{member, member}},
			Review:           findings.ReviewState{Status: findings.StatusUnreviewed},
		},
	}
}

func newRetiredFindingsHost(t *testing.T, fake *fakeNavigator) *Host {
	t.Helper()
	host := newNavigationHost(t, fake)
	for analyzer, finding := range retiredFindings() {
		if _, err := host.findings.SaveAnalyzerFindings(analyzer, "chapter-1", []findings.Finding{finding}); err != nil {
			t.Fatal(err)
		}
	}
	return host
}

func TestRetiredTakeReviewFindingsAreStillListedAndDecided(t *testing.T) {
	host := newRetiredFindingsHost(t, &fakeNavigator{})
	for analyzer, want := range retiredFindings() {
		page := bindingAnswer[findings.Page](t)(host.FindingsList(FindingsQuery{Analyzer: analyzer}))
		if len(page.Findings) != 1 || page.Findings[0].ID != want.ID || page.Findings[0].Category != want.Category {
			t.Fatalf("%s: listed %+v, want %s", analyzer, page.Findings, want.ID)
		}
		if _, err := host.FindingsReview(want.ID, page.Findings[0].EvidenceVersion, string(findings.StatusDismissed), ""); err != nil {
			t.Fatalf("%s: deciding it: %v", analyzer, err)
		}
		page = bindingAnswer[findings.Page](t)(host.FindingsList(FindingsQuery{Analyzer: analyzer}))
		if page.Findings[0].Review.Status != findings.StatusDismissed {
			t.Fatalf("%s: status %q after dismissing it", analyzer, page.Findings[0].Review.Status)
		}
	}
}

func TestGoToOnARetiredTakeReviewFindingGoesToItsOwnItem(t *testing.T) {
	fake := &fakeNavigator{navigate: bridge.Navigated{ItemGUID: retiredItem, ProjectTime: 40}}
	host := newRetiredFindingsHost(t, fake)

	got := bindingAnswer[FindingNavigation](t)(host.FindingsGoTo("take-review-group"))

	if got.Outcome != "navigated" || len(fake.targets) != 1 || fake.targets[0].ItemGUID != retiredItem || fake.targets[0].TakeGUID != retiredTake {
		t.Fatalf("got %+v, sent %+v, want the finding's own item and take", got, fake.targets)
	}
}
