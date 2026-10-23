package voicesample

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/countrymanprime/narration-utils/shell/internal/pathfixtures"
)

// everything lists every file and folder under root, so a test can say that nothing was made.
func everything(t *testing.T, root string) []string {
	t.Helper()
	var found []string
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err == nil && path != root {
			found = append(found, path)
		}
		return nil
	})
	return found
}

// serviceFor is a service whose project folder is dir and whose saved project is rpp.
func serviceFor(r *rig, dir, rpp string) *Service {
	r.config.Project = dir
	r.config.ProjectFile = func() (string, error) { return rpp, nil }
	return r.build()
}

// TestPathFixtures runs the shared set of project folders (definition of done, rule 1) through the whole life of a sample: mark,
// list, play (find the clip), remove. A folder the app can use keeps the sample in <project>/narration-utils/voice-samples and
// finds it again by any spelling of that folder; one it cannot use is refused or fails, and makes nothing anywhere else.
func TestPathFixtures(t *testing.T) {
	pathfixtures.Run(t, func(t *testing.T, p pathfixtures.Place) {
		source := wavBytes(testRate, 1, 16, sineFrames(testRate, 20*testRate))
		r := &rig{t: t, book: aliceBook()}
		r.alignment = &fakeAlignment{heard: heardBoth(testRecord)}
		r.cuts = &fakeCuts{}
		r.config = Config{
			Manuscript: func() (Book, error) { return r.book, nil },
			Alignment:  r.alignment,
			Cuts:       r.cuts,
		}
		if !p.Usable {
			// Nothing here exists, or is the wrong kind of thing: refuse or fail, and make nothing.
			service := serviceFor(r, p.Dir, p.RPP)
			before := everything(t, p.Start)
			working, _ := filepath.Glob("*")
			if list, err := service.List(); err == nil && len(list.Samples) != 0 {
				t.Fatalf("a folder that is not a project has samples: %+v", list)
			}
			if _, err := service.Mark(context.Background(), request(2, 4)); err == nil {
				t.Fatal("a sample was marked in a folder that is not a project")
			}
			if _, err := service.Remove(row(1, "", false, 0).ID); err != nil && p.Dir != "" {
				t.Logf("remove: %v", err)
			}
			if after := everything(t, p.Start); len(after) != len(before) {
				t.Fatalf("something was made beside the starting folder: %v", after)
			}
			if left, _ := filepath.Glob("*"); len(left) != len(working) {
				t.Fatalf("a folder that is not a project wrote into the working folder: %v (was %v)", left, working)
			}
			return
		}

		rpp := p.RPP
		if p.FileReadOnly || p.DirReadOnly {
			// The fixture's own project file cannot be written, so the saved project lives beside the audio elsewhere.
			elsewhere := t.TempDir()
			writeFile(t, filepath.Join(elsewhere, "take.wav"), source)
			rpp = filepath.Join(elsewhere, "Show.rpp")
			writeFile(t, rpp, []byte(rppText("take.wav", 0, 20, "")))
		} else {
			writeFile(t, filepath.Join(filepath.Dir(p.RPP), "take.wav"), source)
			writeFile(t, p.RPP, []byte(rppText("take.wav", 0, 20, "")))
		}
		service := serviceFor(r, p.Dir, rpp)

		if p.DirReadOnly {
			if _, err := service.Mark(context.Background(), request(2, 4)); err == nil {
				t.Fatal("a sample was saved into a folder the OS will not let the app write in")
			}
			if list, err := service.List(); err != nil || len(list.Samples) != 0 {
				t.Fatalf("list = %+v, %v", list, err)
			}
			return
		}

		sample, err := service.Mark(context.Background(), request(2, 4))
		if err != nil {
			t.Fatalf("mark: %v", err)
		}
		folder := filepath.Join(p.Dir, "narration-utils", "voice-samples")
		for _, file := range []string{filepath.Join(folder, "samples.json"), filepath.Join(folder, "clips", sample.ID+".wav")} {
			if info, err := os.Stat(file); err != nil || info.IsDir() {
				t.Fatalf("%s was not written: %v", file, err)
			}
		}
		if clip, err := service.Clip(sample.ID); err != nil || clip.State != ClipOK {
			t.Fatalf("clip = %+v, %v", clip, err)
		}
		// The same project reached by another spelling finds the same sample, and plays it from the same file.
		for _, alias := range p.Aliases {
			t.Run("alias/"+alias.Name, func(t *testing.T) {
				again := serviceFor(r, alias.Dir, rpp)
				list, err := again.List()
				if err != nil || len(list.Samples) != 1 || list.Samples[0].ID != sample.ID || list.Samples[0].ClipState != ClipOK {
					t.Fatalf("list through %q = %+v, %v", alias.Dir, list, err)
				}
				clip, err := again.Clip(sample.ID)
				if err != nil || clip.State != ClipOK {
					t.Fatalf("clip through %q = %+v, %v", alias.Dir, clip, err)
				}
				same, err := os.Stat(clip.Path)
				original, originalErr := os.Stat(filepath.Join(folder, "clips", sample.ID+".wav"))
				if err != nil || originalErr != nil || !os.SameFile(same, original) {
					t.Fatalf("the clip through %q is not the clip: %v, %v", alias.Dir, err, originalErr)
				}
			})
		}
		if removed, err := service.Remove(sample.ID); err != nil || removed.Removed != 1 {
			t.Fatalf("remove = %+v, %v", removed, err)
		}
		if list, err := service.List(); err != nil || len(list.Samples) != 0 {
			t.Fatalf("list after remove = %+v, %v", list, err)
		}
	})
}

// A project folder given as any of the odd strings a narrator or a hand-edited project file can hold is never read or written
// outside itself, and never panics.
func TestPathTexts(t *testing.T) {
	for _, text := range pathfixtures.Texts() {
		t.Run(text.Name, func(t *testing.T) {
			t.Chdir(t.TempDir())
			noProject := func() (string, error) { return "", errors.New("no saved project") }
			r := &rig{t: t, book: aliceBook(), alignment: &fakeAlignment{heard: heardBoth(testRecord)}, cuts: &fakeCuts{}}
			r.config = Config{Project: text.Path, ProjectFile: noProject, Manuscript: func() (Book, error) { return r.book, nil }, Alignment: r.alignment, Cuts: r.cuts}
			service := r.build()
			_, _ = service.List()
			_, err := service.Mark(context.Background(), request(2, 4))
			if err == nil {
				t.Fatal("a sample was marked in a project folder that is only a string")
			}
			_, _ = service.Remove(row(1, "", false, 0).ID)
			_, _ = service.RemoveAll()
			_, _ = service.Clip(row(1, "", false, 0).ID)
			if left, _ := filepath.Glob("*"); len(left) != 0 {
				t.Fatalf("the working folder was written to: %v", left)
			}
		})
	}
}
