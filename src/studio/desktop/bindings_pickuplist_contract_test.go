package main

import (
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/findings"
)

// TestPickupListContract pins PickupsList's answer for tests/fixtures/contracts/pickups-list-*.json (UPDATE_CONTRACTS=1
// rewrites them): a chapter whose check was never run (empty), and the merged list with a gap of a current check, a
// note decided "Needs pickup", one retyped as a noise, and a line added by hand, one of them left out.
func TestPickupListContract(t *testing.T) {
	empty := coverageHost(t, coverageProject(t), true, gapSidecar())
	contractfile.Check(t, "pickups-list-empty", decodeAnswer(t)(empty.PickupsList()))

	f := newGapFixture(t)
	store := f.host.services().findings
	confidence := 0.71
	note := func(id string, start float64) findings.Finding {
		return findings.Finding{
			SchemaVersion: findings.SchemaVersion, ID: id, Analyzer: "transcript-compare", Category: findings.CategoryTranscriptDiscrepancy,
			Severity: findings.SeverityWarning, Confidence: &confidence, ConfidenceReason: "word_scores",
			TimeRange:  &findings.TimeRange{Start: start, End: start + 1},
			Manuscript: &findings.Manuscript{ChapterID: "c-0001", Expected: "the door", Recorded: "a door", Span: &findings.Span{ParagraphID: "p-000001"}},
			Review:     findings.ReviewState{Status: findings.StatusUnreviewed},
		}
	}
	if _, err := store.SaveAnalyzerFindings("transcript-compare", "c-0001", []findings.Finding{note("note-proof", 0.5), note("note-noise", 2.5)}); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"note-proof", "note-noise"} {
		if _, found, err := store.RecordDecision(id, "", findings.StatusAccepted, "", "2026-10-11T12:00:00Z"); err != nil || !found {
			t.Fatalf("decide %s: %v %v", id, found, err)
		}
	}
	if _, found, err := store.RecordType("note-noise", "", findings.NoteNoise, "2026-10-11T12:00:00Z"); err != nil || !found {
		t.Fatalf("retype: %v %v", found, err)
	}
	decodeAnswer(t)(f.host.PickupsAdd("c-0001", 3, "Alice, read again"))
	merged := decodeAnswer(t)(f.host.PickupsSetIncluded("finding:note-noise", false))
	if got := len(pickupsOf(t, merged)); got != 4 {
		t.Fatalf("merged = %v", merged)
	}
	contractfile.Check(t, "pickups-list-merged", merged)
}
