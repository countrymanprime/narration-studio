package manuscript

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/layout"
)

// Switching project must point Load at the new project's manuscript and never serve the previous project's cached parse.
func TestSetProjectLoadsTheNewProjectsManuscript(t *testing.T) {
	first, second := t.TempDir(), t.TempDir()
	service := New(first)
	importAlice(t, service, false)
	if _, err := service.Load(); err != nil {
		t.Fatalf("first project should load: %v", err)
	}

	service.SetProject(second)
	if _, err := service.Load(); err == nil {
		t.Fatal("a project with no manuscript must not be served the previous project's cache")
	}

	service.SetProject(first)
	if _, err := service.Load(); err != nil {
		t.Fatalf("switching back should load the first project again: %v", err)
	}
}

func TestSetProjectEmptyAsksForASavedProject(t *testing.T) {
	service := New(t.TempDir())
	service.SetProject("")
	if _, err := service.Load(); err == nil {
		t.Fatal("Load without a project should fail")
	}
	if err := service.Clear(); err == nil {
		t.Fatal("Clear without a project should fail")
	}
}

func TestCanSwitchProjectWithNoJobs(t *testing.T) {
	if !New(t.TempDir()).CanSwitchProject() {
		t.Fatal("an idle service can switch")
	}
}

// A prepared preview is unsaved user work, so a second REAPER launch must not replace the project under it.
func TestCanSwitchProjectRefusesWhileAPreviewIsPrepared(t *testing.T) {
	service := New(t.TempDir())
	job := service.Begin(layout.RepoFile(layout.FixturesDir + "/alice.md"))
	if _, err := service.Preview(job.ID, 1); err != nil {
		t.Fatal(err)
	}
	if service.CanSwitchProject() {
		t.Fatal("a prepared preview must block a project switch")
	}
}

func TestCanSwitchProjectAllowsOnceJobsAreSettled(t *testing.T) {
	for _, phase := range []string{"success", "error", "cancelled"} {
		service := New(t.TempDir())
		service.jobs["done"] = &ImportJob{ID: "done", Phase: phase}
		if !service.CanSwitchProject() {
			t.Errorf("a %s job must not block a switch", phase)
		}
		service.jobs["live"] = &ImportJob{ID: "live", Phase: "committing"}
		if service.CanSwitchProject() {
			t.Errorf("a running job beside a %s one must still block", phase)
		}
	}
}

func TestClearRemovesTheManuscriptSoLoadFails(t *testing.T) {
	project := t.TempDir()
	service := New(project)
	importAlice(t, service, false)
	if err := service.Clear(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(project, "narration-utils", "manuscript")); !os.IsNotExist(err) {
		t.Fatalf("manuscript directory should be gone, stat err = %v", err)
	}
	if _, err := service.Load(); err == nil {
		t.Fatal("Load after Clear should ask for an import")
	}
}
