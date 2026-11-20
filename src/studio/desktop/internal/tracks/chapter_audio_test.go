package tracks

import "testing"

// A chapter folder holding a narrator and a music bed (a long item), as the saved project holds it (#3557).
func bedProject() Project {
	return Project{Tracks: []Track{
		{GUID: "F", Name: "Chapter 1", IsFolder: true},
		{GUID: "N", Name: "Narrator", Depth: 1, Items: []Item{{GUID: "n1", Position: 0, Length: 30, TakeGUID: "tn1"}}},
		{GUID: "B", Name: "Music bed", Depth: 1, Items: []Item{{GUID: "b1", Position: 0, Length: 600, TakeGUID: "tb1"}}},
		{GUID: "C2", Name: "Chapter 2", Items: []Item{{GUID: "c2", Position: 700, Length: 9}}},
	}}
}

func skipping(guids ...string) func(string) bool {
	return func(guid string) bool {
		for _, g := range guids {
			if g == guid {
				return true
			}
		}
		return false
	}
}

func guidsOf(members []Track) []string {
	var out []string
	for _, member := range members {
		out = append(out, member.GUID)
	}
	return out
}

func TestWithoutARuleTheChapterAudioIsEveryTrackInsideTheFolder(t *testing.T) {
	members, ok := bedProject().ChapterMembers("F")
	if got := guidsOf(members); !ok || len(got) != 3 {
		t.Fatalf("members = %v, %v; want the folder and both children", got, ok)
	}
	if got := bedProject().ChapterRecordedSeconds("F"); !near(got, 600) {
		t.Fatalf("seconds = %v: with no rule the bed still counts", got)
	}
}

func TestAMarkedChildIsNotTheChaptersAudio(t *testing.T) {
	project := bedProject().WithAudioSkip(skipping("B"))
	members, ok := project.ChapterMembers("F")
	if got := guidsOf(members); !ok || len(got) != 2 || got[0] != "F" || got[1] != "N" {
		t.Fatalf("members = %v, %v; want the folder and the narrator only", got, ok)
	}
	if got := project.ChapterRecordedSeconds("F"); !near(got, 30) {
		t.Fatalf("seconds = %v, want the narrator's 30 and not the bed's 600", got)
	}
	end, found := project.ChapterRecordedEnd("F", nil)
	if !found || end.ItemGUID != "n1" || !near(end.ProjectTime, 30) {
		t.Fatalf("end = %+v, %v; want the narrator's item ending at 30, not the bed's at 600", end, found)
	}
}

func TestTheRuleLeavesTheProjectAndItsOtherReadersAlone(t *testing.T) {
	original := bedProject()
	ruled := original.WithAudioSkip(skipping("B"))
	if len(ruled.Tracks) != 4 {
		t.Fatalf("the rule removed a track: %d tracks", len(ruled.Tracks))
	}
	if members, _ := original.WithDescendants("F"); len(members) != 3 {
		t.Fatalf("WithDescendants must still hold the marked child: %v", guidsOf(members))
	}
	if members, _ := ruled.WithDescendants("F"); len(members) != 3 {
		t.Fatalf("WithDescendants on a ruled project must still hold the marked child: %v", guidsOf(members))
	}
	if got := original.ChapterRecordedSeconds("F"); !near(got, 600) {
		t.Fatalf("the original project was changed by the copy: %v", got)
	}
}

func TestAMarkedFolderTakesItsWholeSubtreeOutOfTheChapterAudio(t *testing.T) {
	project := Project{Tracks: []Track{
		{GUID: "F", IsFolder: true},
		{GUID: "N", Depth: 1, Items: []Item{{GUID: "n1", Position: 0, Length: 30}}},
		{GUID: "M", Depth: 1, IsFolder: true},
		{GUID: "M1", Depth: 2, Items: []Item{{GUID: "m1", Position: 0, Length: 500}}},
		{GUID: "M2", Depth: 2, Items: []Item{{GUID: "m2", Position: 0, Length: 400}}},
		{GUID: "H", Depth: 1, Items: []Item{{GUID: "h1", Position: 30, Length: 20}}},
	}}.WithAudioSkip(skipping("M"))
	members, _ := project.ChapterMembers("F")
	if got := guidsOf(members); len(got) != 3 || got[1] != "N" || got[2] != "H" {
		t.Fatalf("members = %v, want the folder, the narrator and the hero (the sibling after the marked folder stays)", got)
	}
	if got := project.ChapterRecordedSeconds("F"); !near(got, 50) {
		t.Fatalf("seconds = %v, want 30 + 20", got)
	}
}

func TestTheChaptersOwnTrackIsNeverSkipped(t *testing.T) {
	// A mark on the very track a chapter is linked to cannot make that track missing, nor empty a plain-track chapter.
	project := bedProject().WithAudioSkip(skipping("C2", "F"))
	if members, ok := project.ChapterMembers("C2"); !ok || len(members) != 1 {
		t.Fatalf("members = %v, %v; want the chapter's own track", guidsOf(members), ok)
	}
	if got := project.ChapterRecordedSeconds("C2"); !near(got, 9) {
		t.Fatalf("seconds = %v, want the plain track's own 9", got)
	}
	if _, ok := project.ChapterMembers("nope"); ok {
		t.Fatal("a track the project does not have is still not found")
	}
}
