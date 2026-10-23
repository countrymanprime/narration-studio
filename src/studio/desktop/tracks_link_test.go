package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"desktop/internal/layout"
	"desktop/internal/project"
	"desktop/internal/settings"
)

// projectLinkedTo makes a project folder whose manifest links rpp (nil link when rpp is empty).
func projectLinkedTo(t *testing.T, rpp string) string {
	t.Helper()
	folder := t.TempDir()
	manifest := project.New("Book", time.Now())
	if rpp != "" {
		link, err := project.BuildDawLink(folder, rpp)
		if err != nil {
			t.Fatal(err)
		}
		manifest.DawProjectFile = &link
	}
	if err := manifest.Save(folder); err != nil {
		t.Fatal(err)
	}
	return folder
}

func touch(t *testing.T, path string) string {
	t.Helper()
	if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func discover(t *testing.T, folder string) (candidates []string, selected string) {
	t.Helper()
	t.Setenv("APPDATA", t.TempDir())
	candidates, selected, err := discoverProjectFiles(folder, settings.New(layout.FindRoot("."), folder))
	if err != nil {
		t.Fatal(err)
	}
	return candidates, selected
}

func TestDiscoveryOffersAndSelectsTheLinkedFileOutsideTheProjectFolder(t *testing.T) {
	rpp := touch(t, filepath.Join(t.TempDir(), "After the Applause.rpp"))
	folder := projectLinkedTo(t, rpp)

	candidates, selected := discover(t, folder)

	if selected != rpp || len(candidates) != 1 || candidates[0] != rpp {
		t.Fatalf("candidates = %v, selected = %q; want the linked file %q alone and selected", candidates, selected, rpp)
	}
}

func TestDiscoveryPrefersTheLinkedFileOverOtherFilesInTheFolder(t *testing.T) {
	folder := projectLinkedTo(t, "")
	touch(t, filepath.Join(folder, "A.rpp"))
	linked := touch(t, filepath.Join(folder, "B.rpp"))
	manifest, _, err := project.Load(nil, folder)
	if err != nil {
		t.Fatal(err)
	}
	link, err := project.BuildDawLink(folder, linked)
	if err != nil {
		t.Fatal(err)
	}
	manifest.DawProjectFile = &link
	if err := manifest.Save(folder); err != nil {
		t.Fatal(err)
	}

	candidates, selected := discover(t, folder)

	if selected != linked || len(candidates) != 2 {
		t.Fatalf("candidates = %v, selected = %q; want both files listed and the linked %q selected", candidates, selected, linked)
	}
}

func TestDiscoveryIgnoresALinkedFileThatIsGone(t *testing.T) {
	rpp := touch(t, filepath.Join(t.TempDir(), "Gone.rpp"))
	folder := projectLinkedTo(t, rpp)
	if err := os.Remove(rpp); err != nil {
		t.Fatal(err)
	}

	candidates, selected := discover(t, folder)

	if len(candidates) != 0 || selected != "" {
		t.Fatalf("candidates = %v, selected = %q; a link to a missing file must not be offered", candidates, selected)
	}
}

func TestDiscoveryListsALinkedFileInsideTheFolderOnce(t *testing.T) {
	folder := projectLinkedTo(t, "")
	inside := touch(t, filepath.Join(folder, "Book.rpp"))
	manifest, _, _ := project.Load(nil, folder)
	link, _ := project.BuildDawLink(folder, inside)
	manifest.DawProjectFile = &link
	if err := manifest.Save(folder); err != nil {
		t.Fatal(err)
	}

	candidates, selected := discover(t, folder)

	if len(candidates) != 1 || selected != inside {
		t.Fatalf("candidates = %v, selected = %q; want the one file once", candidates, selected)
	}
}
