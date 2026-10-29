package main

import (
	"context"
	"desktop/internal/brand"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"desktop/internal/coverage"
	"desktop/internal/evidence"
)

func waitUntil(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !condition() {
		if time.Now().After(deadline) {
			t.Fatal("timed out")
		}
		time.Sleep(time.Millisecond)
	}
}

// resolved is resolveCoverageChoices over a host with the given RecordingCoverage and Transcript Compare settings.
func resolved(t *testing.T, saved map[string]string, options map[string]string) (coverageChoices, error) {
	t.Helper()
	host := newTestHostForDeliverySettings(t, t.TempDir())
	for key, value := range saved {
		tool := coverage.SettingsTool
		if key == "model_size" {
			tool = "TranscriptCompare"
		}
		if err := host.saveSettings(tool, "global", map[string]*string{key: ptr(value)}); err != nil {
			t.Fatal(err)
		}
	}
	return resolveCoverageChoices(host.settings, options)
}

func TestWithNoOptionsAndTheCascadeOffACheckIsOnePassWithTheTranscriptCompareModel(t *testing.T) {
	got, err := resolved(t, map[string]string{"model_size": "medium"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	// Pipeline is the cascade_pipeline setting, on by default (#2238); with the cascade off it is carried but unused.
	want := coverageChoices{FirstPass: "medium", Pipeline: true, Parallel: coverage.DefaultSettings.Parallel}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestWithTheCascadeOnACheckUsesTheCascadesOwnModelsAndDoubtLine(t *testing.T) {
	got, err := resolved(t, map[string]string{
		coverage.SettingCascadeEnabled: "true", coverage.SettingCascadeFirstPassModel: "small", coverage.SettingCascadeRecheckModel: "large-v3",
		coverage.SettingCascadeUnsureBelow: "0.4", "model_size": "medium",
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.FirstPass != "small" || got.Recheck != "large-v3" || got.UnsureBelow != 0.4 {
		t.Fatalf("got %+v: the cascade's models and doubt line, never model_size", got)
	}
}

func TestACheckCanAskForASecondPassTheCascadeSettingDoesNotGive(t *testing.T) {
	got, err := resolved(t, map[string]string{"model_size": "small"}, map[string]string{
		"recheck": "true", "recheckModel": "large-v3-turbo", "recheckBelow": "0.6",
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.FirstPass != "small" || got.Recheck != "large-v3-turbo" || got.UnsureBelow != 0.6 {
		t.Fatalf("got %+v", got)
	}
}

func TestACheckCanTurnTheSecondPassOffWhateverTheCascadeSays(t *testing.T) {
	for _, options := range []map[string]string{{"recheck": "false"}, {"skipRecheck": "true"}, {"recheck": "true", "skipRecheck": "true"}} {
		got, err := resolved(t, map[string]string{coverage.SettingCascadeEnabled: "true"}, options)
		if err != nil {
			t.Fatal(err)
		}
		if got.Recheck != "" || got.UnsureBelow != 0 {
			t.Fatalf("options %v: got %+v, want a first pass alone", options, got)
		}
	}
}

func TestANamedModelRunsAloneUnlessTheSecondPassIsAskedFor(t *testing.T) {
	saved := map[string]string{coverage.SettingCascadeEnabled: "true"}
	alone, err := resolved(t, saved, map[string]string{"model": "base"})
	if err != nil || alone.FirstPass != "base" || alone.Recheck != "" {
		t.Fatalf("got %+v, %v: src/studio/desktop/bindings_coverage_engines.go keeps a named model whole", alone, err)
	}
	both, err := resolved(t, saved, map[string]string{"model": "base", "recheck": "true"})
	if err != nil || both.FirstPass != "base" || both.Recheck != "large-v3-turbo" {
		t.Fatalf("got %+v, %v", both, err)
	}
}

func TestTheRunsParallelOptionsWinOverTheSettings(t *testing.T) {
	got, err := resolved(t, map[string]string{coverage.SettingChunkSeconds: "600"}, map[string]string{"workers": "3", "chunkSeconds": "120", "overlapSeconds": "10"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Parallel != (coverage.Parallel{Workers: 3, ChunkSeconds: 120, OverlapSeconds: 10, Chapters: 1}) {
		t.Fatalf("got %+v", got.Parallel)
	}
	whole, err := resolved(t, nil, map[string]string{"chunkSeconds": "0"})
	if err != nil || whole.Parallel.ChunkSeconds != 0 {
		t.Fatalf("0 is chunking off: %+v, %v", whole.Parallel, err)
	}
}

func TestAnOptionThatIsNotValidIsRefusedNotReplaced(t *testing.T) {
	bad := []map[string]string{
		{"recheck": "yes"}, {"recheck": "true", "recheckBelow": "1.5"}, {"recheck": "true", "recheckBelow": "x"},
		{"workers": "-1"}, {"workers": "33"}, {"workers": "two"}, {"workers": ""},
		{"chunkSeconds": "10"}, {"chunkSeconds": "3601"}, {"chunkSeconds": "5 minutes"},
		{"overlapSeconds": "61"}, {"overlapSeconds": "-1"}, {"overlapSeconds": "6.5"},
	}
	for _, options := range bad {
		if got, err := resolved(t, nil, options); err == nil {
			t.Errorf("options %v were accepted as %+v", options, got)
		}
	}
}

func TestADoubtLineIsOnlyKeptWhenASecondPassFollows(t *testing.T) {
	got, err := resolved(t, nil, map[string]string{"recheckBelow": "0.7"})
	if err != nil {
		t.Fatal(err)
	}
	if got.UnsureBelow != 0 {
		t.Fatalf("got %+v: with no second pass there is nothing to hand a doubt to", got)
	}
}

func startArgs(t *testing.T, host *Host, launches func() [][]string, options map[string]string) ([]string, map[string]any) {
	t.Helper()
	answer := decodeAnswer(t)(host.CoverageStart("c-0001", options))
	if answer["status"] != "started" {
		return nil, answer
	}
	host.services().coverage.Wait()
	all := launches()
	if len(all) == 0 {
		t.Fatal("no sidecar was launched")
	}
	return all[0], answer
}

// onMachine has the host plan recording checks for a computer of cpus processors and freeMB of free memory.
func onMachine(t *testing.T, cpus, freeMB int) {
	t.Helper()
	previousCPUs, previousMemory := coverageCPUs, coverageFreeMemoryMB
	coverageCPUs, coverageFreeMemoryMB = func() int { return cpus }, func() int { return freeMB }
	t.Cleanup(func() { coverageCPUs, coverageFreeMemoryMB = previousCPUs, previousMemory })
}

func TestACheckWithNoOptionsSendsTheSettingsParallelRunToTheSidecar(t *testing.T) {
	onMachine(t, 8, 16384)
	launcher, launches := recordingLauncher(10)
	host := coverageHostWithModels(t, coverageProject(t), whisperCatalog(t, map[string]bool{"small": true}), launcher)

	args, _ := startArgs(t, host, launches, nil)

	if !hasFlag(args, "--chunk-seconds", "60") || !hasFlag(args, "--chunk-overlap-seconds", "6") {
		t.Fatalf("args = %v, want the shipped five-minute chunks with a six second crossover", args)
	}
	if !hasFlag(args, "--parallel-workers", "4") {
		t.Fatalf("args = %v: Automatic sends the planned count, half of 8 processors for small in 16 GB", args)
	}
	if strings.Contains(strings.Join(args, " "), "--unsure-below") {
		t.Fatalf("args = %v: no doubt line sends nothing", args)
	}
}

func TestTheParallelSettingChangesTheCountTheSidecarIsSent(t *testing.T) {
	onMachine(t, 8, 16384)
	for value, want := range map[string]string{"0": "4", "1": "1", "3": "3", "8": "8", "20": "8"} {
		t.Run(value, func(t *testing.T) {
			launcher, launches := recordingLauncher(10)
			host := coverageHostWithModels(t, coverageProject(t), whisperCatalog(t, map[string]bool{"small": true}), launcher)
			if err := host.saveSettings(coverage.SettingsTool, "global", map[string]*string{coverage.SettingParallelWorkers: &value}); err != nil {
				t.Fatal(err)
			}
			args, _ := startArgs(t, host, launches, nil)
			if !hasFlag(args, "--parallel-workers", want) {
				t.Fatalf("parallel_workers %s: args = %v, want --parallel-workers %s", value, args, want)
			}
			plan := decodeAnswer(t)(host.CoverageWorkerPlan(nil))
			if plan["workers"] != float64(mustAtoi(t, want)) {
				t.Fatalf("CoverageWorkerPlan says %v, the sidecar was sent %s", plan, want)
			}
		})
	}
}

func mustAtoi(t *testing.T, text string) int {
	t.Helper()
	value, err := strconv.Atoi(text)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func TestACheckSendsTheRunsOwnParallelChoicesAndDoubtLine(t *testing.T) {
	launcher, launches := recordingLauncher(10)
	models := whisperCatalog(t, map[string]bool{"small": true, "large-v3-turbo": true})
	host := coverageHostWithModels(t, coverageProject(t), models, launcher)

	args, _ := startArgs(t, host, launches, map[string]string{
		"workers": "2", "chunkSeconds": "120", "overlapSeconds": "8", "recheck": "true", "recheckBelow": "0.55",
	})

	for flag, value := range map[string]string{"--parallel-workers": "2", "--chunk-seconds": "120", "--chunk-overlap-seconds": "8", "--unsure-below": "0.55", "--model": "small"} {
		if !hasFlag(args, flag, value) {
			t.Errorf("%s %s missing from %v", flag, value, args)
		}
	}
}

func TestACheckPipelinesTheCascadeUnlessTheSettingIsOff(t *testing.T) {
	models := whisperCatalog(t, map[string]bool{"small": true, "large-v3-turbo": true})
	options := map[string]string{"recheck": "true", "recheckBelow": "0.55"}

	launcher, launches := recordingLauncher(10)
	on := coverageHostWithModels(t, coverageProject(t), models, launcher)
	args, _ := startArgs(t, on, launches, options)
	if !hasFlag(args, "--recheck-model", "large-v3-turbo") || !hasFlag(args, "--unsure-below", "0.55") {
		t.Fatalf("args = %v, want the first pass to carry the larger model", args)
	}

	launcher, launches = recordingLauncher(10)
	off := coverageHostWithModels(t, coverageProject(t), models, launcher)
	if err := off.saveSettings(coverage.SettingsTool, "global", map[string]*string{coverage.SettingCascadePipeline: ptr("false")}); err != nil {
		t.Fatal(err)
	}
	args, _ = startArgs(t, off, launches, options)
	if strings.Contains(strings.Join(args, " "), "--recheck-model") {
		t.Fatalf("args = %v: with the setting off the stages run one after the other", args)
	}
}

func TestAnInvalidOptionStartsNothing(t *testing.T) {
	launcher, launches := recordingLauncher(10)
	host := coverageHostWithModels(t, coverageProject(t), whisperCatalog(t, map[string]bool{"small": true}), launcher)

	_, err := host.CoverageStart("c-0001", map[string]string{"workers": "99"})

	if err == nil || !strings.Contains(err.Error(), "workers") {
		t.Fatalf("err = %v, want the option named", err)
	}
	if got := launches(); len(got) != 0 {
		t.Fatalf("launches = %v, want none", got)
	}
}

func TestAskingForASecondPassWhoseModelIsNotInstalledOffersTheDownload(t *testing.T) {
	launcher, launches := recordingLauncher(10)
	models := whisperCatalog(t, map[string]bool{"small": true, "large-v3-turbo": false})
	host := coverageHostWithModels(t, coverageProject(t), models, launcher)

	answer := decodeAnswer(t)(host.CoverageStart("c-0001", map[string]string{"recheck": "true"}))

	if answer["status"] != "recheck_asset_required" || len(launches()) != 0 {
		t.Fatalf("answer = %v", answer)
	}
}

func TestEnginesReportWhatACheckWithNoOptionsWouldDo(t *testing.T) {
	models := whisperCatalog(t, map[string]bool{"tiny": true, "small": true, "large-v3-turbo": true})
	host := coverageHostWithModels(t, coverageProject(t), models, fakeCoverageSidecar(10))
	if err := host.saveSettings(coverage.SettingsTool, "global", map[string]*string{
		coverage.SettingCascadeEnabled: ptr("true"), coverage.SettingParallelWorkers: ptr("3"), coverage.SettingChunkSeconds: ptr("600"),
		coverage.SettingChunkOverlapSeconds: ptr("9"), coverage.SettingCascadeUnsureBelow: ptr("0.35"),
	}); err != nil {
		t.Fatal(err)
	}

	answer := decodeAnswer(t)(host.CoverageEngines())

	defaults, _ := answer["defaults"].(map[string]any)
	want := map[string]any{"recheck": true, "recheckModel": "large-v3-turbo", "recheckBelow": 0.35, "workers": 3.0, "chunkSeconds": 600.0, "overlapSeconds": 9.0}
	for key, value := range want {
		if defaults[key] != value {
			t.Errorf("defaults[%s] = %v, want %v (defaults = %v)", key, defaults[key], value, defaults)
		}
	}
	if answer["default"] != "tiny" {
		t.Errorf("default = %v, want the cascade's first-pass model", answer["default"])
	}
}

// A background check runs its own model pair, not the narrator's cascade (#2251: a heavy pair chosen for Check recording
// ran unannounced in the background); it keeps the narrator's chunking and doubt line, and its processors' share replaces the
// worker count.
func TestABackgroundCheckRunsItsOwnPairWithTheNarratorsChunkingAndDoubtLine(t *testing.T) {
	models := whisperCatalog(t, map[string]bool{"tiny": true, "small": true, "large-v3-turbo": true})
	host := coverageHostWithModels(t, coverageProject(t), models, fakeCoverageSidecar(10))
	if err := host.saveSettings(coverage.SettingsTool, "global", map[string]*string{
		coverage.SettingCascadeEnabled: ptr("true"), coverage.SettingParallelWorkers: ptr("2"),
	}); err != nil {
		t.Fatal(err)
	}

	request, ready := host.backgroundRequest(host.services(), "c-0001")

	if !ready || !request.Background || request.Transcription.Model != "tiny" || request.Recheck.Model != "small" {
		t.Fatalf("request = %+v, ready = %v: the background pair, not the cascade's", request, ready)
	}
	if request.Parallel.Workers != 0 || request.CPUs < 1 || request.Parallel.ChunkSeconds != 60 || request.UnsureBelow != 0.5 {
		t.Fatalf("request = %+v: the settings' chunking and doubt line, on the background's share of the processors", request)
	}
}

func TestABackgroundCheckPipelinesTheWayAPressDoes(t *testing.T) {
	models := whisperCatalog(t, map[string]bool{"tiny": true, "small": true, "large-v3-turbo": true})
	host := coverageHostWithModels(t, coverageProject(t), models, fakeCoverageSidecar(10))
	if err := host.saveSettings(coverage.SettingsTool, "global", map[string]*string{coverage.SettingCascadeEnabled: ptr("true")}); err != nil {
		t.Fatal(err)
	}

	request, ready := host.backgroundRequest(host.services(), "c-0001")

	if !ready || !request.Pipeline {
		t.Fatalf("request = %+v, ready = %v: the setting's pipelining", request, ready)
	}
}

func TestABackgroundCheckNeverDownloadsAndRunsFirstPassAloneWithoutTheLargerModel(t *testing.T) {
	models := whisperCatalog(t, map[string]bool{"tiny": true, "large-v3-turbo": false})
	host := coverageHostWithModels(t, coverageProject(t), models, fakeCoverageSidecar(10))
	if err := host.saveSettings(coverage.SettingsTool, "global", map[string]*string{coverage.SettingCascadeEnabled: ptr("true")}); err != nil {
		t.Fatal(err)
	}

	request, ready := host.backgroundRequest(host.services(), "c-0001")

	if !ready || request.Recheck.Model != "" || request.UnsureBelow != 0 {
		t.Fatalf("request = %+v, ready = %v", request, ready)
	}

	missing := coverageHostWithModels(t, coverageProject(t), whisperCatalog(t, map[string]bool{"small": false}), fakeCoverageSidecar(10))
	if _, ready := missing.backgroundRequest(missing.services(), "c-0001"); ready {
		t.Fatal("a missing first-pass model must leave the background check waiting")
	}
}

func TestChaptersAtOnceShareTheComputerInTheirPlan(t *testing.T) {
	onMachine(t, 12, 24000)
	host := newTestHostForDeliverySettings(t, t.TempDir())
	plan := func(options map[string]string) map[string]any {
		return decodeAnswer(t)(host.CoverageWorkerPlan(options))
	}

	if got := plan(map[string]string{"model": "tiny", "chapters": "3"}); got["workers"] != 2.0 || got["cpus"] != 4.0 || got["chapters"] != 3.0 || got["computerCpus"] != 12.0 {
		t.Fatalf("3 chapters on 12 processors: %v, want 4 processors and 2 workers each", got)
	}
	if got := plan(map[string]string{"model": "tiny", "chapters": "3", "workers": "4"}); got["workers"] != 4.0 || got["limit"] != "requested" {
		t.Fatalf("a named count is kept while it fits the chapter's share: %v", got)
	}
	onMachine(t, 2, 24000)
	if got := plan(map[string]string{"model": "tiny", "chapters": "8"}); got["workers"] != 1.0 {
		t.Fatalf("never below one worker: %v", got)
	}
	if got := plan(nil); got["requested"] != 0.0 || got["workers"] != 1.0 {
		t.Fatalf("one chapter, Automatic, on 2 processors: %v", got)
	}
}

func TestTheWorkerPlanFollowsTheModelsSize(t *testing.T) {
	onMachine(t, 16, 6000)
	host := newTestHostForDeliverySettings(t, t.TempDir())
	want := map[string]float64{"tiny": 8, "small": 5, "medium": 2, "large-v3-turbo": 2, "large-v3": 1}
	for model, workers := range want {
		got := decodeAnswer(t)(host.CoverageWorkerPlan(map[string]string{"model": model}))
		if got["workers"] != workers || got["model"] != model {
			t.Errorf("%s on 16 processors and 6000 MB free: %v, want %v at once", model, got, workers)
		}
	}
	if _, err := host.CoverageWorkerPlan(map[string]string{"workers": "-1"}); err == nil {
		t.Fatal("a refused option is refused here as it is at the start")
	}
	onMachine(t, 16, 0)
	if got := decodeAnswer(t)(host.CoverageWorkerPlan(map[string]string{"model": "small"})); got["limit"] != "model" || got["workers"] != 4.0 {
		t.Fatalf("memory unread: %v, want the model's fixed cap of 4", got)
	}
}

func TestTheChaptersOptionIsARangeAndComesFromTheSettingByDefault(t *testing.T) {
	for _, bad := range []string{"0", "9", "-1", "two", ""} {
		if got, err := resolved(t, nil, map[string]string{"chapters": bad}); err == nil {
			t.Errorf("chapters %q was accepted as %+v", bad, got.Parallel)
		}
	}
	got, err := resolved(t, map[string]string{coverage.SettingParallelChapters: "2"}, nil)
	if err != nil || got.Parallel.Chapters != 2 {
		t.Fatalf("got %+v, %v", got.Parallel, err)
	}
}

// twoChapterProject is coverageProject with a second narration chapter, c-0002, on its own track.
func twoChapterProject(t *testing.T) string {
	t.Helper()
	project := coverageProject(t)
	rpp := `<REAPER_PROJECT 0.1 "7.80/win64" 1789970042 0
`
	for number, track := range []string{"{TRACK-1}", "{TRACK-2}"} {
		rpp += fmt.Sprintf(`  <TRACK %[1]s
    NAME "Chapter %[2]d"
    TRACKID %[1]s
    <ITEM
      POSITION 0
      LENGTH 4
      IGUID {ITEM-%[2]d}
      SOFFS 0
      PLAYRATE 1 1 0 -1 0 0.0025
      <SOURCE WAVE
        FILE "media/take.wav"
      >
    >
  >
`, track, number+1)
	}
	rpp += ">\n"
	manuscript := `{"schemaVersion":1,"documentId":"doc-1","chapters":[{"id":"c-0001","title":"Chapter One","contentKind":"narration"},{"id":"c-0002","title":"Chapter Two","contentKind":"narration"}],"paragraphs":[{"id":"p-000001","chapterId":"c-0001","index":0,"text":"Alice."},{"id":"p-000002","chapterId":"c-0002","index":1,"text":"Down."}]}`
	for name, content := range map[string]string{"book.rpp": rpp, brand.ProjectFolder + "/manuscript/manuscript.json": manuscript} {
		if err := os.WriteFile(filepath.Join(project, filepath.FromSlash(name)), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := evidence.NewMappingStore(project).Confirm("doc-1", "{TRACK-2}", "c-0002", "Chapter Two"); err != nil {
		t.Fatal(err)
	}
	return project
}

func TestTwoChaptersStartTogetherOnlyWhenTheRunAsksForIt(t *testing.T) {
	gate := make(chan struct{})
	var once sync.Once
	release := func() { once.Do(func() { close(gate) }) }
	inner := fakeCoverageSidecar(10)
	launcher := func(ctx context.Context, program string, args ...string) (coverage.Child, error) {
		<-gate
		return inner(ctx, program, args...)
	}
	host := coverageHostWithModels(t, twoChapterProject(t), whisperCatalog(t, map[string]bool{"small": true}), launcher)
	defer func() {
		release()
		host.services().coverage.Wait()
	}()

	// The launcher blocks inside Start's own sidecar launch, so each start runs in its own goroutine, as the dialog's do.
	answers := make(chan map[string]any, 2)
	start := func(chapter string, options map[string]string) {
		go func() { answers <- decodeAnswer(t)(host.CoverageStart(chapter, options)) }()
	}
	start("c-0001", map[string]string{"chapters": "2"})
	waitUntil(t, func() bool { return host.services().coverage.Busy() })
	start("c-0002", map[string]string{"chapters": "2"})
	release()
	for range 2 {
		if answer := <-answers; answer["status"] != "started" {
			t.Fatalf("answer = %v, want both chapters started", answer)
		}
	}
	host.services().coverage.Wait()
	for _, chapter := range []string{"c-0001", "c-0002"} {
		if result := decodeAnswer(t)(host.CoverageResult(chapter)); result["state"] != "current" {
			t.Fatalf("%s: %v", chapter, result)
		}
	}
}
