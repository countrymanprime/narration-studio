package teleprompter

import (
	"context"
	"fmt"
	"os"
	"slices"
	"testing"
)

// runFakePlacer is a `--words-only` run: the words it heard in the stretch, and the arguments it was given.
func runFakePlacer(mode string) bool {
	if mode != "heard" || !slices.Contains(os.Args[1:], "--words-only") {
		return false
	}
	fmt.Println(`{"type": "heard", "words": [["Ada", 0.5, 0.8], ["climbed", 0.9, 1.3], ["um", 1.4, 1.5], ["the", 1.6, 1.7], ["stairs", 1.8, 2.2]]}`)
	return true
}

func TestLocatePlacesTheDecodedWordsInTheHost(t *testing.T) {
	f := newLocateFixture(t, "heard")
	writeFollowedManuscript(t, f.project)
	located, err := f.service.Locate(context.Background(), f.request())
	if err != nil {
		t.Fatal(err)
	}
	// "Chapter One The Lamp Ada climbed the stairs.": the tail ends after "stairs.", in the paragraph's one sentence.
	if located.Word == nil || *located.Word != 8 || *located.Last != 7 || located.Sentence == nil || *located.Sentence != (Sentence{4, 8, "Ada climbed the stairs."}) {
		t.Fatalf("located %+v", located)
	}
	if located.Matched != 4 || located.Heard != 5 || located.Tokens != 8 || located.HeardText != "Ada climbed um the stairs" || located.Confident {
		t.Fatalf("located %+v", located)
	}
}

func TestAlignWordTimesTheDecodedWordsInTheHostInTheFilesSeconds(t *testing.T) {
	f := newLocateFixture(t, "heard")
	writeFollowedManuscript(t, f.project)
	timed, err := f.service.AlignWord(context.Background(), f.alignRequest(5))
	if err != nil {
		t.Fatal(err)
	}
	// Word 5 is "climbed", heard 0.9 s into the stretch that starts 812.4 s into the file.
	if timed.Time == nil || *timed.Time != 813.3 || !timed.Exact || timed.Word != 5 || timed.Matched != 4 || timed.Tokens != 8 {
		t.Fatalf("timed %+v", timed)
	}
}

func TestAPlacementTheHostCannotBuildIsLeftToTheSidecar(t *testing.T) {
	f := newLocateFixture(t, "locate-ok")
	located, err := f.service.Locate(context.Background(), f.request())
	if err != nil || located.Word == nil || *located.Word != 52 {
		t.Fatalf("located %+v, %v: the `{}` manuscript leaves the placing to the sidecar's own locate line", located, err)
	}
}
