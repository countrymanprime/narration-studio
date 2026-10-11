package teleprompter

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAnchorsRoundTripSortedAndDeduplicated(t *testing.T) {
	project := t.TempDir()
	for _, anchor := range []Anchor{{Word: 10, Position: 5}, {Word: 2, Position: 1}, {Word: 10, Position: 5.5}} {
		if err := AppendAnchor(project, "c1", anchor); err != nil {
			t.Fatal(err)
		}
	}
	got, err := LoadAnchors(project, "c1")
	if err != nil {
		t.Fatal(err)
	}
	want := []Anchor{{Word: 2, Position: 1}, {Word: 10, Position: 5.5}}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("LoadAnchors = %+v, want %+v", got, want)
	}
	if _, err := os.Stat(filepath.Join(project, "narration-utils", "teleprompter", "c1.anchors.json")); err != nil {
		t.Fatal(err)
	}
	if other, err := LoadAnchors(project, "c2"); err != nil || other != nil {
		t.Fatalf("another chapter's anchors = %+v, %v", other, err)
	}
}

func TestAppendAnchorCapsTheFileAtMaxAnchorsKeepingTheNewest(t *testing.T) {
	project := t.TempDir()
	for word := 0; word < maxAnchors+10; word++ {
		if err := AppendAnchor(project, "c1", Anchor{Word: word, Position: float64(word)}); err != nil {
			t.Fatal(err)
		}
	}
	got, err := LoadAnchors(project, "c1")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != maxAnchors {
		t.Fatalf("len(got) = %d, want %d", len(got), maxAnchors)
	}
	if got[0].Word != 10 || got[len(got)-1].Word != maxAnchors+9 {
		t.Fatalf("kept the wrong window: first %+v last %+v", got[0], got[len(got)-1])
	}
}

func TestDropAnchorsFromRemovesAWordAndEverythingAfterIt(t *testing.T) {
	project := t.TempDir()
	for _, anchor := range []Anchor{{Word: 1, Position: 1}, {Word: 5, Position: 5}, {Word: 9, Position: 9}} {
		if err := AppendAnchor(project, "c1", anchor); err != nil {
			t.Fatal(err)
		}
	}
	if err := DropAnchorsFrom(project, "c1", 5); err != nil {
		t.Fatal(err)
	}
	got, err := LoadAnchors(project, "c1")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Word != 1 {
		t.Fatalf("LoadAnchors after drop = %+v", got)
	}
}

func TestLoadAnchorsIsEmptyWithNoFile(t *testing.T) {
	project := t.TempDir()
	got, err := LoadAnchors(project, "c1")
	if err != nil || got != nil {
		t.Fatalf("LoadAnchors = %+v, %v", got, err)
	}
}

func TestLoadAnchorsIgnoresACorruptFile(t *testing.T) {
	project := t.TempDir()
	dir := filepath.Join(project, "narration-utils", "teleprompter")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "c1.anchors.json"), []byte("not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := LoadAnchors(project, "c1")
	if err != nil || got != nil {
		t.Fatalf("LoadAnchors of a corrupt file = %+v, %v", got, err)
	}
}

func TestResolveWordTimeWithNoAnchorsCannotResolve(t *testing.T) {
	if _, _, ok := ResolveWordTime(nil, 5); ok {
		t.Fatal("resolved with no anchors")
	}
}

func TestResolveWordTimeWithOneAnchorCannotResolveAnotherWord(t *testing.T) {
	if _, _, ok := ResolveWordTime([]Anchor{{Word: 5, Position: 10}}, 6); ok {
		t.Fatal("resolved from a single anchor")
	}
}

func TestResolveWordTimeAnExactAnchorIsReturnedVerbatim(t *testing.T) {
	position, source, ok := ResolveWordTime([]Anchor{{Word: 3, Position: 1.5}, {Word: 9, Position: 4.5}}, 3)
	if !ok || source != SourceAnchor || position != 1.5 {
		t.Fatalf("ResolveWordTime = %v, %q, %v", position, source, ok)
	}
}

func TestResolveWordTimeInterpolatesBetweenTwoAnchors(t *testing.T) {
	// Word 6 is halfway between word 3 at 1.5s and word 9 at 4.5s: 3s of runway over 6 words is 0.5s/word, so word 6
	// (3 words in) lands at 1.5 + 3*0.5 = 3.0s.
	position, source, ok := ResolveWordTime([]Anchor{{Word: 3, Position: 1.5}, {Word: 9, Position: 4.5}}, 6)
	if !ok || source != SourceAnchor || position != 3.0 {
		t.Fatalf("ResolveWordTime = %v, %q, %v", position, source, ok)
	}
}

func TestResolveWordTimeExtrapolatesPastTheLastAnchorAsAnEstimate(t *testing.T) {
	// Pace is 0.5s/word (from word 0 at 0s to word 10 at 5s); word 14 is 4 words past the last anchor, so 5 + 4*0.5 = 7s.
	position, source, ok := ResolveWordTime([]Anchor{{Word: 0, Position: 0}, {Word: 10, Position: 5}}, 14)
	if !ok || source != SourceEstimate || position != 7 {
		t.Fatalf("ResolveWordTime = %v, %q, %v", position, source, ok)
	}
}

func TestResolveWordTimeExtrapolatesBeforeTheFirstAnchorClampedAtZero(t *testing.T) {
	position, source, ok := ResolveWordTime([]Anchor{{Word: 10, Position: 1}, {Word: 20, Position: 6}}, 0)
	if !ok || source != SourceEstimate || position != 0 {
		t.Fatalf("ResolveWordTime = %v, %q, %v", position, source, ok)
	}
}

func TestResolveWordTimeSortsUnsortedInput(t *testing.T) {
	position, source, ok := ResolveWordTime([]Anchor{{Word: 9, Position: 4.5}, {Word: 3, Position: 1.5}}, 6)
	if !ok || source != SourceAnchor || position != 3.0 {
		t.Fatalf("ResolveWordTime = %v, %q, %v", position, source, ok)
	}
}

func TestAnchorsForAChapterIDWithOddCharactersUseAHashedFileName(t *testing.T) {
	const chapterID = "../escape/chapter 1"
	name := anchorsFileName(chapterID)
	if !strings.HasPrefix(name, "id-") || !strings.HasSuffix(name, ".anchors.json") || strings.ContainsAny(name, `/\`) {
		t.Fatalf("anchorsFileName(%q) = %q, want a hashed name that cannot name a path", chapterID, name)
	}
	if name == anchorsFileName("../escape/chapter 2") {
		t.Fatal("two different chapter ids must not share an anchors file")
	}

	project := t.TempDir()
	if err := AppendAnchor(project, chapterID, Anchor{Word: 3, Position: 1.5}); err != nil {
		t.Fatal(err)
	}
	got, err := LoadAnchors(project, chapterID)
	if err != nil || len(got) != 1 || got[0] != (Anchor{Word: 3, Position: 1.5}) {
		t.Fatalf("LoadAnchors = %+v, %v; want the one anchor back", got, err)
	}
	if _, err := os.Stat(filepath.Join(AnchorsDir(project), name)); err != nil {
		t.Fatalf("the anchors file is not at the hashed name: %v", err)
	}
}

func TestAppendAnchorWithoutAProjectFails(t *testing.T) {
	if err := AppendAnchor("", "c1", Anchor{Word: 1, Position: 1}); err == nil {
		t.Fatal("AppendAnchor with no project: want an error, got nil")
	}
}

func TestAnchorsReportAFileTheyCannotRead(t *testing.T) {
	project := t.TempDir()
	// A folder where the anchors file belongs: present, but not readable as a file.
	if err := os.MkdirAll(filepath.Join(AnchorsDir(project), anchorsFileName("c1")), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadAnchors(project, "c1"); err == nil {
		t.Fatal("LoadAnchors on an unreadable anchors file: want an error, got nil")
	}
	if err := AppendAnchor(project, "c1", Anchor{Word: 1, Position: 1}); err == nil {
		t.Fatal("AppendAnchor on an unreadable anchors file: want an error, got nil")
	}
	if err := DropAnchorsFrom(project, "c1", 0); err == nil {
		t.Fatal("DropAnchorsFrom on an unreadable anchors file: want an error, got nil")
	}
}

func TestAppendAnchorReportsAFolderItCannotCreate(t *testing.T) {
	notAFolder := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(notAFolder, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := AppendAnchor(notAFolder, "c1", Anchor{Word: 1, Position: 1}); err == nil {
		t.Fatal("AppendAnchor under a project that is a file: want an error, got nil")
	}
}

func TestAppendAnchorReportsATemporaryFileItCannotWrite(t *testing.T) {
	project := t.TempDir()
	// A folder where the temporary file goes makes writing it fail.
	if err := os.MkdirAll(filepath.Join(AnchorsDir(project), anchorsFileName("c1")+".tmp"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := AppendAnchor(project, "c1", Anchor{Word: 1, Position: 1}); err == nil {
		t.Fatal("AppendAnchor with a folder in the temporary file's place: want an error, got nil")
	}
}
