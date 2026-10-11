package main

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/coverage"
)

// engineList decodes CoverageEngines' answer into its engine rows and default.
func engineList(t *testing.T, host *Host) ([]map[string]any, string) {
	t.Helper()
	answer := decodeAnswer(t)(host.CoverageEngines())
	rows, ok := answer["engines"].([]any)
	if !ok {
		t.Fatalf("answer = %v, want an engines list", answer)
	}
	engines := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		engine, ok := row.(map[string]any)
		if !ok {
			t.Fatalf("engine row = %v", row)
		}
		engines = append(engines, engine)
	}
	chosen, _ := answer["default"].(string)
	return engines, chosen
}

func TestCoverageEnginesAreTheApprovedWhisperModels(t *testing.T) {
	models := whisperCatalog(t, map[string]bool{"tiny": true, "small": false, "large-v3-turbo": true})
	host := coverageHostWithModels(t, coverageProject(t), models, fakeCoverageSidecar(10))

	engines, _ := engineList(t, host)

	var ids []string
	for _, engine := range engines {
		ids = append(ids, fmt.Sprint(engine["id"]))
		if engine["family"] != "whisper" || engine["label"] != engine["id"] {
			t.Fatalf("engine = %v, want family whisper and the catalog's displayName as the label", engine)
		}
		if strings.Contains(strings.ToLower(fmt.Sprint(engine["id"])), "moonshine") {
			t.Fatalf("Moonshine is the Booth's, not a recording-check engine: %v", engine)
		}
	}
	// whisperCatalog writes its models sorted by id, which is the catalog order the test builds.
	if got, want := strings.Join(ids, ","), "large-v3-turbo,small,tiny"; got != want {
		t.Fatalf("engine ids = %s, want %s", got, want)
	}
	states := map[string]any{}
	for _, engine := range engines {
		states[fmt.Sprint(engine["id"])] = engine["installState"]
	}
	if states["tiny"] != "installed" || states["small"] != "not_installed" {
		t.Fatalf("install states = %v", states)
	}
}

func TestCoverageEnginesDefaultIsTheModelACheckWouldUse(t *testing.T) {
	models := whisperCatalog(t, map[string]bool{"tiny": true, "small": true, "large-v3-turbo": true})
	host := coverageHostWithModels(t, coverageProject(t), models, fakeCoverageSidecar(10))

	engines, chosen := engineList(t, host)
	if chosen != "small" {
		t.Fatalf("default = %q, want TranscriptCompare.model_size (small) with the cascade off", chosen)
	}

	enableCascade(t, host)
	engines, chosen = engineList(t, host)
	if chosen != "tiny" {
		t.Fatalf("default = %q, want the cascade's first-pass model (tiny)", chosen)
	}
	found := false
	for _, engine := range engines {
		found = found || engine["id"] == chosen
	}
	if !found {
		t.Fatalf("default %q is not one of the listed engines %v", chosen, engines)
	}
}

func TestCoverageEnginesDefaultIsAlwaysListed(t *testing.T) {
	// The only approved model is large-v3-turbo; TranscriptCompare.model_size still says small.
	models := whisperCatalog(t, map[string]bool{"large-v3-turbo": true})
	host := coverageHostWithModels(t, coverageProject(t), models, fakeCoverageSidecar(10))

	_, chosen := engineList(t, host)

	if chosen != "large-v3-turbo" {
		t.Fatalf("default = %q, want the first listed engine when the configured model is not approved", chosen)
	}
}

func TestCoverageEnginesNeedNoProject(t *testing.T) {
	host := NewHost()
	host.assets = newAssetRegistry(t.TempDir(), nil, whisperCatalog(t, map[string]bool{"small": true}), nil, nil)

	engines, chosen := engineList(t, host)

	if len(engines) != 1 || chosen != "small" {
		t.Fatalf("engines = %v, default = %q", engines, chosen)
	}
	if _, err := host.CoverageStart("c-0001", nil); err == nil {
		t.Fatal("a start without a project must still be refused")
	}
}

func TestCoverageEnginesNeedTheWhisperCatalog(t *testing.T) {
	host := NewHost()
	host.assets = newAssetRegistry(t.TempDir(), nil, nil, nil, nil)
	if _, err := host.CoverageEngines(); err == nil {
		t.Fatal("no Whisper catalog must be an error, not an empty list")
	}
}

// recordingLauncher records every sidecar launch's arguments and runs the fake sidecar.
func recordingLauncher(present int) (coverage.Launcher, func() [][]string) {
	var mu sync.Mutex
	var launches [][]string
	launcher := func(ctx context.Context, program string, args ...string) (coverage.Child, error) {
		mu.Lock()
		launches = append(launches, args)
		mu.Unlock()
		return fakeCoverageSidecar(present)(ctx, program, args...)
	}
	return launcher, func() [][]string { mu.Lock(); defer mu.Unlock(); return append([][]string(nil), launches...) }
}

func TestCoverageStartCanNameAModel(t *testing.T) {
	launcher, launches := recordingLauncher(10)
	models := whisperCatalog(t, map[string]bool{"tiny": true, "small": true, "base": true})
	host := coverageHostWithModels(t, coverageProject(t), models, launcher)

	started := decodeAnswer(t)(host.CoverageStart("c-0001", map[string]string{"model": "base"}))
	if started["status"] != "started" {
		t.Fatalf("answer = %v", started)
	}
	host.services().coverage.Wait()
	if got := launches(); len(got) != 1 || !hasFlag(got[0], "--model", "base") {
		t.Fatalf("launches = %v, want one run with --model base", got)
	}
}

func TestCoverageStartRefusesAnUnknownNamedModelAndRunsNothing(t *testing.T) {
	launcher, launches := recordingLauncher(10)
	host := coverageHostWithModels(t, coverageProject(t), whisperCatalog(t, map[string]bool{"small": true}), launcher)

	_, err := host.CoverageStart("c-0001", map[string]string{"model": "moonshine-tiny"})

	if err == nil || !strings.Contains(err.Error(), "not in the approved catalog") {
		t.Fatalf("err = %v, want the approved-catalog sentence", err)
	}
	if got := launches(); len(got) != 0 {
		t.Fatalf("launches = %v, want none", got)
	}
}

func TestCoverageStartANamedModelThatIsNotInstalledAsksForIt(t *testing.T) {
	launcher, launches := recordingLauncher(10)
	host := coverageHostWithModels(t, coverageProject(t), whisperCatalog(t, map[string]bool{"small": true, "base": false}), launcher)

	answer := decodeAnswer(t)(host.CoverageStart("c-0001", map[string]string{"model": "base"}))

	model, _ := answer["model"].(map[string]any)
	if answer["status"] != "asset_required" || model["id"] != "base" {
		t.Fatalf("answer = %v, want asset_required for base", answer)
	}
	if got := launches(); len(got) != 0 {
		t.Fatalf("launches = %v, want none", got)
	}
}

func TestCoverageStartANamedModelSkipsTheCascadeRecheck(t *testing.T) {
	launcher, launches := recordingLauncher(8) // present 8: a region is missing, the case that would plan a re-check
	models := whisperCatalog(t, map[string]bool{"tiny": true, "small": true, "large-v3-turbo": true})
	host := coverageHostWithModels(t, coverageProject(t), models, launcher)
	enableCascade(t, host)

	started := decodeAnswer(t)(host.CoverageStart("c-0001", map[string]string{"model": "small"}))
	if started["status"] != "started" {
		t.Fatalf("answer = %v", started)
	}
	state, _ := started["state"].(map[string]any)
	if state["recheckModel"] != nil || state["pass"] != nil {
		t.Fatalf("state = %v, want no re-check pass named", state)
	}
	host.services().coverage.Wait()
	if got := launches(); len(got) != 1 || !hasFlag(got[0], "--model", "small") {
		t.Fatalf("launches = %v, want the named model alone", got)
	}
	result := decodeAnswer(t)(host.CoverageResult("c-0001"))
	report, _ := result["result"].(map[string]any)
	if report["model"] != "small" || report["recheck"] != nil {
		t.Fatalf("report = %v, want small alone and no recheck", report)
	}
}
