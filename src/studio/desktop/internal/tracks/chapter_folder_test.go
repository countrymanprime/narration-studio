package tracks

import "testing"

// A chapter folder with two voices (and a following chapter) as the saved project holds it.
func voiceProject() Project {
	return Project{Tracks: []Track{
		{GUID: "F", Name: "Chapter 1", IsFolder: true},
		{GUID: "N", Name: "Narrator", Depth: 1, Items: []Item{{GUID: "n1", Position: 0, Length: 30, TakeGUID: "tn1"}}},
		{GUID: "H", Name: "Hero", Depth: 1, Items: []Item{{GUID: "h1", Position: 30, Length: 20, TakeGUID: "th1"}, {GUID: "h2", Position: 60, Length: 5, Muted: true}}},
		{GUID: "C2", Name: "Chapter 2", Items: []Item{{GUID: "c2", Position: 500, Length: 9}}},
	}}
}

func TestChapterRecordedEndIsTheLatestItemEndOnAnyVoiceOfTheFolder(t *testing.T) {
	end, ok := voiceProject().ChapterRecordedEnd("F", nil)
	if !ok || end.ItemGUID != "h1" || !near(end.ProjectTime, 50) {
		t.Fatalf("end = %+v, %v; want the hero's item ending at 50 (not the muted one, not the next chapter)", end, ok)
	}
}

func TestChapterRecordedEndOfAPlainTrackIsItsOwn(t *testing.T) {
	end, ok := voiceProject().ChapterRecordedEnd("C2", nil)
	if !ok || end.ItemGUID != "c2" {
		t.Fatalf("end = %+v, %v", end, ok)
	}
}

func TestChapterRecordedEndOfAnEmptyOrMissingFolderIsNothing(t *testing.T) {
	project := Project{Tracks: []Track{{GUID: "F", IsFolder: true}, {GUID: "N", Depth: 1}}}
	if _, ok := project.ChapterRecordedEnd("F", nil); ok {
		t.Fatal("an empty folder has no recorded end")
	}
	if _, ok := voiceProject().ChapterRecordedEnd("nope", nil); ok {
		t.Fatal("a track the project does not have has no recorded end")
	}
}

func TestChapterRecordedSecondsIsTheUnionOverTheWholeFolder(t *testing.T) {
	if got := voiceProject().ChapterRecordedSeconds("F"); !near(got, 50) {
		t.Fatalf("seconds = %v, want 30 + 20 (the muted item and the next chapter excluded)", got)
	}
	overlapping := voiceProject()
	overlapping.Tracks[2].Items[0].Position = 20 // overlaps the narrator's 0-30 by 10
	if got := overlapping.ChapterRecordedSeconds("F"); !near(got, 40) {
		t.Fatalf("seconds = %v, want overlapping voices counted once (0-40)", got)
	}
	if got := voiceProject().ChapterRecordedSeconds("C2"); !near(got, 9) {
		t.Fatalf("seconds = %v for a plain track", got)
	}
}
