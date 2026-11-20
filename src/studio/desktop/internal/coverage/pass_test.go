package coverage

import (
	"reflect"
	"testing"
)

// A pass over a book's chapters loads the manuscript once and lists the ledger once, however many chapters it answers, and
// each answer is the one a read of that chapter alone gives (issue 3801).
func TestAPassReadsTheManuscriptAndTheLedgerOnceAndAnswersAsSingleReadsDo(t *testing.T) {
	service, _, release := twoChapters(t)
	release()
	for _, chapter := range []string{testChapter, testSecondChapter} {
		run(t, service, request(chapter, 2))
	}
	loads := 0
	load := service.config.LoadManuscript
	service.config.LoadManuscript = func() (map[string]any, error) {
		loads++
		return load()
	}
	project, projectFile, err := service.savedProject()
	if err != nil {
		t.Fatal(err)
	}
	// One never checked, one not in the manuscript, and a credits row, beside the two checked chapters.
	chapters := []string{testChapter, testSecondChapter, "c-0002", "c-9999", "credits-opening"}
	want := map[string]ChapterResult{}
	for _, chapter := range chapters {
		if want[chapter], err = service.ResultIn(project, projectFile, chapter, DefaultAlignmentParams); err != nil {
			t.Fatal(err)
		}
	}
	if current := want[testChapter]; !current.Current() || !want[testSecondChapter].Current() {
		t.Fatalf("the fixture's checked chapters are not current: %+v", current)
	}

	loads = 0
	listings, _ := service.LedgerReads()
	linkReads := service.mapping.Reads()
	pass := service.Pass()
	for _, chapter := range chapters {
		got, err := pass.ResultIn(project, projectFile, chapter, DefaultAlignmentParams)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, want[chapter]) {
			t.Errorf("%s: the pass answered\n%+v\na single read answers\n%+v", chapter, got, want[chapter])
		}
	}
	// The credits row is rendered, not read from the pass's manuscript: it loads the manuscript once more for its document id.
	if loads != 2 {
		t.Errorf("the pass loaded the manuscript %d times for %d chapters, want 2 (the pass, the credits row)", loads, len(chapters))
	}
	// The credits row is refused before its links are asked for (no credits text in this fixture), so the pass's one read is all.
	if got := service.mapping.Reads() - linkReads; got != 1 {
		t.Errorf("the pass read the chapter links %d times for %d chapters, want 1", got, len(chapters))
	}
	if after, _ := service.LedgerReads(); after-listings != 1 {
		t.Errorf("the pass listed the ledger %d times, want 1", after-listings)
	}
}

// A book with no manuscript still answers each chapter of a pass, with the reason a single read gives.
func TestAPassWithNoManuscriptAnswersEachChapterWithItsReason(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{present: 8})
	service.config.LoadManuscript = nil
	project, projectFile, err := service.savedProject()
	if err != nil {
		t.Fatal(err)
	}
	got, err := service.Pass().ResultIn(project, projectFile, testChapter, DefaultAlignmentParams)
	if err != nil || len(got.Reasons) != 1 || got.Reasons[0] != string(ReasonNoManuscript) {
		t.Fatalf("result = %+v, %v; want never with %s", got, err, ReasonNoManuscript)
	}
}
