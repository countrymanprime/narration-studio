package coverage

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"desktop/internal/contractfile"
)

const cascadeActivityJSON = `{"schemaVersion":1,"items":{"total":6,"done":2},"firstPass":{"model":"small","workers":4,"busy":3,"total":112,"done":40,"final":true},
"recheck":{"model":"large-v3-turbo","workers":1,"busy":1,"total":7,"done":3,"final":false,"reason":"low_confidence"}}`

func writeActivity(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "progress.txt.activity.json")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestTheActivityFileIsReadWithItsCounts(t *testing.T) {
	file, ok := readActivityFile(writeActivity(t, cascadeActivityJSON))
	if !ok {
		t.Fatal("a whole file of the right version is read")
	}
	if file.FirstPass.Workers != 4 || file.FirstPass.Busy != 3 || file.FirstPass.Total != 112 || file.Recheck == nil || *file.Recheck.Reason != "low_confidence" {
		t.Fatalf("file = %+v", file)
	}
}

// The sidecar's own test (test_coverage_activity.py) makes exactly this file, so the two cannot drift.
func TestTheFileTheSidecarsTestMakesIsRead(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "sidecars", "transcript-compare", "tests", "fixtures", "coverage_activity.json"))
	if err != nil {
		t.Fatal(err)
	}
	file, ok := readActivityFile(writeActivity(t, string(raw)))
	if !ok || file.FirstPass.Total != 112 || file.Recheck == nil || file.Recheck.Total != 7 {
		t.Fatalf("file = %+v, ok %v", file, ok)
	}
}

func TestAnActivityFileThatIsNotBelievableIsIgnored(t *testing.T) {
	cases := map[string]string{
		"torn":           `{"schemaVersion":1,"items":`,
		"other version":  strings.Replace(cascadeActivityJSON, `"schemaVersion":1`, `"schemaVersion":2`, 1),
		"busy > workers": strings.Replace(cascadeActivityJSON, `"busy":3`, `"busy":5`, 1),
		"no workers":     strings.Replace(cascadeActivityJSON, `"workers":4`, `"workers":0`, 1),
		"negative":       strings.Replace(cascadeActivityJSON, `"done":40`, `"done":-1`, 1),
		"too big":        `{"schemaVersion":1,"pad":"` + strings.Repeat("x", maxActivityBytes) + `"}`,
	}
	for name, body := range cases {
		if _, ok := readActivityFile(writeActivity(t, body)); ok {
			t.Errorf("%s: read as activity", name)
		}
	}
	if _, ok := readActivityFile(filepath.Join(t.TempDir(), "none")); ok {
		t.Error("a missing file is not activity")
	}
}

func TestARecheckStageAddsItsPassagesToTheOnesTheFirstStageQueued(t *testing.T) {
	file, _ := readActivityFile(writeActivity(t, cascadeActivityJSON))
	running := &job{request: Request{Parallel: Parallel{Workers: 0}}}
	first, _ := running.activityOf(file)
	if first.Requested != 0 || first.Recheck == nil || first.Recheck.Total != 7 || !reflect.DeepEqual(first.Recheck.Reasons, []string{ReasonLowConfidence}) {
		t.Fatalf("first stage = %+v", first)
	}

	// The windows stage's sidecar reports its windows as `recheck` (it has no first pass); the host adds them to the first stage's.
	running.stage, running.activityBase = stageRecheckWindows, first
	second, _ := readActivityFile(writeActivity(t, `{"schemaVersion":1,"items":{"total":1,"done":0},"recheck":{"model":"large-v3-turbo","workers":1,"busy":1,"total":2,"done":1,"final":true,"reason":null}}`))
	activity, _ := running.activityOf(second)
	if activity.FirstPass.Busy != 0 || activity.FirstPass.Total != 112 || activity.Items.Total != 6 {
		t.Fatalf("the first pass stays as it ended: %+v", activity)
	}
	recheck := activity.Recheck
	if recheck.Total != 9 || recheck.Done != 4 || recheck.Busy != 1 || !reflect.DeepEqual(recheck.Reasons, []string{ReasonLowConfidence, ReasonMissingWords}) {
		t.Fatalf("recheck = %+v", recheck)
	}

	running.stage = stageRecheckWhole
	wholeActivity, _ := running.activityOf(second)
	whole := wholeActivity.Recheck
	if !reflect.DeepEqual(whole.Reasons, []string{ReasonLowConfidence, ReasonWidespread}) {
		t.Fatalf("a whole-chapter pass is widespread: %+v", whole)
	}
}

func TestARunWithNoSecondLookSendsNoRecheck(t *testing.T) {
	file, _ := readActivityFile(writeActivity(t, `{"schemaVersion":1,"items":{"total":1,"done":0},"firstPass":{"model":"small","workers":1,"busy":1,"total":1,"done":0,"final":true}}`))
	running := &job{}
	if activity, _ := running.activityOf(file); activity.Recheck != nil {
		t.Fatalf("recheck = %+v", activity.Recheck)
	}
}

func TestTheStateCarriesTheSidecarsActivityWhileItRuns(t *testing.T) {
	p := newTestProject(t)
	sidecar := &fakeSidecar{pauseAfter: 1, paused: make(chan struct{}), resume: make(chan struct{})}
	var mu sync.Mutex
	var seen []State
	service := New(Config{Project: p.dir, Python: "python", ProjectFile: func() (string, error) { return p.rpp, nil }, LoadManuscript: p.loadManuscript},
		sidecar.launcher(), func(state State) { mu.Lock(); seen = append(seen, state); mu.Unlock() })
	service.pollInterval = time.Millisecond
	request := testRequest()
	request.Parallel = Parallel{Workers: 4}
	if _, err := service.Start(request); err != nil {
		t.Fatal(err)
	}
	<-sidecar.paused
	progress := sidecar.lastArgs()["--progress"]
	if err := os.WriteFile(progress+".activity.json", []byte(cascadeActivityJSON), 0o600); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return service.State().Activity != nil })
	state := service.State()
	close(sidecar.resume)
	service.Wait()

	if state.Activity.Requested != 4 || state.Activity.FirstPass.Busy != 3 || state.Activity.Recheck.Done != 3 {
		t.Fatalf("activity = %+v", state.Activity)
	}
	state.RunID, state.StartedAt, state.CompletedAt = "1789970042000000000", nil, nil
	state.Phase, state.Message, state.Stage = PhaseRunning, "Transcribing item 3/6… 0:41 / 1:30", "TRANSCRIBE"
	state.ChapterID = "c-0001"
	contractfile.Check(t, "coverage-state-running-activity", state)
}

// The sidecar's own test (test_coverage_activity.py) makes exactly this file for the windows-only stage.
func TestTheRecheckStagesFileTheSidecarsTestMakesIsRead(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "sidecars", "transcript-compare", "tests", "fixtures", "coverage_activity_recheck.json"))
	if err != nil {
		t.Fatal(err)
	}
	file, ok := readActivityFile(writeActivity(t, string(raw)))
	if !ok || file.FirstPass != nil || file.Recheck == nil || file.Recheck.Total != 2 || file.Recheck.Reason != nil {
		t.Fatalf("file = %+v, ok %v", file, ok)
	}
}

func TestARecheckStageUsesTheReasonTheFileGivesOverTheStagesOwn(t *testing.T) {
	running := &job{stage: stageRecheckWindows}
	file, _ := readActivityFile(writeActivity(t, `{"schemaVersion":1,"items":{"total":1,"done":0},"recheck":{"model":"m","workers":1,"busy":0,"total":1,"done":0,"final":true,"reason":"low_confidence"}}`))
	activity, _ := running.activityOf(file)
	if !reflect.DeepEqual(activity.Recheck.Reasons, []string{ReasonLowConfidence}) {
		t.Fatalf("reasons = %v", activity.Recheck.Reasons)
	}
}

func TestAFileWithNoPassIsIgnoredAndAFirstStageNeedsItsFirstPass(t *testing.T) {
	if _, ok := readActivityFile(writeActivity(t, `{"schemaVersion":1,"items":{"total":1,"done":0}}`)); ok {
		t.Error("a file with neither pass is read as activity")
	}
	recheckOnly, _ := readActivityFile(writeActivity(t, `{"schemaVersion":1,"items":{"total":1,"done":0},"recheck":{"model":"m","workers":1,"busy":0,"total":1,"done":0,"final":true,"reason":null}}`))
	if _, ok := (&job{}).activityOf(recheckOnly); ok {
		t.Error("the first stage has no first pass in a re-check-only file")
	}
}
