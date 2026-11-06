package tracks

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func names(list []Track) []string {
	out := make([]string, 0, len(list))
	for _, track := range list {
		out = append(out, track.Name)
	}
	return out
}

func voicesProject() Project {
	return Project{Tracks: []Track{
		{GUID: "{C2}", Name: "Chapter 2"},
		{GUID: "{C3}", Name: "Chapter 3", IsFolder: true},
		{GUID: "{N}", Name: "Narrator", Depth: 1},
		{GUID: "{CROWD}", Name: "Crowd", Depth: 1, IsFolder: true},
		{GUID: "{G}", Name: "Guard", Depth: 2},
		{GUID: "{V}", Name: "Veyra", Depth: 1},
		{GUID: "{C4}", Name: "Chapter 4"},
	}}
}

func TestWithDescendantsListsAFoldersTracksAndStopsWhereItCloses(t *testing.T) {
	got, ok := voicesProject().WithDescendants("{C3}")
	if !ok || !reflect.DeepEqual(names(got), []string{"Chapter 3", "Narrator", "Crowd", "Guard", "Veyra"}) {
		t.Fatalf("got %v, %v", names(got), ok)
	}
}

func TestWithDescendantsOfANestedFolderStopsAtItsOwnClose(t *testing.T) {
	got, _ := voicesProject().WithDescendants("{CROWD}")
	if !reflect.DeepEqual(names(got), []string{"Crowd", "Guard"}) {
		t.Fatalf("got %v", names(got))
	}
}

func TestWithDescendantsOfATrackThatIsNotAFolderIsTheTrackAlone(t *testing.T) {
	got, ok := voicesProject().WithDescendants("{C2}")
	if !ok || !reflect.DeepEqual(names(got), []string{"Chapter 2"}) {
		t.Fatalf("got %v, %v", names(got), ok)
	}
}

func TestWithDescendantsOfAMissingTrackIsFalse(t *testing.T) {
	if got, ok := voicesProject().WithDescendants("{GONE}"); ok || got != nil {
		t.Fatalf("got %v, %v", got, ok)
	}
}

func TestWithDescendantsOfTheLastFolderRunsToTheEnd(t *testing.T) {
	project := Project{Tracks: []Track{{GUID: "{F}", Name: "F", IsFolder: true}, {GUID: "{A}", Name: "A", Depth: 1}}}
	if got, _ := project.WithDescendants("{F}"); !reflect.DeepEqual(names(got), []string{"F", "A"}) {
		t.Fatalf("got %v", names(got))
	}
}

// parseLayout writes an .rpp with one track per (name, ISBUS line) and parses it, so the boundary cases below go through the same
// running sum of folder depths the app reads (#2251: a chapter's voices are only the tracks inside its own folder).
func parseLayout(t *testing.T, layout [][2]string) Project {
	t.Helper()
	var body strings.Builder
	body.WriteString("<REAPER_PROJECT 0.1 \"7.82/linux-x86_64\" 0\n")
	for i, row := range layout {
		fmt.Fprintf(&body, "  <TRACK {%08X-0000-4000-8000-000000000000}\n    NAME %q\n    %s\n  >\n", i+1, row[0], row[1])
	}
	path := filepath.Join(t.TempDir(), "p.rpp")
	if err := os.WriteFile(path, []byte(body.String()+">\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	project, err := Parse(path)
	if err != nil {
		t.Fatal(err)
	}
	return project
}

func descendantsOf(t *testing.T, project Project, name string) []string {
	t.Helper()
	for _, track := range project.Tracks {
		if track.Name == name {
			got, _ := project.WithDescendants(track.GUID)
			return names(got)
		}
	}
	t.Fatalf("no track %q", name)
	return nil
}

func TestWithDescendantsNeverReachesASiblingChapterFolder(t *testing.T) {
	project := parseLayout(t, [][2]string{
		{"Chapter 3", "ISBUS 1 1"},
		{"Narrator", "ISBUS 0 0"},
		{"Veyra", "ISBUS 2 -1"},
		{"Chapter 4", "ISBUS 1 1"},
		{"C4 Narrator", "ISBUS 2 -1"},
		{"Chapter 5", "ISBUS 0 0"},
	})
	if got := descendantsOf(t, project, "Chapter 3"); !reflect.DeepEqual(got, []string{"Chapter 3", "Narrator", "Veyra"}) {
		t.Fatalf("Chapter 3: %v", got)
	}
	if got := descendantsOf(t, project, "Chapter 4"); !reflect.DeepEqual(got, []string{"Chapter 4", "C4 Narrator"}) {
		t.Fatalf("Chapter 4: %v", got)
	}
}

func TestWithDescendantsStopsAtAFolderClosingSeveralLevelsAtOnce(t *testing.T) {
	project := parseLayout(t, [][2]string{
		{"Book", "ISBUS 1 1"},
		{"Chapter 3", "ISBUS 1 1"},
		{"Narrator", "ISBUS 2 -2"},
		{"Chapter 4", "ISBUS 1 1"},
		{"C4 Narrator", "ISBUS 2 -1"},
	})
	if got := descendantsOf(t, project, "Chapter 3"); !reflect.DeepEqual(got, []string{"Chapter 3", "Narrator"}) {
		t.Fatalf("Chapter 3: %v", got)
	}
	if got := descendantsOf(t, project, "Book"); !reflect.DeepEqual(got, []string{"Book", "Chapter 3", "Narrator"}) {
		t.Fatalf("Book: %v", got)
	}
}

func TestAFlatChapterDirectlyAfterAFolderIsNotOneOfItsVoices(t *testing.T) {
	project := parseLayout(t, [][2]string{
		{"Chapter 3", "ISBUS 1 1"},
		{"Narrator", "ISBUS 2 -1"},
		{"Chapter 4", "ISBUS 0 0"},
	})
	if got := descendantsOf(t, project, "Chapter 3"); !reflect.DeepEqual(got, []string{"Chapter 3", "Narrator"}) {
		t.Fatalf("Chapter 3: %v", got)
	}
	if got := descendantsOf(t, project, "Chapter 4"); !reflect.DeepEqual(got, []string{"Chapter 4"}) {
		t.Fatalf("Chapter 4: %v", got)
	}
}

// A project REAPER saved with the last folder open at the end reads every later track as inside it: that is what REAPER shows too, which
// is why the bridge closes such a folder before it appends a track (core.append_track).
func TestAFolderLeftOpenAtTheEndHoldsEveryTrackAfterIt(t *testing.T) {
	project := parseLayout(t, [][2]string{
		{"Chapter 3", "ISBUS 1 1"},
		{"Narrator", "ISBUS 0 0"},
		{"Chapter 4", "ISBUS 0 0"},
	})
	if got := descendantsOf(t, project, "Chapter 3"); !reflect.DeepEqual(got, []string{"Chapter 3", "Narrator", "Chapter 4"}) {
		t.Fatalf("Chapter 3: %v", got)
	}
}
