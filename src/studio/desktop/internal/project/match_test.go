package project

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeManifestWithLink creates projectsDir/name as a project folder whose
// manifest links rpp, and returns the project folder path.
func writeManifestWithLink(t *testing.T, projectsDir, name, rpp string) string {
	t.Helper()
	folder := filepath.Join(projectsDir, name)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		t.Fatal(err)
	}
	link, err := BuildDawLink(folder, rpp)
	if err != nil {
		t.Fatal(err)
	}
	manifest := New(name, fixedNow())
	manifest.DawProjectFile = &link
	if err := manifest.Save(folder); err != nil {
		t.Fatal(err)
	}
	return folder
}

func TestFindByDawFileMatchesTheProjectWhoseManifestLinksTheRpp(t *testing.T) {
	projectsDir := t.TempDir()
	rpp := filepath.Join(projectsDir, "Elsewhere", "Book.rpp")
	writeFile(t, rpp, "rpp")
	want := writeManifestWithLink(t, projectsDir, "Alice", rpp)
	// A second, unrelated project must not confuse the match.
	otherRpp := filepath.Join(projectsDir, "Other.rpp")
	writeFile(t, otherRpp, "rpp")
	writeManifestWithLink(t, projectsDir, "Voltage", otherRpp)

	folder, name, ok := FindByDawFile(nil, projectsDir, rpp)
	if !ok {
		t.Fatal("ok = false, want true: one project links this exact rpp")
	}
	if folder != want {
		t.Fatalf("folder = %q, want %q", folder, want)
	}
	if name != "Alice" {
		t.Fatalf("name = %q, want %q", name, "Alice")
	}
}

func TestFindByDawFileMatchesARelativeLinkResolvedAgainstItsOwnProjectFolder(t *testing.T) {
	projectsDir := t.TempDir()
	folder := filepath.Join(projectsDir, "Alice")
	rpp := filepath.Join(folder, "Alice.rpp")
	writeFile(t, rpp, "rpp")
	writeManifestWithLink(t, projectsDir, "Alice", rpp)

	got, name, ok := FindByDawFile(nil, projectsDir, rpp)
	if !ok || got != folder || name != "Alice" {
		t.Fatalf("FindByDawFile() = (%q, %q, %v), want (%q, %q, true)", got, name, ok, folder, "Alice")
	}
}

func TestFindByDawFileMatchesCaseInsensitivelyLikeWindowsPaths(t *testing.T) {
	projectsDir := t.TempDir()
	rpp := filepath.Join(projectsDir, "Alice", "Book.rpp")
	writeFile(t, rpp, "rpp")
	folder := writeManifestWithLink(t, projectsDir, "Alice", rpp)

	upper := strings.ToUpper(rpp)
	got, _, ok := FindByDawFile(nil, projectsDir, upper)
	if !ok || got != folder {
		t.Fatalf("FindByDawFile(upper-cased rpp) = (%q, %v), want (%q, true)", got, ok, folder)
	}
}

func TestFindByDawFileReturnsNotOkWhenNoProjectLinksTheRpp(t *testing.T) {
	projectsDir := t.TempDir()
	rpp := filepath.Join(projectsDir, "Book.rpp")
	writeFile(t, rpp, "rpp")
	writeManifestWithLink(t, projectsDir, "Alice", filepath.Join(projectsDir, "Different.rpp"))

	_, _, ok := FindByDawFile(nil, projectsDir, rpp)
	if ok {
		t.Fatal("ok = true, want false: no manifest links this rpp")
	}
}

func TestFindByDawFileIgnoresProjectFoldersWithNoManifestOrNoLink(t *testing.T) {
	projectsDir := t.TempDir()
	rpp := filepath.Join(projectsDir, "Book.rpp")
	writeFile(t, rpp, "rpp")
	// A folder with no manifest at all.
	if err := os.MkdirAll(filepath.Join(projectsDir, "NotAProject"), 0o755); err != nil {
		t.Fatal(err)
	}
	// A folder with a manifest but no DAW link.
	unlinked := filepath.Join(projectsDir, "Unlinked")
	if err := os.MkdirAll(unlinked, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := New("Unlinked", fixedNow()).Save(unlinked); err != nil {
		t.Fatal(err)
	}

	_, _, ok := FindByDawFile(nil, projectsDir, rpp)
	if ok {
		t.Fatal("ok = true, want false: nothing here links the rpp")
	}
}

func TestFindByDawFileReturnsNotOkWhenTheLinkedFileNoLongerExists(t *testing.T) {
	projectsDir := t.TempDir()
	rpp := filepath.Join(projectsDir, "Book.rpp")
	writeFile(t, rpp, "rpp")
	writeManifestWithLink(t, projectsDir, "Alice", rpp)
	if err := os.Remove(rpp); err != nil {
		t.Fatal(err)
	}

	_, _, ok := FindByDawFile(nil, projectsDir, rpp)
	if ok {
		t.Fatal("ok = true, want false: the linked file no longer resolves")
	}
}

func TestFindByDawFileWithAnEmptyRppOrProjectsDirIsNotOk(t *testing.T) {
	projectsDir := t.TempDir()
	if _, _, ok := FindByDawFile(nil, projectsDir, ""); ok {
		t.Fatal("ok = true with an empty rpp path, want false (unsaved REAPER project, W5)")
	}
	if _, _, ok := FindByDawFile(nil, "", filepath.Join(projectsDir, "Book.rpp")); ok {
		t.Fatal("ok = true with no projects directory, want false")
	}
}

func TestFindByDawFileWithAnUnreadableProjectsDirIsNotOk(t *testing.T) {
	_, _, ok := FindByDawFile(nil, filepath.Join(t.TempDir(), "does-not-exist"), "C:\\some\\Book.rpp")
	if ok {
		t.Fatal("ok = true for a projects directory that cannot be listed, want false")
	}
}

func TestFindByDawFileMatchesALinkInADeepSubfolderOfTheProject(t *testing.T) {
	projectsDir := t.TempDir()
	folder := filepath.Join(projectsDir, "Alice")
	rpp := filepath.Join(folder, "REAPER", "sessions", "Alice.rpp")
	writeFile(t, rpp, "rpp")
	writeManifestWithLink(t, projectsDir, "Alice", rpp)

	got, _, ok := FindByDawFile(nil, projectsDir, rpp)
	if !ok || got != folder {
		t.Fatalf("FindByDawFile() = %q, %v, want %q, true", got, ok, folder)
	}
}

func TestFindByDawFileMatchesTheSameFileReachedThroughASymlink(t *testing.T) {
	projectsDir := t.TempDir()
	dawDir := t.TempDir()
	rpp := filepath.Join(dawDir, "Book.rpp")
	writeFile(t, rpp, "rpp")
	folder := writeManifestWithLink(t, projectsDir, "Alice", rpp)
	alias := filepath.Join(t.TempDir(), "alias")
	aliasFolder(t, dawDir, alias)

	got, _, ok := FindByDawFile(nil, projectsDir, filepath.Join(alias, "Book.rpp"))
	if !ok || got != folder {
		t.Fatalf("FindByDawFile() = %q, %v, want %q, true", got, ok, folder)
	}
}

// A project created outside the projects directory (ProjectCreateIn takes any absolute parent) holds its own link, and the
// DAW's project inside it must still be recognised: the directory scan alone never lists it.
func TestFindByDawFileAmongFindsAProjectOutsideTheProjectsDirectory(t *testing.T) {
	projectsDir := t.TempDir()
	elsewhere := t.TempDir()
	rpp := filepath.Join(elsewhere, "Book", "Book.rpp")
	writeFile(t, rpp, "rpp")
	want := writeManifestWithLink(t, elsewhere, "Book", rpp)

	if _, _, ok := FindByDawFile(nil, projectsDir, rpp); ok {
		t.Fatal("the directory scan found a project that is not in the projects directory")
	}
	folder, name, ok := FindByDawFileAmong(nil, projectsDir, rpp, []string{want})
	if !ok || folder != want || name != "Book" {
		t.Fatalf("FindByDawFileAmong = (%q, %q, %v), want (%q, \"Book\", true)", folder, name, ok, want)
	}
}

// The shared path cases of the definition of done: every spelling the DAW may report the same file under still matches.
func TestFindByDawFileAmongPathFixtures(t *testing.T) {
	cases := map[string]string{
		"spaces":  "My Book (draft)",
		"unicode": "Köln – 本 – 📖",
		"rtl":     "كتاب",
		"long":    strings.Repeat("a", 100),
	}
	for label, dir := range cases {
		t.Run(label, func(t *testing.T) {
			root := t.TempDir()
			rpp := filepath.Join(root, dir, "Take One.rpp")
			writeFile(t, rpp, "rpp")
			want := writeManifestWithLink(t, root, dir, rpp)
			if _, _, ok := FindByDawFileAmong(nil, t.TempDir(), rpp, []string{want}); !ok {
				t.Fatalf("no match for %q", rpp)
			}
			upper := filepath.Join(root, strings.ToUpper(dir), "TAKE ONE.RPP")
			if _, _, ok := FindByDawFileAmong(nil, t.TempDir(), upper, []string{want}); !ok {
				t.Fatalf("no match for the same file spelled %q", upper)
			}
		})
	}
}

func TestFindByDawFileAmongToleratesBadCandidates(t *testing.T) {
	rpp := filepath.Join(t.TempDir(), "Book.rpp")
	writeFile(t, rpp, "rpp")
	missing := filepath.Join(t.TempDir(), "gone")
	notAProject := t.TempDir()
	for _, candidates := range [][]string{nil, {}, {""}, {missing}, {notAProject}, {missing, "", notAProject}} {
		if _, _, ok := FindByDawFileAmong(nil, "", rpp, candidates); ok {
			t.Fatalf("matched with candidates %q", candidates)
		}
	}
	if _, _, ok := FindByDawFileAmong(nil, "", "", []string{notAProject}); ok {
		t.Fatal("an empty rpp path matched")
	}
}

// A linked file that was moved or deleted must not match by name alone.
func TestFindByDawFileAmongIgnoresALinkWhoseFileIsMissing(t *testing.T) {
	root := t.TempDir()
	rpp := filepath.Join(root, "Book", "Book.rpp")
	writeFile(t, rpp, "rpp")
	folder := writeManifestWithLink(t, root, "Book", rpp)
	if err := os.Remove(rpp); err != nil {
		t.Fatal(err)
	}
	if _, _, ok := FindByDawFileAmong(nil, "", rpp, []string{folder}); ok {
		t.Fatal("matched a link whose file is gone")
	}
}
