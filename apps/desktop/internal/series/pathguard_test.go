package series

import (
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/pathfixtures"
)

// The path guard (definition of done, rule 1): a series' member project paths run the shared fixture set in
// internal/pathfixtures.

func TestPathGuardMembersAndForProject(t *testing.T) {
	pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
		store := New(filepath.Join(t.TempDir(), "series.json"))
		saved, err := store.Save(Series{Name: "Café 朗読 📚 كتاب", MemberProjectPaths: []string{p.Dir, "  ", ""}})
		if err != nil {
			t.Fatal(err)
		}
		if p.Dir == "" {
			if len(saved.MemberProjectPaths) != 0 {
				t.Fatalf("an empty path became a member: %#v", saved.MemberProjectPaths)
			}
			if _, ok, err := store.ForProject(""); err != nil || ok {
				t.Fatalf("an empty project belongs to a series: %v %v", ok, err)
			}
			return
		}
		if len(saved.MemberProjectPaths) != 1 {
			t.Fatalf("members = %#v, want the one folder", saved.MemberProjectPaths)
		}
		if !filepath.IsAbs(saved.MemberProjectPaths[0]) && filepath.IsAbs(p.Dir) {
			t.Errorf("an absolute folder %q was stored as %q", p.Dir, saved.MemberProjectPaths[0])
		}
		if _, ok, err := store.ForProject(p.Dir); err != nil || !ok {
			t.Fatalf("ForProject(%q) did not find the series it is a member of: %v %v", p.Dir, ok, err)
		}
		for _, alias := range p.Aliases {
			if _, ok, err := store.ForProject(alias.Dir); err != nil || !ok {
				t.Errorf("alias %q: ForProject(%q) did not find the series %q is a member of: %v %v", alias.Name, alias.Dir, p.Dir, ok, err)
			}
			again, err := store.Save(Series{ID: saved.ID, Name: saved.Name, MemberProjectPaths: []string{p.Dir, alias.Dir}})
			if err != nil {
				t.Fatal(err)
			}
			if len(again.MemberProjectPaths) != 1 {
				t.Errorf("alias %q: the same folder is a member %d times: %#v", alias.Name, len(again.MemberProjectPaths), again.MemberProjectPaths)
			}
		}
		if _, ok, err := store.ForProject(filepath.Join(p.Start, "Another Project")); err != nil || ok {
			t.Errorf("a folder that is no member belongs to a series: %v %v", ok, err)
		}
	})
}

func TestPathGuardTextsNeverBreakTheSeries(t *testing.T) {
	for _, text := range pathfixtures.Texts() {
		t.Run(text.Name, func(t *testing.T) {
			store := New(filepath.Join(t.TempDir(), "series.json"))
			saved, err := store.Save(Series{Name: "S", MemberProjectPaths: []string{text.Path}})
			if err != nil {
				t.Fatal(err)
			}
			if _, _, err := store.ForProject(text.Path); err != nil {
				t.Fatalf("ForProject(%q): %v", text.Path, err)
			}
			if text.Path != "" && len(saved.MemberProjectPaths) > 1 {
				t.Fatalf("one path became %#v", saved.MemberProjectPaths)
			}
		})
	}
}
