package gapreview

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
	"github.com/countrymanprime/narration-utils/shell/internal/findings"
)

type fixture struct {
	project string
	store   *findings.Store
	current Current
	err     error
	service *Service
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	f := &fixture{project: t.TempDir()}
	f.store = findings.NewStore(f.project)
	text := "and then"
	f.current = Current{EvidenceKey: "rec-1", Gaps: []coverage.GapLine{
		{ID: "missing:p-1:3", Kind: coverage.GapMissing, ParagraphIDs: []string{"p-1"}, TokenCount: 4, FirstWord: "the", LastWord: "door", ConfReason: coverage.ConfNoWordScores},
		{ID: "extra:p-1:9", Kind: coverage.GapExtra, ParagraphIDs: []string{"p-1"}, TokenCount: 2, Text: &text, FirstWord: "and", LastWord: "then", ConfReason: coverage.ConfNoWordScores},
	}}
	f.service = New(Config{Project: f.project, Findings: f.store, Current: func(string) (Current, error) { return f.current, f.err }})
	return f
}

func (f *fixture) summary(t *testing.T) findings.Summary {
	t.Helper()
	summary, err := f.store.Summary()
	if err != nil {
		t.Fatal(err)
	}
	return summary
}

func TestAcceptMakesOneNoteWithTheSuggestedDecision(t *testing.T) {
	f := newFixture(t)
	finding, err := f.service.Accept("c-1", "missing:p-1:3")
	if err != nil {
		t.Fatal(err)
	}
	if finding.Category != findings.CategoryPickup || finding.Analyzer != AnalyzerName || finding.Review.Status != findings.StatusAccepted {
		t.Fatalf("finding = %+v", finding)
	}
	if finding.Confidence != nil || finding.ConfidenceReason != coverage.ConfNoWordScores {
		t.Fatalf("confidence = %v %q", finding.Confidence, finding.ConfidenceReason)
	}
	if finding.Manuscript == nil || finding.Manuscript.Span == nil || finding.Manuscript.Span.ParagraphID != "p-1" || finding.Manuscript.Expected != "the … door" {
		t.Fatalf("manuscript = %+v", finding.Manuscript)
	}
	if summary := f.summary(t); summary.Total != 1 || summary.Decided != 1 || summary.Cleared != 0 {
		t.Fatalf("summary = %+v", summary)
	}
}

func TestAnExtraGapKeepsWhatWasHeard(t *testing.T) {
	f := newFixture(t)
	finding, err := f.service.Accept("c-1", "extra:p-1:9")
	if err != nil {
		t.Fatal(err)
	}
	if finding.Manuscript.Recorded != "and then" || finding.Manuscript.Expected != "" {
		t.Fatalf("manuscript = %+v", finding.Manuscript)
	}
}

func TestAcceptTwiceIsOne(t *testing.T) {
	f := newFixture(t)
	first, err := f.service.Accept("c-1", "missing:p-1:3")
	if err != nil {
		t.Fatal(err)
	}
	second, err := f.service.Accept("c-1", "missing:p-1:3")
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID || f.summary(t).Total != 1 {
		t.Fatalf("ids %q %q, total %d", first.ID, second.ID, f.summary(t).Total)
	}
}

func TestIgnoreMakesNoNoteAndReadsAsIgnored(t *testing.T) {
	f := newFixture(t)
	if err := f.service.Ignore("c-1", "extra:p-1:9"); err != nil {
		t.Fatal(err)
	}
	if f.summary(t).Total != 0 {
		t.Fatal("ignoring made a finding")
	}
	reviews, err := f.service.Reviews("c-1")
	if err != nil || len(reviews) != 1 || reviews["extra:p-1:9"] != Ignored {
		t.Fatalf("reviews = %v, %v", reviews, err)
	}
}

func TestReviewsReadAsAMap(t *testing.T) {
	f := newFixture(t)
	if reviews, _ := f.service.Reviews("c-1"); len(reviews) != 0 {
		t.Fatalf("reviews = %v", reviews)
	}
	if _, err := f.service.Accept("c-1", "missing:p-1:3"); err != nil {
		t.Fatal(err)
	}
	if err := f.service.Ignore("c-1", "extra:p-1:9"); err != nil {
		t.Fatal(err)
	}
	reviews, _ := f.service.Reviews("c-1")
	if len(reviews) != 2 || reviews["missing:p-1:3"] != Accepted || reviews["extra:p-1:9"] != Ignored {
		t.Fatalf("reviews = %v", reviews)
	}
	if other, _ := f.service.Reviews("c-2"); len(other) != 0 {
		t.Fatalf("another chapter's reviews = %v", other)
	}
}

func TestAStaleOrAbsentResultAndAnUnknownGapAreRefusedAndWriteNothing(t *testing.T) {
	f := newFixture(t)
	for _, id := range []string{"nope", "../../etc/passwd", ""} {
		if _, err := f.service.Accept("c-1", id); err == nil {
			t.Fatalf("accepted unknown gap %q", id)
		}
		if err := f.service.Ignore("c-1", id); err == nil {
			t.Fatalf("ignored unknown gap %q", id)
		}
	}
	for _, chapter := range []string{"../c-1", "a/b", ""} {
		if _, err := f.service.Accept(chapter, "missing:p-1:3"); err == nil {
			t.Fatalf("accepted for chapter %q", chapter)
		}
	}
	f.err = ErrNotCurrent
	if _, err := f.service.Accept("c-1", "missing:p-1:3"); !errors.Is(err, ErrNotCurrent) {
		t.Fatalf("err = %v", err)
	}
	if err := f.service.Ignore("c-1", "missing:p-1:3"); !errors.Is(err, ErrNotCurrent) {
		t.Fatalf("err = %v", err)
	}
	if reviews, err := f.service.Reviews("c-1"); err != nil || len(reviews) != 0 {
		t.Fatalf("reviews = %v, %v", reviews, err)
	}
	if _, err := os.Stat(File(f.project)); !os.IsNotExist(err) {
		t.Fatal("a refusal wrote the review file")
	}
	if f.summary(t).Total != 0 {
		t.Fatal("a refusal wrote a finding")
	}
}

func TestADecidedGapIsNotDecidedTheOtherWay(t *testing.T) {
	f := newFixture(t)
	if err := f.service.Ignore("c-1", "missing:p-1:3"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.Accept("c-1", "missing:p-1:3"); err == nil {
		t.Fatal("an ignored gap was accepted")
	}
	if _, err := f.service.Accept("c-1", "extra:p-1:9"); err != nil {
		t.Fatal(err)
	}
	if err := f.service.Ignore("c-1", "extra:p-1:9"); err == nil {
		t.Fatal("an accepted gap was ignored")
	}
}

func TestAReviewFollowsTheEvidence(t *testing.T) {
	f := newFixture(t)
	if err := f.service.Ignore("c-1", "extra:p-1:9"); err != nil {
		t.Fatal(err)
	}
	accepted, err := f.service.Accept("c-1", "missing:p-1:3")
	if err != nil {
		t.Fatal(err)
	}
	// A new check run: a new evidence key, the same gap ids.
	f.current.EvidenceKey = "rec-2"
	if reviews, _ := f.service.Reviews("c-1"); len(reviews) != 0 {
		t.Fatalf("old reviews still read: %v", reviews)
	}
	raw, err := os.ReadFile(File(f.project))
	if err != nil || strings.Count(string(raw), `"evidenceKey": "rec-1"`) != 2 {
		t.Fatalf("history was dropped: %s %v", raw, err)
	}
	// The accepted note stays in the store as any note does.
	if got, found, err := f.store.Get(accepted.ID); err != nil || !found || got.Review.Status != findings.StatusAccepted {
		t.Fatalf("note = %+v %v %v", got, found, err)
	}
	// The same gap in the new run is a different finding.
	again, err := f.service.Accept("c-1", "missing:p-1:3")
	if err != nil || again.ID == accepted.ID {
		t.Fatalf("again = %q (%v), first %q", again.ID, err, accepted.ID)
	}
}

func TestTheFileIsNarratorData(t *testing.T) {
	f := newFixture(t)
	path := File(f.project)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := f.service.Ignore("c-1", "missing:p-1:3"); err != nil {
		t.Fatal(err)
	}
	aside, _ := filepath.Glob(path + ".corrupt-*")
	if len(aside) != 1 {
		t.Fatalf("corrupt file not kept aside: %v", aside)
	}
	if reviews, _ := f.service.Reviews("c-1"); reviews["missing:p-1:3"] != Ignored {
		t.Fatalf("reviews = %v", reviews)
	}

	newer := `{"schemaVersion":99,"reviews":[]}`
	if err := os.WriteFile(path, []byte(newer), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := f.service.Ignore("c-1", "extra:p-1:9"); err == nil {
		t.Fatal("a newer file was written over")
	}
	if raw, _ := os.ReadFile(path); string(raw) != newer {
		t.Fatalf("a newer file was changed: %s", raw)
	}
	if leftover, _ := filepath.Glob(path + ".tmp"); len(leftover) != 0 {
		t.Fatalf("temporary file left: %v", leftover)
	}
}
