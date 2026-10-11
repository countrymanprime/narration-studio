package main

import (
	"strings"
	"testing"
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
