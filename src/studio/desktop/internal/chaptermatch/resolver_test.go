package chaptermatch

import (
	"fmt"
	"reflect"
	"slices"
	"testing"
	"time"

	"desktop/internal/tracks"
)

// bookProject is a 17 hour book's project: a chapter track for each of n chapters, `extra` other tracks and a region for every fifth chapter.
func bookProject(n, extra int) ([]Chapter, tracks.Project) {
	chapters := make([]Chapter, n)
	project := tracks.Project{}
	for i := range n {
		title := fmt.Sprintf("Chapter %d", i+1)
		chapters[i] = Chapter{ID: fmt.Sprintf("c-%04d", i+1), Title: title}
		project.Tracks = append(project.Tracks, tracks.Track{GUID: fmt.Sprintf("{T-%04d}", i+1), Index: i, Name: title})
		if i%5 == 0 {
			project.Regions = append(project.Regions, tracks.Region{Index: i, Name: title, Start: float64(i) * 10, End: float64(i)*10 + 9})
		}
	}
	for i := range extra {
		project.Tracks = append(project.Tracks, tracks.Track{GUID: fmt.Sprintf("{X-%04d}", i+1), Index: n + i, Name: fmt.Sprintf("Extra %d", i+1)})
	}
	return chapters, project
}

func TestResolverAnswersEveryChapterAsForChapterDoes(t *testing.T) {
	chapters, project := bookProject(44, 20)
	confirmed := map[string]string{"{T-0003}": "c-0003", "{T-0007}": "c-0001"} // one link in place, one on another chapter's track
	resolver := NewResolver(chapters, project)
	for _, chapter := range chapters {
		want, err := ForChapter(chapter.ID, chapters, project, confirmed)
		if err != nil {
			t.Fatal(err)
		}
		got, err := resolver.ForChapter(chapter.ID, confirmed)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("%s: Resolver = %+v, %v; ForChapter = %+v", chapter.ID, got, err, want)
		}
	}
	if _, err := resolver.ForChapter("not-a-chapter", confirmed); err == nil {
		t.Fatal("a chapter the manuscript does not have resolved")
	}
}

// Work done, not time: resolving every chapter matches each track and region name against the titles once, whatever the chapter count.
func TestResolverMatchesEachNameOnceNotOncePerChapter(t *testing.T) {
	chapters, project := bookProject(44, 20)
	resolver := NewResolver(chapters, project)
	before := TitleMatchCalls()
	for _, chapter := range chapters {
		if _, err := resolver.ForChapter(chapter.ID, nil); err != nil {
			t.Fatal(err)
		}
	}
	names := map[string]bool{}
	for _, track := range project.Tracks {
		names[track.Name] = true
	}
	for _, region := range project.Regions {
		names[region.Name] = true
	}
	if calls := TitleMatchCalls() - before; calls != int64(len(names)) {
		t.Fatalf("%d title matches for %d distinct names (%d chapters, %d tracks, %d regions), want one each", calls, len(names), len(chapters), len(project.Tracks), len(project.Regions))
	}
}

// The time guard of #3272: 44 chapters against 64 tracks took about 0.9 s before the Resolver (ForChapter once per chapter) and takes a few
// tens of milliseconds with it. The median of five runs against a bound 10 times the measured one, so a slow runner passes and the old cost does not.
func TestResolvingAWholeBookStaysFast(t *testing.T) {
	chapters, project := bookProject(44, 20)
	var runs []time.Duration
	for range 5 {
		start := time.Now()
		resolver := NewResolver(chapters, project)
		for _, chapter := range chapters {
			if _, err := resolver.ForChapter(chapter.ID, nil); err != nil {
				t.Fatal(err)
			}
		}
		runs = append(runs, time.Since(start))
	}
	slices.Sort(runs)
	if median := runs[len(runs)/2]; median > 300*time.Millisecond {
		t.Fatalf("resolving 44 chapters against 64 tracks took %v (median of %v), budget 300ms", median, runs)
	}
}
