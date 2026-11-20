package coverage

import (
	"os"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"

	"desktop/internal/tracks"
)

// warmFixture is a project with two checked chapters whose summaries are gone, as a book checked before summaries
// were stored has them, and a service started afterwards.
func warmFixture(t *testing.T) (*Service, map[string]float64) {
	t.Helper()
	p := newTestProject(t)
	p.addSecondChapter()
	checked := p.service(&fakeSidecar{present: 6})
	for _, chapter := range []string{testChapter, testSecondChapter} {
		run(t, checked, request(chapter, 2))
	}
	want, _ := checked.Current(DefaultAlignmentParams)
	if len(want) != 2 {
		t.Fatalf("the fixture's two checks are not both current: %v", want)
	}
	if err := os.RemoveAll(summariesDir(p.dir)); err != nil {
		t.Fatal(err)
	}
	return p.service(&fakeSidecar{}), want
}

func notClosed() bool { return false }

// The fill rebuilds every missing summary, past the pages' decoded-result cache, and leaves the first chapter-list read
// nothing to decode: no stored result and no ledger record.
func TestTheFillLeavesTheFirstReadNothingToDecode(t *testing.T) {
	service, want := warmFixture(t)
	service.Warm(DefaultAlignmentParams, notClosed)
	if decoded, cached := decodedResults(service), cachedResults(service); decoded != 2 || cached != 0 {
		t.Fatalf("the fill decoded %d results and cached %d, want 2 and 0", decoded, cached)
	}
	_, ledgerDecodes := service.LedgerReads()
	got, _ := service.Current(DefaultAlignmentParams)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("after the fill the read answers %v, want %v", got, want)
	}
	if _, after := service.LedgerReads(); decodedResults(service) != 2 || after != ledgerDecodes {
		t.Fatalf("the read after the fill decoded %d more results and %d more ledger records, want none", decodedResults(service)-2, after-ledgerDecodes)
	}
	if entries, err := os.ReadDir(summariesDir(service.config.Project)); err != nil || len(entries) != 2 {
		t.Fatalf("the fill stored %d summaries (%v), want 2", len(entries), err)
	}
}

// A chapter-list read issued while the fill runs gives the answer it gives alone, and between them each stored result
// and each ledger record is decoded once: the two wait on the same work, they do not repeat it.
func TestAReadDuringTheFillAnswersTheSameAndDecodesNothingTwice(t *testing.T) {
	for round := 0; round < 20; round++ {
		service, want := warmFixture(t)
		var both sync.WaitGroup
		var got map[string]float64
		both.Go(func() { service.Warm(DefaultAlignmentParams, notClosed) })
		both.Go(func() { got, _ = service.Current(DefaultAlignmentParams) })
		both.Wait()
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("round %d: during the fill the read answers %v, want %v", round, got, want)
		}
		records, err := service.ledger.All()
		if err != nil {
			t.Fatal(err)
		}
		if _, decodes := service.LedgerReads(); decodedResults(service) != 2 || decodes != len(records) {
			t.Fatalf("round %d: %d results decoded for 2 chapters and %d ledger decodes for %d records", round, decodedResults(service), decodes, len(records))
		}
	}
}

// The fill stops when it is told the project was closed: nothing is rebuilt for a project nobody reads.
func TestTheFillStopsWhenTheProjectIsClosed(t *testing.T) {
	service, _ := warmFixture(t)
	service.Warm(DefaultAlignmentParams, func() bool { return true })
	if decodedResults(service) != 0 {
		t.Fatalf("a stopped fill decoded %d results", decodedResults(service))
	}
	// Stopped part way: the chapters already queued are left, and the fill still returns.
	var asked atomic.Int32
	service.Warm(DefaultAlignmentParams, func() bool { return asked.Add(1) > 2 })
	if decoded := decodedResults(service); decoded > 2 {
		t.Fatalf("a fill stopped part way decoded %d results for 2 chapters", decoded)
	}
}

// The fill of a project with nothing to fill, or that cannot be read, returns and changes nothing.
func TestTheFillOfAProjectWithNothingCheckedDoesNothing(t *testing.T) {
	p := newTestProject(t)
	unchecked := p.service(&fakeSidecar{})
	unchecked.Warm(DefaultAlignmentParams, notClosed)
	New(Config{}, nil, nil).Warm(DefaultAlignmentParams, notClosed)
	unchecked.Warm(AlignmentParams{}, notClosed)
	if listings, _ := unchecked.LedgerReads(); listings != 1 {
		t.Fatalf("an unchecked project's fills listed the ledger %d times, want once (the fill with settings that are not valid reads nothing)", listings)
	}
	if _, err := os.Stat(summariesDir(p.dir)); !os.IsNotExist(err) {
		t.Fatalf("a fill with nothing checked wrote summaries: %v", err)
	}
}

// Readers that ask for one record's summary at the same time share one rebuild.
func TestReadersOfOneMissingSummaryShareItsRebuild(t *testing.T) {
	store := &summaryStore{dir: t.TempDir()}
	var rebuilds atomic.Int32
	entered, release := make(chan struct{}), make(chan struct{})
	rebuild := func() (ResultSummary, bool) {
		if rebuilds.Add(1) == 1 {
			close(entered)
		}
		<-release
		summary := ResultSummary{RecordID: "abc", ChapterID: "c-0001"}
		store.hold(summary) // as the service's rebuild does when it stores what it built
		return summary, true
	}
	var readers sync.WaitGroup
	answers := make([]ResultSummary, 8)
	readers.Go(func() { answers[0], _ = store.build("abc", rebuild) })
	<-entered
	for i := 1; i < len(answers); i++ {
		readers.Go(func() { answers[i], _ = store.build("abc", rebuild) })
	}
	close(release)
	readers.Wait()
	for i, answer := range answers {
		if answer.ChapterID != "c-0001" {
			t.Fatalf("reader %d got %+v", i, answer)
		}
	}
	if got := rebuilds.Load(); got != 1 {
		t.Fatalf("%d rebuilds for 8 readers of one record, want 1", got)
	}
}

// A rebuild that panics has no answer to share: a reader that waited on it rebuilds for itself, and is not told the
// result is missing.
func TestAReaderWaitingOnARebuildThatPanicsRebuildsForItself(t *testing.T) {
	store := &summaryStore{dir: t.TempDir()}
	entered, release := make(chan struct{}), make(chan struct{})
	var first, second sync.WaitGroup
	first.Go(func() {
		defer func() { _ = recover() }()
		_, _ = store.build("abc", func() (ResultSummary, bool) {
			close(entered)
			<-release
			panic("the result could not be summarized")
		})
	})
	<-entered
	var got ResultSummary
	var ok bool
	second.Go(func() {
		got, ok = store.build("abc", func() (ResultSummary, bool) { return ResultSummary{RecordID: "abc", ChapterID: "c-0001"}, true })
	})
	close(release)
	first.Wait()
	second.Wait()
	if !ok || got.ChapterID != "c-0001" {
		t.Fatalf("the waiting reader got %+v, %v; want its own rebuild's answer", got, ok)
	}
	store.mu.Lock()
	left := len(store.building)
	store.mu.Unlock()
	if left != 0 {
		t.Fatalf("%d rebuilds are still marked as running", left)
	}
}

// A panic while a chapter is evaluated ends the fill and comes out of Warm, on the caller's goroutine, after every
// worker is done: the caller logs it, and nothing is left running or blocked.
func TestAPanicInTheFillComesOutOfWarmOnceTheWorkersAreDone(t *testing.T) {
	service, _ := warmFixture(t)
	service.config.ChapterAudio = func(tracks.Project) tracks.Project { panic("a chapter could not be read") }
	var failure any
	func() {
		defer func() { failure = recover() }()
		service.Warm(DefaultAlignmentParams, notClosed)
	}()
	if failure != "a chapter could not be read" {
		t.Fatalf("Warm raised %v, want the worker's panic", failure)
	}
}
