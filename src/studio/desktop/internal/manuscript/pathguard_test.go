package manuscript

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/importer"
	"github.com/countrymanprime/narration-utils/shell/internal/pathfixtures"
)

// The path guard (definition of done, rule 1): every function here that resolves a manuscript path or the project folder it is
// kept in runs the shared fixture set in internal/pathfixtures.

func sameFile(a, b string) bool {
	infoA, errA := os.Stat(a)
	infoB, errB := os.Stat(b)
	return errA == nil && errB == nil && os.SameFile(infoA, infoB)
}

func TestPathGuardDetectSource(t *testing.T) {
	pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
		detected := DetectSource(p.Dir)
		if !p.Usable {
			if detected != "" {
				t.Fatalf("DetectSource(%q) found %q in a folder that has no manuscript file", p.Dir, detected)
			}
			return
		}
		if !sameFile(detected, p.Manuscript) {
			t.Fatalf("DetectSource(%q) = %q, want %q", p.Dir, detected, p.Manuscript)
		}
		for _, alias := range p.Aliases {
			if found := DetectSource(alias.Dir); !sameFile(found, p.Manuscript) {
				t.Errorf("alias %q: DetectSource(%q) = %q, want the manuscript in %q", alias.Name, alias.Dir, found, p.Dir)
			}
		}
	})
}

func TestPathGuardBeginDetectedAcceptsOnlyTheDetectedFile(t *testing.T) {
	pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
		service := New(p.Dir)
		if !p.Usable {
			if job, err := service.BeginDetected(p.Manuscript); err == nil {
				t.Fatalf("began an import from %q, which is not waiting in a project: %+v", p.Manuscript, job)
			}
			return
		}
		detected := service.Detect()
		if _, err := service.BeginDetected(detected); err != nil {
			t.Fatalf("the file Detect offered, %q, was refused: %v", detected, err)
		}
		// Another spelling of the offered file is the offered file.
		for _, alias := range p.Aliases {
			if _, err := service.BeginDetected(alias.Manuscript); err != nil {
				t.Errorf("alias %q: %q is the detected file %q but was refused: %v", alias.Name, alias.Manuscript, detected, err)
			}
		}
		// A file next to it, or one climbing out of the project, is not.
		other := filepath.Join(filepath.Dir(p.Dir), "elsewhere.md")
		if err := os.WriteFile(other, []byte("# Not mine"), 0o644); err != nil {
			t.Fatal(err)
		}
		for _, refused := range []string{other, "", filepath.Join(p.Dir, "..", filepath.Base(other)), p.Dir} {
			if _, err := service.BeginDetected(refused); err == nil {
				t.Errorf("BeginDetected(%q) was accepted though it is not the detected manuscript", refused)
			}
		}
	})
}

// Import end to end: Begin on the manuscript path, Preview, Commit into the project folder, then Load it back.
func TestPathGuardImportAndLoad(t *testing.T) {
	pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
		service := New(p.Dir)
		job := service.Begin(p.Manuscript)
		previewed, previewErr := service.Preview(job.ID, 1)
		if !p.Usable {
			if previewErr == nil && previewed.Phase == "ready" {
				t.Fatalf("previewed %q, which is not a manuscript file: %+v", p.Manuscript, previewed)
			}
			if _, err := service.Load(); err == nil {
				t.Fatalf("Load() read a manuscript from %q, which has none", p.Dir)
			}
			return
		}
		if previewErr != nil || previewed.Phase != "ready" {
			t.Fatalf("Preview of %q: %+v %v", p.Manuscript, previewed, previewErr)
		}
		committed, err := service.Commit(job.ID, false, Choices{})
		if p.DirReadOnly {
			if err == nil && committed.Phase == "success" {
				t.Fatal("imported a manuscript into a read-only project folder")
			}
			if _, statErr := os.Stat(filepath.Join(p.Dir, "narration-utils")); statErr == nil {
				t.Fatal("a refused import left narration-utils/ behind")
			}
			return
		}
		if err != nil || committed.Phase != "success" {
			t.Fatalf("Commit into %q: %+v %v", p.Dir, committed, err)
		}
		canonical, err := service.Load()
		if err != nil || canonical["documentId"] == "" {
			t.Fatalf("Load after import: %v %v", canonical, err)
		}
		if DetectSource(p.Dir) != "" {
			t.Error("a manuscript is still offered after it was imported")
		}
		for _, alias := range p.Aliases {
			if _, err := New(alias.Dir).Load(); err != nil {
				t.Errorf("alias %q: Load through %q: %v", alias.Name, alias.Dir, err)
			}
		}
		if err := service.Clear(); err != nil {
			t.Errorf("Clear: %v", err)
		}
	})
}

// commit stores a copy of the source in the project; it must refuse a source that is not a file, an empty project folder and a
// project it cannot write, and leave nothing half made.
func TestPathGuardCommitLeavesNothingBehindWhenRefused(t *testing.T) {
	pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
		if p.Dir == "" {
			if _, err := commit("", p.Manuscript, importer.Draft{}, nil, nil); err == nil {
				t.Fatal("committed into the working directory for an empty project folder")
			}
			if _, err := os.Stat("narration-utils"); err == nil {
				t.Fatal("an empty project folder wrote narration-utils/ into the working directory")
			}
			return
		}
		// The source is this place's manuscript path: a real file commits; anything else is refused before any storage is made.
		scratch := t.TempDir()
		_, err := commit(scratch, p.Manuscript, importer.Draft{}, nil, nil)
		if !p.Usable {
			if err == nil {
				t.Errorf("committed from %q, which is not a manuscript file", p.Manuscript)
			}
			if entries, _ := os.ReadDir(filepath.Join(scratch, "narration-utils")); len(entries) != 0 {
				t.Errorf("a refused commit from %q left %v behind", p.Manuscript, entries)
			}
		} else if err != nil {
			t.Errorf("commit from %q: %v", p.Manuscript, err)
		}
		// The project is this place's folder; the source is not there.
		if _, err = commit(p.Dir, filepath.Join(scratch, "no-such-manuscript.md"), importer.Draft{}, nil, nil); err == nil {
			t.Errorf("committed from a source that is not there")
		}
		if p.Usable && !p.DirReadOnly {
			if entries, _ := os.ReadDir(filepath.Join(p.Dir, "narration-utils")); len(entries) != 0 {
				t.Errorf("a refused commit into %q left %v behind", p.Dir, entries)
			}
		}
	})
}

// A manuscript that is a link to a file (a symlink, a cloud-sync placeholder) is a manuscript; a folder named like one is not.
func TestPathGuardDetectSourceFollowsALinkedManuscript(t *testing.T) {
	project := t.TempDir()
	real := filepath.Join(t.TempDir(), "elsewhere.docx")
	if err := os.WriteFile(real, []byte("PK"), 0o644); err != nil {
		t.Fatal(err)
	}
	// A symlink where the machine allows one; where it does not (an unprivileged Windows account), a hard link is the same "a name for a file elsewhere".
	if err := os.Symlink(real, filepath.Join(project, "manuscript.docx")); err != nil {
		if err := os.Link(real, filepath.Join(project, "manuscript.docx")); err != nil {
			t.Fatalf("could not make a linked manuscript by symlink or hard link: %v", err)
		}
	}
	if found := DetectSource(project); found == "" {
		t.Fatal("a manuscript.docx that is a link to a file was not offered")
	}
}
