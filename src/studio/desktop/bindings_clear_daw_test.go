package main

import (
	"desktop/internal/brand"
	"path/filepath"
	"testing"
	"time"

	"desktop/internal/project"
)

// clearHost is a project with a manuscript, the named REAPER files directly in its folder, and the manifest linked to link (a path
// the test chose, in the folder or elsewhere), ready for Clear project data.
func clearHost(t *testing.T, inFolder []string, link string) (*Host, string) {
	t.Helper()
	t.Setenv("APPDATA", t.TempDir())
	folder := t.TempDir()
	writeNested(t, filepath.Join(folder, brand.ProjectFolder, "manuscript", "manuscript.json"), bookmarksManuscript)
	for _, name := range inFolder {
		writeFile(t, filepath.Join(folder, name), "x")
	}
	if link != "" {
		built, err := project.BuildDawLink(folder, link)
		if err != nil {
			t.Fatal(err)
		}
		manifest := project.New("Book", time.Now())
		manifest.DawProjectFile = &built
		if err := manifest.Save(folder); err != nil {
			t.Fatal(err)
		}
	}
	host := NewHost()
	next := host.config
	next.projectFolder = folder
	if attached, reason := host.attachProjectLocked(next); !attached {
		t.Fatalf("attach failed: %s", reason)
	}
	return host, folder
}

func linkedAfterClear(t *testing.T, host *Host, folder string) string {
	t.Helper()
	if _, err := host.ManuscriptClearProjectData(true); err != nil {
		t.Fatal(err)
	}
	manifest, ok, err := project.Load(nil, folder)
	if err != nil || !ok {
		t.Fatalf("manifest after clear: ok=%v err=%v", ok, err)
	}
	if manifest.DawProjectFile == nil {
		return ""
	}
	path, _ := manifest.DawProjectFile.Resolve(folder)
	return path
}

// Clear project data drops the project's DAW connection with the rest: a link to a file in a separate DAW folder is gone, and the
// narrator links it again after importing the manuscript.
func TestClearProjectDataDropsALinkToAFileElsewhere(t *testing.T) {
	elsewhere := filepath.Join(t.TempDir(), "Book.rpp")
	writeFile(t, elsewhere, "x")
	host, folder := clearHost(t, nil, elsewhere)
	if got := linkedAfterClear(t, host, folder); got != "" {
		t.Fatalf("still linked to %q after Clear project data", got)
	}
}

// Several REAPER files in the folder is a choice the narrator makes again, not one to guess.
func TestClearProjectDataDoesNotGuessBetweenSeveralFiles(t *testing.T) {
	host, folder := clearHost(t, []string{"A.rpp", "B.rpp"}, "")
	link, err := project.BuildDawLink(folder, filepath.Join(folder, "A.rpp"))
	if err != nil {
		t.Fatal(err)
	}
	manifest := project.New("Book", time.Now())
	manifest.DawProjectFile = &link
	if err := manifest.Save(folder); err != nil {
		t.Fatal(err)
	}
	if got := linkedAfterClear(t, host, folder); got != "" {
		t.Fatalf("linked to %q, want no link while two files could be it", got)
	}
}

// The one REAPER file in the project folder is found again on its own, so the project reconnects without a click.
func TestClearProjectDataFindsTheOneFileInTheFolderAgain(t *testing.T) {
	elsewhere := filepath.Join(t.TempDir(), "Old.rpp")
	writeFile(t, elsewhere, "x")
	host, folder := clearHost(t, []string{"Book.rpp"}, elsewhere)
	if got, want := linkedAfterClear(t, host, folder), filepath.Join(folder, "Book.rpp"); got != want {
		t.Fatalf("linked to %q, want the folder's own %q", got, want)
	}
}

// The legacy saved choice (Tracks.selectedRpp) is part of the connection and goes too.
func TestClearProjectDataForgetsTheSavedReaperChoice(t *testing.T) {
	host, folder := clearHost(t, []string{"A.rpp", "B.rpp"}, "")
	svc := host.services()
	chosen := filepath.Join(folder, "B.rpp")
	if err := svc.settings.Save("Tracks", "project", map[string]*string{"selectedRpp": &chosen}); err != nil {
		t.Fatal(err)
	}
	if _, err := host.ManuscriptClearProjectData(true); err != nil {
		t.Fatal(err)
	}
	if saved := host.services().settings.Project("Tracks")["selectedRpp"]; saved != "" {
		t.Fatalf("Tracks.selectedRpp = %q after Clear project data", saved)
	}
}
