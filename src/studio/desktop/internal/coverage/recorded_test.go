package coverage

import (
	"os"
	"testing"

	"desktop/internal/evidence"
)

// recordedFractions is RecordedFractions with the default alignment.
func recordedFractions(service *Service) map[string]float64 {
	return service.RecordedFractions(DefaultAlignmentParams)
}

func TestACurrentCompleteResultGivesTheChaptersPresentWordFraction(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{present: 8})
	run(t, service, testRequest())

	fractions := recordedFractions(service)

	if len(fractions) != 1 || fractions[testChapter] != 0.8 {
		t.Fatalf("fractions = %v, want %s: 0.8 (8 of 10 words present)", fractions, testChapter)
	}
	// The same current result gives the chapter's paragraph lines, for how far it is recorded.
	paragraphs := service.CurrentParagraphs(DefaultAlignmentParams)
	present := 0
	for _, line := range paragraphs[testChapter] {
		present += line.Present
	}
	if len(paragraphs) != 1 || len(paragraphs[testChapter]) == 0 || present != 8 {
		t.Fatalf("paragraphs = %+v, want the chapter's lines with 8 words present", paragraphs)
	}
}

func TestAChapterNeverCheckedHasNoFractionAndTheSavedProjectIsNotRead(t *testing.T) {
	p := newTestProject(t)
	reads := 0
	service := New(Config{
		Project: p.dir, Python: "python-sidecar",
		ProjectFile:    func() (string, error) { reads++; return p.rpp, nil },
		LoadManuscript: p.loadManuscript,
	}, (&fakeSidecar{}).launcher(), nil)

	fractions := recordedFractions(service)

	if len(fractions) != 0 || len(service.CurrentParagraphs(DefaultAlignmentParams)) != 0 {
		t.Fatalf("fractions = %v, want none", fractions)
	}
	if reads != 0 {
		t.Fatalf("with no complete record the saved project must not be read (read %d times)", reads)
	}
}

func TestAStaleResultHasNoFraction(t *testing.T) {
	cases := map[string]func(p *testProject){
		"an item edit": func(p *testProject) {
			p.items[1].length = 9
			p.writeRPP()
		},
		"a manuscript text change": func(p *testProject) {
			p.writeManuscript(testDocument, "Chapter One", "Alice was beginning to get very tired indeed.")
		},
		"a vocabulary hints change": func(p *testProject) {
			p.writeFile("TranscriptCompare/vocabulary_hints.txt", "Dinah\n")
		},
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			p := newTestProject(t)
			service := p.service(&fakeSidecar{})
			run(t, service, testRequest())

			change(p)

			if fractions := recordedFractions(service); len(fractions) != 0 {
				t.Fatalf("fractions = %v, want none for a stale result", fractions)
			}
		})
	}
}

func TestAnAlignmentParameterChangeLeavesNoFraction(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{})
	run(t, service, testRequest())

	if fractions := service.RecordedFractions(AlignmentParams{MaxMisreadRun: 4, MinAnchorRun: 3}); len(fractions) != 0 {
		t.Fatalf("fractions = %v, want none", fractions)
	}
}

func TestAnUnmappedChapterHasNoFraction(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{})
	run(t, service, testRequest())

	if err := os.Remove(evidence.MappingFile(p.dir)); err != nil {
		t.Fatal(err)
	}

	if fractions := recordedFractions(service); len(fractions) != 0 {
		t.Fatalf("fractions = %v, want none for an unmapped chapter", fractions)
	}
}

func TestAPartialOrFailedRunGivesNoFraction(t *testing.T) {
	t.Run("partial", func(t *testing.T) {
		p := newTestProject(t)
		sidecar := &fakeSidecar{pauseAfter: 1, paused: make(chan struct{}), resume: make(chan struct{})}
		service := p.service(sidecar)
		if _, err := service.Start(testRequest()); err != nil {
			t.Fatal(err)
		}
		<-sidecar.paused
		service.Cancel()
		close(sidecar.resume)
		service.Wait()

		if fractions := recordedFractions(service); len(fractions) != 0 {
			t.Fatalf("fractions = %v, want none after a cancelled run", fractions)
		}
	})
	t.Run("failed", func(t *testing.T) {
		p := newTestProject(t)
		service := p.service(&fakeSidecar{exitCode: 1, errorMessage: "boom"})
		run(t, service, testRequest())

		if fractions := recordedFractions(service); len(fractions) != 0 {
			t.Fatalf("fractions = %v, want none after a failed run", fractions)
		}
	})
}

func TestTheNewestCompleteRunWinsAndAnUnreadableSavedProjectGivesNoFraction(t *testing.T) {
	p := newTestProject(t)
	run(t, p.service(&fakeSidecar{present: 5}), testRequest())
	service := p.service(&fakeSidecar{present: 9})
	run(t, service, testRequest())

	if fractions := recordedFractions(service); fractions[testChapter] != 0.9 {
		t.Fatalf("fractions = %v, want the newest run's 0.9", fractions)
	}

	if err := os.Remove(p.rpp); err != nil {
		t.Fatal(err)
	}
	if fractions := recordedFractions(service); len(fractions) != 0 {
		t.Fatalf("fractions = %v, want none without a readable saved project", fractions)
	}
}

// A read of every chapter lists the ledger once, whatever it asks of each chapter (issue 3749): before, each chapter's
// evaluation listed it twice more.
func TestAReadOfEveryChapterListsTheLedgerOnce(t *testing.T) {
	p := newTestProject(t)
	service := p.service(&fakeSidecar{present: 8})
	run(t, service, testRequest())
	listingsOf := func() int {
		listings, _ := service.ledger.Reads()
		return listings
	}

	before := listingsOf()
	if fractions := recordedFractions(service); fractions[testChapter] != 0.8 {
		t.Fatalf("fractions = %v, want %s: 0.8", fractions, testChapter)
	}
	if got := listingsOf() - before; got != 1 {
		t.Fatalf("the recorded fractions listed the ledger %d times, want 1", got)
	}

	project, projectFile, err := service.savedProject()
	if err != nil {
		t.Fatal(err)
	}
	direct, err := service.ResultIn(project, projectFile, testChapter, DefaultAlignmentParams)
	if err != nil || !direct.Current() {
		t.Fatalf("ResultIn = %+v, %v; want a current result", direct, err)
	}
	pass := service.Pass()
	before = listingsOf()
	for range 3 {
		result, err := pass.ResultIn(project, projectFile, testChapter, DefaultAlignmentParams)
		if err != nil || result.State != direct.State || result.Record == nil || result.Record.ID != direct.Record.ID {
			t.Fatalf("a pass's ResultIn = %+v, %v; want what the service answers (%+v)", result, err, direct)
		}
	}
	if got := listingsOf() - before; got != 0 {
		t.Fatalf("three chapters of one pass listed the ledger %d more times, want none", got)
	}
	// A chapter the manuscript does not have still reads as never checked, with its reason, as Service.ResultIn answers.
	missing, err := pass.ResultIn(project, projectFile, "c-9999", DefaultAlignmentParams)
	if err != nil || missing.State != evidence.StateNever || len(missing.Reasons) != 1 {
		t.Fatalf("an unknown chapter in a pass = %+v, %v; want never, with a reason", missing, err)
	}
}
