package recents

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/pathfixtures"
)

// The path guard (definition of done, rule 1): the recent-projects list runs the shared fixture set in internal/pathfixtures.

func TestPathGuardTouchListRemove(t *testing.T) {
	pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
		store := New(filepath.Join(t.TempDir(), "recent-projects.json"))
		err := store.Touch(p.Dir, "Café 朗読 📚 كتاب")
		if p.Dir == "" {
			if err == nil {
				t.Fatal("an empty path was recorded as a recent project (it reads as the working directory)")
			}
			return
		}
		if err != nil {
			t.Fatalf("Touch(%q): %v", p.Dir, err)
		}
		entries, err := store.List()
		if err != nil {
			t.Fatal(err)
		}
		if !p.Usable {
			// A path that is missing or is a file is not a project folder and must not be offered as one.
			if info, statErr := os.Stat(p.Dir); statErr != nil || !info.IsDir() {
				if len(entries) != 0 {
					t.Fatalf("offered %#v though %q is not a folder", entries, p.Dir)
				}
			}
			return
		}
		if len(entries) != 1 || entries[0].Name != "Café 朗読 📚 كتاب" {
			t.Fatalf("entries after Touch(%q) = %#v", p.Dir, entries)
		}
		if !filepath.IsAbs(entries[0].Path) {
			t.Errorf("the recorded path %q is not absolute, so it names a different folder once the working directory changes", entries[0].Path)
		}
		if info, statErr := os.Stat(entries[0].Path); statErr != nil || !info.IsDir() {
			t.Errorf("the recorded path %q is not the folder: %v", entries[0].Path, statErr)
		}
		// Every other spelling of the same folder is the same recent project, not a second one.
		for _, alias := range p.Aliases {
			if err := store.Touch(alias.Dir, "Spelled "+alias.Name); err != nil {
				t.Fatalf("alias %q: %v", alias.Name, err)
			}
			entries, err := store.List()
			if err != nil {
				t.Fatal(err)
			}
			if len(entries) != 1 {
				t.Errorf("alias %q (%q): the folder %q is listed %d times: %#v", alias.Name, alias.Dir, p.Dir, len(entries), entries)
			}
		}
		// Remove by any spelling removes it.
		spellings := []string{p.Dir}
		for _, alias := range p.Aliases {
			spellings = append(spellings, alias.Dir)
		}
		for _, spelling := range spellings {
			if err := store.Touch(p.Dir, "Again"); err != nil {
				t.Fatal(err)
			}
			if err := store.Remove(spelling); err != nil {
				t.Fatalf("Remove(%q): %v", spelling, err)
			}
			if entries, err := store.List(); err != nil || len(entries) != 0 {
				t.Errorf("Remove(%q) left %#v (%v)", spelling, entries, err)
			}
		}
	})
}

func TestPathGuardTextsNeverBreakTheList(t *testing.T) {
	for _, text := range pathfixtures.Texts() {
		t.Run(text.Name, func(t *testing.T) {
			store := New(filepath.Join(t.TempDir(), "recent-projects.json"))
			_ = store.Touch(text.Path, "x") // may refuse; must not panic or corrupt the file
			if err := store.Remove(text.Path); err != nil {
				t.Fatalf("Remove(%q): %v", text.Path, err)
			}
			entries, err := store.List()
			if err != nil {
				t.Fatalf("List after %q: %v", text.Path, err)
			}
			if len(entries) != 0 {
				t.Fatalf("%q is no folder here, yet is listed: %#v", text.Path, entries)
			}
		})
	}
}

// Windows is case-insensitive, so the list holds a folder once however the narrator typed it. The entries are compared as
// strings, which holds on every OS; List's existence check is bypassed by reading the stored file.
func TestPathGuardCaseDiffersIsOneEntry(t *testing.T) {
	store := New(filepath.Join(t.TempDir(), "recent-projects.json"))
	dir := filepath.Join(t.TempDir(), "Case Book")
	if err := store.Touch(dir, "First"); err != nil {
		t.Fatal(err)
	}
	if err := store.Touch(filepath.Join(filepath.Dir(dir), strings.ToUpper(filepath.Base(dir))), "Second"); err != nil {
		t.Fatal(err)
	}
	stored, err := store.readLocked()
	if err != nil {
		t.Fatal(err)
	}
	if len(stored) != 1 || stored[0].Name != "Second" {
		t.Fatalf("stored entries = %#v, want the one folder once, as last spelled", stored)
	}
}
