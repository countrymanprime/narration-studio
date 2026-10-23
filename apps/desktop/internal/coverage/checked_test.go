package coverage

import (
	"os"
	"path/filepath"
	"testing"
)

// Incremental checks (#2251 item 5): a range the re-check model has already transcribed is never planned again. The words
// files are the ledger: a file the model made whole, or the spans a windows-only re-check gave it.

func TestPlanRecheckSkipsAWindowTheModelAlreadyChecked(t *testing.T) {
	items := planItems()
	region := RegionLine{Kind: "skip", Before: pos(0, itemGUID(0), 10), After: pos(0, itemGUID(0), 12)}
	first := planRecheck(Report{Regions: []RegionLine{region}}, items, "small")
	if len(first.Windows) != 1 {
		t.Fatalf("first plan = %+v", first)
	}
	checked := checkedRanges{wordsFileFor(0): {{first.Windows[0].Start, first.Windows[0].End}}}

	again := planRecheckUnchecked(Report{Regions: []RegionLine{region}}, items, "small", checked)

	if again.needed() {
		t.Fatalf("an already re-checked window must not be planned again, got %+v", again)
	}
}

func TestPlanRecheckKeepsAWindowOfAnotherItemOrOnlyPartlyChecked(t *testing.T) {
	items := planItems()
	regions := []RegionLine{
		{Kind: "skip", Before: pos(0, itemGUID(0), 10), After: pos(0, itemGUID(0), 12)},
		{Kind: "skip", Before: pos(1, itemGUID(1), 100), After: pos(1, itemGUID(1), 110)},
	}
	checked := checkedRanges{wordsFileFor(0): {{0, 20}}, wordsFileFor(1): {{0, 50}}}

	plan := planRecheckUnchecked(Report{Regions: regions}, items, "small", checked)

	if plan.WholeChapter || len(plan.Windows) != 2 {
		t.Fatalf("plan = %+v", plan)
	}
}

func TestPlanRecheckDoesNotEscalateToTheWholeChapterOverWhatIsAlreadyChecked(t *testing.T) {
	items := planItems()
	report := Report{}
	for i := range 3 {
		report.Unsure = append(report.Unsure, UnsureLine{ItemIndex: i, ItemGUID: itemGUID(i), Start: 0, End: planItemLength, Words: 99, MinScore: 0.1})
	}
	if plan := planRecheck(report, items, "small"); !plan.WholeChapter {
		t.Fatalf("doubt everywhere must re-check the whole chapter the first time, got %+v", plan)
	}
	checked := checkedRanges{}
	for i := range 3 {
		checked[wordsFileFor(i)] = [][2]float64{{0, planItemLength}}
	}

	if plan := planRecheckUnchecked(report, items, "small", checked); plan.needed() {
		t.Fatalf("a chapter the model already checked whole must plan nothing, got %+v", plan)
	}
}

func TestReadCheckedRangesReadsWholeFilesAndSpansOfTheModel(t *testing.T) {
	dir := t.TempDir()
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write("w-0.json", `{"schemaVersion":1,"sourceStart":0,"sourceEnd":300,"words":[],"transcription":{"model":"small"}}`)
	write("w-1.json", `{"schemaVersion":1,"sourceStart":0,"sourceEnd":300,"words":[],"transcription":{"model":"tiny"},
		"spans":[{"start":0,"end":40,"model":"tiny"},{"start":40,"end":70,"model":"small"},{"start":70,"end":300,"model":"tiny"}]}`)
	write("w-2.json", `not json`)

	got := readCheckedRanges(dir, planItems(), "small")

	if r := got[wordsFileFor(0)]; len(r) != 1 || r[0] != [2]float64{0, 300} {
		t.Fatalf("a file the model made whole is checked whole, got %v", r)
	}
	if r := got[wordsFileFor(1)]; len(r) != 1 || r[0] != [2]float64{40, 70} {
		t.Fatalf("a spliced file is checked over the model's spans only, got %v", r)
	}
	if r, ok := got[wordsFileFor(2)]; ok {
		t.Fatalf("an unreadable file is a miss, got %v", r)
	}
	if none := readCheckedRanges(dir, planItems(), ""); len(none) != 0 {
		t.Fatalf("no model, nothing checked: %v", none)
	}
}

func TestASecondCheckOfUnchangedAudioPlansNoRecheck(t *testing.T) {
	p := newTestProject(t)
	sidecar := &fakeSidecar{present: 8, afterRecheckPresent: 8} // the tail stays missing: the narrator has not recorded it yet
	service := p.service(sidecar)
	run(t, service, cascadeRequest())
	if got := len(sidecar.rechecks()); got != 1 {
		t.Fatalf("the first check re-checks the doubtful window once, got %d", got)
	}
	launches := len(sidecar.launches)

	run(t, service, cascadeRequest())

	if got := len(sidecar.rechecks()); got != 1 {
		t.Fatalf("a check of unchanged audio must not re-check a window the larger model already did, got %d re-checks", got)
	}
	second := sidecar.launches[launches:]
	if len(second) != 1 {
		t.Fatalf("the second check is its first pass only, got %d launches", len(second))
	}
	if got := flags(second[0])["--checked-by"]; got != "large-v3-turbo" {
		t.Fatalf("the first pass must name the larger model whose work it keeps, got --checked-by %q", got)
	}
	if got := len(sidecar.transcriptions()); got != 2 {
		t.Fatalf("both items transcribed once, by the first check only; got %d transcriptions", got)
	}
}

func TestABackgroundCheckPlansForItsShareOfTheProcessors(t *testing.T) {
	p := newTestProject(t)
	sidecar := &fakeSidecar{}
	service := p.service(sidecar)
	request := testRequest()
	request.Background, request.CPUs = true, 3

	run(t, service, request)

	if got := sidecar.lastArgs()["--cpus"]; got != "3" {
		t.Fatalf("--cpus = %q", got)
	}
	if !sidecar.lowPriority[len(sidecar.lowPriority)-1] {
		t.Fatal("a background check's sidecar must run below normal priority")
	}
	plain := testRequest()
	run(t, service, plain)
	if _, given := sidecar.lastArgs()["--cpus"]; given {
		t.Fatal("a run with no budget plans for every processor")
	}
	if sidecar.lowPriority[len(sidecar.lowPriority)-1] {
		t.Fatal("the narrator's own check runs at normal priority")
	}
}
