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

// The time guard of #3272, as a ratio on one machine: resolving 44 chapters against 64 tracks takes about 0.9 s without the Resolver (the
// package-level ForChapter once per chapter) and a few tens of milliseconds with it, so the Resolver must be at least 5 times faster than that
// loop on the same run. A slow or busy runner slows both sides alike and passes; losing the Resolver's one match per name does not.
// TestResolverMatchesEachNameOnceNotOncePerChapter is the exact guard; this one catches a cost that is not a title match.
func TestResolvingAWholeBookStaysFast(t *testing.T) {
	chapters, project := bookProject(44, 20)
	// Alternate the two so a burst of load on the machine lands on both.
	var resolved, perChapter []time.Duration
	for range 3 {
		start := time.Now()
		resolver := NewResolver(chapters, project)
		for _, chapter := range chapters {
			if _, err := resolver.ForChapter(chapter.ID, nil); err != nil {
				t.Fatal(err)
			}
		}
		resolved = append(resolved, time.Since(start))
		start = time.Now()
		for _, chapter := range chapters {
			if _, err := ForChapter(chapter.ID, chapters, project, nil); err != nil {
				t.Fatal(err)
			}
		}
		perChapter = append(perChapter, time.Since(start))
	}
	slices.Sort(resolved)
	slices.Sort(perChapter)
	with, without := resolved[1], perChapter[1]
	t.Logf("Resolver %v, ForChapter per chapter %v (%.1fx)", with, without, float64(without)/float64(with))
	if with*5 > without {
		t.Fatalf("resolving 44 chapters against 64 tracks with the Resolver took %v (of %v), per-chapter ForChapter %v (of %v): want at least 5x faster", with, resolved, without, perChapter)
	}
}
