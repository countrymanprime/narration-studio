package production

import (
	"math"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/project"
)

func TestCheckDate(t *testing.T) {
	for _, good := range []string{"2026-12-01", " 2027-02-28 ", "2028-02-29"} {
		if got, err := CheckDate(good); err != nil || got != strings.TrimSpace(good) {
			t.Errorf("%q: want accepted, got %q %v", good, got, err)
		}
	}
	for _, bad := range []string{"", "2026-13-01", "2027-02-29", "12/01/2026", "2026-12-01T00:00:00Z", "tomorrow"} {
		if _, err := CheckDate(bad); err == nil {
			t.Errorf("%q: want refused", bad)
		}
	}
}

func TestCheckAmount(t *testing.T) {
	for _, good := range []float64{0, 1250.5} {
		if err := CheckAmount(&good); err != nil {
			t.Errorf("%v: %v", good, err)
		}
	}
	if err := CheckAmount(nil); err != nil {
		t.Errorf("no amount clears it: %v", err)
	}
	for _, bad := range []float64{-1, math.NaN(), math.Inf(1)} {
		if err := CheckAmount(&bad); err == nil {
			t.Errorf("%v: want refused", bad)
		}
	}
}

func TestCleanMilestonesTrimsAndKeepsTheNarratorsOrder(t *testing.T) {
	cleaned, err := CleanMilestones([]project.Milestone{
		{Name: "  Final delivery ", DueDate: "2026-12-01", Note: "  "},
		{Name: "ACX 15-minute checkpoint", DueDate: " 2026-10-15", Note: " send it "},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []project.Milestone{
		{Name: "Final delivery", DueDate: "2026-12-01"},
		{Name: "ACX 15-minute checkpoint", DueDate: "2026-10-15", Note: "send it"},
	}
	if len(cleaned) != 2 || cleaned[0] != want[0] || cleaned[1] != want[1] {
		t.Fatalf("got %+v", cleaned)
	}
	empty, err := CleanMilestones(nil)
	if err != nil || empty == nil || len(empty) != 0 {
		t.Fatalf("no milestones is an empty list, got %#v %v", empty, err)
	}
}

func TestCleanMilestonesRefusesAMilestoneWithoutANameOrADate(t *testing.T) {
	cases := [][]project.Milestone{
		{{Name: " ", DueDate: "2026-12-01"}},
		{{Name: "Delivery", DueDate: ""}},
		{{Name: "Delivery", DueDate: "2026-02-30"}},
		{{Name: strings.Repeat("n", maxMilestoneName+1), DueDate: "2026-12-01"}},
		{{Name: "Delivery", DueDate: "2026-12-01", Note: strings.Repeat("n", maxMilestoneNote+1)}},
		make([]project.Milestone, maxMilestones+1),
	}
	for i, milestones := range cases {
		if _, err := CleanMilestones(milestones); err == nil {
			t.Errorf("case %d: want refused", i)
		}
	}
}

func TestPlanOfReadsTheManifestFieldsAndIsEmptyWithoutOne(t *testing.T) {
	empty := PlanOf(nil)
	if empty.Deadline != nil || empty.ContractedAmount != nil || empty.Milestones == nil || len(empty.Milestones) != 0 {
		t.Fatalf("want an empty plan, got %#v", empty)
	}
	amount := 900.0
	manifest := &project.Manifest{Deadline: "2026-12-01", ContractedAmount: &amount, Milestones: []project.Milestone{{Name: "A", DueDate: "2026-10-01"}}}
	plan := PlanOf(manifest)
	if plan.Deadline == nil || *plan.Deadline != "2026-12-01" || plan.ContractedAmount == nil || *plan.ContractedAmount != 900 || len(plan.Milestones) != 1 {
		t.Fatalf("unexpected plan: %#v", plan)
	}
	amount = 1
	plan.Milestones[0].Name = "changed"
	if *plan.ContractedAmount != 900 || manifest.Milestones[0].Name != "A" {
		t.Fatal("PlanOf must copy, not alias, the manifest's values")
	}
}

// old-manifest-reads-as-defaults: a manifest written before the payment type reads as per finished hour when it has a
// contracted amount and as none without one (ADR 0800, SNP-Q4); its milestones read as not done, with no measure,
// estimate or template.
func TestPlanOfReadsAnOldManifestAsDefaults(t *testing.T) {
	amount := 900.0
	withAmount := PlanOf(&project.Manifest{ContractedAmount: &amount, Milestones: []project.Milestone{{Name: "A", DueDate: "2026-10-01", Note: "n"}}})
	if withAmount.Payment != PaymentPerFinishedHour || withAmount.ContractedAmount == nil || *withAmount.ContractedAmount != 900 {
		t.Fatalf("an old manifest with an amount reads as per finished hour, got %#v", withAmount)
	}
	if got := withAmount.Milestones[0]; got != (project.Milestone{Name: "A", DueDate: "2026-10-01", Note: "n"}) {
		t.Fatalf("an old milestone reads with empty new fields, got %#v", got)
	}
	if plan := PlanOf(&project.Manifest{}); plan.Payment != PaymentNone {
		t.Fatalf("an old manifest without an amount reads as none, got %q", plan.Payment)
	}
	if plan := PlanOf(nil); plan.Payment != PaymentNone {
		t.Fatalf("no manifest reads as none, got %q", plan.Payment)
	}
}

// royalty-share-has-no-figure: a payment type other than per finished hour never answers an amount, even when a
// manifest edited by hand carries one, so nothing computes an effective rate from it.
func TestPlanOfAnswersNoAmountUnlessThePaymentIsPerFinishedHour(t *testing.T) {
	amount := 50.0
	for _, payment := range []string{PaymentRoyaltyShare, PaymentNone} {
		plan := PlanOf(&project.Manifest{Payment: payment, ContractedAmount: &amount})
		if plan.Payment != payment || plan.ContractedAmount != nil {
			t.Errorf("%s: want the type and no amount, got %#v", payment, plan)
		}
	}
	plan := PlanOf(&project.Manifest{Payment: PaymentPerFinishedHour})
	if plan.Payment != PaymentPerFinishedHour || plan.ContractedAmount != nil {
		t.Fatalf("a stored per finished hour without an amount stays per finished hour, got %#v", plan)
	}
}

func TestCheckPaymentAcceptsTheThreeTypesOnly(t *testing.T) {
	for _, good := range []string{"per_finished_hour", " royalty_share ", "none"} {
		if got, err := CheckPayment(good); err != nil || got != strings.TrimSpace(good) {
			t.Errorf("%q: want accepted, got %q %v", good, got, err)
		}
	}
	for _, bad := range []string{"", "pfh", "royalty", "Royalty_Share", "hourly"} {
		if _, err := CheckPayment(bad); err == nil {
			t.Errorf("%q: want refused", bad)
		}
	}
}

func TestCleanMilestonesKeepsTheMeasureEstimateDoneAndTemplate(t *testing.T) {
	cleaned, err := CleanMilestones([]project.Milestone{
		{Name: "Checkpoint", DueDate: "2026-10-15", Measure: " checkpoint ", Estimate: " 2026-10-12 ", Template: " checkpoint15 "},
		{Name: "First chapters", DueDate: "2026-10-20", Measure: "ch4", Done: true},
		{Name: "Twenty minutes", DueDate: "2026-10-22", Measure: "min20"},
		{Name: "Party", DueDate: "2026-12-05", Measure: "custom", Done: true},
		{Name: "Legacy", DueDate: "2026-12-06"},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []project.Milestone{
		{Name: "Checkpoint", DueDate: "2026-10-15", Measure: "checkpoint", Estimate: "2026-10-12", Template: "checkpoint15"},
		{Name: "First chapters", DueDate: "2026-10-20", Measure: "ch4", Done: true},
		{Name: "Twenty minutes", DueDate: "2026-10-22", Measure: "min20"},
		{Name: "Party", DueDate: "2026-12-05", Measure: "custom", Done: true},
		{Name: "Legacy", DueDate: "2026-12-06"},
	}
	for i := range want {
		if cleaned[i] != want[i] {
			t.Errorf("milestone %d: got %#v, want %#v", i, cleaned[i], want[i])
		}
	}
	for _, measure := range []string{"rec", "edit", "proof", "editproof", "all"} {
		if _, err := CleanMilestones([]project.Milestone{{Name: "M", DueDate: "2026-10-15", Measure: measure}}); err != nil {
			t.Errorf("%s: %v", measure, err)
		}
	}
}

// refusals-stay-whole-list: one bad milestone refuses the list. Whether the delivery profile offers the measure is
// not checked here (SNP-3's platformHas), only that it is a measure at all.
func TestCleanMilestonesRefusesABadMeasureEstimateOrTemplate(t *testing.T) {
	good := project.Milestone{Name: "Fine", DueDate: "2026-10-01"}
	cases := []project.Milestone{
		{Name: "M", DueDate: "2026-10-15", Measure: "everything"},
		{Name: "M", DueDate: "2026-10-15", Measure: "ch"},
		{Name: "M", DueDate: "2026-10-15", Measure: "ch0"},
		{Name: "M", DueDate: "2026-10-15", Measure: "min-5"},
		{Name: "M", DueDate: "2026-10-15", Measure: "rec", Estimate: "soon"},
		{Name: "M", DueDate: "2026-10-15", Measure: "custom", Estimate: "2026-10-10"},
		{Name: "M", DueDate: "2026-10-15", Estimate: "2026-10-10"},
		{Name: "M", DueDate: "2026-10-15", Template: "has spaces"},
		{Name: "M", DueDate: "2026-10-15", Template: strings.Repeat("t", maxMilestoneTemplate+1)},
	}
	for i, bad := range cases {
		if _, err := CleanMilestones([]project.Milestone{good, bad}); err == nil {
			t.Errorf("case %d (%#v): want the whole list refused", i, bad)
		}
	}
}

func TestDefaultPaymentForACXOnly(t *testing.T) {
	if got := DefaultPaymentFor("acx"); got != PaymentPerFinishedHour {
		t.Fatalf("acx = %q", got)
	}
	for _, id := range []string{"", "custom-0123456789abcdef", "other"} {
		if got := DefaultPaymentFor(id); got != "" {
			t.Fatalf("%q = %q, want none", id, got)
		}
	}
}
