package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/bridge"
	"desktop/internal/contractfile"
	"desktop/internal/dawport"
)

// DawSaveProject (#3262). What REAPER does is narration_save_project.lua's (save_project_test.lua) and what the role answers is
// dawport/reaper's (save_project_test.go). These cover the host's wiring: the capability, the linked file, the role's answers.

type fakeSaver struct {
	files  []string
	answer dawport.Result
	err    error
}

func (f *fakeSaver) SaveProject(_ context.Context, file string) (dawport.Result, error) {
	f.files = append(f.files, file)
	return f.answer, f.err
}

func TestDawSaveProjectSendsTheLinkedFileAndAnswersTheRolesResult(t *testing.T) {
	saved := dawport.OK("Saved the project in REAPER: 3 tracks and 12 items.", false)
	role := &fakeSaver{answer: saved}
	got, err := dawSaveProjectIn(t.Context(), "REAPER", available(), role, "C:/Books/Book.rpp", nil)
	if err != nil || got.Message != saved.Message || !got.OK || len(role.files) != 1 || role.files[0] != "C:/Books/Book.rpp" {
		t.Fatalf("got %+v, %v; asked %v", got, err, role.files)
	}
}

func TestDawSaveProjectRefusesWithNothingAskedWhenItCannotSave(t *testing.T) {
	role := &fakeSaver{}
	off := dawport.Support{Available: false, Message: "Save the project is not available with Audacity yet."}
	for name, test := range map[string]struct {
		support dawport.Support
		saver   dawport.ProjectSaver
		file    string
		want    string
	}{
		"capability off": {off, role, "Book.rpp", off.Message},
		"no linked file": {available(), role, "", saveProjectNoLinkSentence},
		"no live engine": {available(), nil, "Book.rpp", "REAPER is not connected to this app, so the project was not saved."},
	} {
		got, err := dawSaveProjectIn(t.Context(), "REAPER", test.support, test.saver, test.file, nil)
		if err != nil || got.OK || got.Refused != test.want {
			t.Errorf("%s: got %+v, %v; want a refusal %q", name, got, err, test.want)
		}
	}
	if len(role.files) != 0 {
		t.Fatalf("asked %v", role.files)
	}
}

func TestDawSaveProjectWordsWhatKeptTheRoleFromAnswering(t *testing.T) {
	for name, test := range map[string]struct {
		err  error
		want string
	}{
		"no answer":   {bridge.ErrNoAnswer, "REAPER is not answering."},
		"unavailable": {bridge.ErrUnavailable, "REAPER is not connected to this app"},
		"late":        {context.DeadlineExceeded, "did not answer the save within 15 seconds"},
		"other":       {errors.New("disk on fire"), "REAPER could not save the project: disk on fire."},
	} {
		got, err := dawSaveProjectIn(t.Context(), "REAPER", available(), &fakeSaver{err: test.err}, "Book.rpp", nil)
		if err != nil || got.OK || !strings.Contains(got.Refused, test.want) {
			t.Errorf("%s: got %+v, %v; want a refusal holding %q", name, got, err, test.want)
		}
	}
}

// The goldens the UI's wireContracts row and mock answer to: a save done, and the refusals the Save in REAPER and read button shows.
func TestDawSaveProjectGoldens(t *testing.T) {
	never := "This REAPER project has never been saved, and saving it would open a file dialog in REAPER. Save it once in REAPER (File > Save project), then read again."
	for name, role := range map[string]*fakeSaver{
		"daw-save-project-done":          {answer: dawport.OK("Saved the project in REAPER: 3 tracks and 12 items.", false)},
		"daw-save-project-refused-never": {answer: dawport.Refused(never)},
	} {
		t.Run(name, func(t *testing.T) {
			got, err := dawSaveProjectIn(t.Context(), "REAPER", available(), role, "C:/Books/Book.rpp", nil)
			if err != nil {
				t.Fatal(err)
			}
			contractfile.Check(t, name, got)
		})
	}
	t.Run("daw-save-project-refused-capability", func(t *testing.T) {
		refusedCapability := dawport.Support{Message: "Save the project is not available with Audacity yet."}
		got, err := dawSaveProjectIn(t.Context(), "Audacity", refusedCapability, &fakeSaver{}, "C:/Books/Book.rpp", nil)
		if err != nil {
			t.Fatal(err)
		}
		contractfile.Check(t, "daw-save-project-refused-capability", got)
	})
}

// A file REAPER cannot write is refused by the host before anything is sent: REAPER 7.82 stops answering the bridge on one.
func TestDawSaveProjectNeverAsksTheDawToSaveAFileItCannotWrite(t *testing.T) {
	dir := t.TempDir()
	locked := filepath.Join(dir, "Locked.rpp")
	if err := os.WriteFile(locked, []byte("x"), 0o444); err != nil {
		t.Fatal(err)
	}
	// Windows cannot remove a read-only file, so the temp folder's cleanup needs it writable again.
	t.Cleanup(func() { _ = os.Chmod(locked, 0o644) })
	cases := map[string]string{"a folder, not a file": dir, "gone": filepath.Join(dir, "Gone.rpp")}
	if os.Geteuid() != 0 { // root writes through a read-only mode
		cases["read-only"] = locked
	}
	for name, file := range cases {
		role := &fakeSaver{answer: dawport.OK("saved", false)}
		got, err := dawSaveProjectIn(t.Context(), "REAPER", available(), role, file, projectFileWritable)
		if err != nil || got.OK || !strings.Contains(got.Refused, "read-only or missing") || len(role.files) != 0 {
			t.Errorf("%s: got %+v, %v; asked %v", name, got, err, role.files)
		}
	}
	writable := filepath.Join(dir, "Book.rpp")
	if err := os.WriteFile(writable, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	role := &fakeSaver{answer: dawport.OK("saved", false)}
	if got, err := dawSaveProjectIn(t.Context(), "REAPER", available(), role, writable, projectFileWritable); err != nil || !got.OK || len(role.files) != 1 {
		t.Fatalf("a writable file: got %+v, %v; asked %v", got, err, role.files)
	}
	if b, _ := os.ReadFile(writable); string(b) != "x" {
		t.Fatalf("the check changed the file: %q", b)
	}
}
