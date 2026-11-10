package tracks

import (
	"reflect"
	"testing"
)

// testdata/reaper-nested-voice-folders.rpp was saved by REAPER 7.82 (scripts/ci/real-reaper, scenario nested_voice_folders, #3232):
// Chapter 3 > [Narrator > [Main, Aside], Veyra], then a flat Chapter 4. The takes sit only on the leaves, Main, Aside and Veyra.
func TestRealREAPERNestedVoiceFoldersKeepEveryLeafsItemsUnderTheChapterFolder(t *testing.T) {
	project, err := Parse("testdata/reaper-nested-voice-folders.rpp")
	if err != nil {
		t.Fatal(err)
	}
	var depths []int
	for _, track := range project.Tracks {
		depths = append(depths, track.Depth)
	}
	if want := []int{0, 1, 2, 2, 1, 0}; !reflect.DeepEqual(depths, want) {
		t.Fatalf("depths %v, want %v", depths, want)
	}
	count := func(name string) int {
		for _, track := range project.Tracks {
			if track.Name == name {
				members, _ := project.WithDescendants(track.GUID)
				n := 0
				for _, member := range members {
					n += len(member.Items)
				}
				return n
			}
		}
		return -1
	}
	for name, want := range map[string]int{"Chapter 3": 3, "Narrator": 2, "Veyra": 1, "Chapter 4": 0} {
		if got := count(name); got != want {
			t.Errorf("%s: %d items through the folder, want %d", name, got, want)
		}
	}
}
