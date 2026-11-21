package persist

import (
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func writeIn(t *testing.T, path string) string {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("kept"), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func stillThere(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Lstat(path); err != nil {
		t.Fatalf("%s is gone: %v", path, err)
	}
}

func TestRemoveRegularDeletesAFileBelowTheRootAndMovesTheGeneration(t *testing.T) {
	roots := map[string]string{
		"plain":     "project",
		"spaces":    "my audio book",
		"unicode":   "Книга 📚 كتاب",
		"very long": strings.Repeat("long-folder-name/", 12) + "project",
	}
	for name, folder := range roots {
		t.Run(name, func(t *testing.T) {
			root := filepath.Join(t.TempDir(), filepath.FromSlash(folder))
			path := writeIn(t, filepath.Join(root, "data", "a.json"))
			before := Generation()
			removed, err := RemoveRegular(root, filepath.Join("data", "a.json"))
			if err != nil || !removed {
				t.Fatalf("RemoveRegular = %v, %v; want true, nil", removed, err)
			}
			if _, err := os.Lstat(path); !os.IsNotExist(err) {
				t.Fatalf("the file is still there: %v", err)
			}
			if Generation() == before {
				t.Fatal("a delete did not move the generation")
			}
		})
	}
}

func TestRemoveRegularHasNothingToDeleteWhenTheRootOrTheFileIsMissing(t *testing.T) {
	root := t.TempDir()
	for name, at := range map[string][2]string{
		"missing root":   {filepath.Join(root, "nowhere"), "a.json"},
		"missing file":   {root, "a.json"},
		"missing folder": {root, filepath.Join("data", "a.json")},
	} {
		t.Run(name, func(t *testing.T) {
			if removed, err := RemoveRegular(at[0], at[1]); removed || err != nil {
				t.Fatalf("RemoveRegular = %v, %v; want false, nil", removed, err)
			}
		})
	}
}

func TestRemoveRegularRefusesAPathThatLeavesTheRoot(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "project")
	outside := writeIn(t, filepath.Join(base, "outside", "a.json"))
	writeIn(t, filepath.Join(root, "data", "b.json"))
	for name, rel := range map[string]string{
		"parent":        filepath.Join("..", "outside", "a.json"),
		"parent midway": filepath.Join("data", "..", "..", "outside", "a.json"),
		"absolute":      outside,
	} {
		t.Run(name, func(t *testing.T) {
			if removed, err := RemoveRegular(root, rel); removed || err == nil {
				t.Fatalf("RemoveRegular(%q) = %v, %v; want false and an error", rel, removed, err)
			}
			stillThere(t, outside)
		})
	}
}

func TestRemoveRegularReportsARootThatIsNotAFolder(t *testing.T) {
	file := writeIn(t, filepath.Join(t.TempDir(), "file"))
	if removed, err := RemoveRegular(file, "a.json"); removed || err == nil {
		t.Fatalf("RemoveRegular = %v, %v; want false and an error", removed, err)
	}
}

func TestRemoveRegularLeavesAFolderWhereTheFileWouldBe(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "a.json"), 0o755); err != nil {
		t.Fatal(err)
	}
	if removed, err := RemoveRegular(root, "a.json"); removed || err != nil {
		t.Fatalf("RemoveRegular = %v, %v; want false, nil", removed, err)
	}
	stillThere(t, filepath.Join(root, "a.json"))
}

func TestRemoveRegularLeavesALinkAndItsTarget(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "project")
	outsideFile := writeIn(t, filepath.Join(base, "outside", "a.json"))
	insideFile := writeIn(t, filepath.Join(root, "inside.json"))
	if err := os.MkdirAll(filepath.Join(root, "data"), 0o755); err != nil {
		t.Fatal(err)
	}
	links := map[string]string{
		"to-outside-file.json":   outsideFile,
		"to-outside-folder.json": filepath.Dir(outsideFile),
		"to-inside-file.json":    filepath.Join("..", "inside.json"),
		"dangling.json":          filepath.Join(base, "nowhere"),
	}
	for name, target := range links {
		if err := os.Symlink(target, filepath.Join(root, "data", name)); err != nil {
			t.Skipf("this platform or account cannot make a symlink: %v", err)
		}
	}
	for name := range links {
		if removed, err := RemoveRegular(root, filepath.Join("data", name)); removed || err != nil {
			t.Fatalf("RemoveRegular(%s) = %v, %v; want false, nil", name, removed, err)
		}
		stillThere(t, filepath.Join(root, "data", name))
	}
	stillThere(t, outsideFile)
	stillThere(t, insideFile)
}

// A folder on the way that is a link is refused wherever it leads: out of the root, or to another folder inside it, whose
// files a delete by name would otherwise take.
func TestRemoveRegularRefusesALinkedFolderOnTheWay(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "project")
	outside := writeIn(t, filepath.Join(base, "outside", "a.json"))
	inside := writeIn(t, filepath.Join(root, "real", "a.json"))
	deep := writeIn(t, filepath.Join(root, "real", "deeper", "a.json"))
	rootFile := writeIn(t, filepath.Join(root, "a.json"))
	if err := os.Symlink(filepath.Dir(outside), filepath.Join(root, "escapes")); err != nil {
		t.Skipf("this platform or account cannot make a symlink: %v", err)
	}
	for link, target := range map[string]string{"stays": "real", "to-root": ".", "dangling": "nowhere"} {
		if err := os.Symlink(target, filepath.Join(root, link)); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink("deeper", filepath.Join(root, "real", "below")); err != nil {
		t.Fatal(err)
	}
	for name, rel := range map[string]string{
		"out of the root":         filepath.Join("escapes", "a.json"),
		"to a folder in the root": filepath.Join("stays", "a.json"),
		"to the root":             filepath.Join("to-root", "a.json"),
		"to nothing":              filepath.Join("dangling", "a.json"),
		"below a real folder":     filepath.Join("real", "below", "a.json"),
		"above a real folder":     filepath.Join("stays", "deeper", "a.json"),
	} {
		t.Run(name, func(t *testing.T) {
			if removed, err := RemoveRegular(root, rel); removed || err == nil {
				t.Fatalf("RemoveRegular(%q) = %v, %v; want false and an error", rel, removed, err)
			}
			if regular, err := IsRegular(root, rel); regular || err == nil {
				t.Fatalf("IsRegular(%q) = %v, %v; want false and an error", rel, regular, err)
			}
			for _, path := range []string{outside, inside, deep, rootFile} {
				stillThere(t, path)
			}
		})
	}
}

// A file where a folder of the path would be is refused as a link is: the path is not what the caller named.
func TestRemoveRegularRefusesAFileWhereAFolderWouldBe(t *testing.T) {
	root := t.TempDir()
	file := writeIn(t, filepath.Join(root, "data"))
	if removed, err := RemoveRegular(root, filepath.Join("data", "a.json")); removed || err == nil {
		t.Fatalf("RemoveRegular = %v, %v; want false and an error", removed, err)
	}
	stillThere(t, file)
}

// The delete acts on the folder the checks were made in: a root replaced at the same path in between is not touched.
func TestRemoveRegularDeletesInTheRootItChecked(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "project")
	writeIn(t, filepath.Join(root, "data", "a.json"))
	moved := filepath.Join(base, "moved")
	previous := beforeAct
	t.Cleanup(func() { beforeAct = previous })
	swapped := false
	beforeAct = func() {
		if err := os.Rename(root, moved); err != nil {
			return // Windows does not rename a folder that is open
		}
		swapped = true
		writeIn(t, filepath.Join(root, "data", "a.json"))
	}
	removed, err := RemoveRegular(root, filepath.Join("data", "a.json"))
	if !swapped {
		t.Skip("this platform does not rename an open folder, so no other folder can take its path")
	}
	if !removed || err != nil {
		t.Fatalf("RemoveRegular = %v, %v; want true, nil", removed, err)
	}
	if _, err := os.Lstat(filepath.Join(moved, "data", "a.json")); !os.IsNotExist(err) {
		t.Fatalf("the file that was checked is still there: %v", err)
	}
	stillThere(t, filepath.Join(root, "data", "a.json"))
}

func TestRealFolderAnswersForAFolderReachedThroughFoldersOnly(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "project")
	file := writeIn(t, filepath.Join(root, "real", "deeper", "a.json"))
	writeIn(t, filepath.Join(base, "outside", "a.json"))
	links := map[string]string{"stays": "real", "to-root": ".", "escapes": filepath.Join(base, "outside"), "dangling": "nowhere"}
	for link, target := range links {
		if err := os.Symlink(target, filepath.Join(root, link)); err != nil {
			t.Skipf("this platform or account cannot make a symlink: %v", err)
		}
	}
	if err := os.Symlink(root, filepath.Join(base, "link")); err != nil {
		t.Fatal(err)
	}
	for name, c := range map[string]struct {
		root, rel string
		real      bool
		refused   bool
	}{
		"a folder":                      {root: root, rel: "real", real: true},
		"a folder below a folder":       {root: root, rel: filepath.Join("real", "deeper"), real: true},
		"the root":                      {root: root, rel: ".", real: true},
		"a root reached through a link": {root: filepath.Join(base, "link"), rel: filepath.Join("real", "deeper"), real: true},
		"nothing":                       {root: root, rel: "missing"},
		"nothing below nothing":         {root: root, rel: filepath.Join("missing", "deeper")},
		"no root":                       {root: filepath.Join(base, "nowhere"), rel: "real"},
		"a root that is a file":         {root: file, rel: "real", refused: true},
		"a file":                        {root: root, rel: filepath.Join("real", "deeper", "a.json"), refused: true},
		"a link to a folder":            {root: root, rel: "stays", refused: true},
		"a link to the root":            {root: root, rel: "to-root", refused: true},
		"a link out of the root":        {root: root, rel: "escapes", refused: true},
		"a link to nothing":             {root: root, rel: "dangling", refused: true},
		"below a link":                  {root: root, rel: filepath.Join("stays", "deeper"), refused: true},
		"out of the root":               {root: root, rel: filepath.Join("..", "outside"), refused: true},
		"an absolute path":              {root: root, rel: filepath.Join(root, "real"), refused: true},
	} {
		t.Run(name, func(t *testing.T) {
			real, err := RealFolder(c.root, c.rel)
			if real != c.real || (err != nil) != c.refused {
				t.Fatalf("RealFolder(%q) = %v, %v; want %v, refused %v", c.rel, real, err, c.real, c.refused)
			}
		})
	}
}

// The project folder itself may be reached through a link: the narrator chose it, and the root is whatever it leads to.
func TestRemoveRegularWorksBelowARootReachedThroughALink(t *testing.T) {
	base := t.TempDir()
	path := writeIn(t, filepath.Join(base, "real", "a.json"))
	if err := os.Symlink(filepath.Join(base, "real"), filepath.Join(base, "link")); err != nil {
		t.Skipf("this platform or account cannot make a symlink: %v", err)
	}
	if removed, err := RemoveRegular(filepath.Join(base, "link"), "a.json"); !removed || err != nil {
		t.Fatalf("RemoveRegular = %v, %v; want true, nil", removed, err)
	}
	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Fatalf("the file is still there: %v", err)
	}
}

func TestRemoveRegularReportsAFileAReadOnlyFolderKeeps(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("a folder's mode does not stop a delete on Windows or for root, so the refusal cannot be made here")
	}
	root := t.TempDir()
	path := writeIn(t, filepath.Join(root, "data", "a.json"))
	if err := os.Chmod(filepath.Dir(path), 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(filepath.Dir(path), 0o700) })
	if removed, err := RemoveRegular(root, filepath.Join("data", "a.json")); removed || err == nil {
		t.Fatalf("RemoveRegular in a read-only folder = %v, %v; want false and an error", removed, err)
	}
	stillThere(t, path)
}

func TestIsRegularAnswersWhatRemoveRegularWouldActOn(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "project")
	file := writeIn(t, filepath.Join(root, "data", "a.json"))
	writeIn(t, filepath.Join(base, "outside", "a.json"))
	for name, c := range map[string]struct {
		rel     string
		regular bool
		refused bool
	}{
		"a file":            {rel: filepath.Join("data", "a.json"), regular: true},
		"a folder":          {rel: "data"},
		"nothing":           {rel: filepath.Join("data", "b.json")},
		"out of the root":   {rel: filepath.Join("..", "outside", "a.json"), refused: true},
		"an absolute path":  {rel: file, refused: true},
		"the root's folder": {rel: "."},
	} {
		t.Run(name, func(t *testing.T) {
			regular, err := IsRegular(root, c.rel)
			if regular != c.regular || (err != nil) != c.refused {
				t.Fatalf("IsRegular(%q) = %v, %v; want %v, refused %v", c.rel, regular, err, c.regular, c.refused)
			}
		})
	}
	stillThere(t, file)
}

func TestOnlyAFolderItselfIsARealFolder(t *testing.T) {
	for name, tc := range map[string]struct {
		mode fs.FileMode
		want bool
	}{
		"a folder":                   {fs.ModeDir, true},
		"a folder with a cloud tag":  {fs.ModeDir | fs.ModeIrregular, true},
		"a symlink":                  {fs.ModeSymlink, false},
		"a junction (no folder bit)": {fs.ModeIrregular, false},
		"a symlink to a folder":      {fs.ModeSymlink | fs.ModeDir, false},
		"a file":                     {0, false},
	} {
		if got := isRealFolder(tc.mode); got != tc.want {
			t.Errorf("%s: isRealFolder(%v) = %v, want %v", name, tc.mode, got, tc.want)
		}
	}
}
