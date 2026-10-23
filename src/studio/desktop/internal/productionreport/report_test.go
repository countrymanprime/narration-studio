package productionreport

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/countrymanprime/narration-studio/shell/internal/production"
	"github.com/countrymanprime/narration-studio/shell/internal/project"
	"github.com/countrymanprime/narration-studio/shell/internal/stages"
)

// The golden files are written by this test, never by hand: run it with UPDATE_GOLDEN=1 after an intended change and
// read the diff.

func number(v float64) *float64 { return &v }

func sampleOverview() production.Overview {
	return production.Overview{
		Chapters: []production.OverviewChapter{
			{ID: "ch-1", Title: "Down the Rabbit-Hole", Status: stages.StageFinalized, WordCount: 3200, RecordedSeconds: number(708), HoursLogged: 3,
				PFH: number(1.5), Readiness: &production.Readiness{Verdict: stages.VerdictRecommended}},
			{ID: "ch-2", Title: "The Pool of Tears", Status: stages.StageEditing, WordCount: 2800, RecordedSeconds: number(512), HoursLogged: 1,
				Readiness: &production.Readiness{Verdict: stages.VerdictNotReady, Reason: "2 pickups open"}},
			{ID: "ch-3", Title: "A Caucus-Race and a Long Tale", Status: stages.StageNotStarted, WordCount: 2600, HoursLogged: 0},
		},
		Totals: production.Totals{
			Chapters: 3, FinalizedChapters: 1, WordCount: 8600, RecordedSeconds: 1220, MeasuredChapters: 2, HoursLogged: 4,
			HoursByStage: map[stages.Stage]float64{stages.StageRecording: 2, stages.StageEditing: 1.5, stages.StageProofing: 0.5},
			BookPFH:      number(1.97), ContractedAmount: number(2400), EffectiveRate: number(600),
		},
		Deadline: &production.Deadline{Date: "2026-12-01", DaysLeft: 30},
	}
}

func sampleInput() Input {
	return Input{
		GeneratedAt: "2026-09-27T18:00:00Z", AppVersion: "0.9.0",
		Options:  Options{Include: AllSections},
		Overview: sampleOverview(),
		Milestones: []project.Milestone{
			{Name: "ACX 15-minute checkpoint", DueDate: "2026-10-15", Note: "The rights holder approves the first 15 minutes."},
			{Name: "Final delivery", DueDate: "2026-09-01"},
		},
		Now: time.Date(2026, 9, 27, 12, 0, 0, 0, time.UTC),
		Pickups: []PickupChapter{
			{Chapter: "Chapter 1", Open: 0},
			{Chapter: "Chapter 2", Open: 2, Kinds: []string{"misread", "noise"}},
		},
		Delivery: &DeliveryInput{Profile: "ACX", Files: []DeliveryFile{
			{Name: "ch-1.wav", Measured: true},
			{Name: "ch-2.wav", Measured: true, Missed: []string{"noise floor", "peak"}},
			{Name: "ch-3.wav"},
		}},
	}
}

func render(t *testing.T, in Input) (string, string) {
	t.Helper()
	report := Build(in)
	encoded, err := report.JSON()
	if err != nil {
		t.Fatal(err)
	}
	page, err := report.HTML()
	if err != nil {
		t.Fatal(err)
	}
	return string(encoded), string(page)
}

func golden(t *testing.T, name, got string) {
	t.Helper()
	path := filepath.Join("testdata", name)
	if os.Getenv("UPDATE_GOLDEN") == "1" {
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%s: %v (run with UPDATE_GOLDEN=1 to write it)", path, err)
	}
	if !bytes.Equal(bytes.ReplaceAll(want, []byte("\r\n"), []byte("\n")), []byte(got)) {
		t.Fatalf("%s differs from what the report writes now; run with UPDATE_GOLDEN=1 if the change is intended", path)
	}
}

func TestTheReportMatchesItsGoldenFiles(t *testing.T) {
	encoded, page := render(t, sampleInput())
	golden(t, "report.golden.json", encoded)
	golden(t, "report.golden.html", page)
}

func TestTheSameInputGivesTheSameBytesApartFromTheTimestamp(t *testing.T) {
	first, firstPage := render(t, sampleInput())
	again, againPage := render(t, sampleInput())
	if first != again || firstPage != againPage {
		t.Fatal("two reports of the same input differ")
	}
}

func TestTheContractedAmountAndRateAreLeftOutUnlessTheNarratorOptsIn(t *testing.T) {
	report := Build(sampleInput())
	if report.Rate != nil {
		t.Fatal("the contracted amount and rate should be left out by default")
	}
	if report.Privacy.ContractedAmountIncluded {
		t.Fatal("Privacy.ContractedAmountIncluded should be false by default")
	}
	encoded, page := render(t, sampleInput())
	if bytes.Contains([]byte(encoded), []byte("2400")) || bytes.Contains([]byte(page), []byte("2400")) {
		t.Fatal("the contracted amount should not appear anywhere in the report by default")
	}

	in := sampleInput()
	in.Options.Include.Money = true
	optedIn := Build(in)
	if optedIn.Rate == nil || optedIn.Rate.ContractedAmount == nil || *optedIn.Rate.ContractedAmount != 2400 {
		t.Fatal("opting in should include the contracted amount")
	}
	if optedIn.Rate.EffectiveRate == nil || *optedIn.Rate.EffectiveRate != 600 {
		t.Fatal("opting in should include the effective rate")
	}
	if !optedIn.Privacy.ContractedAmountIncluded {
		t.Fatal("Privacy.ContractedAmountIncluded should be true once opted in")
	}
}

func TestAnUndefinedBookPFHIsWrittenAsAbsentNeverZero(t *testing.T) {
	in := sampleInput()
	in.Overview.Totals.BookPFH = nil
	report := Build(in)
	if report.Stages.BookPFH != nil {
		t.Fatal("an undefined BookPFH should stay nil, never 0")
	}
	_, page := render(t, in)
	if !bytes.Contains([]byte(page), []byte("not available")) {
		t.Fatal("the HTML page should say the PFH is not available, never write 0")
	}
}

func TestAMilestonePastItsDateIsOverdue(t *testing.T) {
	report := Build(sampleInput())
	if len(report.Schedule.Milestones) != 2 {
		t.Fatalf("expected 2 milestones, got %d", len(report.Schedule.Milestones))
	}
	if report.Schedule.Milestones[0].Overdue {
		t.Fatal("the ACX checkpoint (2026-10-15) should not be overdue as of 2026-09-27")
	}
	if !report.Schedule.Milestones[1].Overdue {
		t.Fatal("final delivery (2026-09-01) should be overdue as of 2026-09-27")
	}
}

func TestReadinessCountsEveryChapterByItsVerdictAndNoneWhenNotAssessed(t *testing.T) {
	report := Build(sampleInput())
	if report.Readiness.Recommended != 1 || report.Readiness.NotReady != 1 || report.Readiness.None != 1 {
		t.Fatalf("unexpected readiness counts: %+v", report.Readiness)
	}
}

func TestAnUntickedSectionIsLeftOutOfBothRenderings(t *testing.T) {
	cases := []struct {
		name    string
		untick  func(*Sections)
		jsonKey string
		heading string
	}{
		{"words", func(s *Sections) { s.Words = false }, `"word_count"`, "Finished audio"},
		{"stages", func(s *Sections) { s.Stages = false }, `"hours_by_stage"`, "Hours by stage"},
		{"milestones", func(s *Sections) { s.Milestones = false }, `"schedule"`, "<h2>Milestones</h2>"},
		{"pickups", func(s *Sections) { s.Pickups = false }, `"held_back"`, "Chapters held back"},
		{"pickups list", func(s *Sections) { s.Pickups = false }, `"open"`, "Open pickups"},
		{"delivery", func(s *Sections) { s.Delivery = false }, `"readiness"`, "Chapter readiness"},
		{"delivery check", func(s *Sections) { s.Delivery = false }, `"unchecked"`, "Delivery check"},
	}
	whole, wholePage := render(t, sampleInput())
	for _, tc := range cases {
		if !bytes.Contains([]byte(whole), []byte(tc.jsonKey)) || !bytes.Contains([]byte(wholePage), []byte(tc.heading)) {
			t.Fatalf("%s: the fully ticked report should hold %q and %q", tc.name, tc.jsonKey, tc.heading)
		}
		in := sampleInput()
		tc.untick(&in.Options.Include)
		encoded, page := render(t, in)
		if bytes.Contains([]byte(encoded), []byte(tc.jsonKey)) {
			t.Errorf("%s: the JSON still holds %q", tc.name, tc.jsonKey)
		}
		if bytes.Contains([]byte(page), []byte(tc.heading)) {
			t.Errorf("%s: the page still holds %q", tc.name, tc.heading)
		}
	}
}

func TestAChapterHeldBackIsListedWithItsReason(t *testing.T) {
	held := Build(sampleInput()).HeldBack
	if held == nil || len(held.Chapters) != 1 || held.Chapters[0].ID != "ch-2" || held.Chapters[0].Reason != "2 pickups open" {
		t.Fatalf("unexpected held-back chapters: %+v", held)
	}
}

func TestOpenPickupsSkipAChapterWithNone(t *testing.T) {
	pickups := Build(sampleInput()).Pickups
	if pickups == nil || pickups.Open != 2 || len(pickups.Chapters) != 1 || pickups.Chapters[0].Chapter != "Chapter 2" {
		t.Fatalf("unexpected pickups: %+v", pickups)
	}
}

func TestDeliveryCountsPassFailAndUncheckedFiles(t *testing.T) {
	d := Build(sampleInput()).Delivery
	if d == nil || !d.Measured || d.Pass != 1 || d.Fail != 1 || d.Unchecked != 1 || len(d.Failing) != 1 || d.Failing[0].File != "ch-2.wav" {
		t.Fatalf("unexpected delivery: %+v", d)
	}
}

func TestDeliverySaysNothingWasMeasuredNeverAPass(t *testing.T) {
	in := sampleInput()
	in.Delivery = nil
	d := Build(in).Delivery
	if d == nil || d.Measured || d.Pass != 0 || d.Note == "" {
		t.Fatalf("unexpected delivery: %+v", d)
	}
	_, page := render(t, in)
	if !bytes.Contains([]byte(page), []byte("Nothing has been measured")) {
		t.Fatal("the page should say nothing was measured")
	}
}
