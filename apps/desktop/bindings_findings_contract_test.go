package main

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/findings"
	"github.com/countrymanprime/narration-utils/shell/internal/guide"
	"github.com/countrymanprime/narration-utils/shell/internal/proofing"
	"github.com/countrymanprime/narration-utils/shell/internal/transcript"
)

// contractManuscriptLookup resolves every Transcript Compare chapter title to one chapter and paragraph id, as
// *manuscript.Service does for a linked manuscript, so the golden findings carry resolved manuscript anchors.
type contractManuscriptLookup struct{}

func (contractManuscriptLookup) ChapterIDByTitle(string) (string, bool, bool) {
	return "chapter-1", false, true
}
func (contractManuscriptLookup) ParagraphID(_ string, globalIndex int) (string, bool) {
	return fmt.Sprintf("chapter-1-p%d", globalIndex), true
}

// compareMarkerRow builds a row the way transcript.Service builds one from a COMPARE_MARKER event, with the item, take
// and track GUIDs the bridge appends, which a finding is navigated by.
func compareMarkerRow(paragraph, itemIndex int, srcpos, projectTime float64, kind, doc, audio, script, audioContext, state, existing string) map[string]any {
	return map[string]any{
		"id": fmt.Sprintf("%d_%.3f", itemIndex, srcpos), "kind": kind, "docText": doc, "audioText": audio,
		"projectTime": projectTime, "itemIndex": itemIndex, "srcpos": srcpos, "chapter": "Chapter One", "paragraph": paragraph,
		"scriptContext": script, "audioContext": audioContext, "markerState": state, "existingMarkerName": existing,
		"itemGuid": fmt.Sprintf("{A1B2C3D4-0000-4000-8000-%012d}", itemIndex+1), "takeGuid": "{A1B2C3D4-0000-4000-8000-0000000000A1}",
		"trackGuid": "{A1B2C3D4-0000-4000-8000-0000000000F1}",
	}
}

// storyBibleEntity builds an entity the way guide.Service.Entities normalizes one.
func storyBibleEntity(id, name, reviewState, pronunciation string) map[string]any {
	return map[string]any{
		"id": id, "canonical_name": name, "category": "Character", "review_state": reviewState, "locked": false,
		"pronunciation": map[string]any{"confidence": pronunciation},
		"occurrences": []any{map[string]any{"chapter": "Chapter One", "chapterId": "chapter-1", "paragraph": 2,
			"paragraphId": "chapter-1-p2", "excerpt": name + " walked in."}},
	}
}

// contractReviewHost is a host over a temp project whose findings store holds what the real adapters produce:
// three of Transcript Compare's fixture markers (internal/transcript/testdata) and two Story Bible entities, one
// of which the latest Story Bible run no longer flags, so it is carried forward as not_in_latest_run.
func contractReviewHost(t *testing.T) *Host {
	t.Helper()
	folder := t.TempDir()
	store := findings.NewStore(folder)
	project := findings.Project{Path: "C:/Projects/Alice"}
	rows := []map[string]any{
		compareMarkerRow(3, 0, 12.340, 100.340, "MISREAD", "the quick brown fox", "the quick brown socks",
			"The quick brown fox jumped over the lazy dog.", "The quick brown socks jumped over the lazy dog.", "pending", ""),
		compareMarkerRow(3, 0, 45.100, 133.100, "SKIPPED", "jumped over", "",
			"The quick brown fox jumped over the lazy dog.", "The quick brown fox the lazy dog.", "pending", ""),
		compareMarkerRow(4, 0, 67.890, 155.890, "EXTRA", "", "and then",
			"It was a dark and stormy night.", "It was and then a dark and stormy night.", "existing", "TAKE 2"),
	}
	testdata := filepath.Join("internal", "transcript", "testdata")
	grouped, err := transcript.BuildFindings(rows, filepath.Join(testdata, "results_run-fixture.txt"),
		filepath.Join(testdata, "manifest_run-fixture.txt"), project, contractManuscriptLookup{})
	if err != nil {
		t.Fatal(err)
	}
	for scope, fresh := range grouped {
		if _, err := store.SaveAnalyzerFindings("transcript-compare", scope, fresh); err != nil {
			t.Fatal(err)
		}
	}
	aria := storyBibleEntity("ent-aria", "Aria Wren", "needs review", "high")
	tobias := storyBibleEntity("ent-tobias", "Tobias Vane", "reviewed", "low")
	for _, run := range [][]map[string]any{{aria, tobias}, {aria}} {
		if _, err := store.SaveAnalyzerFindings("story-bible", "entities", guide.BuildFindings(run, project)); err != nil {
			t.Fatal(err)
		}
	}
	host := &Host{findings: store}
	host.config.projectFolder = folder
	return host
}

// What FindingsList, FindingsReview and FindingsSummary send (ADR 0120): a decided
// finding, the evidence shapes the store holds today, and a finding not in the latest run. FindingsGet sends the
// same record as FindingsReview, so it has no file of its own.
func TestContractFindingsReviewBindings(t *testing.T) {
	host := contractReviewHost(t)
	var shown findings.Page
	if first, err := host.FindingsList(FindingsQuery{Analyzer: "transcript-compare", Sort: "time", Limit: 1}); err != nil {
		t.Fatal(err)
	} else if err := json.Unmarshal([]byte(first), &shown); err != nil || len(shown.Findings) != 1 {
		t.Fatalf("first transcript finding: %v %s", err, first)
	}
	reviewed, err := host.FindingsReview(shown.Findings[0].ID, shown.Findings[0].EvidenceVersion, "dismissed", "Room noise, not a misread.")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "findings-review", reviewed)

	listed, err := host.FindingsList(FindingsQuery{IncludeNotInLatestRun: true})
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "findings-list", listed)

	summary, err := host.FindingsSummary()
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "findings-summary", summary)

	retyped, err := host.FindingsSetType(shown.Findings[0].ID, shown.Findings[0].EvidenceVersion, "pron")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "findings-retype", retyped)

	if _, err := host.FindingsThread(shown.Findings[0].ID, "add", "", "you", "Is this a misread or the room?"); err != nil {
		t.Fatal(err)
	}
	threaded, err := host.FindingsThread(shown.Findings[0].ID, "add", "", "proofer", "The room: waive it.")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "findings-thread", threaded)
}

// checkBindingContract pins a string binding's answer as the UI receives it, with the decision timestamp fixed.
func checkBindingContract(t *testing.T, name, payload string) {
	t.Helper()
	var decoded any
	if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
		t.Fatal(err)
	}
	stable, err := contractfile.Stabilize(decoded)
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, name, stable)
}

// TestFindingsSummaryClearedAgreesWithTheStageEngineForOneChapter settles ADR 0793 point 6 for findings: the stage
// engine's proofing.pickups (proofing.PickupItem.Open) treats a finding as open unless it is dismissed, and the
// summary's cleared counts exactly the dismissed ones, so for one chapter the open count the rail shows
// (total - cleared) equals the engine's open items. They can still differ in two ways this test does not close: the
// engine also counts REAPER PICKUP: markers (the rail adds pickupsState().remaining for those), and it treats a
// finding a complete later run did not reproduce as resolved (the summary leaves it out of every count).
func TestFindingsSummaryClearedAgreesWithTheStageEngineForOneChapter(t *testing.T) {
	store := findings.NewStore(t.TempDir())
	var chapter []findings.Finding
	for _, id := range []string{"a", "b", "c", "d"} {
		f := reviewFinding(id, "transcript-compare", "chapter-1", findings.SeverityInfo, nil)
		f.EvidenceVersion = "v1"
		chapter = append(chapter, f)
	}
	if _, err := store.SaveAnalyzerFindings("transcript-compare", "chapter-1", chapter); err != nil {
		t.Fatal(err)
	}
	for id, status := range map[string]findings.Status{"a": findings.StatusAccepted, "b": findings.StatusDismissed, "c": findings.StatusDeferred} {
		if _, _, err := store.RecordDecision(id, "v1", status, "", "2026-09-23T10:00:00Z"); err != nil {
			t.Fatal(err)
		}
	}
	summary, err := store.Summary()
	if err != nil {
		t.Fatal(err)
	}
	listed, err := store.List(findings.Query{})
	if err != nil {
		t.Fatal(err)
	}
	engineOpen := 0
	for _, f := range listed {
		if (proofing.PickupItem{FindingID: f.ID, Status: f.Review.Status, NotInLatestRun: f.NotInLatestRun}).Open() {
			engineOpen++
		}
	}
	if got := summary.Total - summary.Cleared; got != engineOpen || got != 3 {
		t.Fatalf("summary open = %d, engine open = %d, want both 3 (accepted, deferred and unreviewed stay open)", got, engineOpen)
	}
}
