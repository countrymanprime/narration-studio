package tracks

import (
	"reflect"
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
