package project

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
)

func TestBuildDawLinkStoresBothTheAbsoluteAndProjectRelativePath(t *testing.T) {
	project := t.TempDir()
	rpp := filepath.Join(project, "alice.rpp")
	writeFile(t, rpp, "rpp")

	link, err := BuildDawLink(project, rpp)
	if err != nil {
		t.Fatalf("BuildDawLink() error = %v", err)
	}
	if link.Absolute != rpp {
		t.Fatalf("Absolute = %q, want %q", link.Absolute, rpp)
	}
	if link.Relative != "alice.rpp" {
		t.Fatalf("Relative = %q, want %q", link.Relative, "alice.rpp")
	}
}

func TestBuildDawLinkOnAFileOutsideTheProjectFolderStillStoresTheAbsolutePath(t *testing.T) {
	project := t.TempDir()
	elsewhere := t.TempDir()
	rpp := filepath.Join(elsewhere, "alice.rpp")
	writeFile(t, rpp, "rpp")

	link, err := BuildDawLink(project, rpp)
	if err != nil {
		t.Fatalf("BuildDawLink() error = %v", err)
	}
	if link.Absolute != rpp {
		t.Fatalf("Absolute = %q, want %q", link.Absolute, rpp)
	}
	if link.Relative != "" {
		t.Fatalf("Relative = %q, want empty for a file outside the project folder", link.Relative)
	}
}

func TestResolvePrefersTheAbsolutePathWhenBothExist(t *testing.T) {
	project := t.TempDir()
	rpp := filepath.Join(project, "alice.rpp")
	writeFile(t, rpp, "rpp")
	link := DawLink{Absolute: rpp, Relative: "alice.rpp"}

	resolved, ok := link.Resolve(project)
	if !ok || resolved != rpp {
		t.Fatalf("Resolve() = %q, %v, want %q, true", resolved, ok, rpp)
	}
}

func TestResolveFallsBackToTheRelativePathWhenTheAbsoluteOneIsGone(t *testing.T) {
	project := t.TempDir()
	moved := filepath.Join(project, "alice.rpp")
	writeFile(t, moved, "rpp")
	// The absolute path recorded when the project lived somewhere else no longer exists,
	// but the file is still where the relative path says, inside the current project folder.
	link := DawLink{Absolute: filepath.Join(t.TempDir(), "alice.rpp"), Relative: "alice.rpp"}

	resolved, ok := link.Resolve(project)
	if !ok || resolved != moved {
		t.Fatalf("Resolve() = %q, %v, want %q, true", resolved, ok, moved)
	}
}

func TestResolveReturnsFalseWhenNeitherPathExists(t *testing.T) {
	project := t.TempDir()
	link := DawLink{Absolute: filepath.Join(project, "gone.rpp"), Relative: "gone.rpp"}

	_, ok := link.Resolve(project)
	if ok {
		t.Fatalf("Resolve() ok = true, want false")
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s): %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%s): %v", path, err)
	}
}

func TestBuildDawLinkInASubfolderStoresTheProjectRelativePath(t *testing.T) {
	project := t.TempDir()
	rpp := filepath.Join(project, "REAPER", "takes", "alice.rpp")
	writeFile(t, rpp, "rpp")

	link, err := BuildDawLink(project, rpp)
	if err != nil {
		t.Fatalf("BuildDawLink() error = %v", err)
	}
	if want := filepath.Join("REAPER", "takes", "alice.rpp"); link.Relative != want {
		t.Fatalf("Relative = %q, want %q", link.Relative, want)
	}
	if !link.Inside() {
		t.Fatal("Inside() = false for a file in a subfolder of the project")
	}
}

func TestBuildDawLinkThroughASymlinkedProjectFolderIsStillInside(t *testing.T) {
	real := t.TempDir()
	rpp := filepath.Join(real, "sub", "alice.rpp")
	writeFile(t, rpp, "rpp")
	alias := filepath.Join(t.TempDir(), "alias")
	aliasFolder(t, real, alias)

	// The project is opened through the alias; the dialog hands back the real path (and the reverse).
	for _, tc := range []struct{ folder, file string }{{alias, rpp}, {real, filepath.Join(alias, "sub", "alice.rpp")}} {
		link, err := BuildDawLink(tc.folder, tc.file)
		if err != nil {
			t.Fatalf("BuildDawLink(%q, %q) error = %v", tc.folder, tc.file, err)
		}
		if want := filepath.Join("sub", "alice.rpp"); link.Relative != want {
			t.Fatalf("BuildDawLink(%q, %q).Relative = %q, want %q", tc.folder, tc.file, link.Relative, want)
		}
	}
}

func TestBuildDawLinkInASiblingFolderWithACommonPrefixIsOutside(t *testing.T) {
	parent := t.TempDir()
	project := filepath.Join(parent, "Alice")
	if err := os.MkdirAll(project, 0o755); err != nil {
		t.Fatal(err)
	}
	rpp := filepath.Join(parent, "Alice REAPER", "alice.rpp")
	writeFile(t, rpp, "rpp")

	link, err := BuildDawLink(project, rpp)
	if err != nil {
		t.Fatalf("BuildDawLink() error = %v", err)
	}
	if link.Relative != "" || link.Inside() {
		t.Fatalf("link = %#v, want an absolute-only link for a sibling folder", link)
	}
}

func TestDawLinkInASubfolderSurvivesMovingTheWholeProject(t *testing.T) {
	parent := t.TempDir()
	project := filepath.Join(parent, "Alice")
	rpp := filepath.Join(project, "REAPER", "alice.rpp")
	writeFile(t, rpp, "rpp")
	link, err := BuildDawLink(project, rpp)
	if err != nil {
		t.Fatal(err)
	}

	moved := filepath.Join(parent, "Moved")
	if err := os.Rename(project, moved); err != nil {
		t.Fatal(err)
	}
	resolved, ok := link.Resolve(moved)
	if want := filepath.Join(moved, "REAPER", "alice.rpp"); !ok || resolved != want {
		t.Fatalf("Resolve() = %q, %v, want %q", resolved, ok, want)
	}
}

// aliasFolder makes alias point at target: a symlink, or on Windows without the symlink privilege a directory
// junction (mklink /J needs none), which is the case a narrator's redirected folder most often is.
func aliasFolder(t *testing.T, target, alias string) {
	t.Helper()
	err := os.Symlink(target, alias)
	if err == nil {
		return
	}
	if runtime.GOOS != "windows" {
		t.Fatalf("could not make a symlink: %v", err)
	}
	if out, junctionErr := exec.Command("cmd", "/c", "mklink", "/J", alias, target).CombinedOutput(); junctionErr != nil {
		t.Fatalf("could not make a symlink (%v) or a junction (%v: %s)", err, junctionErr, out)
	}
}
