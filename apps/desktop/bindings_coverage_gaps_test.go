package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/gapreview"
)

// coverageManuscriptJSON is the manuscript coverageProject writes.
const coverageManuscriptJSON = `{"schemaVersion":1,"documentId":"doc-1","chapters":[{"id":"c-0001","title":"Chapter One","contentKind":"narration"}],"paragraphs":[{"id":"p-000001","chapterId":"c-0001","index":0,"text":"Alice."}]}`

// gapSidecar stands in for `compare.py --coverage` for a chapter whose one paragraph was read except for two skipped
// words: its stored report holds one gap.
func gapSidecar() coverage.Launcher {
	return func(_ context.Context, _ string, args ...string) (coverage.Child, error) {
		values := map[string]string{}
		for i := 0; i+1 < len(args); i++ {
			if strings.HasPrefix(args[i], "--") {
				values[args[i]] = args[i+1]
			}
		}
		results := fmt.Sprintf(`COVERAGE|{"schemaVersion":1,"chapterId":%q,"bodyTokens":10,"presentTokens":8,"missingTokens":2,"extraTokens":0,"longestMissingRun":2,"alignment":{"maxMisreadRun":8,"minAnchorRun":3},"items":{"analyzed":1,"muted":0,"playedSeconds":4,"transcribed":1,"reused":0},"analysis":{"model":"small","language":null,"equivalencesHash":null}}`+"\n", values["--chapter-id"])
		results += `COVERAGE_PARAGRAPH|{"id":"p-000001","tokens":10,"present":8,"longestMissingRun":2}` + "\n"
		results += `COVERAGE_REGION|{"kind":"skip","paragraphIds":["p-000001"],"tokenCount":2,"firstWord":"the","lastWord":"door","position":null,"before":null,"after":null}` + "\n"
		code := 0
		if err := os.WriteFile(values["--out"], []byte(results), 0o600); err != nil {
			code = 1
		}
		_ = os.WriteFile(values["--progress"], []byte("DONE|100|Finished\n"), 0o600)
		return &coverageChild{code: &code}, nil
	}
}

type gapFixture struct {
	host    *Host
	project string
	gapID   string
}

func newGapFixture(t *testing.T) gapFixture {
	t.Helper()
	project := coverageProject(t)
	host := coverageHost(t, project, true, gapSidecar())
	started := decodeAnswer(t)(host.CoverageStart("c-0001", nil))
	if started["status"] != "started" {
		t.Fatalf("start = %v", started)
	}
	host.services().coverage.Wait()
	result := decodeAnswer(t)(host.CoverageResult("c-0001"))
	if result["state"] != "current" {
		t.Fatalf("result = %v", result)
	}
	gaps, _ := result["result"].(map[string]any)["gaps"].([]any)
	if len(gaps) != 1 {
		t.Fatalf("gaps = %v", gaps)
	}
	return gapFixture{host: host, project: project, gapID: gaps[0].(map[string]any)["id"].(string)}
}

func (f gapFixture) summary(t *testing.T) map[string]any {
	t.Helper()
	return decodeAnswer(t)(f.host.FindingsSummary())
}

func (f gapFixture) reviews(t *testing.T) map[string]any {
	t.Helper()
	return decodeAnswer(t)(f.host.CoverageGapReviews("c-0001"))
}

func TestCoverageGapAcceptMakesOneNoteWithTheSuggestedDecision(t *testing.T) {
	f := newGapFixture(t)
	before := f.summary(t)
	finding := decodeAnswer(t)(f.host.CoverageGapAccept("c-0001", f.gapID))
	if finding["category"] != "pickup" || finding["analyzer"] != "recording-check" || finding["confidence"] != nil {
		t.Fatalf("finding = %v", finding)
	}
	if review := finding["review"].(map[string]any); review["status"] != "accepted" {
		t.Fatalf("review = %v", review)
	}
	after := f.summary(t)
	if after["total"].(float64) != before["total"].(float64)+1 || after["decided"].(float64) != before["decided"].(float64)+1 || after["cleared"] != before["cleared"] {
		t.Fatalf("summary before %v after %v", before, after)
	}
	again := decodeAnswer(t)(f.host.CoverageGapAccept("c-0001", f.gapID))
	if again["id"] != finding["id"] || f.summary(t)["total"] != after["total"] {
		t.Fatalf("accept twice made %v", again)
	}
	if got := f.reviews(t); got[f.gapID] != "accepted" {
		t.Fatalf("reviews = %v", got)
	}
}

func TestCoverageGapIgnoreMakesNoNote(t *testing.T) {
	f := newGapFixture(t)
	before := f.summary(t)
	if _, err := f.host.CoverageGapIgnore("c-0001", f.gapID); err != nil {
		t.Fatal(err)
	}
	if after := f.summary(t); after["total"] != before["total"] {
		t.Fatalf("ignoring changed the summary: %v", after)
	}
	if got := f.reviews(t); len(got) != 1 || got[f.gapID] != "ignored" {
		t.Fatalf("reviews = %v", got)
	}
}

func TestCoverageGapReviewsAreEmptyWithoutAReview(t *testing.T) {
	f := newGapFixture(t)
	if got := f.reviews(t); len(got) != 0 {
		t.Fatalf("reviews = %v", got)
	}
}

func TestCoverageGapRefusesAStaleOrNeverResultAndAnUnknownGap(t *testing.T) {
	f := newGapFixture(t)
	for _, id := range []string{"missing:nope:1", "../../x", "/etc/passwd", ""} {
		if _, err := f.host.CoverageGapAccept("c-0001", id); err == nil {
			t.Fatalf("accepted %q", id)
		}
		if _, err := f.host.CoverageGapIgnore("c-0001", id); err == nil {
			t.Fatalf("ignored %q", id)
		}
	}
	if _, err := f.host.CoverageGapAccept("../c-0001", f.gapID); err == nil {
		t.Fatal("a path-shaped chapter id was accepted")
	}
	if _, err := f.host.CoverageGapAccept("c-9999", f.gapID); err == nil {
		t.Fatal("an unknown chapter was accepted")
	}
	// The manuscript moved on: the result is stale.
	writeNested(t, filepath.Join(f.project, "narration-utils", "manuscript", "manuscript.json"),
		strings.Replace(coverageManuscriptJSON, "Alice.", "Alice and Bob.", 1))
	if view := decodeAnswer(t)(f.host.CoverageResult("c-0001")); view["state"] != "stale" {
		t.Fatalf("result = %v", view["state"])
	}
	_, err := f.host.CoverageGapAccept("c-0001", f.gapID)
	if err == nil || !strings.Contains(err.Error(), "out of date") {
		t.Fatalf("accept on a stale result: %v", err)
	}
	if _, err := f.host.CoverageGapIgnore("c-0001", f.gapID); err == nil {
		t.Fatal("ignored on a stale result")
	}
	if got := f.reviews(t); len(got) != 0 {
		t.Fatalf("reviews = %v", got)
	}
	if _, statErr := os.Stat(gapreview.File(f.project)); !os.IsNotExist(statErr) {
		t.Fatal("a refusal wrote the review file")
	}
	if f.summary(t)["total"].(float64) != 0 {
		t.Fatal("a refusal wrote a finding")
	}
}

func TestCoverageGapWithNoProjectOrNoCheckIsRefused(t *testing.T) {
	host := NewHost()
	if _, err := host.CoverageGapAccept("c-0001", "x"); err == nil {
		t.Fatal("accepted with no project")
	}
	if _, err := host.CoverageGapIgnore("c-0001", "x"); err == nil {
		t.Fatal("ignored with no project")
	}
	if got := decodeAnswer(t)(host.CoverageGapReviews("c-0001")); len(got) != 0 {
		t.Fatalf("reviews = %v", got)
	}
}

func TestRunningACheckDecidesNothing(t *testing.T) {
	f := newGapFixture(t)
	if f.summary(t)["total"].(float64) != 0 {
		t.Fatal("a finished check made a finding")
	}
	if got := f.reviews(t); len(got) != 0 {
		t.Fatalf("a finished check made a review: %v", got)
	}
	if _, err := os.Stat(gapreview.File(f.project)); !os.IsNotExist(err) {
		t.Fatal("a finished check wrote the review file")
	}
}

func TestACheckThatChangesTheGapsDropsTheOldIgnoredEntries(t *testing.T) {
	f := newGapFixture(t)
	if _, err := f.host.CoverageGapIgnore("c-0001", f.gapID); err != nil {
		t.Fatal(err)
	}
	if started := decodeAnswer(t)(f.host.CoverageStart("c-0001", nil)); started["status"] != "started" {
		t.Fatalf("start = %v", started)
	}
	f.host.services().coverage.Wait()
	if got := f.reviews(t); len(got) != 0 {
		t.Fatalf("an ignored gap of an older check still reads: %v", got)
	}
	raw, err := os.ReadFile(gapreview.File(f.project))
	if err != nil || !json.Valid(raw) || !strings.Contains(string(raw), f.gapID) {
		t.Fatalf("the file's history was dropped: %s %v", raw, err)
	}
}
