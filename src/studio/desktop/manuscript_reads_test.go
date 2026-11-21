package main

import (
	"fmt"
	"testing"

	"desktop/internal/manuscript"
)

// Every load of the manuscript reads and hashes the whole file, so a binding that loaded it for each chapter read the book
// once per chapter (issue 3896). Each of these reads it the same number of times for a book five times as long.
func TestABindingReadsTheManuscriptAsOftenForALongBookAsForAShortOne(t *testing.T) {
	for _, binding := range []struct {
		name string
		call func(*Host) (string, error)
	}{
		{"PreviewCandidates", (*Host).PreviewCandidates},
		{"PickupsList", (*Host).PickupsList},
		{"StageRecommendations", (*Host).StageRecommendations},
	} {
		t.Run(binding.name, func(t *testing.T) {
			reads := func(chapters int) int64 {
				host := coverageHost(t, previewBookOf(t, chapters), true, fakeCoverageSidecar(10))
				for i := 1; i <= chapters; i++ { // the recording signal is asked only of a chapter that is being recorded
					if _, err := host.manuscript.SetChapterStatus(fmt.Sprintf("c-%04d", i), "recording"); err != nil {
						t.Fatal(err)
					}
				}
				before := manuscript.Reads()
				if _, err := binding.call(host); err != nil {
					t.Fatal(err)
				}
				return manuscript.Reads() - before
			}
			short, long := reads(5), reads(25)
			if short == 0 || long != short {
				t.Fatalf("%s read the manuscript %d times for 5 chapters and %d for 25, want the same number", binding.name, short, long)
			}
		})
	}
}

// The findings save asks for its manuscript once for a run: the host gives it one book, and nothing at all (never a nil
// book inside the interface) when the manuscript cannot be read.
func TestTheFindingsSaveIsGivenOneBookOrNothing(t *testing.T) {
	text := manuscript.New(previewBook(t))
	before := manuscript.Reads()
	lookup := transcriptManuscript(text)()
	if id, _, ok := lookup.ChapterIDByTitle("Chapter 2"); !ok || id != "c-0002" {
		t.Fatalf("Chapter 2 resolved to %q, %v", id, ok)
	}
	if _, ok := lookup.ParagraphID("c-0002", 0); !ok {
		t.Fatal("c-0002 has no paragraph 0")
	}
	if got := manuscript.Reads() - before; got != 1 {
		t.Fatalf("taking the book and asking it twice read the manuscript %d times, want 1", got)
	}
	if none := transcriptManuscript(manuscript.New(t.TempDir()))(); none != nil {
		t.Fatalf("with no manuscript the lookup is %#v, want nil", none)
	}
}
