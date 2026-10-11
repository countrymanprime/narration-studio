package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/contractfile"
	"github.com/countrymanprime/narration-utils/shell/internal/production"
	"github.com/countrymanprime/narration-utils/shell/internal/project"
)

// The production plan bindings: deadline, contracted amount and milestones on the
// project manifest.

func decodePlan(t *testing.T, encoded string) production.Plan {
	t.Helper()
	var plan production.Plan
	decodeInto(t, encoded, &plan)
	return plan
}

func TestProductionPlanIsEmptyForAProjectThatHasSetNothing(t *testing.T) {
	host := hostWithCredits(t)
	encoded, err := host.ProductionPlan()
	if err != nil {
		t.Fatal(err)
	}
	plan := decodePlan(t, encoded)
	if plan.Deadline != nil || plan.ContractedAmount != nil || plan.Milestones == nil || len(plan.Milestones) != 0 {
		t.Fatalf("want an empty plan, got %s", encoded)
	}
}

func TestProductionSetDeadlineStoresItOnTheManifestAndClearsIt(t *testing.T) {
	host := hostWithCredits(t)
	amount := 1800.0
	encoded, err := host.ProductionSetDeadline(" 2026-12-01 ", &amount)
	if err != nil {
		t.Fatal(err)
	}
	plan := decodePlan(t, encoded)
	if plan.Deadline == nil || *plan.Deadline != "2026-12-01" || plan.ContractedAmount == nil || *plan.ContractedAmount != 1800 {
		t.Fatalf("unexpected answer: %s", encoded)
	}
	manifest, ok, err := project.Load(host.persist, host.config.projectFolder)
	if err != nil || !ok || manifest.Deadline != "2026-12-01" || *manifest.ContractedAmount != 1800 {
		t.Fatalf("want it on the manifest, got %+v ok=%v err=%v", manifest, ok, err)
	}

	encoded, err = host.ProductionSetDeadline("", nil)
	if err != nil {
		t.Fatal(err)
	}
	if plan := decodePlan(t, encoded); plan.Deadline != nil || plan.ContractedAmount != nil {
		t.Fatalf("want both cleared, got %s", encoded)
	}
}

func TestProductionSetDeadlineRefusesABadDateOrAmountAndWritesNothing(t *testing.T) {
	host := hostWithCredits(t)
	negative := -5.0
	if _, err := host.ProductionSetDeadline("2026-02-30", nil); err == nil {
		t.Fatal("want an impossible date refused")
	}
	if _, err := host.ProductionSetDeadline("2026-12-01", &negative); err == nil {
		t.Fatal("want a negative amount refused")
	}
	if manifest, ok, _ := project.Load(host.persist, host.config.projectFolder); ok && (manifest.Deadline != "" || manifest.ContractedAmount != nil) {
		t.Fatalf("a refused call must write nothing: %+v", manifest)
	}
}

func TestProductionSaveMilestonesReplacesTheListInOrder(t *testing.T) {
	host := hostWithCredits(t)
	encoded, err := host.ProductionSaveMilestones([]project.Milestone{
		{Name: "ACX 15-minute checkpoint", DueDate: "2026-10-15", Note: "rights holder approves"},
		{Name: "Final delivery", DueDate: "2026-12-01"},
	})
	if err != nil {
		t.Fatal(err)
	}
	plan := decodePlan(t, encoded)
	if len(plan.Milestones) != 2 || plan.Milestones[0].Name != "ACX 15-minute checkpoint" || plan.Milestones[1].DueDate != "2026-12-01" {
		t.Fatalf("unexpected answer: %s", encoded)
	}

	if _, err := host.ProductionSaveMilestones([]project.Milestone{{Name: "", DueDate: "2026-10-15"}}); err == nil {
		t.Fatal("want a milestone with no name refused")
	}
	reread, err := host.ProductionPlan()
	if err != nil {
		t.Fatal(err)
	}
	if plan := decodePlan(t, reread); len(plan.Milestones) != 2 {
		t.Fatalf("a refused save must keep the previous list, got %s", reread)
	}

	encoded, err = host.ProductionSaveMilestones(nil)
	if err != nil {
		t.Fatal(err)
	}
	if plan := decodePlan(t, encoded); len(plan.Milestones) != 0 || plan.Milestones == nil {
		t.Fatalf("want an empty list, got %s", encoded)
	}
}

func TestProductionSettingOneFieldKeepsTheOthersAndTheCredits(t *testing.T) {
	host := hostWithExtras(t, 10)
	if _, err := host.CreditsSetStatus("opening", "finalized"); err != nil {
		t.Fatal(err)
	}
	if _, err := host.ProductionSaveMilestones([]project.Milestone{{Name: "Checkpoint", DueDate: "2026-10-15"}}); err != nil {
		t.Fatal(err)
	}
	amount := 10.0
	if _, err := host.ProductionSetDeadline("2026-12-01", &amount); err != nil {
		t.Fatal(err)
	}
	manifest, _, err := project.Load(host.persist, host.config.projectFolder)
	if err != nil {
		t.Fatal(err)
	}
	if len(manifest.Milestones) != 1 || manifest.CreditsStatus["opening"] != "finalized" {
		t.Fatalf("setting the deadline must keep the milestones and credits: %+v", manifest)
	}
}

func TestTheProductionPlanSurvivesClearDerivedData(t *testing.T) {
	host := hostWithExtras(t, 10)
	amount := 2400.0
	if _, err := host.ProductionSetDeadline("2026-12-01", &amount); err != nil {
		t.Fatal(err)
	}
	if _, err := host.ProductionSaveMilestones([]project.Milestone{{Name: "Checkpoint", DueDate: "2026-10-15"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := host.ManuscriptClearProjectData(true); err != nil {
		t.Fatal(err)
	}
	encoded, err := host.ProductionPlan()
	if err != nil {
		t.Fatal(err)
	}
	plan := decodePlan(t, encoded)
	if plan.Deadline == nil || *plan.Deadline != "2026-12-01" || plan.ContractedAmount == nil || len(plan.Milestones) != 1 {
		t.Fatalf("want the plan to survive Clear, like the credits do, got %s", encoded)
	}
}

func TestProductionPlanBindingsRequireAnOpenProject(t *testing.T) {
	host := NewHost()
	if _, err := host.ProductionPlan(); err == nil {
		t.Fatal("want an error with no project open")
	}
	if _, err := host.ProductionSetDeadline("2026-12-01", nil); err == nil {
		t.Fatal("want an error with no project open")
	}
	if _, err := host.ProductionSaveMilestones(nil); err == nil {
		t.Fatal("want an error with no project open")
	}
}

func TestProductionPlanReadsACorruptManifestAsEmpty(t *testing.T) {
	host := hostWithCredits(t)
	path := project.Path(host.config.projectFolder)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	encoded, err := host.ProductionPlan()
	if err != nil {
		t.Fatal(err)
	}
	if plan := decodePlan(t, encoded); plan.Deadline != nil || len(plan.Milestones) != 0 {
		t.Fatalf("want an empty plan (persist kept the corrupt file aside), got %s", encoded)
	}
}

// productionHost is an attached project (stagesHost) whose one chapter, c-0001, is in recording.
func productionHost(t *testing.T) *Host {
	t.Helper()
	return stagesHost(t, 5)
}

func TestProductionOverviewReadsTheChaptersTheirReadinessAndTheTimeLog(t *testing.T) {
	host := productionHost(t)
	overview := decodeAnswer(t)(host.ProductionOverview())
	chapters, _ := overview["chapters"].([]any)
	if len(chapters) != 1 {
		t.Fatalf("overview = %v", overview)
	}
	chapter := chapters[0].(map[string]any)
	if chapter["id"] != "c-0001" || chapter["status"] != "recording" || chapter["pfh"] != nil {
		t.Fatalf("chapter = %v", chapter)
	}
	readiness, _ := chapter["readiness"].(map[string]any)
	if readiness == nil || readiness["target"] != "editing" {
		t.Fatalf("readiness = %v, want the stage recommendation's own verdict towards editing", chapter["readiness"])
	}
	if overview["running"] != nil || overview["deadline"] != nil {
		t.Fatalf("overview = %v, want no timer and no deadline yet", overview)
	}
	totals := overview["totals"].(map[string]any)
	if totals["effectiveRate"] != nil || totals["bookPfh"] != nil {
		t.Fatalf("totals = %v, want undefined figures with nothing logged", totals)
	}
}

// A timer is started and stopped only by these two bindings, a second start is refused rather than switching timers,
// and neither touches the chapter's status.
func TestProductionTimerStartsStopsAndRefusesASecondTimer(t *testing.T) {
	host := productionHost(t)
	started := decodeAnswer(t)(host.ProductionStartTimer("c-0001", "recording"))
	if started["status"] != "started" {
		t.Fatalf("start = %v", started)
	}
	refused := decodeAnswer(t)(host.ProductionStartTimer("c-0001", "editing"))
	if refused["status"] != "refused" || refused["reason"] != "timer_running" {
		t.Fatalf("second start = %v, want refused", refused)
	}
	running := decodeAnswer(t)(host.ProductionOverview())["running"].(map[string]any)
	if running["chapterId"] != "c-0001" || running["stage"] != "recording" {
		t.Fatalf("running = %v", running)
	}
	stopped := decodeAnswer(t)(host.ProductionStopTimer())
	if stopped["stopped"] != true || stopped["session"].(map[string]any)["endedAt"] == nil {
		t.Fatalf("stop = %v", stopped)
	}
	again := decodeAnswer(t)(host.ProductionStopTimer())
	if again["stopped"] != false || again["session"] != nil {
		t.Fatalf("second stop = %v, want a no-op", again)
	}
	chapter := decodeAnswer(t)(host.ProductionOverview())["chapters"].([]any)[0].(map[string]any)
	if chapter["status"] != "recording" {
		t.Fatalf("status = %v, want it untouched by the timer", chapter["status"])
	}
	if _, err := os.Stat(filepath.Join(host.config.projectFolder, "narration-utils", "production", "sessions.json")); err != nil {
		t.Fatalf("the time log was not written: %v", err)
	}
}

func TestProductionStartTimerRefusesAChapterTheManuscriptDoesNotHave(t *testing.T) {
	host := productionHost(t)
	if _, err := host.ProductionStartTimer("c-9999", "recording"); err == nil {
		t.Fatal("want an error for an unknown chapter")
	}
	if _, err := host.ProductionStartTimer("c-0001", "mastering"); err == nil {
		t.Fatal("want an error for a stage that is not one of the five")
	}
	if running := decodeAnswer(t)(host.ProductionOverview())["running"]; running != nil {
		t.Fatalf("running = %v, want nothing logged", running)
	}
}

func TestProductionBindingsNeedAProject(t *testing.T) {
	host := NewHost()
	if _, err := host.ProductionOverview(); err == nil {
		t.Fatal("overview: want an error with no project")
	}
	if _, err := host.ProductionStartTimer("c-0001", "recording"); err == nil {
		t.Fatal("start: want an error with no project")
	}
	if _, err := host.ProductionStopTimer(); err == nil {
		t.Fatal("stop: want an error with no project")
	}
}

// ProductionStartTimer's and ProductionStopTimer's answers (ADR 0069). The session id is random hex of 16 characters,
// which Stabilize leaves alone, so it is fixed here.
func TestContractProductionTimer(t *testing.T) {
	host := productionHost(t)
	pin := func(name, encoded string, err error) {
		t.Helper()
		answer := decodeAnswer(t)(encoded, err)
		if session, ok := answer["session"].(map[string]any); ok {
			session["id"] = "0000000000000000"
		}
		stable, err := contractfile.Stabilize(answer)
		if err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, name, stable)
	}
	encoded, err := host.ProductionStopTimer()
	pin("production-timer-stop-none", encoded, err)
	encoded, err = host.ProductionStartTimer("c-0001", "recording")
	pin("production-timer-started", encoded, err)
	encoded, err = host.ProductionStartTimer("c-0001", "editing")
	pin("production-timer-refused", encoded, err)
	encoded, err = host.ProductionStopTimer()
	pin("production-timer-stopped", encoded, err)
}

// ProductionBurndown: a time series of the book's logged hours, one point per day from the first
// stopped session to the last, running cumulatively. Data only; no chart primitive reads it yet.
func TestProductionBurndownRequiresAnOpenProject(t *testing.T) {
	host := NewHost()
	if _, err := host.ProductionBurndown(); err == nil {
		t.Fatal("want an error with no project open")
	}
}

func TestProductionBurndownIsEmptyWithNothingLoggedAndCumulativeOnceItIs(t *testing.T) {
	host := productionHost(t)
	empty := decodeAnswerList(t)(host.ProductionBurndown())
	if len(empty) != 0 {
		t.Fatalf("want no points with nothing logged, got %v", empty)
	}
	if _, err := host.ProductionStartTimer("c-0001", "recording"); err != nil {
		t.Fatal(err)
	}
	// A real, measurable gap between start and stop: two back-to-back time.Now() calls can otherwise land in the
	// same clock tick on some CI runners, logging zero elapsed time.
	time.Sleep(5 * time.Millisecond)
	if _, err := host.ProductionStopTimer(); err != nil {
		t.Fatal(err)
	}
	points := decodeAnswerList(t)(host.ProductionBurndown())
	if len(points) != 1 {
		t.Fatalf("want one point for today, got %v", points)
	}
	point := points[0].(map[string]any)
	if point["hoursLogged"].(float64) <= 0 {
		t.Fatalf("want some hours logged, got %v", point)
	}
}

func TestContractProductionBurndown(t *testing.T) {
	host := productionHost(t)
	if _, err := host.ProductionStartTimer("c-0001", "recording"); err != nil {
		t.Fatal(err)
	}
	if _, err := host.ProductionStopTimer(); err != nil {
		t.Fatal(err)
	}
	points := decodeAnswerList(t)(host.ProductionBurndown())
	for _, point := range points {
		row := point.(map[string]any)
		row["date"] = "2026-09-21"
		// hoursLogged is the real time between two time.Now() calls a moment apart: not a fixed 32-hex id or an
		// RFC 3339 timestamp Stabilize normalizes, so it is fixed here like the date.
		row["hoursLogged"] = 0.5
	}
	stable, err := contractfile.Stabilize(points)
	if err != nil {
		t.Fatal(err)
	}
	contractfile.Check(t, "production-burndown", stable)
}

// The overview reads the deadline and contracted amount the manifest stores: the rate becomes defined once an
// amount and some logged time exist, and the deadline appears with the days left.
func TestProductionOverviewReadsThePlanSetOnTheManifest(t *testing.T) {
	host := productionHost(t)
	amount := 1200.0
	if _, err := host.ProductionSetDeadline("2099-01-01", &amount); err != nil {
		t.Fatal(err)
	}
	overview := decodeAnswer(t)(host.ProductionOverview())
	deadline, _ := overview["deadline"].(map[string]any)
	if deadline["date"] != "2099-01-01" || deadline["daysLeft"].(float64) <= 0 {
		t.Fatalf("deadline = %v", overview["deadline"])
	}
	totals := overview["totals"].(map[string]any)
	if totals["contractedAmount"] != 1200.0 || totals["effectiveRate"] != nil {
		t.Fatalf("totals = %v, want the amount set and no rate before any hour is logged", totals)
	}
}

// old-manifest-reads-as-defaults: a project.json written before the payment type and the milestone fields reads with
// their defaults, and reading it does not rewrite the file.
func TestProductionPlanReadsAnOldManifestAsDefaultsWithoutRewritingIt(t *testing.T) {
	host := hostWithCredits(t)
	path := project.Path(host.config.projectFolder)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	old := []byte(`{"schemaVersion":1,"name":"Alice","deadline":"2026-12-01","contractedAmount":2400,` +
		`"milestones":[{"name":"ACX 15-minute checkpoint","dueDate":"2026-10-15","note":"approve"}]}`)
	if err := os.WriteFile(path, old, 0o600); err != nil {
		t.Fatal(err)
	}
	encoded, err := host.ProductionPlan()
	if err != nil {
		t.Fatal(err)
	}
	plan := decodePlan(t, encoded)
	if plan.Payment != production.PaymentPerFinishedHour || plan.ContractedAmount == nil || *plan.ContractedAmount != 2400 {
		t.Fatalf("an amount and no payment type reads as per finished hour, got %s", encoded)
	}
	if got := plan.Milestones; len(got) != 1 || got[0] != (project.Milestone{Name: "ACX 15-minute checkpoint", DueDate: "2026-10-15", Note: "approve"}) {
		t.Fatalf("want the milestone with empty new fields, got %s", encoded)
	}
	after, err := os.ReadFile(path)
	if err != nil || string(after) != string(old) {
		t.Fatalf("reading must not rewrite project.json, got %s (%v)", after, err)
	}
}

// plan-roundtrips-with-the-new-fields: each payment type and a milestone with every new field read back equal from a
// new host over the same folder.
func TestProductionPlanRoundTripsThePaymentAndMilestoneFieldsAcrossARestart(t *testing.T) {
	host := hostWithCredits(t)
	milestones := []project.Milestone{
		{Name: "ACX 15-minute checkpoint", DueDate: "2026-10-15", Measure: "checkpoint", Estimate: "2026-10-12", Done: true, Template: "checkpoint15"},
		{Name: "Final delivery", DueDate: "2026-12-01", Measure: "all"},
	}
	if _, err := host.ProductionSaveMilestones(milestones); err != nil {
		t.Fatal(err)
	}
	for _, payment := range []string{production.PaymentRoyaltyShare, production.PaymentNone, production.PaymentPerFinishedHour} {
		saved, err := host.ProductionSetPayment(payment)
		if err != nil {
			t.Fatal(err)
		}
		restarted := NewHost()
		restarted.config.projectFolder = host.config.projectFolder
		restarted.config.projectName = host.config.projectName
		reread, err := restarted.ProductionPlan()
		if err != nil {
			t.Fatal(err)
		}
		if reread != saved {
			t.Fatalf("%s: want the saved plan back after a restart\nsaved:  %s\nreread: %s", payment, saved, reread)
		}
		plan := decodePlan(t, reread)
		if plan.Payment != payment || len(plan.Milestones) != 2 || plan.Milestones[0] != milestones[0] || plan.Milestones[1] != milestones[1] {
			t.Fatalf("%s: unexpected plan %s", payment, reread)
		}
	}
}

// royalty-share-has-no-figure: choosing royalty share or none clears the contracted amount on save (the mock's
// Schedule dialog does the same, studio-next/tests/batch-b.test.tsx), and an amount is then refused with a sentence
// until the payment type is per finished hour again. The overview computes no effective rate.
func TestProductionSetPaymentClearsTheAmountForRoyaltyShareOrNone(t *testing.T) {
	for _, payment := range []string{production.PaymentRoyaltyShare, production.PaymentNone} {
		host := productionHost(t)
		amount := 2400.0
		if _, err := host.ProductionSetDeadline("2026-12-01", &amount); err != nil {
			t.Fatal(err)
		}
		if _, err := host.ProductionStartTimer("c-0001", "recording"); err != nil {
			t.Fatal(err)
		}
		time.Sleep(5 * time.Millisecond)
		if _, err := host.ProductionStopTimer(); err != nil {
			t.Fatal(err)
		}
		if before, _, err := host.buildProductionOverview(); err != nil || before.Totals.EffectiveRate == nil {
			t.Fatalf("%s: want an effective rate while per finished hour, got %+v %v", payment, before.Totals, err)
		}
		encoded, err := host.ProductionSetPayment(payment)
		if err != nil {
			t.Fatal(err)
		}
		plan := decodePlan(t, encoded)
		if plan.Payment != payment || plan.ContractedAmount != nil || plan.Deadline == nil || *plan.Deadline != "2026-12-01" {
			t.Fatalf("%s: want the amount cleared and the deadline kept, got %s", payment, encoded)
		}
		if manifest, _, _ := project.Load(host.persist, host.config.projectFolder); manifest.ContractedAmount != nil || manifest.Payment != payment {
			t.Fatalf("%s: want the amount cleared on the manifest, got %+v", payment, manifest)
		}
		if _, err := host.ProductionSetDeadline("2026-12-01", &amount); err == nil || !strings.Contains(err.Error(), "per finished hour") {
			t.Fatalf("%s: want an amount refused with a sentence, got %v", payment, err)
		}
		overview, _, err := host.buildProductionOverview()
		if err != nil {
			t.Fatal(err)
		}
		if overview.Totals.ContractedAmount != nil || overview.Totals.EffectiveRate != nil {
			t.Fatalf("%s: want no amount and no effective rate, got %+v", payment, overview.Totals)
		}
		if _, err := host.ProductionSetDeadline("", nil); err != nil {
			t.Fatalf("%s: clearing the deadline without an amount stays allowed: %v", payment, err)
		}
	}
}

// refusals-stay-whole-list: an unknown payment type is refused and nothing is saved.
func TestProductionSetPaymentRefusesAnUnknownTypeAndWritesNothing(t *testing.T) {
	host := hostWithCredits(t)
	amount := 2400.0
	if _, err := host.ProductionSetDeadline("2026-12-01", &amount); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(project.Path(host.config.projectFolder))
	if err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"", "royalty", "hourly"} {
		if _, err := host.ProductionSetPayment(bad); err == nil {
			t.Errorf("%q: want refused", bad)
		}
	}
	if _, err := host.ProductionSaveMilestones([]project.Milestone{{Name: "M", DueDate: "2026-10-15", Measure: "nonsense"}}); err == nil {
		t.Error("want an unknown measure refused")
	}
	after, err := os.ReadFile(project.Path(host.config.projectFolder))
	if err != nil || string(after) != string(before) {
		t.Fatalf("a refused call must write nothing:\nbefore %s\nafter  %s", before, after)
	}
}

// rate-basis-round-trip: each basis reads back, from a new service over the same folder; the standard basis is the
// absent field. old-manifest-reads-as-standard: a project.json with no rateBasis answers no override.
func TestProductionSetRateBasisRoundTripsAcrossARestart(t *testing.T) {
	host := hostWithCredits(t)
	for _, basis := range []string{production.RateBasisOwn, production.RateBasisStandard} {
		saved, err := host.ProductionSetRateBasis(basis)
		if err != nil {
			t.Fatal(err)
		}
		reread, err := host.ProductionPlan()
		if err != nil || reread != saved {
			t.Fatalf("%s: want the saved plan back, saved %s reread %s %v", basis, saved, reread, err)
		}
		manifest, _, err := project.Load(host.persist, host.config.projectFolder)
		if err != nil || production.RateBasisOf(manifest) != basis {
			t.Fatalf("%s: want it on the manifest, got %+v %v", basis, manifest, err)
		}
		if basis == production.RateBasisOwn && !strings.Contains(saved, `"rateBasis":"own"`) {
			t.Fatalf("want rateBasis own in %s", saved)
		}
		if basis == production.RateBasisStandard && strings.Contains(saved, "rateBasis") {
			t.Fatalf("the standard basis is the absent field, got %s", saved)
		}
	}
	if production.RateBasisOf(&project.Manifest{}) != production.RateBasisStandard || production.RateBasisOf(nil) != production.RateBasisStandard {
		t.Fatal("a manifest with no rateBasis reads as standard")
	}
}

// unknown-basis-is-refused: any other string is refused with a sentence and nothing is written.
func TestProductionSetRateBasisRefusesAnUnknownBasisAndWritesNothing(t *testing.T) {
	host := hostWithCredits(t)
	if _, err := host.ProductionSetRateBasis("own"); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(project.Path(host.config.projectFolder))
	if err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"", "Own", "fast"} {
		if _, err := host.ProductionSetRateBasis(bad); err == nil || !strings.Contains(err.Error(), "not a schedule basis") {
			t.Errorf("%q: want a sentence refusal, got %v", bad, err)
		}
	}
	after, err := os.ReadFile(project.Path(host.config.projectFolder))
	if err != nil || string(after) != string(before) {
		t.Fatalf("a refused call must write nothing:\nbefore %s\nafter  %s", before, after)
	}
}

// save-goes-through-the-existing-guarded-write: a corrupt manifest is handled as the other plan setters handle it
// (persist keeps the corrupt file aside and the save starts from a fresh manifest), never overwritten in place.
func TestProductionSetRateBasisHandlesACorruptManifestLikeThePaymentSetter(t *testing.T) {
	outcome := func(set func(*Host) error) (string, int) {
		host := hostWithCredits(t)
		path := project.Path(host.config.projectFolder)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("{not json"), 0o600); err != nil {
			t.Fatal(err)
		}
		err := set(host)
		entries, _ := os.ReadDir(filepath.Dir(path))
		return fmt.Sprint(err == nil), len(entries)
	}
	wantErr, wantFiles := outcome(func(h *Host) error { _, err := h.ProductionSetPayment("none"); return err })
	gotErr, gotFiles := outcome(func(h *Host) error { _, err := h.ProductionSetRateBasis("own"); return err })
	if gotErr != wantErr || gotFiles != wantFiles {
		t.Fatalf("want the payment setter's outcome (ok=%s, %d files), got ok=%s, %d files", wantErr, wantFiles, gotErr, gotFiles)
	}
}
