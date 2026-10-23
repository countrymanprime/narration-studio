package project

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/pathfixtures"
)

// The path guard (definition of done, rule 1): every function in this package that resolves a project folder or a DAW project
// file runs the shared fixture set in internal/pathfixtures.

func sameFileOnDisk(t *testing.T, a, b string) bool {
	t.Helper()
	infoA, errA := os.Stat(a)
	infoB, errB := os.Stat(b)
	return errA == nil && errB == nil && os.SameFile(infoA, infoB)
}

// writeLinkedManifest links rpp from dir in dir's manifest, as linkDawFile does.
func writeLinkedManifest(t *testing.T, dir, rpp string) {
	t.Helper()
	link, err := BuildDawLink(dir, rpp)
	if err != nil {
		t.Fatal(err)
	}
	manifest := New("Guarded", fixedNow())
	manifest.DawProjectFile = &link
	if err := manifest.Save(dir); err != nil {
		t.Fatal(err)
	}
}

func TestPathGuardFindByDawFileAmong(t *testing.T) {
	pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
		if !p.Usable {
			// Nothing to find: it must say so for the open project's folder being this path, and for the rpp being this path.
			if _, _, ok := FindByDawFileAmong(nil, p.Start, p.RPP, []string{p.Dir}); ok {
				t.Fatalf("found a project for the unusable place %q / %q", p.Dir, p.RPP)
			}
			if _, _, ok := FindByDawFile(nil, p.Start, p.RPP); ok {
				t.Fatalf("scan found a project for the unusable place %q", p.RPP)
			}
			return
		}
		if p.DirReadOnly {
			// Not a case for this check: no manifest can be put in a read-only folder; TestPathGuardManifestLoadSave asserts the refusal there.
			return
		}
		writeLinkedManifest(t, p.Dir, p.RPP)

		// A project outside the starting folder is never found by scanning the starting folder; only the caller's known folders
		// (the open and recent projects) find it.
		if _, _, ok := FindByDawFile(nil, p.Start, p.RPP); ok && !strings.HasPrefix(p.Dir, p.Start) {
			t.Fatalf("the scan of %q found a project at %q that is outside it", p.Start, p.Dir)
		}
		folder, name, ok := FindByDawFileAmong(nil, p.Start, p.RPP, []string{p.Dir})
		if !ok || name != "Guarded" || !sameFileOnDisk(t, folder, p.Dir) {
			t.Fatalf("known folder %q did not find the project linking %q: folder=%q name=%q ok=%v", p.Dir, p.RPP, folder, name, ok)
		}
		for _, alias := range p.Aliases {
			// The launcher hands a spelling of the rpp that differs from the one the manifest stored.
			folder, _, ok := FindByDawFileAmong(nil, p.Start, alias.RPP, []string{p.Dir})
			if !ok || !sameFileOnDisk(t, folder, p.Dir) {
				t.Errorf("alias %q: launched with %q, the project linking %q was not found (folder=%q ok=%v)", alias.Name, alias.RPP, p.RPP, folder, ok)
			}
			// And the other way: the manifest stored the alias and the launcher passes the primary spelling.
			writeLinkedManifest(t, p.Dir, alias.RPP)
			if folder, _, ok := FindByDawFileAmong(nil, p.Start, p.RPP, []string{p.Dir}); !ok || !sameFileOnDisk(t, folder, p.Dir) {
				t.Errorf("alias %q: manifest linked %q, launched with %q, the project was not found (folder=%q ok=%v)", alias.Name, alias.RPP, p.RPP, folder, ok)
			}
		}
	})
}

// A project inside the starting folder is found by the scan, however the rpp is spelled.
func TestPathGuardFindByDawFileScansTheStartingFolder(t *testing.T) {
	start := t.TempDir()
	for _, text := range pathfixtures.Texts() {
		t.Run(text.Name, func(t *testing.T) {
			if _, _, ok := FindByDawFile(nil, start, text.Path); ok {
				t.Fatalf("an empty starting folder cannot hold a project linking %q", text.Path)
			}
			if _, _, ok := FindByDawFileAmong(nil, "", text.Path, []string{text.Path, "", start}); ok {
				t.Fatalf("no project can link %q here", text.Path)
			}
		})
	}
}

func TestPathGuardBuildDawLinkAndResolve(t *testing.T) {
	pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
		link, err := BuildDawLink(p.Dir, p.RPP)
		if p.RPP == "" {
			if err == nil {
				t.Fatalf("an empty rpp path was linked as %+v", link)
			}
			return
		}
		if err != nil {
			t.Fatal(err)
		}
		if !filepath.IsAbs(link.Absolute) {
			t.Fatalf("the absolute link %q is not absolute", link.Absolute)
		}
		resolved, ok := link.Resolve(p.Dir)
		if !p.Usable {
			if ok && !sameFileOnDisk(t, resolved, p.RPP) {
				t.Fatalf("resolved %q for the unusable place %q", resolved, p.RPP)
			}
			if !fileExists(p.RPP) && ok && !sameFileOnDisk(t, resolved, p.RPP) {
				t.Fatalf("resolved %q though %q is not a file", resolved, p.RPP)
			}
			return
		}
		if !link.Inside() || link.Relative != filepath.Base(p.RPP) {
			t.Errorf("the rpp is directly in %q but the link is %+v", p.Dir, link)
		}
		if !ok || !sameFileOnDisk(t, resolved, p.RPP) {
			t.Fatalf("link %+v did not resolve to %q: %q %v", link, p.RPP, resolved, ok)
		}
		// The whole project folder moved: only the relative half of the link can still say where the file is.
		moved := DawLink{Relative: link.Relative}
		if resolved, ok := moved.Resolve(p.Dir); !ok || !sameFileOnDisk(t, resolved, p.RPP) {
			t.Errorf("relative half %+v did not resolve against %q: %q %v", moved, p.Dir, resolved, ok)
		}
		for _, alias := range p.Aliases {
			aliased, err := BuildDawLink(alias.Dir, alias.RPP)
			if err != nil {
				t.Fatalf("alias %q: %v", alias.Name, err)
			}
			if aliased.Relative != link.Relative {
				t.Errorf("alias %q: the rpp is in the folder, but the link is %+v (want relative %q)", alias.Name, aliased, link.Relative)
			}
			// The same file reached through another spelling of the folder is inside it, at the same relative path.
			if relative, inside := RelativeTo(alias.Dir, p.RPP); !inside || relative != link.Relative {
				t.Errorf("alias %q: RelativeTo(%q, %q) = %q, %v", alias.Name, alias.Dir, p.RPP, relative, inside)
			}
		}
		// The folder a rpp is not in.
		if relative, inside := RelativeTo(filepath.Join(p.Start), p.RPP); inside && !strings.HasPrefix(p.Dir, p.Start) {
			t.Errorf("%q is not inside the starting folder %q but RelativeTo said %q", p.RPP, p.Start, relative)
		}
	})
}

func TestPathGuardBuildDawLinkTexts(t *testing.T) {
	for _, text := range pathfixtures.Texts() {
		t.Run(text.Name, func(t *testing.T) {
			link, err := BuildDawLink(text.Path, text.Path)
			if text.Path == "" {
				if err == nil {
					t.Fatalf("linked an empty path as %+v", link)
				}
				return
			}
			if err == nil && !filepath.IsAbs(link.Absolute) {
				t.Fatalf("absolute link %q is not absolute", link.Absolute)
			}
			if resolved, ok := link.Resolve(text.Path); ok {
				t.Fatalf("a path nothing exists at resolved to %q", resolved)
			}
			// RelativeTo of two arbitrary strings never panics and never says "inside" for an unrelated folder.
			if relative, inside := RelativeTo(`Z:\Nowhere\Else`, text.Path); inside {
				t.Fatalf("%q reported inside Z:\\Nowhere\\Else as %q", text.Path, relative)
			}
		})
	}
}

func TestPathGuardEnsureDawLink(t *testing.T) {
	pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
		link, changed, err := EnsureDawLink(p.Dir, nil, "")
		switch {
		case p.Usable:
			if err != nil || !changed || !sameFileOnDisk(t, link.Absolute, p.RPP) {
				t.Fatalf("the sole rpp in %q was not adopted: %+v changed=%v err=%v", p.Dir, link, changed, err)
			}
			// The legacy selected rpp, in any spelling, is adopted.
			for _, alias := range p.Aliases {
				adopted, _, err := EnsureDawLink(p.Dir, nil, alias.RPP)
				if err != nil || !sameFileOnDisk(t, adopted.Absolute, p.RPP) {
					t.Errorf("alias %q: legacy rpp %q not adopted: %+v %v", alias.Name, alias.RPP, adopted, err)
				}
			}
		case p.Dir == "" || p.Class == pathfixtures.Missing || p.Class == pathfixtures.FileForFolder:
			if err == nil {
				t.Fatalf("a folder that is not there (%q) was read as holding no rpp: %+v", p.Dir, link)
			}
		case p.Class == pathfixtures.FolderForFile:
			// A folder named Show.rpp is not a project file.
			if err != nil || changed || link.Absolute != "" {
				t.Fatalf("a folder named like an rpp was adopted: %+v changed=%v err=%v", link, changed, err)
			}
		}
	})
}

func TestPathGuardManifestLoadSave(t *testing.T) {
	pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
		loaded, ok, err := Load(nil, p.Dir)
		if err != nil {
			t.Fatalf("Load(%q): %v", p.Dir, err)
		}
		if ok || loaded != nil {
			t.Fatalf("Load(%q) found a manifest in a folder that has none: %+v", p.Dir, loaded)
		}
		manifest := New("Café 朗読 📚 كتاب", fixedNow())
		saveErr := manifest.Save(p.Dir)
		switch {
		case p.Dir == "":
			if saveErr == nil {
				t.Fatal("saved a manifest into the working directory for an empty project folder")
			}
			if _, err := os.Stat("narration-utils"); err == nil {
				t.Fatal("an empty project folder wrote narration-utils/ into the working directory")
			}
			return
		case p.Class == pathfixtures.FileForFolder:
			if saveErr == nil {
				t.Fatal("saved a manifest inside a file")
			}
			return
		case p.DirReadOnly:
			if saveErr == nil {
				t.Fatal("saved a manifest into a read-only folder")
			}
			if _, err := os.Stat(Path(p.Dir) + ".tmp"); err == nil {
				t.Fatal("a refused save left a .tmp file behind")
			}
			return
		}
		if saveErr != nil {
			t.Fatalf("Save(%q): %v", p.Dir, saveErr)
		}
		got, ok, err := Load(nil, p.Dir)
		if err != nil || !ok || got.Name != manifest.Name {
			t.Fatalf("Load after Save: %+v %v %v", got, ok, err)
		}
		for _, alias := range p.Aliases {
			if got, ok, err := Load(nil, alias.Dir); err != nil || !ok || got.Name != manifest.Name {
				t.Errorf("alias %q: Load(%q) = %+v %v %v", alias.Name, alias.Dir, got, ok, err)
			}
		}
	})
}

// The link keeps the name the file has on disk, whatever case the caller spelled; an exact match always wins, and a name that
// is not there is kept as given.
func TestPathGuardOnDiskCase(t *testing.T) {
	folder := t.TempDir()
	if err := os.MkdirAll(filepath.Join(folder, "Sub Folder"), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Show.rpp", filepath.Join("Sub Folder", "Deep.rpp"), "exact.rpp", "EXACT.rpp"} {
		if err := os.WriteFile(filepath.Join(folder, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	cases := []struct{ in, want string }{
		{"SHOW.RPP", "Show.rpp"},
		{"Show.rpp", "Show.rpp"},
		{filepath.Join("SUB FOLDER", "DEEP.RPP"), filepath.Join("Sub Folder", "Deep.rpp")},
		{"Missing.rpp", "Missing.rpp"},
		{filepath.Join("Nope", "Show.rpp"), filepath.Join("Nope", "Show.rpp")},
	}
	// Two files that differ only by case exist only where names are case-sensitive; on Windows the second write is the first file.
	entries, err := os.ReadDir(folder)
	if err != nil {
		t.Fatal(err)
	}
	pair := 0
	for _, entry := range entries {
		if strings.EqualFold(entry.Name(), "exact.rpp") {
			pair++
		}
	}
	if pair == 2 {
		cases = append(cases, struct{ in, want string }{"EXACT.rpp", "EXACT.rpp"}, struct{ in, want string }{"exact.rpp", "exact.rpp"})
	}
	for _, tc := range cases {
		if got := onDiskCase(folder, tc.in); got != tc.want {
			t.Errorf("onDiskCase(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestPathGuardValidateName(t *testing.T) {
	for _, fixture := range pathfixtures.Names() {
		t.Run(fixture.Name, func(t *testing.T) {
			err := ValidateName(strings.TrimSpace(fixture.Value))
			if fixture.Valid && err != nil {
				t.Fatalf("ValidateName(%q) refused a name a narrator may use: %v", fixture.Value, err)
			}
			if !fixture.Valid && err == nil {
				t.Fatalf("ValidateName(%q) accepted a name Windows cannot make a folder of", fixture.Value)
			}
		})
	}
}

func TestPathGuardResolveAndEnsureDir(t *testing.T) {
	for _, text := range pathfixtures.Texts() {
		t.Run(text.Name, func(t *testing.T) {
			dir, err := ResolveDir(text.Path)
			if err != nil {
				t.Fatal(err)
			}
			if text.Path != "" && dir != text.Path {
				t.Fatalf("ResolveDir(%q) = %q, want the override unchanged", text.Path, dir)
			}
			if text.Path == "" && dir == "" {
				t.Fatal("ResolveDir with no override returned an empty directory")
			}
		})
	}
	t.Run("EnsureDir", func(t *testing.T) {
		pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
			err := EnsureDir(p.Dir)
			switch {
			case p.Dir == "" || p.Class == pathfixtures.FileForFolder:
				if err == nil {
					t.Fatalf("EnsureDir(%q) said a folder exists where there is none", p.Dir)
				}
			case p.DirReadOnly:
				// It already exists, so there is nothing to create and no error.
				if err != nil {
					t.Fatal(err)
				}
			default:
				if err != nil {
					t.Fatal(err)
				}
				if info, statErr := os.Stat(p.Dir); statErr != nil || !info.IsDir() {
					t.Fatalf("EnsureDir(%q) left no folder: %v", p.Dir, statErr)
				}
			}
		})
	})
}
