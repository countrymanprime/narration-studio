package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/countrymanprime/narration-utils/shell/internal/project"
)

func TestLinkDawFileWithAFileInsideTheProjectFolderLinksIt(t *testing.T) {
	folder := t.TempDir()
	rpp := filepath.Join(folder, "Book.rpp")
	writeFile(t, rpp, "x")

	result, err := linkDawFile(nil, folder, rpp)
	if err != nil {
		t.Fatal(err)
	}
	if result["selected"] != true || result["linked"] != true {
		t.Fatalf("result = %#v, want selected and linked true", result)
	}
	if result["insideProject"] != true || result["note"] != nil || result["message"] != nil {
		t.Fatalf("result = %#v, want insideProject true and no note or message", result)
	}

	manifest, ok, err := project.Load(nil, folder)
	if err != nil || !ok {
		t.Fatalf("manifest not saved: ok=%v err=%v", ok, err)
	}
	if manifest.DawProjectFile == nil {
		t.Fatal("manifest.DawProjectFile is nil, want the linked file")
	}
	resolved, ok := manifest.DawProjectFile.Resolve(folder)
	if !ok || resolved != rpp {
		t.Fatalf("resolved = %q, ok=%v, want %q", resolved, ok, rpp)
	}
}

func TestLinkDawFileWithAFileOutsideTheProjectFolderLinksItByItsAbsolutePath(t *testing.T) {
	folder := t.TempDir()
	other := t.TempDir()
	rpp := filepath.Join(other, "Elsewhere.rpp")
	writeFile(t, rpp, "x")

	result, err := linkDawFile(nil, folder, rpp)
	if err != nil {
		t.Fatal(err)
	}
	if result["selected"] != true || result["linked"] != true || result["insideProject"] != false {
		t.Fatalf("result = %#v, want selected and linked true, insideProject false", result)
	}
	if result["message"] != nil {
		t.Fatalf("result = %#v, want no refusal message", result)
	}
	note, _ := result["note"].(string)
	if !strings.Contains(note, other) || !strings.Contains(note, folder) {
		t.Fatalf("note = %q, want it to name where the file and the project are", note)
	}
	manifest, ok, err := project.Load(nil, folder)
	if err != nil || !ok || manifest.DawProjectFile == nil {
		t.Fatalf("manifest not saved: ok=%v err=%v", ok, err)
	}
	if got := *manifest.DawProjectFile; got.Absolute != rpp || got.Relative != "" {
		t.Fatalf("DawProjectFile = %#v, want the absolute path only", got)
	}
}

func TestLinkDawFileInASubfolderStoresAProjectRelativePathThatSurvivesAMove(t *testing.T) {
	parent := t.TempDir()
	folder := filepath.Join(parent, "Alice")
	rpp := filepath.Join(folder, "REAPER", "Alice.rpp")
	writeFile(t, rpp, "x")

	result, err := linkDawFile(nil, folder, rpp)
	if err != nil {
		t.Fatal(err)
	}
	if result["linked"] != true || result["insideProject"] != true || result["note"] != nil {
		t.Fatalf("result = %#v, want linked inside the project with no note", result)
	}
	moved := filepath.Join(parent, "Moved")
	if err := os.Rename(folder, moved); err != nil {
		t.Fatal(err)
	}
	manifest, ok, err := project.Load(nil, moved)
	if err != nil || !ok || manifest.DawProjectFile == nil {
		t.Fatalf("manifest not reloaded: ok=%v err=%v", ok, err)
	}
	if manifest.DawProjectFile.Relative != filepath.Join("REAPER", "Alice.rpp") {
		t.Fatalf("Relative = %q, want REAPER/Alice.rpp", manifest.DawProjectFile.Relative)
	}
	if resolved, ok := manifest.DawProjectFile.Resolve(moved); !ok || resolved != filepath.Join(moved, "REAPER", "Alice.rpp") {
		t.Fatalf("Resolve() = %q, %v after the move", resolved, ok)
	}
}

func TestLinkDawFileThroughASymlinkedProjectFolderIsInside(t *testing.T) {
	real := t.TempDir()
	rpp := filepath.Join(real, "Book.rpp")
	writeFile(t, rpp, "x")
	alias := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(real, alias); err != nil {
		t.Skipf("symlinks unavailable here: %v", err)
	}

	result, err := linkDawFile(nil, alias, rpp)
	if err != nil {
		t.Fatal(err)
	}
	if result["linked"] != true || result["insideProject"] != true || result["note"] != nil {
		t.Fatalf("result = %#v, want linked inside the project with no note", result)
	}
}

func TestLinkDawFileAcceptsAnUpperCaseRppExtension(t *testing.T) {
	folder := t.TempDir()
	rpp := filepath.Join(folder, "BOOK.RPP")
	writeFile(t, rpp, "x")

	result, err := linkDawFile(nil, folder, rpp)
	if err != nil {
		t.Fatal(err)
	}
	if result["linked"] != true {
		t.Fatalf("result = %#v, want linked", result)
	}
}

func TestLinkDawFileRefusesAFileThatIsNotAReaperProject(t *testing.T) {
	folder := t.TempDir()
	wav := filepath.Join(folder, "take.wav")
	writeFile(t, wav, "x")

	result, err := linkDawFile(nil, folder, wav)
	if err != nil {
		t.Fatal(err)
	}
	message, _ := result["message"].(string)
	if result["linked"] != false || !strings.Contains(message, ".rpp") || strings.Contains(message, "outside") {
		t.Fatalf("result = %#v, want a refusal naming .rpp", result)
	}
	if _, ok, _ := project.Load(nil, folder); ok {
		t.Fatal("a manifest was written for a refused file")
	}
}

func TestLinkDawFileRefusesAFileThatDoesNotExist(t *testing.T) {
	folder := t.TempDir()

	result, err := linkDawFile(nil, folder, filepath.Join(folder, "Gone.rpp"))
	if err != nil {
		t.Fatal(err)
	}
	message, _ := result["message"].(string)
	if result["linked"] != false || !strings.Contains(message, "Gone.rpp") || strings.Contains(message, "outside") {
		t.Fatalf("result = %#v, want a refusal naming the missing file", result)
	}
}

func TestLinkDawFilePreservesTheExistingProjectNameWhenAManifestAlreadyExists(t *testing.T) {
	folder := t.TempDir()
	rpp := filepath.Join(folder, "Book.rpp")
	writeFile(t, rpp, "x")
	if err := project.New("My Project", time.Now()).Save(folder); err != nil {
		t.Fatal(err)
	}

	if _, err := linkDawFile(nil, folder, rpp); err != nil {
		t.Fatal(err)
	}

	manifest, ok, err := project.Load(nil, folder)
	if err != nil || !ok {
		t.Fatalf("manifest not found: ok=%v err=%v", ok, err)
	}
	if manifest.Name != "My Project" {
		t.Fatalf("manifest.Name = %q, want the existing name preserved", manifest.Name)
	}
}

func TestLinkDawFileCreatesAManifestWhenNoneExistsYet(t *testing.T) {
	folder := t.TempDir()
	rpp := filepath.Join(folder, "Book.rpp")
	writeFile(t, rpp, "x")

	if _, err := linkDawFile(nil, folder, rpp); err != nil {
		t.Fatal(err)
	}
	manifest, ok, err := project.Load(nil, folder)
	if err != nil || !ok {
		t.Fatalf("manifest not created: ok=%v err=%v", ok, err)
	}
	if manifest.Name != filepath.Base(folder) {
		t.Fatalf("manifest.Name = %q, want the folder's base name", manifest.Name)
	}
}

func TestLinkDawFileRelinkingReplacesThePreviousLink(t *testing.T) {
	folder := t.TempDir()
	first := filepath.Join(folder, "First.rpp")
	second := filepath.Join(folder, "Second.rpp")
	writeFile(t, first, "x")
	writeFile(t, second, "x")

	if _, err := linkDawFile(nil, folder, first); err != nil {
		t.Fatal(err)
	}
	if _, err := linkDawFile(nil, folder, second); err != nil {
		t.Fatal(err)
	}

	manifest, ok, err := project.Load(nil, folder)
	if err != nil || !ok {
		t.Fatal("manifest not found")
	}
	resolved, ok := manifest.DawProjectFile.Resolve(folder)
	if !ok || resolved != second {
		t.Fatalf("resolved = %q, want %q (the relinked file)", resolved, second)
	}
}

func TestProjectLinkDawFileRefusesWithNoHostContext(t *testing.T) {
	host := NewHost()
	host.config.projectFolder = t.TempDir()
	if _, err := host.ProjectLinkDawFile(); err == nil {
		t.Fatal("want an error when the desktop host has no window context yet")
	}
}
