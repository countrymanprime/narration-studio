package main

import (
	"reflect"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/bridge"
	"github.com/countrymanprime/narration-utils/shell/internal/daw"
	"github.com/countrymanprime/narration-utils/shell/internal/dawport"
)

// The Takes panel's bindings (ADR 0700). What they answer is internal/passagetakes' own (its tests pin the candidates,
// the choices and the outcomes, and write the goldens the UI checks); these cover the host's wiring: no project, a
// token range the alignment does not have, and a read of a chapter whose item has only one take.

func TestWorkspaceTakesBindingsWithNoProjectAreAnError(t *testing.T) {
	host := NewHost()
	if _, err := host.WorkspaceTakes("c-0001", 0, 0); err == nil {
		t.Error("WorkspaceTakes: no error")
	}
	if _, err := host.WorkspaceTakesCompareStart("c-0001", 0, 0); err == nil {
		t.Error("WorkspaceTakesCompareStart: no error")
	}
	if _, err := host.WorkspaceUseTake("c-0001", 0, 0, "take:x:y"); err == nil {
		t.Error("WorkspaceUseTake: no error")
	}
}

func TestWorkspaceTakesOfAOneTakeItemOffersNoAlternates(t *testing.T) {
	host := coverageHost(t, coverageProject(t), true, fakeAlignedCoverageSidecarWithSkip())
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()

	answer := decodeAnswer(t)(host.WorkspaceTakes("c-0001", 0, 0))

	if answer["itemGuid"] != "{ITEM-1}" || answer["passageId"] == "" {
		t.Fatalf("answer = %v", answer)
	}
	if candidates, _ := answer["candidates"].([]any); len(candidates) != 0 {
		t.Fatalf("candidates = %v", candidates)
	}
}

func TestWorkspaceTakesOutsideTheAlignmentIsTheCallersError(t *testing.T) {
	host := coverageHost(t, coverageProject(t), true, fakeAlignedCoverageSidecarWithSkip())
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()

	if _, err := host.WorkspaceTakes("c-0001", 0, 9); err == nil || !strings.Contains(err.Error(), "not in this chapter's alignment") {
		t.Fatalf("got %v", err)
	}
}

func TestWorkspaceUseTakeRefusesATakeItDidNotOffer(t *testing.T) {
	host := coverageHost(t, coverageProject(t), true, fakeAlignedCoverageSidecarWithSkip())
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()

	answer := decodeAnswer(t)(host.WorkspaceUseTake("c-0001", 0, 0, "take:{NOT-OFFERED}:{TAKE}"))

	if answer["outcome"] != "refused" || answer["reason"] != "not_offered" || answer["changed"] != false {
		t.Fatalf("answer = %v", answer)
	}
}

// useTakeHost is a REAPER launch over twoTakeCoverageProject wired as the app wires one: a session folder, so the
// bridge client, navigation and h.dawPortResolver are the attach's own, with REAPER answering and the takes capability
// set to toggle. role stands in for the takes role the attach takes from the REAPER adapter.
func useTakeHost(t *testing.T, role dawport.TakeSelector, toggle string) *Host {
	t.Helper()
	t.Setenv("APPDATA", t.TempDir())
	host := NewHost()
	host.coverageLauncher = fakeAlignedCoverageSidecarWithSkip()
	host.assets = newAssetRegistry(t.TempDir(), nil, whisperWithSmall(t, true), nil, nil)
	next := host.config
	next.projectFolder = twoTakeCoverageProject(t)
	next.comparePython, next.compareBackend = "python-sidecar", "compare.py"
	next.daw, next.sessionDir = "REAPER", t.TempDir()
	if attached, reason := host.attachProjectLocked(next); !attached {
		t.Fatalf("attach failed: %s", reason)
	}
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()
	// The finished check starts a chaptersync:state read of the project folder; Windows cannot remove the folder while it runs.
	host.chapterSyncEmits.Wait()
	if err := host.saveSettings("DAW", "global", map[string]*string{dawport.ToggleKey(dawport.CapTakes): &toggle}); err != nil {
		t.Fatal(err)
	}
	host.mu.Lock()
	host.reachability.(*daw.Reachability).Record(bridge.Event{Tag: "PROJECT_STATUS", Fields: []string{"PROJECT_STATUS", "", "C:/Projects/Alice/Alice.rpp", "0"}})
	host.takeSelector = role
	host.mu.Unlock()
	return host
}

// Making another take of the item active goes to the takes role, gated by the launch's resolver as WorkspaceHideTakes
// is. h.dawPortResolver's adapter (p5aAdapter) has no takes role, so asking it for one refused every make-active once
// the takes capability was on.
func TestWorkspaceUseTakeMakesAnotherTakeActiveThroughTheTakesRole(t *testing.T) {
	role := &fakeTakeSelector{}
	host := useTakeHost(t, role, "on")

	answer := decodeAnswer(t)(host.WorkspaceUseTake("c-0001", 0, 0, hideKeepA))

	if answer["outcome"] != "done" || answer["changed"] != true {
		t.Fatalf("answer = %v", answer)
	}
	if want := [][2]string{{"{ITEM-1}", "{TAKE-A}"}}; !reflect.DeepEqual(role.activated, want) {
		t.Fatalf("sent %v, want %v", role.activated, want)
	}
}

func TestWorkspaceUseTakeWithTakesTurnedOffRefusesAndSendsNothing(t *testing.T) {
	role := &fakeTakeSelector{}
	host := useTakeHost(t, role, "off")

	answer := decodeAnswer(t)(host.WorkspaceUseTake("c-0001", 0, 0, hideKeepA))

	if answer["outcome"] != "refused" || answer["reason"] != "experimental_off" || answer["changed"] != false || len(role.activated) != 0 {
		t.Fatalf("answer = %v, sent %v", answer, role.activated)
	}
}

func TestWorkspaceTakeEvidenceRefusesWhatWorkspaceTakesRefuses(t *testing.T) {
	if _, err := NewHost().WorkspaceTakeEvidence("c-0001", 0, 0); err == nil {
		t.Error("no project: no error")
	}
	host := coverageHost(t, coverageProject(t), true, fakeAlignedCoverageSidecarWithSkip())
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()

	for _, args := range []struct {
		chapter     string
		first, last int
	}{{"c-0001", 0, 9}, {"c-9999", 0, 0}} {
		_, takesErr := host.WorkspaceTakes(args.chapter, args.first, args.last)
		payload, err := host.WorkspaceTakeEvidence(args.chapter, args.first, args.last)
		if err == nil || takesErr == nil || err.Error() != takesErr.Error() || payload != "" {
			t.Errorf("%v: evidence %q, %v; takes %v", args, payload, err, takesErr)
		}
	}
}

func TestWorkspaceTakeEvidenceListsTheTakesWorkspaceTakesOffers(t *testing.T) {
	host := coverageHost(t, coverageProject(t), true, fakeAlignedCoverageSidecarWithSkip())
	if _, err := host.CoverageStart("c-0001", nil); err != nil {
		t.Fatal(err)
	}
	host.services().coverage.Wait()

	takes := decodeAnswer(t)(host.WorkspaceTakes("c-0001", 0, 0))
	evidence := decodeAnswer(t)(host.WorkspaceTakeEvidence("c-0001", 0, 0))
	candidates, _ := takes["candidates"].([]any)
	list, ok := evidence["takes"].([]any)
	if !ok || len(list) != len(candidates) || evidence["chapterId"] != "c-0001" {
		t.Fatalf("evidence = %v, takes = %v", evidence, takes)
	}
}
