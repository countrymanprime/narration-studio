package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/project"
)

// ProductionPlan's, ProductionSetDeadline's, ProductionSetPayment's and ProductionSaveMilestones's payload:
// the empty plan of a project that has set nothing, then one with a deadline, an amount and two milestones.
func TestContractProductionPlan(t *testing.T) {
	host := hostWithCredits(t)
	empty, err := host.ProductionPlan()
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "production-plan-empty", empty)

	amount := 2400.0
	if _, err := host.ProductionSetDeadline("2026-12-01", &amount); err != nil {
		t.Fatal(err)
	}
	set, err := host.ProductionSaveMilestones([]project.Milestone{
		{Name: "ACX 15-minute checkpoint", DueDate: "2026-10-15", Note: "The rights holder approves the first 15 minutes."},
		{Name: "Final delivery", DueDate: "2026-12-01"},
	})
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "production-plan-set", set)
}

// The plan a manifest written before the payment type and the milestone fields reads as (ADR 0800): per finished hour
// from its contracted amount, and milestones with no measure, estimate, done flag or template.
func TestContractProductionPlanOldManifest(t *testing.T) {
	host := hostWithCredits(t)
	path := project.Path(host.config.projectFolder)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	old := `{"schemaVersion":1,"name":"Alice","deadline":"2026-12-01","contractedAmount":2400,` +
		`"milestones":[{"name":"ACX 15-minute checkpoint","dueDate":"2026-10-15","note":"The rights holder approves the first 15 minutes."}]}`
	if err := os.WriteFile(path, []byte(old), 0o600); err != nil {
		t.Fatal(err)
	}
	plan, err := host.ProductionPlan()
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "production-plan-old-manifest", plan)
}

// ProductionSetPayment's answer for a royalty share: the type and no contracted amount.
func TestContractProductionPlanRoyaltyShare(t *testing.T) {
	host := hostWithCredits(t)
	amount := 2400.0
	if _, err := host.ProductionSetDeadline("2026-12-01", &amount); err != nil {
		t.Fatal(err)
	}
	plan, err := host.ProductionSetPayment("royalty_share")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "production-plan-royalty-share", plan)
}

// ProductionSaveMilestones's answer with every milestone field: a measured checkpoint from its template with an
// estimate, a done chapters milestone and a custom one.
func TestContractProductionPlanMilestoneMeasure(t *testing.T) {
	host := hostWithCredits(t)
	if _, err := host.ProductionSetPayment("per_finished_hour"); err != nil {
		t.Fatal(err)
	}
	plan, err := host.ProductionSaveMilestones([]project.Milestone{
		{Name: "ACX 15-minute checkpoint", DueDate: "2026-10-15", Measure: "checkpoint", Estimate: "2026-10-12", Template: "checkpoint15"},
		{Name: "First 4 chapters", DueDate: "2026-10-20", Measure: "ch4", Estimate: "2026-10-19", Done: true},
		{Name: "Cover art approved", DueDate: "2026-11-01", Measure: "custom", Note: "Ask the publisher."},
	})
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "production-plan-milestone-measure", plan)
}

// ProductionSetRateBasis's answer for the narrator's own pace: the plan with rateBasis "own".
func TestContractProductionPlanRateBasis(t *testing.T) {
	host := hostWithCredits(t)
	plan, err := host.ProductionSetRateBasis("own")
	if err != nil {
		t.Fatal(err)
	}
	checkBindingContract(t, "production-plan-rate-basis", plan)
}
